/**
 * room.js — Durable Object: per-room WebSocket relay.
 * Never inspects message content — only routes encrypted envelopes.
 * Exported as named class; bound in wrangler.toml as "ROOMS".
 */

const INACTIVITY_WARNING_MS = 23 * 60 * 60 * 1000;
const INACTIVITY_DESTRUCT_MS = 24 * 60 * 60 * 1000;

// How long an undelivered (offline) message is retained in DO storage before
// being swept. Mirrors DEFAULT_MESSAGE_TTL (7d) unless overridden.
const DEFAULT_OFFLINE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MBX_PREFIX = 'mbx:';
// Envelope types whose content is buffered for offline delivery.
const BUFFERED_TYPES = ['message', 'file_meta', 'voice_meta'];

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    /** @type {Map<string, WebSocket>} connectionId → WebSocket */
    this.connections = new Map();
    this.lastActivity = Date.now();
    this.inactivityTimer = null;
  }

  offlineTtlMs() {
    const fromEnv = parseInt(this.env.DEFAULT_MESSAGE_TTL || '', 10);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv * 1000 : DEFAULT_OFFLINE_TTL_MS;
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    await this.handleSession(server, request);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** @param {WebSocket} ws @param {Request} request */
  async handleSession(ws, request) {
    this.state.acceptWebSocket(ws);

    const url = new URL(request.url);
    const connectionId = crypto.randomUUID();

    ws.serializeAttachment({ connectionId });
    this.connections.set(connectionId, ws);

    this.resetInactivityTimer();

    const joinEvent = JSON.stringify({
      type: 'peer_joined',
      connectionId,
      connectionCount: this.connections.size,
      timestamp: Date.now(),
    });
    this.broadcast(joinEvent, connectionId);
  }

  /** @param {WebSocket} ws @param {string|ArrayBuffer} message */
  async webSocketMessage(ws, message) {
    this.lastActivity = Date.now();
    this.resetInactivityTimer();

    let envelope;
    try {
      envelope = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      ws.close(1008, 'Invalid message format');
      return;
    }

    const att = ws.deserializeAttachment() ?? {};
    const { connectionId } = att;

    if (!this.isValidEnvelope(envelope)) {
      return;
    }

    // Learn this connection's app-level identity (carried on every envelope) and,
    // the first time we see it, deliver anything buffered while they were away.
    if (att.userId !== envelope.senderId) {
      att.userId = envelope.senderId;
      ws.serializeAttachment(att);
      await this.flushMailbox(envelope.senderId, ws);
    }

    const allowedTypes = ['message', 'typing', 'receipt', 'public_key', 'reaction', 'file_meta', 'voice_meta', 'ack'];
    if (!allowedTypes.includes(envelope.type)) {
      return;
    }

    // Acks are control messages: they delete the buffered copy and aren't relayed.
    if (envelope.type === 'ack') {
      await this.dropBufferedMessage(envelope.messageId);
      return;
    }

    const outbound = JSON.stringify({ ...envelope, relayedAt: Date.now() });

    if (envelope.type === 'receipt') {
      this.sendToConnection(envelope.targetConnectionId, outbound);
      return;
    }

    this.broadcast(outbound, connectionId);

    // Persist content envelopes so a peer who is offline right now can still
    // receive them on reconnect. Online recipients are recorded as delivered.
    if (BUFFERED_TYPES.includes(envelope.type)) {
      await this.bufferMessage(envelope);
    }
  }

  /** @param {WebSocket} ws @param {number} code @param {string} reason */
  async webSocketClose(ws, code, reason) {
    const { connectionId } = ws.deserializeAttachment();
    this.connections.delete(connectionId);

    const leaveEvent = JSON.stringify({
      type: 'peer_left',
      connectionId,
      connectionCount: this.connections.size,
      timestamp: Date.now(),
    });
    this.broadcast(leaveEvent, null);

    if (this.connections.size === 0) {
      this.clearInactivityTimer();
    }
  }

  /** @param {WebSocket} ws @param {Error} error */
  async webSocketError(ws, error) {
    const { connectionId } = ws.deserializeAttachment() ?? {};
    if (connectionId) {
      this.connections.delete(connectionId);
    }
    ws.close(1011, 'Internal error');
  }

  /**
   * Broadcasts a message to all connections except the sender.
   * @param {string} message - Serialised JSON string.
   * @param {string|null} excludeId - Connection ID to exclude (null = send to all).
   */
  broadcast(message, excludeId) {
    for (const [id, ws] of this.connections) {
      if (id !== excludeId) {
        try {
          ws.send(message);
        } catch {
          this.connections.delete(id);
        }
      }
    }
  }

  /**
   * Sends to a specific connection by ID.
   * @param {string} targetId
   * @param {string} message
   */
  sendToConnection(targetId, message) {
    const ws = this.connections.get(targetId);
    if (ws) {
      try {
        ws.send(message);
      } catch {
        this.connections.delete(targetId);
      }
    }
  }

  // ─── Offline mailbox (store-and-forward) ──────────────────────────────────────
  //
  // Content envelopes are persisted in this Durable Object's own storage as
  // OPAQUE CIPHERTEXT (the server holds no keys and never decrypts). The mailbox
  // is simply the set of UNACKNOWLEDGED messages: a message is re-sent to a
  // recipient on every (re)connect until they acknowledge receipt (which deletes
  // it) or its TTL elapses. The client de-duplicates by messageId, so a message
  // that was already shown live is never displayed twice. This "keep until acked"
  // model means a recipient who briefly received but never processed a message
  // (e.g. a tab crash before ack) still gets it again — nothing is lost.

  /** Persists a content envelope until its recipient acknowledges it. */
  async bufferMessage(envelope) {
    const messageId = envelope.messageId;
    if (typeof messageId !== 'string') return;

    const expiresAt = Date.now() + this.offlineTtlMs();
    await this.state.storage.put(`${MBX_PREFIX}${messageId}`, {
      messageId,
      senderId: envelope.senderId,
      env: envelope,
      expiresAt,
    });
    await this.scheduleCleanup(expiresAt);
  }

  /** Sends a (re)connecting user every unacknowledged message they didn't author. */
  async flushMailbox(userId, ws) {
    const stored = await this.state.storage.list({ prefix: MBX_PREFIX });
    const now = Date.now();

    for (const [key, record] of stored) {
      if (record.expiresAt && now > record.expiresAt) {
        await this.state.storage.delete(key);
        continue;
      }
      if (record.senderId === userId) continue;

      try {
        ws.send(JSON.stringify({ ...record.env, relayedAt: now, buffered: true }));
      } catch {
        // Socket went away mid-flush; leave it buffered for next time.
        break;
      }
    }
  }

  /** Drops a buffered message once its recipient confirms receipt (1:1 ack). */
  async dropBufferedMessage(messageId) {
    if (typeof messageId !== 'string') return;
    await this.state.storage.delete(`${MBX_PREFIX}${messageId}`);
  }

  /** Ensures an alarm is set to sweep expired buffered messages. */
  async scheduleCleanup(expiresAt) {
    const current = await this.state.storage.getAlarm();
    if (current === null || current > expiresAt + 1000) {
      await this.state.storage.setAlarm(expiresAt + 1000);
    }
  }

  /** DO alarm: delete expired buffered messages and reschedule if any remain. */
  async alarm() {
    const now = Date.now();
    const stored = await this.state.storage.list({ prefix: MBX_PREFIX });
    let next = null;

    for (const [key, record] of stored) {
      if (record.expiresAt && now > record.expiresAt) {
        await this.state.storage.delete(key);
      } else if (record.expiresAt) {
        next = next === null ? record.expiresAt : Math.min(next, record.expiresAt);
      }
    }
    if (next !== null) await this.state.storage.setAlarm(next + 1000);
  }

  /**
   * Validates that an envelope has the required non-content fields.
   * Server never validates or reads ciphertext/plaintext.
   * @param {object} envelope
   * @returns {boolean}
   */
  isValidEnvelope(envelope) {
    if (!envelope || typeof envelope !== 'object') return false;
    if (typeof envelope.type !== 'string') return false;
    if (typeof envelope.senderId !== 'string') return false;
    if (typeof envelope.timestamp !== 'number') return false;
    return true;
  }

  resetInactivityTimer() {
    this.clearInactivityTimer();

    this.inactivityTimer = setTimeout(async () => {
      const warningEvent = JSON.stringify({
        type: 'room_expiring',
        expiresIn: INACTIVITY_DESTRUCT_MS - INACTIVITY_WARNING_MS,
        timestamp: Date.now(),
      });
      this.broadcast(warningEvent, null);

      setTimeout(() => this.destroyRoom(), INACTIVITY_DESTRUCT_MS - INACTIVITY_WARNING_MS);
    }, INACTIVITY_WARNING_MS);
  }

  clearInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  async destroyRoom() {
    const destructEvent = JSON.stringify({
      type: 'room_destroyed',
      reason: 'inactivity',
      timestamp: Date.now(),
    });
    this.broadcast(destructEvent, null);

    for (const [, ws] of this.connections) {
      try { ws.close(1001, 'Room destroyed'); } catch { /* already closed */ }
    }
    this.connections.clear();
    await this.state.storage.deleteAll();
  }
}
