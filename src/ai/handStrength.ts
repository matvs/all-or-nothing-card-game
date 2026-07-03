import type { Card, Rank, Suit } from "../engine/types.js";

/**
 * Rough, explainable "probability this card wins a trick on its own" weights.
 * Not a solver — a hand-tuned heuristic in the spirit of how a competent
 * human Oh-Hell/Whist player eyeballs a hand before bidding: trump length
 * and top honours dominate, plain-suit aces are good, everything else is
 * nearly worthless without help.
 */
const TRUMP_WEIGHT: Partial<Record<Rank, number>> = {
  A: 1.0,
  K: 0.85,
  Q: 0.7,
  J: 0.55,
  "10": 0.45,
  "9": 0.35,
};

const PLAIN_WEIGHT: Partial<Record<Rank, number>> = {
  A: 0.7,
  K: 0.4,
  Q: 0.15,
};

export function cardTrickWeight(card: Card, trump: Suit | null): number {
  const isTrump = trump !== null && card.suit === trump;
  if (isTrump) return TRUMP_WEIGHT[card.rank] ?? 0.25;
  return PLAIN_WEIGHT[card.rank] ?? 0.02;
}

/**
 * Expected tricks for a hand: the sum of per-card weights, plus a length
 * bonus for long trump suits (a 5th+ trump usually cashes in the endgame
 * even if it's low, once shorter trump hands are exhausted).
 */
export function estimateHandStrength(hand: readonly Card[], trump: Suit | null): number {
  const base = hand.reduce((sum, c) => sum + cardTrickWeight(c, trump), 0);
  const trumpCount = trump ? hand.filter((c) => c.suit === trump).length : 0;
  const lengthBonus = trumpCount > 3 ? (trumpCount - 3) * 0.5 : 0;
  return base + lengthBonus;
}
