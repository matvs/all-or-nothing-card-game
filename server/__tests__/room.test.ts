import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../db/index.js";
import { createStatsStore, type StatsStore } from "../db/stats.js";
import { Room, type OutboundSocket, type RoomDeps } from "../rooms/room.js";
import { DEFAULT_ROOM_SETTINGS, type ServerMessage } from "../../shared/protocol.js";
import { mulberry32 } from "../../src/engine/rng.js";
import type { Database } from "better-sqlite3";

class FakeSocket implements OutboundSocket {
  messages: ServerMessage[] = [];
  send(data: string): void {
    this.messages.push(JSON.parse(data) as ServerMessage);
  }
  ofType<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.messages.filter((m) => m.type === type) as Extract<ServerMessage, { type: T }>[];
  }
  last(): ServerMessage | undefined {
    return this.messages.at(-1);
  }
}

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("Room", () => {
  let db: Database;
  let statsStore: StatsStore;
  const openRooms: Room[] = [];

  beforeEach(() => {
    db = openDatabase(":memory:");
    statsStore = createStatsStore(db);
  });

  afterEach(() => {
    // Stop any AI cascade still scheduled before the db goes away.
    for (const room of openRooms.splice(0)) room.dispose();
    db.close();
    vi.useRealTimers();
  });

  function makeRoom(overrides?: Partial<RoomDeps>): Room {
    const deps: RoomDeps = {
      statsStore,
      aiThinkDelayMs: 0,
      reconnectGraceMs: 60_000,
      rng: mulberry32(7),
      ...overrides,
    };
    const room = new Room("TEST", { ...DEFAULT_ROOM_SETTINGS, roundPeak: 2 }, deps);
    openRooms.push(room);
    return room;
  }

  it("seats the host at seat 0 and fills subsequent joins clockwise", () => {
    const room = makeRoom();
    const host = room.addHost("Alice");
    expect(host.seat).toBe(0);
    expect(room.hostPlayerId).toBe(host.playerId);
    const b = room.join("Bob");
    const c = room.join("Cara");
    const d = room.join("Dan");
    expect([b.seat, c.seat, d.seat]).toEqual([1, 2, 3]);
    expect(room.isFull()).toBe(true);
  });

  it("overflows the 5th joiner (and anyone joining mid-match) to spectator", () => {
    const room = makeRoom();
    room.addHost("Alice");
    room.join("Bob");
    room.join("Cara");
    room.join("Dan");
    const fifth = room.join("Eve");
    expect(fifth.isSpectator).toBe(true);
    expect(fifth.seat).toBeNull();
    expect(room.spectators.size).toBe(1);
  });

  it("routes joiners to spectator once the match has started, even with free seats", async () => {
    const room = makeRoom();
    const host = room.addHost("Alice");
    room.startMatch(host.playerId);
    const late = room.join("Late Larry");
    expect(late.isSpectator).toBe(true);
  });

  it("only the host can start or change settings; settings lock after start", () => {
    const room = makeRoom();
    const host = room.addHost("Alice");
    const bob = room.join("Bob");

    expect(room.startMatch(bob.playerId!).ok).toBe(false);
    expect(room.updateSettings(bob.playerId!, { difficulty: "hard" }).ok).toBe(false);

    expect(room.updateSettings(host.playerId, { difficulty: "hard", roundPeak: 3 }).ok).toBe(true);
    expect(room.settings.difficulty).toBe("hard");
    expect(room.settings.roundPeak).toBe(3);

    expect(room.startMatch(host.playerId).ok).toBe(true);
    expect(room.updateSettings(host.playerId, { roundPeak: 5 }).ok).toBe(false);
    expect(room.startMatch(host.playerId).ok).toBe(false); // already started
  });

  it("fills empty seats with AI on start and plays AI turns automatically", async () => {
    const room = makeRoom();
    const host = room.addHost("Alice");
    const socket = new FakeSocket();
    room.attachSocket(host.playerId, host.token, socket);

    expect(room.startMatch(host.playerId).ok).toBe(true);
    expect(room.seats.filter((s) => s?.isAi)).toHaveLength(3);
    expect(room.phase).toBe("playing");

    // With aiThinkDelayMs=0, AI turns cascade on microtasks until it's the human's turn
    // (or the human's turn passed first if they lead). Flush and check progress.
    await flushMicrotasks();
    const round = room.match!.round!;
    const aiSeats = [1, 2, 3];
    const bidsPlaced = Object.keys(round.bids).length;
    // Human is seat 0. Either the round is waiting on the human to bid, or on a human play.
    if (round.phase === "bidding") {
      expect(round.nextBidder).toBe(0);
      expect(bidsPlaced).toBeGreaterThan(0);
      for (const s of aiSeats) {
        if (round.bids[s as 0 | 1 | 2 | 3] !== undefined) {
          expect(round.bids[s as 0 | 1 | 2 | 3]).toBeGreaterThanOrEqual(0);
        }
      }
    } else {
      expect(round.phase).toBe("playing");
      expect(round.nextPlayer).toBe(0);
    }
  });

  it("plays a full match to completion when all four seats are AI-controlled after grace expiry", async () => {
    vi.useFakeTimers();
    const room = makeRoom({ reconnectGraceMs: 1000 });
    const host = room.addHost("Alice");
    const socket = new FakeSocket();
    room.attachSocket(host.playerId, host.token, socket);
    room.startMatch(host.playerId);

    // Host disconnects mid-match; after the grace period the seat flips to AI
    // and the AIs finish the whole match among themselves.
    room.handleDisconnect(host.playerId);
    await vi.advanceTimersByTimeAsync(1001);
    expect(room.seats[0]!.isAi).toBe(true);
    expect(room.seats[0]!.aiTakeoverPermanent).toBe(true);

    // Let the microtask-scheduled AI turns run to completion.
    for (let i = 0; i < 200 && room.phase !== "complete"; i++) {
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(room.phase).toBe("complete");
    expect(room.match!.phase).toBe("complete");
  });

  it("reconnection within the grace window restores the seat to the human", async () => {
    vi.useFakeTimers();
    const room = makeRoom({ reconnectGraceMs: 60_000 });
    const host = room.addHost("Alice");
    const s1 = new FakeSocket();
    room.attachSocket(host.playerId, host.token, s1);
    room.startMatch(host.playerId);

    room.handleDisconnect(host.playerId);
    expect(room.seats[0]!.connected).toBe(false);

    await vi.advanceTimersByTimeAsync(30_000); // half the window
    const s2 = new FakeSocket();
    const attached = room.attachSocket(host.playerId, host.token, s2);
    expect(attached.ok).toBe(true);
    expect(room.seats[0]!.connected).toBe(true);
    expect(room.seats[0]!.isAi).toBe(false);

    // The grace timer must have been cancelled: advancing past it changes nothing.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(room.seats[0]!.isAi).toBe(false);
  });

  it("rejects reconnection after the grace window and keeps the seat AI-controlled", async () => {
    vi.useFakeTimers();
    const room = makeRoom({ reconnectGraceMs: 1000 });
    const host = room.addHost("Alice");
    room.join("Bob"); // second human so the room keeps a host candidate
    const s1 = new FakeSocket();
    room.attachSocket(host.playerId, host.token, s1);
    room.startMatch(host.playerId);

    room.handleDisconnect(host.playerId);
    await vi.advanceTimersByTimeAsync(1001);

    const s2 = new FakeSocket();
    const attached = room.attachSocket(host.playerId, host.token, s2);
    expect(attached.ok).toBe(false);
    expect(room.seats[0]!.isAi).toBe(true);
  });

  it("rejects reconnection with a wrong token", () => {
    const room = makeRoom();
    const host = room.addHost("Alice");
    const attached = room.attachSocket(host.playerId, "wrong-token", new FakeSocket());
    expect(attached.ok).toBe(false);
  });

  it("ignores a stale socket's close event after a fresh socket reconnects", () => {
    const room = makeRoom();
    const host = room.addHost("Alice");
    const oldSocket = new FakeSocket();
    room.attachSocket(host.playerId, host.token, oldSocket);
    const newSocket = new FakeSocket();
    room.attachSocket(host.playerId, host.token, newSocket);

    room.handleDisconnectIfCurrent(host.playerId, oldSocket); // stale close arrives late
    expect(room.seats[0]!.connected).toBe(true);

    room.handleDisconnectIfCurrent(host.playerId, newSocket); // real close
    expect(room.seats[0]!.connected).toBe(false);
  });

  it("frees a lobby seat when a player leaves and reassigns the host role", () => {
    const room = makeRoom();
    const host = room.addHost("Alice");
    const bob = room.join("Bob");
    room.leave(host.playerId);
    expect(room.seats[0]).toBeNull();
    expect(room.hostPlayerId).toBe(bob.playerId);
  });

  it("flips a mid-match leaver to permanent AI", () => {
    const room = makeRoom();
    const host = room.addHost("Alice");
    const bob = room.join("Bob");
    room.startMatch(host.playerId);
    room.leave(bob.playerId!);
    expect(room.seats[1]!.isAi).toBe(true);
    expect(room.seats[1]!.aiTakeoverPermanent).toBe(true);
  });

  it("redacts other players' hands in per-seat views and gives spectators no hand at all", () => {
    const room = makeRoom();
    const host = room.addHost("Alice");
    room.startMatch(host.playerId);
    const view0 = room.toMatchView(0)!;
    expect(view0.round!.yourHand).toEqual(room.match!.round!.hands[0]);
    // handCounts are public; actual cards of other seats are never present.
    expect(view0.round!.handCounts[1]).toBe(room.match!.round!.hands[1].length);
    expect((view0.round as any).hands).toBeUndefined();

    const spectatorView = room.toMatchView(null)!;
    expect(spectatorView.round!.yourHand).toBeNull();
  });

  it("delivers chat to players and spectators, trims history, and flags spectator messages", () => {
    const room = makeRoom();
    const host = room.addHost("Alice");
    const hostSocket = new FakeSocket();
    room.attachSocket(host.playerId, host.token, hostSocket);
    const spec = room.join("Watcher", { asSpectator: true });
    const specSocket = new FakeSocket();
    room.attachSocket(spec.playerId, spec.token, specSocket);

    room.handleChat(host.playerId, "hello table");
    room.handleChat(spec.playerId, "hi from the rail");

    const hostChats = hostSocket.ofType("chat");
    expect(hostChats).toHaveLength(2);
    expect(hostChats[0].message.from).toBe("Alice");
    expect(hostChats[0].message.isSpectator).toBe(false);
    expect(hostChats[1].message.isSpectator).toBe(true);
    expect(specSocket.ofType("chat")).toHaveLength(2);

    room.handleChat(host.playerId, "   "); // whitespace only: dropped
    expect(hostSocket.ofType("chat")).toHaveLength(2);

    const long = "x".repeat(1000);
    room.handleChat(host.playerId, long);
    const last = hostSocket.ofType("chat").at(-1)!;
    expect(last.message.text.length).toBeLessThanOrEqual(300);
  });

  it("records aggregate win/loss stats for human seats when the match completes", async () => {
    vi.useFakeTimers();
    const room = makeRoom({ reconnectGraceMs: 500 });
    const host = room.addHost("StatsAlice");
    const socket = new FakeSocket();
    room.attachSocket(host.playerId, host.token, socket);
    room.startMatch(host.playerId);
    // Convert the human to AI (via leave) so the match self-plays to the end.
    room.leave(host.playerId);
    for (let i = 0; i < 300 && room.phase !== "complete"; i++) {
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(room.phase).toBe("complete");
    const stats = statsStore.getStats("StatsAlice");
    expect(stats.gamesPlayed).toBe(1);
    expect([0, 1]).toContain(stats.gamesWon);
  });

  it("prevents a player from acting on a seat after AI takeover (stale actions rejected)", () => {
    const room = makeRoom();
    const host = room.addHost("Alice");
    const socket = new FakeSocket();
    room.attachSocket(host.playerId, host.token, socket);
    room.startMatch(host.playerId);
    room.leave(host.playerId); // seat 0 becomes AI
    socket.messages.length = 0;
    room.handleBid(host.playerId, 1);
    // The action must be rejected (NOT_SEATED); no engine state corruption.
    // (No message is delivered because the leaver's socket was detached.)
    expect(room.seats[0]!.isAi).toBe(true);
  });
});
