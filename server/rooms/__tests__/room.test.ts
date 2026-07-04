import { describe, expect, it } from "vitest";
import { cardFromId, findFirstSet, mulberry32 } from "../../../shared/engine/index.js";
import { RoomRegistry } from "../registry.js";
import { Room } from "../room.js";

const deps = {
  now: () => 1_000,
  rngFor: (round: number) => mulberry32(round + 1),
};

function firstSet(room: Room): [number, number, number] {
  const board = room.toView().board.map((id) => cardFromId(id));
  const set = findFirstSet(board);
  if (!set) throw new Error("no set on board while playing");
  return set.cards.map((c) => c.id) as [number, number, number];
}

describe("Room membership + host", () => {
  it("makes the first player host and preserves names with spaces", () => {
    const room = new Room("ABCD", deps);
    const host = room.addPlayer("Ada Lovelace");
    const guest = room.addPlayer("Bob");
    expect(room.isHost(host.playerId)).toBe(true);
    expect(room.isHost(guest.playerId)).toBe(false);
    const view = room.toView();
    expect(view.players.map((p) => p.name).sort()).toEqual(["Ada Lovelace", "Bob"]);
    expect(view.status).toBe("lobby");
  });

  it("authenticates with the right token only (reconnect credential)", () => {
    const room = new Room("ABCD", deps);
    const { playerId, token } = room.addPlayer("Ada");
    expect(room.authenticate(playerId, token)).toBe(true);
    expect(room.authenticate(playerId, "wrong")).toBe(false);
    // Token survives a disconnect so the player can rejoin.
    room.setConnected(playerId, true);
    room.setConnected(playerId, false);
    expect(room.authenticate(playerId, token)).toBe(true);
  });
});

describe("Room game flow", () => {
  it("only the host can start while the host is connected", () => {
    const room = new Room("ABCD", deps);
    const host = room.addPlayer("Ada");
    const guest = room.addPlayer("Bob");
    room.setConnected(host.playerId, true);
    const denied = room.start(guest.playerId);
    expect(denied).toEqual({ error: "Only the host can start" });
    const ok = room.start(host.playerId);
    expect(ok).toMatchObject({ kind: "started", round: 1 });
    expect(room.toView().status).toBe("playing");
    expect(room.toView().board.length).toBeGreaterThanOrEqual(12);
  });

  it("promotes a starter to host when the host has left", () => {
    const room = new Room("ABCD", deps);
    const host = room.addPlayer("Ada");
    const guest = room.addPlayer("Bob");
    // Host never connects; guest may start and becomes host.
    const ok = room.start(guest.playerId);
    expect(ok).toMatchObject({ kind: "started" });
    expect(room.isHost(guest.playerId)).toBe(true);
    void host;
  });

  it("accepts a valid set, scores it, and rejects stale / non-set claims", () => {
    const room = new Room("ABCD", deps);
    const host = room.addPlayer("Ada");
    room.setConnected(host.playerId, true);
    room.start(host.playerId);

    const set = firstSet(room);
    const good = room.claim(host.playerId, set);
    expect(good.ok).toBe(true);
    expect(good.event).toMatchObject({ kind: "claimed", by: host.playerId });
    expect(room.toView().players.find((p) => p.id === host.playerId)!.score).toBe(1);

    // The same three cards are gone now.
    const stale = room.claim(host.playerId, set);
    expect(stale.ok).toBe(false);

    // A non-set triple from the current board.
    const board = room.toView().board.map((id) => cardFromId(id));
    let nonSet: [number, number, number] | null = null;
    outer: for (let i = 0; i < board.length; i++)
      for (let j = i + 1; j < board.length; j++)
        for (let k = j + 1; k < board.length; k++) {
          const [a, b, c] = [board[i], board[j], board[k]];
          if ((a.color + b.color + c.color) % 3 !== 0) {
            nonSet = [a.id, b.id, c.id];
            break outer;
          }
        }
    const bad = room.claim(host.playerId, nonSet!);
    expect(bad.ok).toBe(false);
    expect(bad.reason).toContain("not a set");
  });

  it("cannot claim before the game starts", () => {
    const room = new Room("ABCD", deps);
    const host = room.addPlayer("Ada");
    expect(room.claim(host.playerId, [0, 1, 2]).ok).toBe(false);
  });

  it("plays to completion and declares the top scorer the winner", () => {
    const room = new Room("WXYZ", deps);
    const ada = room.addPlayer("Ada");
    const bob = room.addPlayer("Bob");
    room.setConnected(ada.playerId, true);
    room.start(ada.playerId);

    let guard = 0;
    let turn = 0;
    while (room.toView().status === "playing") {
      const claimant = turn % 3 === 0 ? bob.playerId : ada.playerId; // Ada claims ~2/3
      const res = room.claim(claimant, firstSet(room));
      expect(res.ok).toBe(true);
      turn++;
      if (++guard > 200) throw new Error("game did not terminate");
    }
    const view = room.toView();
    expect(view.status).toBe("finished");
    const total = view.players.reduce((s, p) => s + p.score, 0);
    expect(total).toBeGreaterThan(0);
    // Winner(s) hold the max score.
    const max = Math.max(...view.players.map((p) => p.score));
    expect(view.winnerIds.length).toBeGreaterThanOrEqual(1);
    for (const id of view.winnerIds) {
      expect(view.players.find((p) => p.id === id)!.score).toBe(max);
    }
  });
});

describe("RoomRegistry", () => {
  it("creates unique rooms and sweeps idle empty ones", () => {
    let clock = 0;
    const registry = new RoomRegistry({
      now: () => clock,
      idleTtlMs: 1000,
      sweepIntervalMs: 1_000_000, // disable the auto-timer; sweep manually
    });
    const a = registry.createRoom("Ada");
    const b = registry.createRoom("Bob");
    expect(a.room.code).not.toBe(b.room.code);
    expect(registry.roomCount()).toBe(2);
    expect(registry.getRoom(a.room.code.toLowerCase())).toBe(a.room); // case-insensitive

    // Rooms have no connections -> after TTL they are swept.
    clock = 2000;
    const swept = registry.sweepIdle();
    expect(swept).toBe(2);
    expect(registry.roomCount()).toBe(0);
    registry.dispose();
  });
});
