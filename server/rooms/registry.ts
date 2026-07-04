import { generateRoomCode } from "../../shared/id.js";
import { Room, type RoomDeps } from "./room.js";

export interface RegistryOptions extends RoomDeps {
  /** Rooms with no live connections for longer than this are swept. */
  idleTtlMs?: number;
  sweepIntervalMs?: number;
  /** Deterministic code generator for tests. */
  codeRng?: () => number;
}

export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private lastActive = new Map<string, number>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private idleTtlMs: number;

  constructor(private opts: RegistryOptions = {}) {
    this.idleTtlMs = opts.idleTtlMs ?? 30 * 60 * 1000;
    const interval = opts.sweepIntervalMs ?? 60 * 1000;
    this.sweepTimer = setInterval(() => this.sweepIdle(), interval);
    this.sweepTimer.unref?.();
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  createRoom(hostName: string): { room: Room; playerId: string; token: string } {
    const code = this.uniqueCode();
    const room = new Room(code, this.opts);
    const { playerId, token } = room.addPlayer(hostName);
    this.rooms.set(code, room);
    this.lastActive.set(code, this.now());
    return { room, playerId, token };
  }

  private uniqueCode(): string {
    for (let attempt = 0; attempt < 200; attempt++) {
      const code = generateRoomCode(this.opts.codeRng ?? Math.random);
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("Room code space saturated");
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

  sweepIdle(): number {
    let swept = 0;
    for (const [code, room] of this.rooms) {
      if (!room.isEmpty()) {
        this.lastActive.set(code, this.now());
        continue;
      }
      const last = this.lastActive.get(code) ?? room.createdAt;
      if (this.now() - last > this.idleTtlMs) {
        this.rooms.delete(code);
        this.lastActive.delete(code);
        swept++;
      }
    }
    return swept;
  }

  dispose(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.rooms.clear();
    this.lastActive.clear();
  }
}
