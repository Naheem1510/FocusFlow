/**
 * messages.js — Message send/receive/render pipeline.
 * Handles encryption before send, decryption on receive, receipts, typing, reactions.
 */

import { encryptMessage, decryptMessage, randomUUID } from './crypto.js';
import {
  saveMessage, getMessages, updateMessageStatus,
  deleteMessage, logAuditEvent, enqueue, getQueue, dequeue,
} from './storage.js';
import { scheduleExpiry, scheduleViewOnceDelete } from './autodelete.js';
import { addUnread } from './notifications.js';
import { sessions, activeRoomId } from './room.js';

const TYPING_DEBOUNCE_MS = 200;
const TYPING_CLEAR_MS = 3000;

let typingTimer = null;
let typingClearTimer = null;

// ─── Sending ──────────────────────────────────────────────────────────────────

/**
 * Encrypts and sends a text message. Queues if no session key yet.
 * @param {string} roomId
 * @param {string} plaintext
 * @param {object} [opts] - {viewOnce, expiresAt}
 */
export async function sendMessage(roomId, plaintext, opts = {}) {
  const session = sessions.get(roomId);
  if (!session) return;

  const messageId = randomUUID();
  const timestamp = Date.now();

  const expiresAt = opts.expiresAt ?? computeExpiry(session);
  const viewOnce = opts.viewOnce ?? false;

  const localRecord = {
    id: messageId,
    roomId,
    senderId: session.userId,
    plaintext,
    timestamp,
    status: 'sent',
    expiresAt,
    viewOnce,
    reactions: [],
    isSelf: true,
  };

  await saveMessage(localRecord);
  appendMessageToDOM(localRecord, session);

  if (!session.sessionKey) {
    await enqueue({ id: messageId, roomId, plaintext, timestamp, expiresAt, viewOnce });
    return;
  }

  await encryptAndEmit(session, messageId, plaintext, timestamp, expiresAt, viewOnce);
}

async function encryptAndEmit(session, messageId, plaintext, timestamp, expiresAt, viewOnce) {
  const { iv, ciphertext } = await encryptMessage(session.sessionKey, plaintext);

  session.socket.emit('message', {
    senderId: session.userId,
    messageId,
    iv,
    ciphertext,
    timestamp,
    expiresAt,
    viewOnce,
  });
}

/**
 * Flushes the outbox queue for a room after reconnection or key exchange.
 * @param {string} roomId
 */
export async function flushQueue(roomId) {
  const session = sessions.get(roomId);
  if (!session || !session.sessionKey) return;

  const queued = await getQueue(roomId);
  for (const item of queued) {
    await encryptAndEmit(session, item.id, item.plaintext, item.timestamp, item.expiresAt, item.viewOnce);
    await dequeue(item.id);
  }
}

// ─── Receiving ────────────────────────────────────────────────────────────────

/**
 * Handles an incoming encrypted message envelope from the WebSocket.
 * Decrypts, stores, renders, and emits a read receipt.
 *
 * @param {string} roomId
 * @param {object} envelope - {senderId, messageId, iv, ciphertext, timestamp, expiresAt, viewOnce}
 */
export async function receiveMessage(roomId, envelope) {
  const session = sessions.get(roomId);
  if (!session || !session.sessionKey) return;
  if (envelope.senderId === session.userId) return;

  let plaintext;
  try {
    plaintext = await decryptMessage(session.sessionKey, envelope.iv, envelope.ciphertext);
  } catch {
    return;
  }

  const record = {
    id: envelope.messageId,
    roomId,
    senderId: envelope.senderId,
    plaintext,
    timestamp: envelope.timestamp,
    status: 'delivered',
    expiresAt: envelope.expiresAt ?? null,
    viewOnce: envelope.viewOnce ?? false,
    reactions: [],
    isSelf: false,
  };

  await saveMessage(record);
  appendMessageToDOM(record, session);

  if (record.expiresAt) scheduleExpiry(record, id => removeMessageFromDOM(id));

  if (roomId !== activeRoomId || !document.hasFocus()) {
    addUnread();
  } else {
    emitReadReceipt(session, envelope.messageId);
  }

  await logAuditEvent('message_received', { roomId });
}

// ─── Read Receipts ────────────────────────────────────────────────────────────

/**
 * Emits a read receipt to the server for a specific message.
 * @param {object} session
 * @param {string} messageId
 */
export function emitReadReceipt(session, messageId) {
  session.socket.emit('receipt', {
    senderId: session.userId,
    messageId,
    status: 'read',
  });
}

/**
 * Handles an incoming read receipt, updating the message status in DOM + DB.
 * @param {string} roomId
 * @param {object} envelope - {messageId, status}
 */
export async function receiveReceipt(roomId, envelope) {
  await updateMessageStatus(envelope.messageId, envelope.status);
  updateReceiptUI(envelope.messageId, envelope.status);
}

// ─── Typing Indicators ────────────────────────────────────────────────────────

/**
 * Call on every keydown in the message input.
 * Debounces outgoing typing events and auto-clears after 3s of silence.
 * @param {string} roomId
 */
export function emitTyping(roomId) {
  const session = sessions.get(roomId);
  if (!session) return;

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    session.socket.emit('typing', {
      senderId: session.userId,
      isTyping: true,
    });
  }, TYPING_DEBOUNCE_MS);

  clearTimeout(typingClearTimer);
  typingClearTimer = setTimeout(() => {
    session.socket.emit('typing', {
      senderId: session.userId,
      isTyping: false,
    });
  }, TYPING_CLEAR_MS);
}

/**
 * Handles an incoming typing indicator envelope.
 * @param {string} roomId
 * @param {object} envelope - {senderId, isTyping}
 */
export function receiveTyping(roomId, envelope) {
  const session = sessions.get(roomId);
  if (!session || envelope.senderId === session.userId) return;
  if (roomId !== activeRoomId) return;

  const indicator = document.getElementById('typing-indicator');
  if (!indicator) return;

  if (envelope.isTyping) {
    indicator.textContent = 'Someone is composing...';
    indicator.classList.remove('hidden');
  } else {
    indicator.textContent = '';
    indicator.classList.add('hidden');
  }
}

// ─── Reactions ────────────────────────────────────────────────────────────────

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '✊'];

/**
 * Sends a reaction to a message.
 * @param {string} roomId
 * @param {string} targetMessageId
 * @param {string} emoji
 */
export function sendReaction(roomId, targetMessageId, emoji) {
  if (!REACTION_EMOJIS.includes(emoji)) return;

  const session = sessions.get(roomId);
  if (!session) return;

  session.socket.emit('reaction', {
    senderId: session.userId,
    targetMessageId,
    emoji,
  });

  addReactionToDOM(targetMessageId, emoji);
}

/**
 * Handles an incoming reaction envelope.
 * @param {string} roomId
 * @param {object} envelope - {targetMessageId, emoji, senderId}
 */
export function receiveReaction(roomId, envelope) {
  const session = sessions.get(roomId);
  if (!session || envelope.senderId === session.userId) return;
  addReactionToDOM(envelope.targetMessageId, envelope.emoji);
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/**
 * Loads all stored messages for a room and renders them to the chat DOM.
 * @param {string} roomId
 * @param {object} session
 */
export async function renderMessages(roomId, session) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  container.innerHTML = '';

  const messages = await getMessages(roomId);
  for (const msg of messages) {
    appendMessageToDOM(msg, session);
    if (msg.expiresAt) scheduleExpiry(msg, id => removeMessageFromDOM(id));
  }

  scrollToBottom(container);
}

function appendMessageToDOM(msg, session) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const isSelf = msg.senderId === session.userId || msg.isSelf;
  const el = buildMessageElement(msg, isSelf);
  container.appendChild(el);
  scrollToBottom(container);

  if (msg.viewOnce && !isSelf) {
    scheduleViewOnceDelete(msg.id, id => removeMessageFromDOM(id));
  }
}

function buildMessageElement(msg, isSelf) {
  const wrap = document.createElement('div');
  wrap.className = `message ${isSelf ? 'message--self' : 'message--other'}`;
  wrap.dataset.messageId = msg.id;

  const bubble = document.createElement('div');
  bubble.className = 'message__bubble';
  bubble.textContent = msg.plaintext;

  const meta = document.createElement('div');
  meta.className = 'message__meta';

  const time = document.createElement('span');
  time.className = 'message__time';
  time.textContent = formatTime(msg.timestamp);

  meta.appendChild(time);

  if (isSelf) {
    const ticks = document.createElement('span');
    ticks.className = `message__ticks ticks--${msg.status}`;
    ticks.dataset.messageId = msg.id;
    ticks.textContent = msg.status === 'read' ? '✓✓' : '✓';
    meta.appendChild(ticks);
  }

  const reactions = document.createElement('div');
  reactions.className = 'message__reactions';
  reactions.dataset.messageId = msg.id;

  wrap.appendChild(bubble);
  wrap.appendChild(meta);
  wrap.appendChild(reactions);

  // Reaction picker on hover (desktop) / long-press (mobile)
  let pressTimer;
  wrap.addEventListener('mouseenter', () => showReactionPicker(wrap, msg.id));
  wrap.addEventListener('mouseleave', () => hideReactionPicker());
  wrap.addEventListener('touchstart', () => {
    pressTimer = setTimeout(() => showReactionPicker(wrap, msg.id), 600);
  }, { passive: true });
  wrap.addEventListener('touchend', () => clearTimeout(pressTimer), { passive: true });

  return wrap;
}

function updateReceiptUI(messageId, status) {
  const el = document.querySelector(`.message__ticks[data-message-id="${messageId}"]`);
  if (!el) return;
  el.className = `message__ticks ticks--${status}`;
  el.textContent = status === 'read' ? '✓✓' : '✓';
}

function addReactionToDOM(messageId, emoji) {
  const container = document.querySelector(`.message__reactions[data-message-id="${messageId}"]`);
  if (!container) return;

  const existing = Array.from(container.querySelectorAll('.reaction-pill'))
    .find(p => p.dataset.emoji === emoji);

  if (existing) {
    const count = parseInt(existing.dataset.count || '1', 10) + 1;
    existing.dataset.count = String(count);
    existing.querySelector('.reaction-count').textContent = count;
  } else {
    const pill = document.createElement('span');
    pill.className = 'reaction-pill';
    pill.dataset.emoji = emoji;
    pill.dataset.count = '1';
    pill.innerHTML = `${emoji} <span class="reaction-count">1</span>`;
    container.appendChild(pill);
  }
}

let reactionPickerEl = null;

function showReactionPicker(messageWrap, messageId) {
  hideReactionPicker();

  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.id = 'reaction-picker-active';

  REACTION_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'reaction-btn';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      const roomId = activeRoomId;
      if (roomId) sendReaction(roomId, messageId, emoji);
      hideReactionPicker();
    });
    picker.appendChild(btn);
  });

  messageWrap.appendChild(picker);
  reactionPickerEl = picker;
}

function hideReactionPicker() {
  reactionPickerEl?.remove();
  reactionPickerEl = null;
}

function removeMessageFromDOM(messageId) {
  document.querySelector(`[data-message-id="${messageId}"]`)?.remove();
}

function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function computeExpiry(session) {
  const mode = session.messageDeleteMode;
  if (!mode || mode === 'never') return null;
  const map = { 'on_read': null, '24h': 86400_000, '7d': 604800_000 };
  const ms = map[mode];
  return ms ? Date.now() + ms : null;
}
