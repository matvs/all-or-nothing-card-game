import { cardsEqual, rankValue } from "../engine/deck.js";
import { pick, type RngFn } from "../engine/rng.js";
import { legalPlays, wouldWinTrick } from "../engine/trick.js";
import { RANKS, type Card } from "../engine/types.js";
import type { AiContext, Difficulty } from "./types.js";

const byRankAsc = (cards: Card[]): Card[] =>
  cards.slice().sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
const byRankDesc = (cards: Card[]): Card[] =>
  cards.slice().sort((a, b) => rankValue(b.rank) - rankValue(a.rank));

function cardsPlayedThisRound(ctx: AiContext): Card[] {
  const { round } = ctx;
  return [...round.completedTricks.flat().map((p) => p.card), ...round.currentTrick.map((p) => p.card)];
}

/**
 * Cards that could still beat `card` in a straight suit fight, as far as
 * this seat can tell: every higher card of the same suit that hasn't
 * already been played this round *and* isn't sitting safely in this seat's
 * own hand (in which case no opponent can hold it either). Used only for
 * leading decisions — the Hard tier's "counting" edge.
 */
function unaccountedHigherCards(card: Card, ctx: AiContext): Card[] {
  const higherRanks = RANKS.filter((r) => rankValue(r) > rankValue(card.rank));
  const accounted = [...cardsPlayedThisRound(ctx), ...ctx.round.hands[ctx.seat]];
  return higherRanks
    .map((rank) => ({ suit: card.suit, rank }))
    .filter((candidate) => !accounted.some((a) => cardsEqual(a, candidate)));
}

function leadCard(ctx: AiContext, difficulty: Difficulty, legal: Card[], wantsToWin: boolean, rng: RngFn): Card {
  if (difficulty === "easy") return pick(legal, rng);

  const trump = ctx.round.trump;
  const nonTrump = trump ? legal.filter((c) => c.suit !== trump) : legal;
  const trumpCards = trump ? legal.filter((c) => c.suit === trump) : [];
  const pool = nonTrump.length > 0 ? nonTrump : trumpCards;

  if (wantsToWin) {
    const sorted = byRankDesc(pool);
    if (difficulty === "hard") {
      const safe = sorted.filter((c) => unaccountedHigherCards(c, ctx).length === 0);
      if (safe.length > 0) return safe[0];
    }
    return sorted[0];
  }
  // Leading while trying to stay out of the lead: play low, and prefer not
  // to lead trump (a trump lead is far more likely to win than you want).
  return byRankAsc(pool)[0];
}

function followCard(ctx: AiContext, difficulty: Difficulty, legal: Card[], wantsToWin: boolean, rng: RngFn): Card {
  const { round, seat } = ctx;
  const winners = legal.filter((c) => wouldWinTrick(c, round.currentTrick, seat, round.trump));
  const nonWinners = legal.filter((c) => !winners.some((w) => cardsEqual(w, c)));

  if (wantsToWin) {
    const pool = winners.length > 0 ? winners : legal;
    // Win cheap: the lowest card that currently takes the trick; if none of
    // our legal cards can win, shed the lowest one instead (waste nothing).
    return difficulty === "easy" ? pick(pool, rng) : byRankAsc(pool)[0];
  }
  const pool = nonWinners.length > 0 ? nonWinners : legal;
  if (difficulty === "easy") return pick(pool, rng);
  // Dump safely: get rid of the highest card that still can't win, under the
  // cover of someone else's trick. If every legal card would win (forced to
  // take it), take it as cheaply as possible instead.
  return nonWinners.length > 0 ? byRankDesc(pool)[0] : byRankAsc(pool)[0];
}

/**
 * Choose a card to play. Always legal by construction: every branch selects
 * from `legal`, which is derived from the engine's own follow-suit rule, so
 * no difficulty tier can ever produce an illegal play.
 */
export function chooseCard(ctx: AiContext, difficulty: Difficulty, rng: RngFn): Card {
  const { round, seat } = ctx;
  const hand = round.hands[seat];
  const legal = legalPlays(hand, round.currentTrick);
  if (legal.length === 1) return legal[0];

  const bid = round.bids[seat] ?? 0;
  const stillNeeded = bid - round.tricksWon[seat];
  const wantsToWin = stillNeeded > 0;

  return round.currentTrick.length === 0
    ? leadCard(ctx, difficulty, legal, wantsToWin, rng)
    : followCard(ctx, difficulty, legal, wantsToWin, rng);
}
