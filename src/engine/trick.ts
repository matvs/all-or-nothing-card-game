import { rankValue } from "./deck.js";
import type { Card, PlayedCard, SeatIndex, Suit } from "./types.js";

/** True if `a` currently beats `b` within a trick led in `leadSuit` with `trump`. */
export function beats(a: Card, b: Card, leadSuit: Suit, trump: Suit | null): boolean {
  const aTrump = trump !== null && a.suit === trump;
  const bTrump = trump !== null && b.suit === trump;
  if (aTrump !== bTrump) return aTrump;
  if (aTrump && bTrump) return rankValue(a.rank) > rankValue(b.rank);
  const aFollows = a.suit === leadSuit;
  const bFollows = b.suit === leadSuit;
  if (aFollows !== bFollows) return aFollows;
  if (!aFollows && !bFollows) return false; // neither can win; earliest played stands
  return rankValue(a.rank) > rankValue(b.rank);
}

/** Which seat currently "owns" a trick, given the cards played so far (1..4 of them). */
export function currentTrickWinner(trick: readonly PlayedCard[], trump: Suit | null): SeatIndex {
  if (trick.length === 0) {
    throw new Error("currentTrickWinner() called with an empty trick");
  }
  const leadSuit = trick[0].card.suit;
  let best = trick[0];
  for (const played of trick.slice(1)) {
    if (beats(played.card, best.card, leadSuit, trump)) {
      best = played;
    }
  }
  return best.seat;
}

/** Would `card` currently win the trick if played next? Used heavily by AI. */
export function wouldWinTrick(
  card: Card,
  trick: readonly PlayedCard[],
  actingSeat: SeatIndex,
  trump: Suit | null
): boolean {
  const hypothetical: PlayedCard[] = [...trick, { seat: actingSeat, card }];
  return currentTrickWinner(hypothetical, trump) === actingSeat;
}

/**
 * Legal cards `seat` may play right now: must follow the suit led if able,
 * otherwise anything (including trump) is fair game. An empty trick means
 * `seat` is leading, so every card in hand is legal.
 */
export function legalPlays(
  hand: readonly Card[],
  trick: readonly PlayedCard[]
): Card[] {
  if (trick.length === 0) return hand.slice();
  const leadSuit = trick[0].card.suit;
  const followers = hand.filter((c) => c.suit === leadSuit);
  return followers.length > 0 ? followers : hand.slice();
}
