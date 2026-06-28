/**
 * socket.js — WebSocket client with auto-reconnect, heartbeat, and typed events.
 * Connection state machine: disconnected → connecting → connected → reconnecting.
 * Exports a SocketClient class; instantiated once per room in room.js.
 */

const HEARTBEAT_INTERVAL_MS = 30_000;
const BACKOFF_SEQUENCE_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_QUEUE_SIZE = 100;

export class SocketClient {
  /**
   * @param {string} roomId - The room this socket serves.
   * @param {string} workerUrl - Base URL of the Cloudflare Worker (wss://...).
   */
  constructor(roomId, workerUrl) {
    this.roomId = roomId;
    this.workerUrl = workerUrl;
    this.ws = null;
    this.state = 'disconnected';
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.paused = false;

    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
    /** @type {Array<string>} Messages queued while paused or reconnecting */
    this.sendQueue = [];
  }

  // ─── Connection lifecycle ──────────────────────────────────────────────────

  connect() {
    if (this.state === 'connected' || this.state === 'connecting') return;
    this._setState('connecting');

    const url = `${this.workerUrl}/ws/${this.roomId}`;
    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => this._onOpen());
    this.ws.addEventListener('message', e => this._onMessage(e));
    this.ws.addEventListener('close', e => this._onClose(e));
    this.ws.addEventListener('error', e => this._onError(e));
  }

  disconnect() {
    this._clearTimers();
    this.reconnectAttempts = 0;
    this._setState('disconnected');
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  // ─── Pause / resume (for panic mode) ──────────────────────────────────────

  /**
   * Pauses outgoing sends; queues messages internally.
   * WebSocket connection stays alive (reads still work).
   */
  pause() {
    this.paused = true;
  }

  /**
   * Resumes outgoing sends and flushes the queue.
   */
  resume() {
    this.paused = false;
    this._flushQueue();
  }

  // ─── Event emitter interface ───────────────────────────────────────────────

  /**
   * Registers a listener for a typed event.
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
  }

  /**
   * Removes a previously registered listener.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    this.listeners.get(event)?.delete(handler);
  }

  /**
   * Sends a typed message envelope to the server.
   * Queues if paused or not yet connected.
   * @param {string} type - Message type.
   * @param {object} payload - Additional fields to include.
   */
  emit(type, payload = {}) {
    const envelope = JSON.stringify({ type, ...payload, timestamp: Date.now() });

    if (this.paused || this.state !== 'connected') {
      if (this.sendQueue.length < MAX_QUEUE_SIZE) {
        this.sendQueue.push(envelope);
      }
      return;
    }

    this._send(envelope);
  }

  // ─── Internal handlers ─────────────────────────────────────────────────────

  _onOpen() {
    this._setState('connected');
    this.reconnectAttempts = 0;
    this._startHeartbeat();
    this._flushQueue();
    this._emit('connected', {});
  }

  _onMessage(event) {
    let envelope;
    try {
      envelope = JSON.parse(event.data);
    } catch {
      return;
    }

    if (envelope.type === 'pong') return;

    this._emit(envelope.type, envelope);
    this._emit('*', envelope);
  }

  _onClose(event) {
    this._clearTimers();

    if (event.code === 1000 || event.code === 1001) {
      this._setState('disconnected');
      return;
    }

    this._reconnect();
  }

  _onError() {
    // close event always follows error; reconnect handled there
  }

  // ─── Reconnection ──────────────────────────────────────────────────────────

  _reconnect() {
    this._setState('reconnecting');
    this._emit('reconnecting', { attempt: this.reconnectAttempts + 1 });

    const delay = BACKOFF_SEQUENCE_MS[
      Math.min(this.reconnectAttempts, BACKOFF_SEQUENCE_MS.length - 1)
    ];
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      if (this.state === 'reconnecting') this.connect();
    }, delay);
  }

  // ─── Heartbeat ─────────────────────────────────────────────────────────────

  _startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.state === 'connected') {
        this._send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  _send(data) {
    try {
      this.ws?.send(data);
    } catch {
      this._reconnect();
    }
  }

  _flushQueue() {
    while (this.sendQueue.length > 0 && this.state === 'connected' && !this.paused) {
      this._send(this.sendQueue.shift());
    }
  }

  _setState(state) {
    this.state = state;
    this._emit('state_change', { state });
  }

  _emit(event, data) {
    this.listeners.get(event)?.forEach(h => {
      try { h(data); } catch (e) { console.error(`Socket listener error [${event}]:`, e); }
    });
  }

  _clearTimers() {
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.reconnectTimer);
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
  }
}
