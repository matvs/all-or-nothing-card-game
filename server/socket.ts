import type { Server, Socket } from "socket.io";
import {
  CHAT_MAX_LENGTH,
  type ClientToServerEvents,
  type ServerToClientEvents,
  START_COUNTDOWN_SECONDS,
} from "../shared/protocol.js";
import type { RoomRegistry } from "./rooms/registry.js";
import type { Room } from "./rooms/room.js";

interface SocketData {
  playerId: string;
  name: string;
  rooms: Set<string>;
}

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Room used to address every socket belonging to one player id. */
const playerRoom = (playerId: string): string => `player:${playerId}`;

/**
 * Wires all realtime behaviour onto a Socket.IO server. Stateless beyond the
 * RoomRegistry: it just translates socket events into room-state mutations and
 * broadcasts, and relays WebRTC signalling between peers.
 */
export class SocketGateway {
  private readonly countdowns = new Map<string, NodeJS.Timeout>();
  /** playerId -> set of live socket ids (multi-tab / reconnect aware). */
  private readonly connections = new Map<string, Set<string>>();

  constructor(
    private readonly io: AppServer,
    private readonly registry: RoomRegistry,
  ) {
    this.io.on("connection", (socket) => this.onConnection(socket));
  }

  dispose(): void {
    for (const timer of this.countdowns.values()) clearInterval(timer);
    this.countdowns.clear();
  }

  private onConnection(socket: AppSocket): void {
    const auth = socket.handshake.auth as { token?: string; playerId?: string; name?: string };
    const identity = this.registry.resolveIdentity(auth);
    if (!identity) {
      // Unknown/stale token (e.g. server restarted): ask the client to re-login.
      socket.emit("room:state", {
        roomId: "",
        players: [],
        chat: [],
        game: { running: false, board: [], setsAvailable: 0, deckRemaining: 0 },
        voice: [],
        countdown: null,
      });
      socket.disconnect(true);
      return;
    }

    socket.data.playerId = identity.id;
    socket.data.name = identity.name;
    socket.data.rooms = new Set();
    socket.join(playerRoom(identity.id));
    this.track(identity.id, socket.id);

    socket.on("room:join", (roomId) => this.onJoin(socket, roomId));
    socket.on("room:sit", (msg) => this.onSit(socket, msg));
    socket.on("game:start", (roomId) => this.onStart(socket, roomId));
    socket.on("game:claim", (msg, ack) => this.onClaim(socket, msg, ack));
    socket.on("chat:send", (msg) => this.onChat(socket, msg));
    socket.on("cursor:move", (msg) => this.onCursor(socket, msg));
    socket.on("voice:join", (roomId) => this.onVoiceJoin(socket, roomId));
    socket.on("voice:leave", (roomId) => this.onVoiceLeave(socket, roomId));
    socket.on("voice:signal", (msg) => this.onVoiceSignal(socket, msg));
    socket.on("disconnect", () => this.onDisconnect(socket));
  }

  // -- membership ----------------------------------------------------------

  private onJoin(socket: AppSocket, roomId: string): void {
    if (!roomId || typeof roomId !== "string") return;
    const room = this.registry.getOrCreateRoom(roomId);
    const identity = { id: socket.data.playerId, name: socket.data.name, token: "" };
    room.join(identity);
    socket.join(roomId);
    socket.data.rooms.add(roomId);

    socket.emit("room:state", room.snapshot());
    socket.to(roomId).emit("room:playerJoined", { id: identity.id, name: identity.name });
    this.io.to(roomId).emit("room:players", room.roster());
  }

  private onSit(socket: AppSocket, msg: { roomId: string; color: import("../shared/protocol.js").SeatColor }): void {
    const room = this.registry.getRoom(msg?.roomId);
    if (!room) return;
    if (room.sit(socket.data.playerId, msg.color)) {
      this.io.to(room.id).emit("room:players", room.roster());
    }
  }

  // -- game lifecycle ------------------------------------------------------

  private onStart(socket: AppSocket, roomId: string): void {
    const room = this.registry.getRoom(roomId);
    if (!room || room.isRunning) return;

    const everyoneReady = room.markReady(socket.data.playerId);
    this.io.to(room.id).emit("room:players", room.roster());
    if (everyoneReady) {
      this.beginGame(room);
      return;
    }
    if (this.countdowns.has(room.id)) return;

    let left = START_COUNTDOWN_SECONDS;
    room.countdown = left;
    this.io.to(room.id).emit("game:countdown", left);
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
        this.io.to(room.id).emit("game:countdown", null);
        this.io.to(room.id).emit("room:players", room.roster());
        return;
      }
      this.io.to(room.id).emit("game:countdown", left);
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
    this.io.to(room.id).emit("game:countdown", null);
    this.io.to(room.id).emit("game:started", state);
    this.io.to(room.id).emit("room:players", room.roster());
  }

  private onClaim(
    socket: AppSocket,
    msg: { roomId: string; cardIds: number[] },
    ack: (result: import("../shared/protocol.js").ClaimAck) => void,
  ): void {
    const room = this.registry.getRoom(msg?.roomId);
    if (!room) {
      ack?.({ ok: false, reason: "not-running", explanation: null });
      return;
    }
    const outcome = room.claim(socket.data.playerId, msg.cardIds ?? []);
    if (outcome.ok) {
      ack?.({ ok: true, cards: outcome.cards, explanation: outcome.explanation });
      this.io.to(room.id).emit("game:claimAccepted", {
        playerId: outcome.player.id,
        name: outcome.player.name,
        color: outcome.player.color,
        cards: outcome.cards,
        explanation: outcome.explanation,
        points: outcome.player.points,
      });
      this.io.to(room.id).emit("game:board", room.gameState());
      if (room.isOver()) {
        this.io.to(room.id).emit("game:over", { players: room.roster(), winnerIds: room.winnerIds() });
      }
    } else {
      ack?.({ ok: false, reason: outcome.reason, explanation: outcome.explanation });
      if (outcome.player) {
        this.io.to(room.id).emit("game:claimRejected", {
          playerId: outcome.player.id,
          points: outcome.player.points,
        });
      }
    }
  }

  // -- chat ----------------------------------------------------------------

  private onChat(socket: AppSocket, msg: { roomId: string; text: string }): void {
    const room = this.registry.getRoom(msg?.roomId);
    if (!room) return;
    const text = String(msg.text ?? "").trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;
    const message = room.addChat(socket.data.playerId, text);
    if (message) this.io.to(room.id).emit("chat:message", message);
  }

  // -- cursors -------------------------------------------------------------

  private onCursor(socket: AppSocket, msg: { roomId: string; x: number; y: number }): void {
    const room = this.registry.getRoom(msg?.roomId);
    if (!room) return;
    const color = room.setCursor(socket.data.playerId, msg.x, msg.y);
    socket.to(room.id).emit("cursor:update", { playerId: socket.data.playerId, color, x: msg.x, y: msg.y });
  }

  // -- voice (WebRTC signalling relay) -------------------------------------

  private onVoiceJoin(socket: AppSocket, roomId: string): void {
    const room = this.registry.getRoom(roomId);
    if (!room || !room.has(socket.data.playerId)) return;
    const peers = room.voiceJoin(socket.data.playerId);
    // Newcomer receives the current peers and initiates offers to each.
    socket.emit("voice:peers", peers);
  }

  private onVoiceLeave(socket: AppSocket, roomId: string): void {
    const room = this.registry.getRoom(roomId);
    if (!room) return;
    room.voiceLeave(socket.data.playerId);
    socket.to(room.id).emit("voice:peerLeft", socket.data.playerId);
  }

  private onVoiceSignal(
    socket: AppSocket,
    msg: { roomId: string; to: string; data: import("../shared/protocol.js").RtcSignalData },
  ): void {
    const room = this.registry.getRoom(msg?.roomId);
    if (!room || !room.has(msg.to)) return;
    // Relay to every socket of the target player.
    this.io.to(playerRoom(msg.to)).emit("voice:signal", { from: socket.data.playerId, data: msg.data });
  }

  // -- disconnect / reconnection ------------------------------------------

  private onDisconnect(socket: AppSocket): void {
    const playerId = socket.data.playerId;
    if (!playerId) return;
    const stillConnected = this.untrack(playerId, socket.id);
    if (stillConnected) return; // another tab keeps the player online

    for (const roomId of socket.data.rooms) {
      const room = this.registry.getRoom(roomId);
      if (!room) continue;
      room.markOffline(playerId);
      this.io.to(roomId).emit("room:players", room.roster());
      this.io.to(roomId).emit("voice:peerLeft", playerId);
    }
  }

  private track(playerId: string, socketId: string): void {
    let set = this.connections.get(playerId);
    if (!set) {
      set = new Set();
      this.connections.set(playerId, set);
    }
    set.add(socketId);
  }

  /** Remove a socket; return true if the player still has another socket. */
  private untrack(playerId: string, socketId: string): boolean {
    const set = this.connections.get(playerId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
      this.connections.delete(playerId);
      return false;
    }
    return true;
  }
}
