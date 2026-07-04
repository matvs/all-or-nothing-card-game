import type { SeatIndex } from "../engine/types.js";
import {
  WS_PATH,
  type ClientMatchView,
  type ClientMessage,
  type CreateRoomResponse,
  type JoinRoomResponse,
  type RoomSettings,
  type RoomSnapshot,
  type ServerMessage,
} from "../../shared/protocol.js";
import { SessionEmitter, type GameSession, type SessionEvent } from "../game/session.js";

interface Credentials {
  code: string;
  playerId: string;
  token: string;
}

const CREDS_KEY = "aon.session";

export function saveCredentials(creds: Credentials): void {
  try {
    sessionStorage.setItem(CREDS_KEY, JSON.stringify(creds));
  } catch {
    /* private browsing etc. — reconnection across reloads just won't work */
  }
}

export function loadCredentials(): Credentials | null {
  try {
    const raw = sessionStorage.getItem(CREDS_KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  try {
    sessionStorage.removeItem(CREDS_KEY);
  } catch {
    /* ignore */
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function createRoom(name: string, settings: Partial<RoomSettings>): Promise<CreateRoomResponse> {
  return postJson<CreateRoomResponse>("/api/rooms", { name, settings });
}

export async function joinRoom(code: string, name: string, asSpectator: boolean): Promise<JoinRoomResponse> {
  return postJson<JoinRoomResponse>(`/api/rooms/${encodeURIComponent(code)}/join`, { name, asSpectator });
}

/**
 * Multiplayer session over a WebSocket. Auto-reconnects with exponential
 * backoff using the stored playerId+token, riding the server's 60s grace
 * window; a page reload rejoins the same seat via sessionStorage.
 */
export class RemoteSession implements GameSession {
  readonly kind = "remote" as const;
  mySeat: SeatIndex | null = null;
  isSpectator = false;
  readonly roomCode: string;

  private emitter = new SessionEmitter();
  private creds: Credentials;
  private ws: WebSocket | null = null;
  private room: RoomSnapshot | null = null;
  private match: ClientMatchView | null = null;
  private closedByUser = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(creds: Credentials) {
    this.creds = creds;
    this.roomCode = creds.code;
    saveCredentials(creds);
    this.connect();
  }

  private wsUrl(): string {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const params = new URLSearchParams({
      code: this.creds.code,
      playerId: this.creds.playerId,
      token: this.creds.token,
    });
    return `${proto}://${location.host}${WS_PATH}?${params}`;
  }

  private connect(): void {
    if (this.closedByUser) return;
    const socket = new WebSocket(this.wsUrl());
    this.ws = socket;

    socket.addEventListener("message", (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handleServerMessage(message);
    });

    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
    });

    socket.addEventListener("close", (event) => {
      if (this.ws !== socket) return; // superseded by a newer socket
      this.ws = null;
      // 4000 = server refused the handshake (bad token / AI takeover / no room):
      // reconnecting with the same credentials would loop forever.
      if (this.closedByUser || event.code === 4000) return;
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    const delay = Math.min(15000, 500 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt++;
    this.emitter.emit({ type: "connection", status: "reconnecting", detail: `Retrying in ${Math.round(delay / 1000)}s` });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case "welcome":
        this.mySeat = message.yourSeat;
        this.isSpectator = message.isSpectator;
        this.room = message.room;
        this.match = message.match;
        this.emitter.emit({ type: "connection", status: "connected" });
        this.emitter.emit({ type: "room", room: message.room });
        if (message.match) this.emitter.emit({ type: "match", match: message.match });
        break;
      case "roomUpdate":
        this.room = message.room;
        this.emitter.emit({ type: "room", room: message.room });
        break;
      case "matchState":
        this.match = message.match;
        this.emitter.emit({ type: "match", match: message.match });
        break;
      case "matchEnded":
        this.match = message.match;
        this.emitter.emit({ type: "match", match: message.match });
        this.emitter.emit({ type: "ended", match: message.match, winners: message.winners });
        break;
      case "chat":
        this.emitter.emit({ type: "chat", message: message.message });
        break;
      case "toast":
        this.emitter.emit({ type: "toast", text: message.text, level: message.level });
        break;
      case "error":
        if (message.code === "REJECTED" || message.code === "ROOM_NOT_FOUND" || message.code === "BAD_HANDSHAKE") {
          this.closedByUser = true; // do not retry a hopeless handshake
          clearCredentials();
          this.emitter.emit({ type: "connection", status: "rejected", detail: message.message });
        } else {
          this.emitter.emit({ type: "toast", text: message.message, level: "warn" });
        }
        break;
    }
  }

  subscribe(listener: (event: SessionEvent) => void): () => void {
    const unsubscribe = this.emitter.subscribe(listener);
    if (this.room) {
      queueMicrotask(() => {
        listener({ type: "room", room: this.room! });
        if (this.match) listener({ type: "match", match: this.match! });
      });
    }
    return unsubscribe;
  }

  getRoom(): RoomSnapshot | null {
    return this.room;
  }

  getMatch(): ClientMatchView | null {
    return this.match;
  }

  private send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.emitter.emit({ type: "toast", text: "Not connected — hold on, reconnecting…", level: "warn" });
    }
  }

  bid(amount: number): void {
    this.send({ type: "bid", amount });
  }

  play(cardId: string): void {
    this.send({ type: "play", cardId });
  }

  sendChat(text: string): void {
    this.send({ type: "chat", text });
  }

  startMatch(): void {
    this.send({ type: "startMatch" });
  }

  updateSettings(patch: Partial<RoomSettings>): void {
    this.send({ type: "updateSettings", settings: patch });
  }

  leave(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    clearCredentials();
    try {
      this.send({ type: "leaveRoom" });
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.emitter.emit({ type: "connection", status: "closed" });
  }
}
