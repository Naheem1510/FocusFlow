/**
 * socket.ts — WebSocket client with auto-reconnect, heartbeat and typed events.
 * TypeScript port of the secure-workspace SocketClient. State machine:
 * disconnected → connecting → connected → reconnecting.
 *
 * The server (a Cloudflare Durable Object) only relays envelopes; it never reads
 * ciphertext. Every outbound envelope carries { type, senderId, timestamp }.
 */

const HEARTBEAT_INTERVAL_MS = 30_000;
const BACKOFF_SEQUENCE_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_QUEUE_SIZE = 100;

export type SocketState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface Envelope {
  type: string;
  senderId?: string;
  timestamp?: number;
  [key: string]: unknown;
}

type Handler = (data: Envelope) => void;

export class SocketClient {
  readonly roomId: string;
  readonly workerWsUrl: string;
  private ws: WebSocket | null = null;
  private state: SocketState = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Map<string, Set<Handler>>();
  private sendQueue: string[] = [];

  constructor(roomId: string, workerWsUrl: string) {
    this.roomId = roomId;
    this.workerWsUrl = workerWsUrl;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  connect() {
    if (this.state === "connected" || this.state === "connecting") return;
    this.setState("connecting");

    this.ws = new WebSocket(`${this.workerWsUrl}/ws/${this.roomId}`);
    this.ws.addEventListener("open", () => this.onOpen());
    this.ws.addEventListener("message", (e) => this.onMessage(e));
    this.ws.addEventListener("close", (e) => this.onClose(e));
    this.ws.addEventListener("error", () => {
      /* close always follows; reconnect handled there */
    });
  }

  disconnect() {
    this.clearTimers();
    this.reconnectAttempts = 0;
    this.setState("disconnected");
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
  }

  // ─── Event emitter ──────────────────────────────────────────────────────────

  on(event: string, handler: Handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: Handler) {
    this.listeners.get(event)?.delete(handler);
  }

  /** Sends a typed envelope. Queues if not yet connected. */
  emit(type: string, payload: Record<string, unknown> = {}) {
    const envelope = JSON.stringify({ ...payload, type, timestamp: Date.now() });
    if (this.state !== "connected") {
      if (this.sendQueue.length < MAX_QUEUE_SIZE) this.sendQueue.push(envelope);
      return;
    }
    this.rawSend(envelope);
  }

  getState(): SocketState {
    return this.state;
  }

  // ─── Internal handlers ──────────────────────────────────────────────────────

  private onOpen() {
    this.setState("connected");
    this.reconnectAttempts = 0;
    this.startHeartbeat();
    this.flushQueue();
    this.dispatch("connected", { type: "connected" });
  }

  private onMessage(event: MessageEvent) {
    let envelope: Envelope;
    try {
      envelope = JSON.parse(event.data as string);
    } catch {
      return;
    }
    if (envelope.type === "pong") return;
    this.dispatch(envelope.type, envelope);
    this.dispatch("*", envelope);
  }

  private onClose(event: CloseEvent) {
    this.clearTimers();
    if (event.code === 1000 || event.code === 1001) {
      this.setState("disconnected");
      this.dispatch("disconnected", { type: "disconnected" });
      return;
    }
    this.reconnect();
  }

  private reconnect() {
    this.setState("reconnecting");
    this.dispatch("reconnecting", {
      type: "reconnecting",
      attempt: this.reconnectAttempts + 1,
    });
    const delay =
      BACKOFF_SEQUENCE_MS[
        Math.min(this.reconnectAttempts, BACKOFF_SEQUENCE_MS.length - 1)
      ];
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      if (this.state === "reconnecting") this.connect();
    }, delay);
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.state === "connected") {
        this.rawSend(JSON.stringify({ type: "ping", timestamp: Date.now() }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private rawSend(data: string) {
    try {
      this.ws?.send(data);
    } catch {
      this.reconnect();
    }
  }

  private flushQueue() {
    while (this.sendQueue.length > 0 && this.state === "connected") {
      this.rawSend(this.sendQueue.shift()!);
    }
  }

  private setState(state: SocketState) {
    this.state = state;
    this.dispatch("state_change", { type: "state_change", state });
  }

  private dispatch(event: string, data: Envelope) {
    this.listeners.get(event)?.forEach((h) => {
      try {
        h(data);
      } catch (e) {
        console.error(`Socket listener error [${event}]:`, e);
      }
    });
  }

  private clearTimers() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
  }
}
