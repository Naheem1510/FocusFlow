/**
 * connection.ts — Orchestrates a live, end-to-end encrypted Vault room:
 * WebSocket transport (socket.ts) + ECDH/AES-GCM crypto (crypto.ts) +
 * key-exchange choreography. Ported from the secure-workspace room.js, but
 * UI-agnostic (emits callbacks instead of touching the DOM) and memory-only
 * (keys are never persisted — refresh = new identity, matching Zero Trace).
 */

import { getWorkerHttpUrl, getWorkerWsUrl } from "./config";
import { SocketClient, type Envelope, type SocketState } from "./socket";
import type { VaultIdentity } from "./identity";
import {
  importPublicKey,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  generateFingerprint,
  randomUUID,
} from "./crypto";
import { x3dhInitiate, x3dhReceive, type X3DHHeader } from "./x3dh";
import { fetchPreKeyBundle, consumePreKey, ensurePreKeysPublished } from "./prekeys";

export interface LiveMessage {
  id: string;
  senderId: string;
  body: string;
  ts: number;
  self: boolean;
  burnIn: number | null;
  reactions?: Record<string, number>;
  /** True when delivered from the server mailbox (sent while we were offline). */
  buffered?: boolean;
}

/** A real participant we've completed a key exchange with. */
export interface PeerIdentity {
  /** Their identity id (stable when they persist their identity). */
  id: string;
  /** The display name they announced (their own chosen profile name). */
  name: string;
  /** Per-peer verification fingerprint derived from the shared secret. */
  fingerprint: string;
  /** Base64 SPKI of their identity public key — cached to reach them offline. */
  publicKeyB64: string;
}

/** A cached peer identity, used to pre-derive a key for offline send/receive. */
export interface PeerHint {
  userId: string;
  publicKeyB64: string;
}

export interface ConnectionCallbacks {
  onState: (state: SocketState) => void;
  onMessage: (msg: LiveMessage) => void;
  onFingerprint: (fp: string) => void;
  onPeer: (peer: PeerIdentity) => void;
  onPresence: (peerCount: number, joined: boolean) => void;
  onTyping: (senderId: string, isTyping: boolean) => void;
  onReaction: (targetMessageId: string, emoji: string) => void;
  onRoomEvent: (event: "expiring" | "destroyed") => void;
}

// ─── REST: room create / join ─────────────────────────────────────────────────

export interface CreateRoomResult {
  roomId: string;
  token: string;
}

/** Marker error so the UI can tell "worker unreachable" from other failures. */
export class WorkerUnreachableError extends Error {
  constructor() {
    super("WORKER_UNREACHABLE");
    this.name = "WorkerUnreachableError";
  }
}

/**
 * fetch with a hard timeout. A missing/stuck worker (or the localhost→IPv6
 * stall on Windows) otherwise leaves requests pending forever — which is what
 * makes "Create a secure room" spin endlessly. Here it fails fast instead.
 */
async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    // AbortError (timeout) or a network-level failure → worker not reachable.
    throw new WorkerUnreachableError();
  } finally {
    clearTimeout(timer);
  }
}

export async function createRoom(
  userId: string,
  opts: { messageDeleteMode?: string; roomPassword?: string | null } = {},
): Promise<CreateRoomResult> {
  const res = await fetchWithTimeout(`${getWorkerHttpUrl()}/api/room/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creatorId: userId,
      // Non-expiring, reusable invite so a saved contact can reconnect to the
      // same room indefinitely without re-sharing a link.
      inviteExpiry: "never",
      oneTimeInvite: false,
      messageDeleteMode: opts.messageDeleteMode ?? "on_read",
      selfDestructAfter: "7d",
      roomPassword: opts.roomPassword ?? null,
    }),
  });
  if (!res.ok) throw new Error("Failed to create room");
  const { roomId, token } = await res.json();
  return { roomId, token };
}

/** Resolves an invite token to a room and joins it. */
export async function joinViaInvite(
  userId: string,
  token: string,
  password?: string,
): Promise<{ roomId: string }> {
  const base = getWorkerHttpUrl();
  const resolve = await fetchWithTimeout(`${base}/api/invite/${encodeURIComponent(token)}`);
  if (!resolve.ok) throw new Error("Invalid or expired invite link");
  const { roomId } = await resolve.json();

  const join = await fetchWithTimeout(`${base}/api/room/${roomId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, userId, password }),
  });
  if (!join.ok) {
    const err = await join.json().catch(() => ({}));
    if (err.requiresPassword) throw new Error("NEEDS_PASSWORD");
    if (join.status === 403) throw new Error("WRONG_PASSWORD");
    throw new Error("Failed to join room");
  }
  return { roomId };
}

/** Ephemeral per-session identity. Cleared on tab close → no lasting trace. */
export function getOrCreateUserId(): string {
  const KEY = "ff_vault_uid";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = randomUUID();
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

// ─── Live session ─────────────────────────────────────────────────────────────

export class VaultConnection {
  readonly roomId: string;
  readonly userId: string;
  readonly displayName: string;
  private identity: VaultIdentity;
  private cb: ConnectionCallbacks;
  private socket: SocketClient;

  private localKeyPair: CryptoKeyPair;
  private sessionKey: CryptoKey | null = null;
  private peerKeys = new Map<string, CryptoKey>();
  private peerHint: PeerHint | null;
  /** Group chat: cached identities of all members, so we can reach offline ones. */
  private roster: PeerHint[];
  private isGroup: boolean;
  /** Other contacts currently online — 0 means send must go via the mailbox. */
  private peerCount = 0;

  constructor(
    roomId: string,
    identity: VaultIdentity,
    displayName: string,
    cb: ConnectionCallbacks,
    opts: { peerHint?: PeerHint | null; roster?: PeerHint[]; isGroup?: boolean } = {},
  ) {
    this.roomId = roomId;
    this.identity = identity;
    this.userId = identity.userId;
    this.localKeyPair = identity.keyPair;
    this.displayName = displayName;
    this.cb = cb;
    this.peerHint = opts.peerHint ?? null;
    this.roster = opts.roster ?? [];
    this.isGroup = opts.isGroup ?? false;
    this.socket = new SocketClient(roomId, getWorkerWsUrl());
    this.wire();
  }

  connect() {
    // Derive pairwise keys for contacts/members we already know, up front. That
    // lets us send to (and decrypt mailbox messages from) someone who is offline
    // right now — before any live handshake happens.
    void this.preDerive();
    this.socket.connect();
  }

  disconnect() {
    this.socket.disconnect();
    this.sessionKey = null;
    this.peerKeys.clear();
  }

  get hasSessionKey() {
    return this.sessionKey !== null;
  }

  private async preDerive() {
    // 1:1 → the single peer hint; group → every cached member.
    const hints = this.isGroup ? this.roster : this.peerHint ? [this.peerHint] : [];
    for (const h of hints) {
      try {
        const theirPub = await importPublicKey(h.publicKeyB64);
        const shared = await deriveSharedKey(this.localKeyPair.privateKey, theirPub);
        this.peerKeys.set(h.userId, shared);
        if (!this.isGroup) {
          this.sessionKey = shared;
          this.cb.onFingerprint(await generateFingerprint(shared));
        }
      } catch (err) {
        console.error("Pre-derive of a cached identity key failed:", err);
      }
    }
  }

  // ─── Sending ────────────────────────────────────────────────────────────────

  async sendMessage(plaintext: string, burnIn: number | null) {
    const body = plaintext.trim();
    if (!body) return;
    const id = randomUUID();
    const ts = Date.now();

    // Optimistically surface our own message immediately.
    this.cb.onMessage({ id, senderId: this.userId, body, ts, self: true, burnIn });

    // Group: encrypt the body separately for each member under our pairwise key
    // with them (stable, identity-derived), so every member — online or offline —
    // can decrypt. The relay/mailbox just carries the multi-recipient envelope.
    if (this.isGroup) {
      const recipients: Record<string, { iv: string; ciphertext: string }> = {};
      for (const [uid, key] of Array.from(this.peerKeys.entries())) {
        recipients[uid] = await encryptMessage(key, body);
      }
      if (Object.keys(recipients).length === 0) return; // no known members yet
      this.socket.emit("message", {
        senderId: this.userId,
        messageId: id,
        recipients,
        timestamp: ts,
        burnIn,
      });
      return;
    }

    // When the peer is offline and we know their identity, use X3DH so the
    // buffered message gets a fresh, forward-secret key (a unique one-time
    // prekey per message) instead of the static identity-derived session key.
    if (this.peerCount === 0 && this.peerHint?.userId) {
      if (await this.trySendX3DH(id, body, ts, burnIn)) return;
    }

    if (!this.sessionKey) return; // no key established yet; relay would be undecryptable
    const { iv, ciphertext } = await encryptMessage(this.sessionKey, body);
    this.socket.emit("message", {
      senderId: this.userId,
      messageId: id,
      iv,
      ciphertext,
      timestamp: ts,
      burnIn,
    });
  }

  /** Encrypts via X3DH using a freshly fetched one-time prekey. Returns false to fall back. */
  private async trySendX3DH(
    id: string,
    body: string,
    ts: number,
    burnIn: number | null,
  ): Promise<boolean> {
    try {
      const bundle = await fetchPreKeyBundle(this.peerHint!.userId);
      if (!bundle?.oneTimePreKey) return false; // peer has no prekeys → fall back
      const { sk, header } = await x3dhInitiate(
        this.identity.publicKeyB64,
        this.localKeyPair.privateKey,
        bundle.identityKey,
        bundle.oneTimePreKey,
      );
      const { iv, ciphertext } = await encryptMessage(sk, body);
      this.socket.emit("message", {
        senderId: this.userId,
        messageId: id,
        iv,
        ciphertext,
        timestamp: ts,
        burnIn,
        x3dh: header,
      });
      return true;
    } catch {
      return false;
    }
  }

  sendTyping(isTyping: boolean) {
    this.socket.emit("typing", { senderId: this.userId, isTyping });
  }

  sendReaction(targetMessageId: string, emoji: string) {
    this.socket.emit("reaction", { senderId: this.userId, targetMessageId, emoji });
  }

  // ─── Wiring ───────────────────────────────────────────────────────────────

  private wire() {
    this.socket.on("state_change", (e) =>
      this.cb.onState((e.state as SocketState) ?? "disconnected"),
    );

    this.socket.on("connected", () => void this.doKeyExchange());

    this.socket.on("public_key", (env) => void this.handlePeerPublicKey(env));

    this.socket.on("peer_joined", (env) => {
      // connectionCount counts everyone including us → subtract self.
      this.peerCount = otherCount(env.connectionCount);
      this.cb.onPresence(this.peerCount, true);
      // Re-announce our key so the newcomer can derive the shared secret.
      void this.doKeyExchange();
    });

    this.socket.on("peer_left", (env) => {
      this.peerCount = otherCount(env.connectionCount);
      this.cb.onPresence(this.peerCount, false);
    });

    this.socket.on("message", (env) => void this.handleMessage(env));

    this.socket.on("typing", (env) => {
      if (env.senderId === this.userId) return;
      this.cb.onTyping(env.senderId as string, Boolean(env.isTyping));
    });

    this.socket.on("reaction", (env) => {
      if (env.senderId === this.userId) return;
      this.cb.onReaction(env.targetMessageId as string, env.emoji as string);
    });

    this.socket.on("room_expiring", () => this.cb.onRoomEvent("expiring"));
    this.socket.on("room_destroyed", () => this.cb.onRoomEvent("destroyed"));
  }

  // ─── Key exchange ─────────────────────────────────────────────────────────

  private async doKeyExchange() {
    // Announce our (now persistent) identity public key + real display name. The
    // relay passes the whole envelope through, so peers learn who they're with.
    this.socket.emit("public_key", {
      senderId: this.userId,
      publicKey: this.identity.publicKeyB64,
      displayName: this.displayName,
    });
  }

  private async handlePeerPublicKey(env: Envelope) {
    if (env.senderId === this.userId) return;
    try {
      const senderId = env.senderId as string;
      const theirPubB64 = env.publicKey as string;
      const theirPub = await importPublicKey(theirPubB64);
      const shared = await deriveSharedKey(this.localKeyPair.privateKey, theirPub);
      this.peerKeys.set(senderId, shared);

      // Receiving a peer's public key proves they're online RIGHT NOW. The last
      // peer to join never gets a `peer_joined` event (the server broadcasts it to
      // everyone *except* the joiner), so its peerCount would stay 0 — which made
      // sendMessage wrongly route live messages through the X3DH offline path, and
      // the recipient (with no matching prekey) silently dropped them: typing
      // showed but messages never arrived. A completed live handshake means we
      // must use the reliable session key, so reflect presence here.
      if (!this.isGroup && this.peerCount === 0) {
        this.peerCount = 1;
        this.cb.onPresence(this.peerCount, true);
      }

      const fingerprint = await generateFingerprint(shared);
      const announced = typeof env.displayName === "string" ? env.displayName.trim() : "";
      const name = announced || `Contact ${senderId.slice(0, 4)}`;
      this.cb.onPeer({ id: senderId, name, fingerprint, publicKeyB64: theirPubB64 });

      // Always adopt the most-recently negotiated key as the session key (this
      // is a 1:1 channel). Pinning it to only the FIRST peer broke reconnects:
      // when a saved contact rejoined with a fresh key, the long-lived side kept
      // encrypting with the stale key — so the newcomer could send but never
      // decrypt incoming messages. Re-keying here makes both sides converge.
      this.sessionKey = shared;
      this.cb.onFingerprint(fingerprint);
    } catch (err) {
      console.error("Key exchange failed:", err);
    }
  }

  private async handleMessage(env: Envelope) {
    if (env.senderId === this.userId) return;

    // Group multi-recipient message: decrypt our own entry with the pairwise key.
    if (env.recipients) {
      void this.handleGroupMessage(env);
      return;
    }

    // X3DH first-message: derive a one-off key from our consumed prekey.
    if (env.x3dh) {
      void this.handleX3DHMessage(env);
      return;
    }

    const key = this.peerKeys.get(env.senderId as string) ?? this.sessionKey;
    if (!key) return;
    try {
      const body = await decryptMessage(key, env.iv as string, env.ciphertext as string);
      const messageId = (env.messageId as string) ?? randomUUID();
      this.cb.onMessage({
        id: messageId,
        senderId: env.senderId as string,
        body,
        ts: (env.timestamp as number) ?? Date.now(),
        self: false,
        burnIn: (env.burnIn as number | null) ?? null,
        buffered: env.buffered === true,
      });
      // Confirm receipt so the relay can drop its buffered copy. (Re-acking an
      // already-deleted message is a harmless no-op.)
      this.sendAck(messageId);
    } catch {
      /* undecryptable — drop silently (stays buffered until its TTL) */
    }
  }

  private async handleGroupMessage(env: Envelope) {
    const recipients = env.recipients as Record<string, { iv: string; ciphertext: string }> | undefined;
    const entry = recipients?.[this.userId];
    if (!entry) return; // not addressed to us
    const senderId = env.senderId as string;
    const key = this.peerKeys.get(senderId);
    if (!key) return; // we don't yet hold this member's pairwise key
    try {
      const body = await decryptMessage(key, entry.iv, entry.ciphertext);
      const messageId = (env.messageId as string) ?? randomUUID();
      this.cb.onMessage({
        id: messageId,
        senderId,
        body,
        ts: (env.timestamp as number) ?? Date.now(),
        self: false,
        burnIn: (env.burnIn as number | null) ?? null,
        buffered: env.buffered === true,
      });
      this.sendAck(messageId);
    } catch {
      /* undecryptable — drop silently */
    }
  }

  private async handleX3DHMessage(env: Envelope) {
    const header = env.x3dh as X3DHHeader;
    try {
      const opkPriv = await consumePreKey(header.opkId);
      if (!opkPriv) return; // prekey already used / not ours — leave it buffered
      const sk = await x3dhReceive(this.localKeyPair.privateKey, opkPriv, header);
      const body = await decryptMessage(sk, env.iv as string, env.ciphertext as string);
      const messageId = (env.messageId as string) ?? randomUUID();
      this.cb.onMessage({
        id: messageId,
        senderId: env.senderId as string,
        body,
        ts: (env.timestamp as number) ?? Date.now(),
        self: false,
        burnIn: (env.burnIn as number | null) ?? null,
        buffered: env.buffered === true,
      });
      this.sendAck(messageId);
      // We just spent a one-time prekey → top the published pool back up.
      void ensurePreKeysPublished(this.userId, this.identity.publicKeyB64);
    } catch {
      /* undecryptable — drop silently */
    }
  }

  private sendAck(messageId: string) {
    this.socket.emit("ack", { senderId: this.userId, messageId });
  }
}

/** Connections in the room, minus ourselves → the number of real contacts. */
function otherCount(connectionCount: unknown): number {
  const n = typeof connectionCount === "number" ? connectionCount : 1;
  return Math.max(0, n - 1);
}
