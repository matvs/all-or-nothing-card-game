import { beforeEach, describe, expect, it } from "vitest";
import { type Card, cardFromId, findAllSets, isSet } from "../../../shared/engine/index.js";
import { SEAT_COLORS } from "../../../shared/protocol.js";
import { type PlayerIdentity, Room } from "../room.js";

const ALICE: PlayerIdentity = { id: "a", name: "Alice", token: "ta" };
const BOB: PlayerIdentity = { id: "b", name: "Bob", token: "tb" };

function seatBoth(room: Room): void {
  room.join(ALICE);
  room.join(BOB);
  room.sit(ALICE.id, SEAT_COLORS[0]);
  room.sit(BOB.id, SEAT_COLORS[1]);
}

function boardCards(room: Room): Card[] {
  return room.gameState().board.map(cardFromId);
}

function findNonSet(cards: Card[]): [number, number, number] {
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      for (let k = j + 1; k < cards.length; k++)
        if (!isSet(cards[i], cards[j], cards[k])) return [cards[i].id, cards[j].id, cards[k].id];
  throw new Error("no non-set triple on board (impossible for 12+ cards)");
}

describe("Room membership", () => {
  let room: Room;
  beforeEach(() => {
    room = new Room("r1");
  });

  it("adds a player on join and marks them online", () => {
    const p = room.join(ALICE);
    expect(p.name).toBe("Alice");
    expect(p.online).toBe(true);
    expect(room.has(ALICE.id)).toBe(true);
  });

  it("rejoin keeps the same player and flips them back online", () => {
    room.join(ALICE);
    room.markOffline(ALICE.id);
    expect(room.roster()[0].online).toBe(false);
    room.join(ALICE);
    expect(room.roster()[0].online).toBe(true);
  });

  it("isEmpty only when everyone is offline", () => {
    room.join(ALICE);
    expect(room.isEmpty).toBe(false);
    room.markOffline(ALICE.id);
    expect(room.isEmpty).toBe(true);
  });

  it("roster never leaks the reconnect token", () => {
    room.join(ALICE);
    expect(room.roster()[0]).not.toHaveProperty("token");
  });
});

describe("Room seating", () => {
  let room: Room;
  beforeEach(() => {
    room = new Room("r2");
    room.join(ALICE);
    room.join(BOB);
  });

  it("lets a player take a free seat", () => {
    expect(room.sit(ALICE.id, SEAT_COLORS[0])).toBe(true);
    expect(room.roster().find((p) => p.id === ALICE.id)?.color).toBe(SEAT_COLORS[0]);
  });

  it("refuses a seat already held by someone else", () => {
    room.sit(ALICE.id, SEAT_COLORS[0]);
    expect(room.sit(BOB.id, SEAT_COLORS[0])).toBe(false);
  });

  it("lets a player move to another free seat", () => {
    room.sit(ALICE.id, SEAT_COLORS[0]);
    expect(room.sit(ALICE.id, SEAT_COLORS[2])).toBe(true);
    expect(room.roster().find((p) => p.id === ALICE.id)?.color).toBe(SEAT_COLORS[2]);
  });

  it("rejects an invalid seat colour", () => {
    expect(room.sit(ALICE.id, "#123456" as never)).toBe(false);
  });
});

describe("Room round lifecycle & readiness", () => {
  let room: Room;
  beforeEach(() => {
    room = new Room("r3");
    seatBoth(room);
  });

  it("is ready only when two+ seated players are all ready", () => {
    expect(room.allSeatedReady()).toBe(false);
    room.markReady(ALICE.id);
    expect(room.allSeatedReady()).toBe(false);
    room.markReady(BOB.id);
    expect(room.allSeatedReady()).toBe(true);
  });

  it("markReady is ignored for a player without a seat", () => {
    const room2 = new Room("r3b");
    room2.join(ALICE);
    expect(room2.markReady(ALICE.id)).toBe(false);
  });

  it("begin deals a running board and resets scores", () => {
    const state = room.begin();
    expect(state.running).toBe(true);
    expect(state.board.length).toBeGreaterThanOrEqual(12);
    expect(room.isRunning).toBe(true);
    expect(room.roster().every((p) => p.points === 0)).toBe(true);
  });

  it("cancelStart clears readiness and countdown", () => {
    room.markReady(ALICE.id);
    room.cancelStart();
    expect(room.allSeatedReady()).toBe(false);
    expect(room.countdown).toBeNull();
  });
});

describe("Room claims (server-authoritative)", () => {
  let room: Room;
  beforeEach(() => {
    room = new Room("r4");
    seatBoth(room);
    room.begin();
  });

  it("accepts a real set, awards a point and refreshes the board", () => {
    const set = findAllSets(boardCards(room))[0];
    const out = room.claim(ALICE.id, set.cards.map((c) => c.id));
    expect(out.ok).toBe(true);
    expect(room.roster().find((p) => p.id === ALICE.id)?.points).toBe(1);
    expect(room.gameState().board.length).toBeGreaterThanOrEqual(12);
  });

  it("penalises a wrong claim by a point and returns an explanation", () => {
    const out = room.claim(ALICE.id, findNonSet(boardCards(room)));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("not-a-set");
    expect(out.explanation).not.toBeNull();
    expect(room.roster().find((p) => p.id === ALICE.id)?.points).toBe(-1);
  });

  it("rejects a duplicate-card claim", () => {
    const id = room.gameState().board[0];
    const out = room.claim(ALICE.id, [id, id, room.gameState().board[1]]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("duplicate-card");
  });

  it("rejects a claim referencing a card not on the board", () => {
    const board = new Set(room.gameState().board);
    const offBoard = [...Array(81).keys()].find((id) => !board.has(id))!;
    const [x, y] = room.gameState().board;
    const out = room.claim(ALICE.id, [x, y, offBoard]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("already-taken");
  });

  it("rejects any claim before the round is running", () => {
    const idle = new Room("r4b");
    idle.join(ALICE);
    const out = idle.claim(ALICE.id, [0, 1, 2]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("not-running");
  });

  it("names the top scorer as the winner", () => {
    const set = findAllSets(boardCards(room))[0];
    room.claim(ALICE.id, set.cards.map((c) => c.id));
    expect(room.winnerIds()).toContain(ALICE.id);
    expect(room.winnerIds()).not.toContain(BOB.id);
  });
});

describe("Room chat & voice", () => {
  let room: Room;
  beforeEach(() => {
    room = new Room("r5");
    room.join(ALICE);
    room.join(BOB);
  });

  it("records chat messages with author metadata", () => {
    room.sit(ALICE.id, SEAT_COLORS[0]);
    const msg = room.addChat(ALICE.id, "hello");
    expect(msg).toMatchObject({ name: "Alice", text: "hello", color: SEAT_COLORS[0] });
  });

  it("caps chat history at 100 messages", () => {
    for (let i = 0; i < 130; i++) room.addChat(ALICE.id, `m${i}`);
    expect(room.snapshot().chat.length).toBe(100);
    expect(room.snapshot().chat.at(-1)?.text).toBe("m129");
  });

  it("tracks the voice roster and hands newcomers the existing peers", () => {
    expect(room.voiceJoin(ALICE.id)).toEqual([]);
    expect(room.voiceJoin(BOB.id)).toEqual([ALICE.id]);
    expect(room.voice.sort()).toEqual([ALICE.id, BOB.id].sort());
    room.voiceLeave(ALICE.id);
    expect(room.voice).toEqual([BOB.id]);
  });

  it("drops a player from voice when they go offline", () => {
    room.voiceJoin(ALICE.id);
    room.markOffline(ALICE.id);
    expect(room.voice).not.toContain(ALICE.id);
  });
});
