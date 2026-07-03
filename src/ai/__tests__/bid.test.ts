import { describe, expect, it } from "vitest";
import { estimateBid, resolveLegalBid } from "../bid.js";
import { beginRound } from "../../engine/match.js";
import { mulberry32 } from "../../engine/rng.js";
import type { AiContext } from "../types.js";
import type { Card, MatchState, SeatIndex, Suit } from "../../engine/types.js";

function emptyHandsWith(seat: SeatIndex, hand: Card[]): Record<SeatIndex, Card[]> {
  const hands: Record<SeatIndex, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  hands[seat] = hand;
  return hands;
}

function soloRound(hand: Card[], trump: Suit | null, handSize: number, dealerRestriction = true): MatchState {
  const base: MatchState = {
    roundSequence: [handSize],
    roundIndex: 0,
    dealerStart: 0,
    totalScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
    history: [],
    round: null,
    phase: "in_progress",
    settings: { roundPeak: handSize, dealerRestriction, seed: 1 },
  };
  const match = beginRound(base);
  return { ...match, round: { ...match.round!, hands: emptyHandsWith(0, hand), trump } };
}

describe("estimateBid", () => {
  it("always returns a legal amount within [0, handSize]", () => {
    for (let seed = 0; seed < 30; seed++) {
      const localRng = mulberry32(seed);
      const base: MatchState = {
        roundSequence: [7],
        roundIndex: 0,
        dealerStart: 0,
        totalScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
        history: [],
        round: null,
        phase: "in_progress",
        settings: { roundPeak: 7, dealerRestriction: true, seed },
      };
      const match = beginRound(base);
      for (const seat of [0, 1, 2, 3] as const) {
        for (const difficulty of ["easy", "medium", "hard"] as const) {
          const ctx: AiContext = { round: match.round!, seat, match };
          const bid = estimateBid(ctx, difficulty, localRng);
          expect(bid).toBeGreaterThanOrEqual(0);
          expect(bid).toBeLessThanOrEqual(match.round!.handSize);
          expect(Number.isInteger(bid)).toBe(true);
        }
      }
    }
  });

  it("bids higher on a hand stacked with trump honours than on a weak hand", () => {
    const strongHand: Card[] = [
      { suit: "S", rank: "A" },
      { suit: "S", rank: "K" },
      { suit: "S", rank: "Q" },
      { suit: "S", rank: "J" },
      { suit: "H", rank: "A" },
    ];
    const weakHand: Card[] = [
      { suit: "C", rank: "2" },
      { suit: "C", rank: "4" },
      { suit: "D", rank: "3" },
      { suit: "D", rank: "5" },
      { suit: "H", rank: "6" },
    ];
    const strongMatch = soloRound(strongHand, "S", 5, false);
    const weakMatch = soloRound(weakHand, "S", 5, false);
    const rng = mulberry32(1);

    for (const difficulty of ["medium", "hard"] as const) {
      const strongBid = estimateBid({ round: strongMatch.round!, seat: 0, match: strongMatch }, difficulty, rng);
      const weakBid = estimateBid({ round: weakMatch.round!, seat: 0, match: weakMatch }, difficulty, rng);
      expect(strongBid).toBeGreaterThan(weakBid);
    }
  });

  it("the Hard tier leans toward the extreme bids on hands that are almost there", () => {
    // One trick shy of "All": 4 top trumps out of a 5-card hand.
    const almostAll: Card[] = [
      { suit: "S", rank: "A" },
      { suit: "S", rank: "K" },
      { suit: "S", rank: "Q" },
      { suit: "S", rank: "J" },
      { suit: "C", rank: "2" },
    ];
    const match = soloRound(almostAll, "S", 5, false);
    const bid = estimateBid({ round: match.round!, seat: 0, match }, "hard", mulberry32(2));
    expect(bid).toBe(5);
  });
});

describe("resolveLegalBid", () => {
  it("never returns the dealer-restricted forbidden amount", () => {
    const base: MatchState = {
      roundSequence: [3],
      roundIndex: 0,
      dealerStart: 0,
      totalScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      history: [],
      round: null,
      phase: "in_progress",
      settings: { roundPeak: 3, dealerRestriction: true, seed: 42 },
    };
    let match = beginRound(base);
    // biddingOrder is [1,2,3,0]; drive bids so seat 0 (dealer) closes with forbidden=0.
    match = { ...match, round: { ...match.round!, bids: { 1: 1 }, nextBidder: 2 } };
    match = { ...match, round: { ...match.round!, bids: { 1: 1, 2: 1 }, nextBidder: 3 } };
    match = { ...match, round: { ...match.round!, bids: { 1: 1, 2: 1, 3: 1 }, nextBidder: 0 } };

    for (let seed = 0; seed < 20; seed++) {
      const rng = mulberry32(seed);
      const resolved = resolveLegalBid(0, { round: match.round!, seat: 0, match }, rng);
      expect(resolved).not.toBe(0);
      expect(resolved).toBeGreaterThanOrEqual(0);
      expect(resolved).toBeLessThanOrEqual(3);
    }
  });
});
