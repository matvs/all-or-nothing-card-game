import { describe, expect, it } from "vitest";
import { beats, currentTrickWinner, legalPlays, wouldWinTrick } from "../trick.js";
import type { Card, PlayedCard } from "../types.js";

const c = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });

describe("beats", () => {
  it("a higher card of the lead suit beats a lower one", () => {
    expect(beats(c("K", "H"), c("2", "H"), "H", null)).toBe(true);
    expect(beats(c("2", "H"), c("K", "H"), "H", null)).toBe(false);
  });

  it("any trump beats any non-trump, regardless of rank", () => {
    expect(beats(c("2", "S"), c("A", "H"), "H", "S")).toBe(true);
    expect(beats(c("A", "H"), c("2", "S"), "H", "S")).toBe(false);
  });

  it("higher trump beats lower trump", () => {
    expect(beats(c("K", "S"), c("2", "S"), "H", "S")).toBe(true);
  });

  it("an off-suit, non-trump card never beats anything", () => {
    // lead is H, trump is S; a C card can't win over an H card or another C card already ahead.
    expect(beats(c("A", "C"), c("2", "H"), "H", "S")).toBe(false);
  });

  it("in a No Trump round, only the lead suit can win", () => {
    expect(beats(c("A", "C"), c("2", "H"), "H", null)).toBe(false);
    expect(beats(c("3", "H"), c("2", "H"), "H", null)).toBe(true);
  });
});

describe("currentTrickWinner", () => {
  it("resolves a simple all-follow-suit trick to the highest card", () => {
    const trick: PlayedCard[] = [
      { seat: 0, card: c("4", "H") },
      { seat: 1, card: c("K", "H") },
      { seat: 2, card: c("2", "H") },
      { seat: 3, card: c("9", "H") },
    ];
    expect(currentTrickWinner(trick, null)).toBe(1);
  });

  it("a single trump card wins over three off-suit-following cards", () => {
    const trick: PlayedCard[] = [
      { seat: 0, card: c("A", "H") },
      { seat: 1, card: c("2", "S") }, // trump
      { seat: 2, card: c("K", "H") },
      { seat: 3, card: c("Q", "H") },
    ];
    expect(currentTrickWinner(trick, "S")).toBe(1);
  });

  it("highest trump wins when multiple trumps are played", () => {
    const trick: PlayedCard[] = [
      { seat: 0, card: c("4", "S") },
      { seat: 1, card: c("K", "S") },
      { seat: 2, card: c("2", "H") },
      { seat: 3, card: c("9", "S") },
    ];
    expect(currentTrickWinner(trick, "S")).toBe(1);
  });

  it("off-suit discards never win, even when they beat the lead in rank", () => {
    const trick: PlayedCard[] = [
      { seat: 0, card: c("5", "H") }, // leads hearts
      { seat: 1, card: c("A", "C") }, // off suit, no trump in play
      { seat: 2, card: c("2", "H") },
      { seat: 3, card: c("3", "D") }, // off suit
    ];
    expect(currentTrickWinner(trick, null)).toBe(0);
  });

  it("works with a partial trick (fewer than 4 cards played so far)", () => {
    const trick: PlayedCard[] = [
      { seat: 2, card: c("5", "H") },
      { seat: 3, card: c("9", "H") },
    ];
    expect(currentTrickWinner(trick, null)).toBe(3);
  });

  it("throws on an empty trick", () => {
    expect(() => currentTrickWinner([], null)).toThrow();
  });
});

describe("wouldWinTrick", () => {
  it("reports whether a hypothetical play would currently win", () => {
    const trick: PlayedCard[] = [{ seat: 0, card: c("5", "H") }];
    expect(wouldWinTrick(c("9", "H"), trick, 1, null)).toBe(true);
    expect(wouldWinTrick(c("2", "H"), trick, 1, null)).toBe(false);
    expect(wouldWinTrick(c("2", "S"), trick, 1, "S")).toBe(true); // trump wins
  });
});

describe("legalPlays", () => {
  it("allows any card when leading (empty trick)", () => {
    const hand: Card[] = [c("2", "H"), c("K", "S")];
    expect(legalPlays(hand, [])).toEqual(hand);
  });

  it("restricts to the lead suit when the hand can follow it", () => {
    const hand: Card[] = [c("2", "H"), c("K", "S"), c("9", "H")];
    const trick: PlayedCard[] = [{ seat: 0, card: c("4", "H") }];
    const legal = legalPlays(hand, trick);
    expect(legal.map((card) => card.suit)).toEqual(["H", "H"]);
  });

  it("allows any card (a 'sluff') when the hand cannot follow suit", () => {
    const hand: Card[] = [c("K", "S"), c("2", "C")];
    const trick: PlayedCard[] = [{ seat: 0, card: c("4", "H") }];
    expect(legalPlays(hand, trick)).toEqual(hand);
  });
});
