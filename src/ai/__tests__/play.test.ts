import { describe, expect, it } from "vitest";
import { chooseCard } from "../play.js";
import { beginRound } from "../../engine/match.js";
import { mulberry32 } from "../../engine/rng.js";
import { legalPlays, wouldWinTrick } from "../../engine/trick.js";
import type { AiContext } from "../types.js";
import type { Card, MatchState, PlayedCard, SeatIndex, Suit } from "../../engine/types.js";

function makeRound(
  hands: Record<SeatIndex, Card[]>,
  trump: Suit | null,
  currentTrick: PlayedCard[],
  bids: Partial<Record<SeatIndex, number>>,
  tricksWon: Record<SeatIndex, number>,
  handSize: number
): MatchState {
  const base: MatchState = {
    roundSequence: [handSize],
    roundIndex: 0,
    dealerStart: 0,
    totalScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
    history: [],
    round: null,
    phase: "in_progress",
    settings: { roundPeak: handSize, dealerRestriction: false, seed: 1 },
  };
  const match = beginRound(base);
  return {
    ...match,
    round: { ...match.round!, hands, trump, currentTrick, bids, tricksWon, phase: "playing", nextPlayer: currentTrick.length as SeatIndex },
  };
}

const emptyTricks = (): Record<SeatIndex, number> => ({ 0: 0, 1: 0, 2: 0, 3: 0 });

describe("chooseCard legality", () => {
  it("always plays a card that is in the legal-plays set, across many random hands", () => {
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      for (let seed = 0; seed < 25; seed++) {
        const rng = mulberry32(seed * 7 + 1);
        const hand: Card[] = [
          { suit: "H", rank: "4" },
          { suit: "H", rank: "9" },
          { suit: "S", rank: "K" },
        ];
        const trick: PlayedCard[] = [{ seat: 0, card: { suit: "H", rank: "2" } }];
        const hands: Record<SeatIndex, Card[]> = { 0: [], 1: hand, 2: [], 3: [] };
        const match = makeRound(hands, "S", trick, { 1: 1 }, emptyTricks(), 3);
        const card = chooseCard({ round: match.round!, seat: 1, match }, difficulty, rng);
        const legal = legalPlays(hand, trick);
        expect(legal.some((c) => c.suit === card.suit && c.rank === card.rank)).toBe(true);
      }
    }
  });
});

describe("chooseCard strategy: win cheap", () => {
  it("plays the cheapest card that still wins the trick when it still needs tricks", () => {
    // Seat 1 bid 1, has won 0 so far -> still needs to win. Holds 9H and KH;
    // both beat the 4H led, so it should play the CHEAPER winner (9H), not the King.
    const hand: Card[] = [
      { suit: "H", rank: "9" },
      { suit: "H", rank: "K" },
    ];
    const trick: PlayedCard[] = [{ seat: 0, card: { suit: "H", rank: "4" } }];
    const hands: Record<SeatIndex, Card[]> = { 0: [], 1: hand, 2: [], 3: [] };
    const match = makeRound(hands, null, trick, { 1: 1 }, emptyTricks(), 2);
    for (const difficulty of ["medium", "hard"] as const) {
      const rng = mulberry32(3);
      const card = chooseCard({ round: match.round!, seat: 1, match }, difficulty, rng);
      expect(card).toEqual({ suit: "H", rank: "9" });
    }
  });
});

describe("chooseCard strategy: defend a made bid (dump safely)", () => {
  it("avoids winning once the bid is already met, discarding a card that can't take the trick", () => {
    // Seat 1 bid 0 and has already won 0 -> must now avoid winning. Holds a
    // low heart (safe, loses to the 9H led) and the Ace of hearts (would win).
    // It must not win, so it should play the low heart, not the Ace.
    const hand: Card[] = [
      { suit: "H", rank: "2" },
      { suit: "H", rank: "A" },
    ];
    const trick: PlayedCard[] = [{ seat: 0, card: { suit: "H", rank: "9" } }];
    const hands: Record<SeatIndex, Card[]> = { 0: [], 1: hand, 2: [], 3: [] };
    const match = makeRound(hands, null, trick, { 1: 0 }, emptyTricks(), 2);
    for (const difficulty of ["medium", "hard"] as const) {
      const rng = mulberry32(4);
      const card = chooseCard({ round: match.round!, seat: 1, match }, difficulty, rng);
      expect(card).toEqual({ suit: "H", rank: "2" });
      expect(wouldWinTrick(card, trick, 1, null)).toBe(false);
    }
  });

  it("when forced to win anyway (no safe card), takes it as cheaply as possible", () => {
    // Seat 1 already met its bid of 0. Both cards it holds beat the 3H led
    // (it must follow suit and only has hearts left) -> forced to win either
    // way, so it should still take the trick as cheaply as it can (the 9H).
    const hand: Card[] = [
      { suit: "H", rank: "9" },
      { suit: "H", rank: "A" },
    ];
    const trick: PlayedCard[] = [{ seat: 0, card: { suit: "H", rank: "3" } }];
    const hands: Record<SeatIndex, Card[]> = { 0: [], 1: hand, 2: [], 3: [] };
    const match = makeRound(hands, null, trick, { 1: 0 }, emptyTricks(), 2);
    for (const difficulty of ["medium", "hard"] as const) {
      const rng = mulberry32(5);
      const card = chooseCard({ round: match.round!, seat: 1, match }, difficulty, rng);
      expect(card).toEqual({ suit: "H", rank: "9" });
    }
  });
});

describe("chooseCard strategy: leading", () => {
  it("leads low when trying to stay away from the lead (bid already satisfied)", () => {
    const hand: Card[] = [
      { suit: "H", rank: "2" },
      { suit: "H", rank: "K" },
      { suit: "S", rank: "5" },
    ];
    const hands: Record<SeatIndex, Card[]> = { 0: [], 1: hand, 2: [], 3: [] };
    const match = makeRound(hands, "S", [], { 1: 0 }, emptyTricks(), 3);
    for (const difficulty of ["medium", "hard"] as const) {
      const rng = mulberry32(6);
      const card = chooseCard({ round: match.round!, seat: 1, match }, difficulty, rng);
      // Should avoid leading trump (S) and avoid the King; the 2H is the safe low lead.
      expect(card).toEqual({ suit: "H", rank: "2" });
    }
  });

  it("leads strength (highest non-trump) when it still needs to win tricks", () => {
    const hand: Card[] = [
      { suit: "H", rank: "2" },
      { suit: "H", rank: "A" },
      { suit: "S", rank: "K" },
    ];
    const hands: Record<SeatIndex, Card[]> = { 0: [], 1: hand, 2: [], 3: [] };
    const match = makeRound(hands, "S", [], { 1: 2 }, emptyTricks(), 3);
    for (const difficulty of ["medium", "hard"] as const) {
      const rng = mulberry32(7);
      const card = chooseCard({ round: match.round!, seat: 1, match }, difficulty, rng);
      // Should lead its strongest non-trump card (AH) and hold the trump king back.
      expect(card).toEqual({ suit: "H", rank: "A" });
    }
  });
});
