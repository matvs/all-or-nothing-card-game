import { describe, expect, it } from "vitest";
import { estimateBid } from "../bid.js";
import { chooseCard } from "../play.js";
import type { AiContext, Difficulty } from "../types.js";
import { createMatch, getLegalBidAmounts, isMatchComplete, placeBid, playCard } from "../../engine/match.js";
import { mulberry32 } from "../../engine/rng.js";
import { legalPlays } from "../../engine/trick.js";
import type { MatchState, SeatIndex } from "../../engine/types.js";

/**
 * Drives a complete match using nothing but AI decisions for all four
 * seats, asserting every single bid and play the engine is asked to apply
 * is accepted. This is the "AI never revokes/misplays illegally" guarantee
 * demanded by the spec: it doesn't just check the AI's output *looks*
 * reasonable, it feeds every decision straight through the same
 * server-authoritative validation a real multiplayer game would use.
 */
function simulateFullAiMatch(
  seed: number,
  difficulties: Record<SeatIndex, Difficulty>,
  roundPeak: number,
  dealerRestriction: boolean
): MatchState {
  const rng = mulberry32(seed ^ 0xabcdef);
  let match = createMatch({ roundPeak, dealerRestriction, seed });

  let guard = 0;
  while (!isMatchComplete(match)) {
    guard++;
    if (guard > 20000) throw new Error("runaway simulation — likely an infinite loop");
    const round = match.round!;
    if (round.phase === "bidding") {
      const seat = round.nextBidder as SeatIndex;
      const ctx: AiContext = { round, seat, match };
      const bid = estimateBid(ctx, difficulties[seat], rng);

      // The bid must always be one of the engine's own reported legal amounts.
      const legalAmounts = getLegalBidAmounts(round, match.settings);
      expect(legalAmounts).toContain(bid);

      const result = placeBid(match, seat, bid);
      expect(result.ok, `bid ${bid} by seat ${seat} rejected: ${!result.ok && result.error.message}`).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      match = result.state;
    } else {
      const seat = round.nextPlayer as SeatIndex;
      const ctx: AiContext = { round, seat, match };
      const card = chooseCard(ctx, difficulties[seat], rng);

      const legal = legalPlays(round.hands[seat], round.currentTrick);
      expect(legal.some((c) => c.suit === card.suit && c.rank === card.rank)).toBe(true);

      const result = playCard(match, seat, card);
      expect(
        result.ok,
        `play ${card.rank}${card.suit} by seat ${seat} rejected: ${!result.ok && result.error.message}`
      ).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      match = result.state;
    }
  }
  return match;
}

const ALL_EASY: Record<SeatIndex, Difficulty> = { 0: "easy", 1: "easy", 2: "easy", 3: "easy" };
const ALL_MEDIUM: Record<SeatIndex, Difficulty> = { 0: "medium", 1: "medium", 2: "medium", 3: "medium" };
const ALL_HARD: Record<SeatIndex, Difficulty> = { 0: "hard", 1: "hard", 2: "hard", 3: "hard" };
const MIXED: Record<SeatIndex, Difficulty> = { 0: "easy", 1: "medium", 2: "hard", 3: "medium" };

describe("AI legality across full simulated matches", () => {
  const seeds = Array.from({ length: 25 }, (_, i) => i * 101 + 7);

  it.each(seeds)("all-easy AI never makes an illegal move (seed %i)", (seed) => {
    const match = simulateFullAiMatch(seed, ALL_EASY, 5, true);
    expect(isMatchComplete(match)).toBe(true);
  });

  it.each(seeds)("all-medium AI never makes an illegal move (seed %i)", (seed) => {
    const match = simulateFullAiMatch(seed, ALL_MEDIUM, 5, true);
    expect(isMatchComplete(match)).toBe(true);
  });

  it.each(seeds)("all-hard AI never makes an illegal move (seed %i)", (seed) => {
    const match = simulateFullAiMatch(seed, ALL_HARD, 5, true);
    expect(isMatchComplete(match)).toBe(true);
  });

  it.each(seeds.slice(0, 12))("mixed-difficulty AI never makes an illegal move (seed %i)", (seed) => {
    const match = simulateFullAiMatch(seed, MIXED, 6, true);
    expect(isMatchComplete(match)).toBe(true);
  });

  it.each(seeds.slice(0, 8))("holds up with the dealer restriction disabled (seed %i)", (seed) => {
    const match = simulateFullAiMatch(seed, ALL_HARD, 4, false);
    expect(isMatchComplete(match)).toBe(true);
  });

  it("holds up through a full peak-13 match, including the No Trump round(s)", () => {
    const match = simulateFullAiMatch(123456, ALL_HARD, 13, true);
    expect(isMatchComplete(match)).toBe(true);
    const noTrumpRounds = match.history.filter((r) => r.trump === null);
    expect(noTrumpRounds.length).toBeGreaterThan(0);
  });

  it("every completed match awards a total score consistent with its history for all difficulty mixes", () => {
    const match = simulateFullAiMatch(999, MIXED, 6, true);
    for (const seat of [0, 1, 2, 3] as const) {
      const sum = match.history.reduce((acc, r) => acc + r.scores[seat], 0);
      expect(match.totalScores[seat]).toBe(sum);
    }
  });
});
