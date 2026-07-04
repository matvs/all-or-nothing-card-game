import { randomUUID } from "node:crypto";
import { generateRoomCode } from "../../shared/id.js";
import { ROOM_NAME_MAX_LENGTH } from "../../shared/protocol.js";
import { type PlayerIdentity, Room } from "./room.js";

const FORBIDDEN = new Set(["kurwa", "dick", "fuck"]);

export interface RegistryOptions {
  /** Seed a couple of always-open rooms for demos/manual testing. */
  seedRooms?: string[];
}

/**
 * In-memory store of player identities and rooms. Player identity is keyed by
 * an opaque token so a browser can reconnect (after a refresh or a drop) and
 * be recognised as the same player, keeping its seat and score.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly byToken = new Map<string, PlayerIdentity>();
  private readonly byId = new Map<string, PlayerIdentity>();

  constructor(options: RegistryOptions = {}) {
    for (const id of options.seedRooms ?? ["demo"]) {
      this.rooms.set(id, new Room(id));
    }
  }

  // -- players -------------------------------------------------------------

  createPlayer(name: string): PlayerIdentity {
    const identity: PlayerIdentity = { id: randomUUID(), name, token: randomUUID() };
    this.byToken.set(identity.token, identity);
    this.byId.set(identity.id, identity);
    return identity;
  }

  playerByToken(token: string | undefined): PlayerIdentity | undefined {
    return token ? this.byToken.get(token) : undefined;
  }

  /** Resolve the auth handshake to a known identity (or undefined if stale). */
  resolveIdentity(auth: { token?: string; playerId?: string }): PlayerIdentity | undefined {
    const byToken = this.playerByToken(auth.token);
    if (byToken && byToken.id === auth.playerId) return byToken;
    return byToken;
  }

  // -- rooms ---------------------------------------------------------------

  /** Create a room. Empty name → random code. Returns error codes like the original. */
  createRoom(roomId?: string):
    | { id: string }
    | { id: string; error: true; errorCode: "alreadyExists" | "invalidName" } {
    let id = roomId?.trim();
    if (id) {
      if (id.length > ROOM_NAME_MAX_LENGTH || FORBIDDEN.has(id.toLowerCase())) {
        return { id, error: true, errorCode: "invalidName" };
      }
      if (this.rooms.has(id)) {
        return { id, error: true, errorCode: "alreadyExists" };
      }
    } else {
      id = generateRoomCode();
      while (this.rooms.has(id)) id = generateRoomCode();
    }
    this.rooms.set(id, new Room(id));
    return { id };
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getOrCreateRoom(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Room(roomId);
      this.rooms.set(roomId, room);
    }
    return room;
  }

  deleteRoom(roomId: string): void {
    this.rooms.delete(roomId);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  dispose(): void {
    this.rooms.clear();
    this.byToken.clear();
    this.byId.clear();
  }
}
