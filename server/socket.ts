import type { IncomingMessage } from "node:http";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { VoiceSignalingRelay, VOICE_PEER_LEFT } from "@matvs/core-realtime/signaling";
import {
  CHAT_MAX_LENGTH,
  type ClaimAck,
  type RtcSignalData,
  type SeatColor,
  START_COUNTDOWN_SECONDS,
} from "../shared/protocol.js";
import type { RoomRegistry } from "./rooms/registry.js";
import type { Room } from "./rooms/room.js";

/** Per-connection state kept beside each raw WebSocket. */
interface ConnData {
  playerId: string;
  name: string;
  rooms: Set<string>;
  isAlive: boolean;
}

interface Envelope {
  t: string;
  d?: unknown;
  id?: number;
}

const HEARTBEAT_MS = 30000;

/**
 * Realtime gateway over NATIVE WebSockets (the `ws` library) — no Socket.IO, for
 * lowest latency. Speaks a tiny JSON envelope `{ t: type, d: payload, id? }`;
 * `id` marks a request that expects a single `{ t:"__ack", id, d }` reply (used
 * by the server-authoritative claim). It owns room/player socket membership,
 * broadcasts, WebRTC signalling relay, and a ping/pong heartbeat.
 */
export class WsGateway {
  private readonly conns = new Map<WebSocket, ConnData>();
  private readonly roomMembers = new Map<string, Set<WebSocket>>();
  private readonly playerSockets = new Map<string, Set<WebSocket>>();
  private readonly countdowns = new Map<string, NodeJS.Timeout>();
  private readonly heartbeat: NodeJS.Timeout;

  /**
   * WebRTC voice signalling is delegated to the shared `@matvs/core-realtime`
   * relay (peer discovery + SDP/ICE forwarding). Membership is delegated back to
   * the `Room` objects so the room snapshot's `voice[]` stays the source of truth.
   * Media is peer-to-peer and never reaches this server.
   */
  private readonly voice: VoiceSignalingRelay<WebSocket>;

  constructor(
    private readonly wss: WebSocketServer,
    private readonly registry: RoomRegistry,
  ) {
    this.wss.on("connection", (ws, req) => this.onConnection(ws, req));
    this.heartbeat = setInterval(() => this.pingAll(), HEARTBEAT_MS);
    this.voice = new VoiceSignalingRelay<WebSocket>(
      {
        toConn: (ws, t, d) => this.send(ws, t, d),
        toRoom: (roomId, t, d, except) => this.broadcast(roomId, t, d, except),
        toPlayer: (playerId, t, d) => this.toPlayer(playerId, t, d),
        isRoomMember: (roomId, playerId) => this.registry.getRoom(roomId)?.has(playerId) ?? false,
      },
      {
        membership: {
          join: (roomId, playerId) => this.registry.getRoom(roomId)?.voiceJoin(playerId) ?? [],
          leave: (roomId, playerId) => {
            this.registry.getRoom(roomId)?.voiceLeave(playerId);
          },
          members: (roomId) => this.registry.getRoom(roomId)?.voice ?? [],
        },
      },
    );
  }

  dispose(): void {
    clearInterval(this.heartbeat);
    for (const timer of this.countdowns.values()) clearInterval(timer);
    this.countdowns.clear();
    for (const ws of this.wss.clients) ws.terminate();
  }

  // -- low-level send helpers ------------------------------------------------

  private send(ws: WebSocket, t: string, d?: unknown): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t, d }));
  }

  private ack(ws: WebSocket, id: number | undefined, d: unknown): void {
    if (id !== undefined && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: "__ack", id, d }));
  }

  /** Broadcast to every socket in a room (optionally excluding one). */
  private broadcast(roomId: string, t: string, d: unknown, except?: WebSocket): void {
    const members = this.roomMembers.get(roomId);
    if (!members) return;
    const raw = JSON.stringify({ t, d });
    for (const ws of members) {
      if (ws !== except && ws.readyState === ws.OPEN) ws.send(raw);
    }
  }

  /** Send to every socket belonging to one player id (multi-tab aware). */
  private toPlayer(playerId: string, t: string, d: unknown): void {
    const sockets = this.playerSockets.get(playerId);
    if (!sockets) return;
    const raw = JSON.stringify({ t, d });
    for (const ws of sockets) if (ws.readyState === ws.OPEN) ws.send(raw);
  }

  // -- connection lifecycle --------------------------------------------------

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url ?? "/", "http://localhost");
    const auth = {
      token: url.searchParams.get("token") ?? undefined,
      playerId: url.searchParams.get("playerId") ?? undefined,
      name: url.searchParams.get("name") ?? undefined,
    };
    const identity = this.registry.resolveIdentity(auth);
    if (!identity) {
      // Unknown/stale token (e.g. server restarted): ask the client to re-login.
      this.send(ws, "room:state", {
        roomId: "",
        players: [],
        chat: [],
        game: { running: false, board: [], setsAvailable: 0, deckRemaining: 0 },
        voice: [],
        countdown: null,
      });
      ws.close();
      return;
    }

    const data: ConnData = { playerId: identity.id, name: identity.name, rooms: new Set(), isAlive: true };
    this.conns.set(ws, data);
    this.track(identity.id, ws);

    ws.on("message", (raw) => this.onMessage(ws, raw));
    ws.on("pong", () => {
      data.isAlive = true;
    });
    ws.on("close", () => this.onClose(ws));
    ws.on("error", () => ws.terminate());
  }

  private onMessage(ws: WebSocket, raw: RawData): void {
    let env: Envelope;
    try {
      env = JSON.parse(raw.toString()) as Envelope;
    } catch {
      return;
    }
    if (env.t === "__ping") {
      this.send(ws, "__pong");
      return;
    }
    const data = this.conns.get(ws);
    if (!data) return;

    switch (env.t) {
      case "room:join":
        this.onJoin(ws, data, env.d as string);
        break;
      case "room:sit":
        this.onSit(data, env.d as { roomId: string; color: SeatColor });
        break;
      case "game:start":
        this.onStart(data, env.d as string);
        break;
      case "game:claim":
        this.onClaim(ws, data, env.d as { roomId: string; cardIds: number[] }, env.id);
        break;
      case "chat:send":
        this.onChat(data, env.d as { roomId: string; text: string });
        break;
      case "cursor:move":
        this.onCursor(ws, data, env.d as { roomId: string; x: number; y: number });
        break;
      case "voice:join":
        this.onVoiceJoin(ws, data, env.d as string);
        break;
      case "voice:leave":
        this.onVoiceLeave(ws, data, env.d as string);
        break;
      case "voice:signal":
        this.onVoiceSignal(ws, data, env.d as { roomId: string; to: string; data: RtcSignalData });
        break;
    }
  }

  // -- membership ------------------------------------------------------------

  private onJoin(ws: WebSocket, data: ConnData, roomId: string): void {
    if (!roomId || typeof roomId !== "string") return;
    const room = this.registry.getOrCreateRoom(roomId);
    room.join({ id: data.playerId, name: data.name, token: "" });

    let members = this.roomMembers.get(roomId);
    if (!members) {
      members = new Set();
      this.roomMembers.set(roomId, members);
    }
    members.add(ws);
    data.rooms.add(roomId);

    this.send(ws, "room:state", room.snapshot());
    this.broadcast(roomId, "room:playerJoined", { id: data.playerId, name: data.name }, ws);
    this.broadcast(roomId, "room:players", room.roster());
  }

  private onSit(data: ConnData, msg: { roomId: string; color: SeatColor }): void {
    const room = this.registry.getRoom(msg?.roomId);
    if (!room) return;
    if (room.sit(data.playerId, msg.color)) {
      this.broadcast(room.id, "room:players", room.roster());
    }
  }

  // -- game lifecycle --------------------------------------------------------

  private onStart(data: ConnData, roomId: string): void {
    const room = this.registry.getRoom(roomId);
    if (!room || room.isRunning) return;

    const everyoneReady = room.markReady(data.playerId);
    this.broadcast(room.id, "room:players", room.roster());
    if (everyoneReady) {
      this.beginGame(room);
      return;
    }
    if (this.countdowns.has(room.id)) return;

    let left = START_COUNTDOWN_SECONDS;
    room.countdown = left;
    this.broadcast(room.id, "game:countdown", left);
    const timer = setInterval(() => {
      if (room.allSeatedReady()) {
        this.beginGame(room);
        return;
      }
      left -= 1;
      room.countdown = left;
      if (left <= 0) {
        clearInterval(timer);
        this.countdowns.delete(room.id);
        room.cancelStart();
        this.broadcast(room.id, "game:countdown", null);
        this.broadcast(room.id, "room:players", room.roster());
        return;
      }
      this.broadcast(room.id, "game:countdown", left);
    }, 1000);
    this.countdowns.set(room.id, timer);
  }

  private beginGame(room: Room): void {
    const timer = this.countdowns.get(room.id);
    if (timer) {
      clearInterval(timer);
      this.countdowns.delete(room.id);
    }
    const state = room.begin();
    this.broadcast(room.id, "game:countdown", null);
    this.broadcast(room.id, "game:started", state);
    this.broadcast(room.id, "room:players", room.roster());
  }

  private onClaim(
    ws: WebSocket,
    data: ConnData,
    msg: { roomId: string; cardIds: number[] },
    reqId: number | undefined,
  ): void {
    const room = this.registry.getRoom(msg?.roomId);
    if (!room) {
      this.ack(ws, reqId, { ok: false, reason: "not-running", explanation: null } satisfies ClaimAck);
      return;
    }
    const outcome = room.claim(data.playerId, msg.cardIds ?? []);
    if (outcome.ok) {
      this.ack(ws, reqId, { ok: true, cards: outcome.cards, explanation: outcome.explanation } satisfies ClaimAck);
      this.broadcast(room.id, "game:claimAccepted", {
        playerId: outcome.player.id,
        name: outcome.player.name,
        color: outcome.player.color,
        cards: outcome.cards,
        explanation: outcome.explanation,
        points: outcome.player.points,
      });
      this.broadcast(room.id, "game:board", room.gameState());
      this.broadcast(room.id, "room:players", room.roster());
      if (room.isOver()) {
        this.broadcast(room.id, "game:over", { players: room.roster(), winnerIds: room.winnerIds() });
      }
    } else {
      this.ack(ws, reqId, { ok: false, reason: outcome.reason, explanation: outcome.explanation } satisfies ClaimAck);
      if (outcome.player) {
        this.broadcast(room.id, "game:claimRejected", {
          playerId: outcome.player.id,
          points: outcome.player.points,
        });
        this.broadcast(room.id, "room:players", room.roster());
      }
    }
  }

  // -- chat ------------------------------------------------------------------

  private onChat(data: ConnData, msg: { roomId: string; text: string }): void {
    const room = this.registry.getRoom(msg?.roomId);
    if (!room) return;
    const text = String(msg.text ?? "").trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;
    const message = room.addChat(data.playerId, text);
    if (message) this.broadcast(room.id, "chat:message", message);
  }

  // -- cursors ---------------------------------------------------------------

  private onCursor(ws: WebSocket, data: ConnData, msg: { roomId: string; x: number; y: number }): void {
    const room = this.registry.getRoom(msg?.roomId);
    if (!room) return;
    const color = room.setCursor(data.playerId, msg.x, msg.y);
    this.broadcast(room.id, "cursor:update", { playerId: data.playerId, color, x: msg.x, y: msg.y }, ws);
  }

  // -- voice (WebRTC signalling relay) ---------------------------------------
  // Delegated to @matvs/core-realtime's VoiceSignalingRelay (see `this.voice`).
  // The relay owns the wire protocol (peer discovery + SDP/ICE forwarding); this
  // app keeps voice membership in its Room objects via the injected adapter.

  private onVoiceJoin(ws: WebSocket, data: ConnData, roomId: string): void {
    this.voice.onJoin(ws, roomId, data.playerId);
  }

  private onVoiceLeave(ws: WebSocket, data: ConnData, roomId: string): void {
    this.voice.onLeave(ws, roomId, data.playerId);
  }

  private onVoiceSignal(
    ws: WebSocket,
    data: ConnData,
    msg: { roomId: string; to: string; data: RtcSignalData },
  ): void {
    this.voice.onSignal(ws, data.playerId, msg);
  }

  // -- disconnect / reconnection --------------------------------------------

  private onClose(ws: WebSocket): void {
    const data = this.conns.get(ws);
    this.conns.delete(ws);
    if (!data) return;

    for (const roomId of data.rooms) this.roomMembers.get(roomId)?.delete(ws);

    const stillConnected = this.untrack(data.playerId, ws);
    if (stillConnected) return; // another tab keeps the player online

    for (const roomId of data.rooms) {
      const room = this.registry.getRoom(roomId);
      if (!room) continue;
      room.markOffline(data.playerId);
      this.broadcast(roomId, "room:players", room.roster());
      this.broadcast(roomId, VOICE_PEER_LEFT, data.playerId);
    }
  }

  private track(playerId: string, ws: WebSocket): void {
    let set = this.playerSockets.get(playerId);
    if (!set) {
      set = new Set();
      this.playerSockets.set(playerId, set);
    }
    set.add(ws);
  }

  /** Remove a socket; return true if the player still has another socket. */
  private untrack(playerId: string, ws: WebSocket): boolean {
    const set = this.playerSockets.get(playerId);
    if (!set) return false;
    set.delete(ws);
    if (set.size === 0) {
      this.playerSockets.delete(playerId);
      return false;
    }
    return true;
  }

  private pingAll(): void {
    for (const ws of this.wss.clients) {
      const data = this.conns.get(ws);
      if (data && data.isAlive === false) {
        ws.terminate();
        continue;
      }
      if (data) data.isAlive = false;
      ws.ping();
    }
  }
}
