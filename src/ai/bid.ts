import { getForbiddenBid, getLegalBidAmounts } from "../engine/match.js";
import { pick, type RngFn } from "../engine/rng.js";
import { SUITS, type Suit } from "../engine/types.js";
import { estimateHandStrength } from "./handStrength.js";
import type { AiContext, Difficulty } from "./types.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Legality is never a matter of skill: whatever difficulty produced the
 * desired bid, if it happens to be the dealer-restricted forbidden value we
 * nudge it to the closest legal neighbour (ties broken by rng). Every
 * difficulty routes through this before returning.
 */
export function resolveLegalBid(desired: number, ctx: AiContext, rng: RngFn): number {
  const { round, match } = ctx;
  const clamped = clamp(Math.round(desired), 0, round.handSize);
  const forbidden = getForbiddenBid(round, match.settings);
  if (forbidden === null || clamped !== forbidden) return clamped;
  const legal = getLegalBidAmounts(round, match.settings);
  const distances = legal.map((n) => Math.abs(n - clamped));
  const minDist = Math.min(...distances);
  const closest = legal.filter((_, i) => distances[i] === minDist);
  return pick(closest, rng);
}

function easyEstimate(ctx: AiContext, rng: RngFn): number {
  // Naive: only really registers aces and kings, and wobbles randomly —
  // deliberately weaker and more beatable than the other tiers.
  const { round, seat } = ctx;
  const hand = round.hands[seat];
  const raw = hand.reduce((sum, c) => {
    if (c.rank === "A") return sum + (c.suit === round.trump ? 0.9 : 0.6);
    if (c.rank === "K") return sum + (c.suit === round.trump ? 0.6 : 0.3);
    return sum + (c.suit === round.trump ? 0.15 : 0);
  }, 0);
  return raw + (rng() - 0.5) * 2.4; // +/- up to ~1.2 tricks of noise
}

function hardEstimate(ctx: AiContext): number {
  const { round, seat } = ctx;
  const hand = round.hands[seat];
  let raw = estimateHandStrength(hand, round.trump);
  const trump = round.trump;
  if (trump) {
    const trumpCount = hand.filter((c) => c.suit === trump).length;
    if (trumpCount > 0) {
      // Voids are ruffing (trick-winning) potential once trump is led out —
      // but only worth something if this hand actually holds trump to ruff with.
      const voidSuits = SUITS.filter(
        (s: Suit) => s !== trump && !hand.some((c) => c.suit === s)
      );
      raw += voidSuits.length * 0.3;
    }
  }
  return raw;
}

export function estimateBid(ctx: AiContext, difficulty: Difficulty, rng: RngFn): number {
  const { round, seat } = ctx;
  const hand = round.hands[seat];
  const handSize = round.handSize;

  let raw: number;
  if (difficulty === "easy") raw = easyEstimate(ctx, rng);
  else if (difficulty === "hard") raw = hardEstimate(ctx);
  else raw = estimateHandStrength(hand, round.trump);

  let bid = Math.round(clamp(raw, 0, handSize));

  if (difficulty === "hard" && handSize >= 2) {
    // Chase the namesake bonus when a hand is already close to an extreme —
    // the risk premium for going the extra step is small when you were
    // nearly there anyway, and the payout is much larger (see scoring.ts).
    if (bid === 1 && raw < 1.35) bid = 0;
    if (bid === handSize - 1 && raw > handSize - 1.35) bid = handSize;
  }

  return resolveLegalBid(bid, ctx, rng);
}
