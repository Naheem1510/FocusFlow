/**
 * room.js — Room creation, joining via invite link, and key exchange orchestration.
 * Coordinates crypto.js, socket.js, storage.js, and qr.js.
 */

import {
  generateKeyPair, exportPublicKey, exportPrivateKey,
  importPublicKey, deriveSharedKey, generateFingerprint, randomUUID,
} from './crypto.js';
import { SocketClient } from './socket.js';
import {
  saveKeyPair, getKeyPair, saveRoom, saveFingerprint,
  getRooms, deleteRoom, logAuditEvent,
} from './storage.js';
import { showShareModal } from './qr.js';
import { renderMessages } from './messages.js';

const WORKER_URL = window.__WORKER_URL__ || 'https://secure-workspace.your-worker.workers.dev';
const APP_DOMAIN = window.__APP_DOMAIN__ || window.location.origin;

/** @type {Map<string, RoomSession>} roomId → session */
export const sessions = new Map();
/** @type {string|null} Currently active room ID */
export let activeRoomId = null;

/**
 * @typedef {object} RoomSession
 * @property {string} roomId
 * @property {string} userId - Ephemeral local user ID
 * @property {CryptoKey|null} sessionKey - Null until key exchange completes
 * @property {string} fingerprint
 * @property {SocketClient} socket
 * @property {Map<string, CryptoKey>} peerKeys - peerId → their shared key
 */

/**
 * Creates a new room on the server and opens the share modal.
 * @param {object} settings - Room creation options.
 * @returns {Promise<string>} roomId
 */
export async function createRoom(settings = {}) {
  const userId = getOrCreateUserId();

  const response = await fetch(`${WORKER_URL}/api/room/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creatorId: userId,
      inviteExpiry: settings.inviteExpiry ?? '7d',
      oneTimeInvite: settings.oneTimeInvite ?? false,
      messageDeleteMode: settings.messageDeleteMode ?? '7d',
      selfDestructAfter: settings.selfDestructAfter ?? '7d',
      roomPassword: settings.roomPassword ?? null,
    }),
  });

  if (!response.ok) throw new Error('Failed to create room');

  const { roomId, token } = await response.json();

  await saveRoom({
    roomId,
    nickname: settings.nickname || `Room ${roomId.slice(0, 4)}`,
    isCreator: true,
    createdAt: Date.now(),
    messageDeleteMode: settings.messageDeleteMode ?? '7d',
  });

  await logAuditEvent('room_created', { roomId });
  await openSession(roomId, userId);
  showShareModal(token, APP_DOMAIN);

  return roomId;
}

/**
 * Joins a room via an invite token (from /invite/:token URL).
 * @param {string} token
 * @param {string} [password] - Room password if required.
 * @returns {Promise<string>} roomId
 */
export async function joinViaInvite(token, password) {
  const userId = getOrCreateUserId();

  // Resolve token to roomId
  const resolveRes = await fetch(`${WORKER_URL}/api/invite/${encodeURIComponent(token)}`);
  if (!resolveRes.ok) throw new Error('Invalid or expired invite link');
  const { roomId } = await resolveRes.json();

  // Join + validate password if needed
  const joinRes = await fetch(`${WORKER_URL}/api/room/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, userId, password }),
  });

  if (!joinRes.ok) {
    const err = await joinRes.json().catch(() => ({ error: 'Join failed' }));
    if (err.requiresPassword) throw new Error('NEEDS_PASSWORD');
    if (joinRes.status === 403) throw new Error('WRONG_PASSWORD');
    throw new Error(err.error || 'Join failed');
  }

  const { messageDeleteMode } = await joinRes.json();

  await saveRoom({
    roomId,
    nickname: `Room ${roomId.slice(0, 4)}`,
    isCreator: false,
    joinedAt: Date.now(),
    messageDeleteMode,
  });

  await logAuditEvent('room_joined', { roomId });
  await openSession(roomId, userId);

  return roomId;
}

/**
 * Opens a WebSocket session for a room and starts key exchange.
 * @param {string} roomId
 * @param {string} userId
 */
export async function openSession(roomId, userId) {
  if (sessions.has(roomId)) return;

  const socket = new SocketClient(roomId, WORKER_URL.replace('https://', 'wss://').replace('http://', 'ws://'));

  const session = {
    roomId,
    userId,
    sessionKey: null,
    fingerprint: '',
    socket,
    peerKeys: new Map(),
  };

  sessions.set(roomId, session);
  wireSocketEvents(session);
  socket.connect();
}

/**
 * Switches the active room view.
 * @param {string} roomId
 */
export async function switchRoom(roomId) {
  activeRoomId = roomId;
  const session = sessions.get(roomId);
  if (!session) return;

  await renderMessages(roomId, session);
  updateRoomUI(session);
}

/**
 * Closes and cleans up a room session.
 * @param {string} roomId
 */
export async function closeRoom(roomId) {
  const session = sessions.get(roomId);
  if (session) {
    session.socket.disconnect();
    sessions.delete(roomId);
  }

  if (activeRoomId === roomId) {
    activeRoomId = null;
  }
}

/**
 * Permanently deletes a room locally and from the server (creator only).
 * @param {string} roomId
 */
export async function deleteRoomPermanently(roomId) {
  const session = sessions.get(roomId);
  if (!session) return;

  await fetch(`${WORKER_URL}/api/room/${roomId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creatorId: session.userId }),
  });

  await closeRoom(roomId);
  await deleteRoom(roomId);
  await logAuditEvent('room_deleted', { roomId });
}

// ─── Key exchange ─────────────────────────────────────────────────────────────

async function doKeyExchange(session) {
  let keyPairRecord = await getKeyPair(session.roomId);
  let keyPair;

  if (keyPairRecord) {
    const { importPrivateKey, importPublicKey: importPub } = await import('./crypto.js');
    keyPair = {
      privateKey: await importPrivateKey(keyPairRecord.privateKey),
      publicKey: await importPub(keyPairRecord.publicKey),
    };
  } else {
    keyPair = await generateKeyPair();
    const privBuf = await exportPrivateKey(keyPair.privateKey);
    const pubB64 = await exportPublicKey(keyPair.publicKey);
    await saveKeyPair(session.roomId, privBuf, pubB64);
    keyPairRecord = { privateKey: privBuf, publicKey: pubB64 };
  }

  const myPublicKeyB64 = keyPairRecord?.publicKey || await exportPublicKey(keyPair.publicKey);

  session.socket.emit('public_key', {
    senderId: session.userId,
    publicKey: myPublicKeyB64,
  });

  session._localKeyPair = keyPair;

  // Process any peer public keys that arrived before our key pair was ready
  const pending = session._pendingPeerKeys?.splice(0) ?? [];
  for (const env of pending) {
    handlePeerPublicKey(session, env);
  }
}

async function handlePeerPublicKey(session, envelope) {
  if (envelope.senderId === session.userId) return;
  if (!session._localKeyPair) return;

  try {
    const theirPublicKey = await importPublicKey(envelope.publicKey);
    const sharedKey = await deriveSharedKey(session._localKeyPair.privateKey, theirPublicKey);
    session.peerKeys.set(envelope.senderId, sharedKey);

    if (!session.sessionKey) {
      session.sessionKey = sharedKey;
      session.fingerprint = await generateFingerprint(sharedKey);
      await saveFingerprint(session.roomId, session.fingerprint);
      updateFingerprintUI(session.fingerprint);
      await logAuditEvent('key_exchange_complete', { roomId: session.roomId });
    }
  } catch (err) {
    console.error('Key exchange failed:', err);
  }
}

// ─── Socket event wiring ──────────────────────────────────────────────────────

function wireSocketEvents(session) {
  const { socket } = session;

  socket.on('connected', async () => {
    await doKeyExchange(session);
    updateConnectionUI(session.roomId, 'connected');
    await logAuditEvent('room_joined', { roomId: session.roomId });
  });

  socket.on('reconnecting', () => updateConnectionUI(session.roomId, 'reconnecting'));
  socket.on('disconnected', () => updateConnectionUI(session.roomId, 'disconnected'));

  socket.on('public_key', envelope => {
    if (!session._localKeyPair) {
      (session._pendingPeerKeys ??= []).push(envelope);
    } else {
      handlePeerPublicKey(session, envelope);
    }
  });

  socket.on('peer_joined', async envelope => {
    showPeerPresence(session.roomId, envelope.connectionId, true);
    await doKeyExchange(session);
  });

  socket.on('peer_left', envelope => {
    showPeerPresence(session.roomId, envelope.connectionId, false);
  });

  socket.on('room_expiring', () => {
    showRoomExpiryWarning(session.roomId);
  });

  socket.on('room_destroyed', async () => {
    await deleteRoom(session.roomId);
    sessions.delete(session.roomId);
    showRoomDestroyedNotice(session.roomId);
  });
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function updateFingerprintUI(fingerprint) {
  const el = document.getElementById('session-fingerprint');
  if (el) el.textContent = fingerprint;
}

function updateConnectionUI(roomId, state) {
  const badge = document.getElementById('connection-badge') ||
    document.querySelector(`[data-room-status="${roomId}"]`);
  if (!badge) return;

  badge.dataset.roomStatus = roomId;
  badge.textContent = {
    connected: 'Connected',
    reconnecting: 'Reconnecting...',
    disconnected: 'Offline',
  }[state] || state;

  badge.dataset.state = state;
}

function updateRoomUI(session) {
  const nameEl = document.getElementById('room-name');
  if (nameEl) nameEl.textContent = `Room ${session.roomId.slice(0, 4)}`;
}

function showPeerPresence(roomId, peerId, online) {
  const feed = document.getElementById('chat-presence');
  if (!feed) return;
  const msg = document.createElement('div');
  msg.className = 'presence-notice';
  msg.textContent = online ? 'A contact joined the stream.' : 'A contact left the stream.';
  feed.appendChild(msg);
  setTimeout(() => msg.remove(), 4000);
}

function showRoomExpiryWarning(roomId) {
  const banner = document.getElementById('room-expiry-banner');
  if (banner) {
    banner.textContent = 'This workspace will close due to inactivity soon.';
    banner.classList.remove('hidden');
  }
}

function showRoomDestroyedNotice(roomId) {
  const banner = document.getElementById('room-expiry-banner');
  if (banner) {
    banner.textContent = 'This workspace has been closed.';
    banner.classList.remove('hidden');
  }
}

// ─── User identity ────────────────────────────────────────────────────────────

function getOrCreateUserId() {
  const KEY = 'ws_user_id';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = randomUUID();
    sessionStorage.setItem(KEY, id);
  }
  return id;
}
