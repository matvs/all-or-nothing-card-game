import { describe, expect, it } from "vitest";
import { cardId, cardsEqual, createDeck, parseCardId, rankValue, sortHand } from "../deck.js";
import type { Card } from "../types.js";

describe("createDeck", () => {
  it("has exactly 52 cards", () => {
    expect(createDeck()).toHaveLength(52);
  });

  it("has no duplicate cards", () => {
    const ids = createDeck().map(cardId);
    expect(new Set(ids).size).toBe(52);
  });

  it("has 13 ranks in each of the 4 suits", () => {
    const deck = createDeck();
    for (const suit of ["S", "H", "D", "C"] as const) {
      expect(deck.filter((c) => c.suit === suit)).toHaveLength(13);
    }
  });
});

describe("rankValue", () => {
  it("ranks Ace as high (14)", () => {
    expect(rankValue("A")).toBe(14);
    expect(rankValue("A")).toBeGreaterThan(rankValue("K"));
  });

  it("orders number cards numerically", () => {
    expect(rankValue("2")).toBe(2);
    expect(rankValue("10")).toBe(10);
    expect(rankValue("9")).toBeLessThan(rankValue("10"));
  });

  it("orders face cards J < Q < K < A", () => {
    expect(rankValue("J")).toBeLessThan(rankValue("Q"));
    expect(rankValue("Q")).toBeLessThan(rankValue("K"));
    expect(rankValue("K")).toBeLessThan(rankValue("A"));
  });
});

describe("cardId / parseCardId", () => {
  it("round-trips every card in the deck", () => {
    for (const card of createDeck()) {
      expect(parseCardId(cardId(card))).toEqual(card);
    }
  });

  it("produces the expected ids", () => {
    expect(cardId({ suit: "S", rank: "A" })).toBe("AS");
    expect(cardId({ suit: "H", rank: "10" })).toBe("10H");
  });

  it("rejects a malformed id", () => {
    expect(() => parseCardId("ZZ")).toThrow();
  });
});

describe("cardsEqual", () => {
  it("treats same suit+rank as equal even for distinct object instances", () => {
    const a: Card = { suit: "C", rank: "7" };
    const b: Card = { suit: "C", rank: "7" };
    expect(a).not.toBe(b);
    expect(cardsEqual(a, b)).toBe(true);
  });

  it("treats different rank or suit as unequal", () => {
    expect(cardsEqual({ suit: "C", rank: "7" }, { suit: "C", rank: "8" })).toBe(false);
    expect(cardsEqual({ suit: "C", rank: "7" }, { suit: "D", rank: "7" })).toBe(false);
  });
});

describe("sortHand", () => {
  it("groups by suit and orders low-to-high within a suit", () => {
    const hand: Card[] = [
      { suit: "H", rank: "K" },
      { suit: "H", rank: "2" },
      { suit: "S", rank: "A" },
    ];
    const sorted = sortHand(hand, null);
    // No trump: fixed suit order S,H,D,C.
    expect(sorted.map(cardId)).toEqual(["AS", "2H", "KH"]);
  });

  it("places the trump suit first when a trump is set", () => {
    const hand: Card[] = [
      { suit: "S", rank: "A" },
      { suit: "H", rank: "2" },
    ];
    const sorted = sortHand(hand, "H");
    expect(sorted[0].suit).toBe("H");
  });

  it("never mutates the input", () => {
    const hand: Card[] = [
      { suit: "S", rank: "K" },
      { suit: "S", rank: "2" },
    ];
    const copy = hand.slice();
    sortHand(hand, null);
    expect(hand).toEqual(copy);
  });
});
