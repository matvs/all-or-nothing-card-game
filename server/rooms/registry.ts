import { generateRoomCode } from "../../shared/id.js";
import { DEFAULT_ROOM_SETTINGS, type RoomSettings } from "../../shared/protocol.js";
import type { StatsStore } from "../db/stats.js";
import { Room, type RoomDeps } from "./room.js";

export interface RegistryOptions {
  statsStore: StatsStore;
  aiThinkDelayMs: number;
  reconnectGraceMs: number;
  /** Rooms with no live connections for longer than this are swept. */
  idleRoomTtlMs?: number;
  sweepIntervalMs?: number;
  rng?: () => number;
  now?: () => number;
}

export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private opts: Required<Pick<RegistryOptions, "idleRoomTtlMs" | "sweepIntervalMs">> & RegistryOptions;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  /** Tracks when each room last had at least one live connection. */
  private lastActive = new Map<string, number>();

  constructor(options: RegistryOptions) {
    this.opts = {
      idleRoomTtlMs: 30 * 60 * 1000,
      sweepIntervalMs: 60 * 1000,
      ...options,
    };
    this.sweepTimer = setInterval(() => this.sweepIdleRooms(), this.opts.sweepIntervalMs);
    // Never keep the process alive just to garbage-collect rooms.
    this.sweepTimer.unref?.();
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  private roomDeps(): RoomDeps {
    return {
      statsStore: this.opts.statsStore,
      aiThinkDelayMs: this.opts.aiThinkDelayMs,
      reconnectGraceMs: this.opts.reconnectGraceMs,
      rng: this.opts.rng,
      now: this.opts.now,
    };
  }

  createRoom(hostName: string, settings?: Partial<RoomSettings>): { room: Room; playerId: string; token: string } {
    const code = this.generateUniqueCode();
    const merged: RoomSettings = { ...DEFAULT_ROOM_SETTINGS, ...stripUndefined(settings ?? {}) };
    const room = new Room(code, merged, this.roomDeps());
    const host = room.addHost(hostName);
    this.rooms.set(code, room);
    this.lastActive.set(code, this.now());
    return { room, playerId: host.playerId, token: host.token };
  }

  private generateUniqueCode(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      const code = generateRoomCode(this.opts.rng ?? Math.random);
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("Could not allocate a unique room code (registry saturated?)");
  }

  getRoom(code: string): Room | null {
    return this.rooms.get(code.toUpperCase()) ?? null;
  }

  markActive(code: string): void {
    this.lastActive.set(code.toUpperCase(), this.now());
  }

  roomCount(): number {
    return this.rooms.size;
  }

  /** Removes rooms that have had no live connection for idleRoomTtlMs. Exposed for tests. */
  sweepIdleRooms(): number {
    let swept = 0;
    for (const [code, room] of this.rooms) {
      if (room.hasAnyConnection()) {
        this.lastActive.set(code, this.now());
        continue;
      }
      const last = this.lastActive.get(code) ?? room.createdAt;
      if (this.now() - last > this.opts.idleRoomTtlMs) {
        room.dispose();
        this.rooms.delete(code);
        this.lastActive.delete(code);
        swept++;
      }
    }
    return swept;
  }

  dispose(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
    this.lastActive.clear();
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
