import type { SocketAuth } from "../../shared/protocol.js";

/**
 * Native-WebSocket client for the realtime game.
 *
 * The transport is a raw browser `WebSocket` (no Socket.IO) for lowest latency.
 * On top of it sits a tiny JSON envelope — `{ t: type, d: payload, id?: reqId }`
 * — and a small event API (`on` / `off` / `emit`) shaped like the one the room
 * and voice hooks expect, so those hooks are transport-agnostic. Extras the game
 * relies on: a synthetic `"connect"` event (re-fired on every reconnect so the
 * room re-joins), request/response `emit(type, data, ack)` for server-validated
 * claims, resilient exponential-backoff reconnection, and an app-level ping.
 */

type Handler = (data: unknown) => void;

export interface AppClientSocket {
  readonly connected: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(type: string, data?: unknown, ack?: (resp: any) => void): void;
  on<T = unknown>(type: string, handler: (data: T) => void): void;
  off<T = unknown>(type: string, handler: (data: T) => void): void;
  connect(): void;
  disconnect(): void;
}

interface Envelope {
  t: string;
  d?: unknown;
  id?: number;
}

const RECONNECT_MIN = 500;
const RECONNECT_MAX = 4000;
const PING_INTERVAL = 25000;

class NativeSocket implements AppClientSocket {
  private ws: WebSocket | null = null;
  private readonly listeners = new Map<string, Set<Handler>>();
  private readonly acks = new Map<number, (resp: unknown) => void>();
  private nextReqId = 1;
  private outbox: string[] = [];
  private closedByUser = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;

  constructor(private auth: SocketAuth) {
    this.connect();
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  setAuth(auth: SocketAuth): void {
    this.auth = auth;
  }

  private url(): string {
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const q = new URLSearchParams({
      token: this.auth.token,
      playerId: this.auth.playerId,
      name: this.auth.name,
    });
    return `${scheme}://${window.location.host}/ws?${q.toString()}`;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.closedByUser = false;
    const ws = new WebSocket(this.url());
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      for (const msg of this.outbox) ws.send(msg);
      this.outbox = [];
      this.startPing();
      this.dispatch("connect", undefined);
    };
    ws.onmessage = (event: MessageEvent) => {
      let env: Envelope;
      try {
        env = JSON.parse(typeof event.data === "string" ? event.data : "") as Envelope;
      } catch {
        return;
      }
      if (env.t === "__pong") return;
      if (env.t === "__ack" && typeof env.id === "number") {
        const ack = this.acks.get(env.id);
        if (ack) {
          this.acks.delete(env.id);
          ack(env.d);
        }
        return;
      }
      this.dispatch(env.t, env.d);
    };
    ws.onclose = () => {
      this.stopPing();
      this.dispatch("disconnect", undefined);
      if (!this.closedByUser) this.scheduleReconnect();
    };
    ws.onerror = () => {
      // Surfaced as a close; reconnection handles recovery.
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(RECONNECT_MIN * 2 ** this.reconnectAttempts, RECONNECT_MAX);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      if (this.connected) this.ws?.send(JSON.stringify({ t: "__ping" }));
    }, PING_INTERVAL);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private dispatch(type: string, data: unknown): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const handler of [...set]) handler(data);
  }

  private send(env: Envelope): void {
    const raw = JSON.stringify(env);
    if (this.connected) this.ws!.send(raw);
    else this.outbox.push(raw);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(type: string, data?: unknown, ack?: (resp: any) => void): void {
    if (ack) {
      const id = this.nextReqId++;
      this.acks.set(id, ack);
      this.send({ t: type, d: data, id });
    } else {
      this.send({ t: type, d: data });
    }
  }

  on<T = unknown>(type: string, handler: (data: T) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler as Handler);
  }

  off<T = unknown>(type: string, handler: (data: T) => void): void {
    this.listeners.get(type)?.delete(handler as Handler);
  }

  disconnect(): void {
    this.closedByUser = true;
    this.stopPing();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

let socket: NativeSocket | null = null;

/**
 * Open (once) the realtime connection with the player's identity in the URL so
 * the server can restore their seat + score on reconnect. Returns the shared
 * singleton; safe to call repeatedly.
 */
export function connectSocket(auth: SocketAuth): AppClientSocket {
  if (socket) {
    socket.setAuth(auth);
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = new NativeSocket(auth);
  return socket;
}

export function getSocket(): AppClientSocket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
