import { RANKS, SUITS, type Card, type CardId, type Rank, type Suit } from "./types.js";

/** Standard 52-card deck in a fixed, deterministic order (before shuffling). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** Ace-high numeric value used for trick comparisons and AI hand evaluation. */
export function rankValue(rank: Rank): number {
  const index = RANKS.indexOf(rank);
  return index + 2; // "2" -> 2, ... "A" -> 14
}

export function cardId(card: Card): CardId {
  return `${card.rank}${card.suit}`;
}

export function parseCardId(id: CardId): Card {
  const suit = id.slice(-1) as Suit;
  const rank = id.slice(0, -1) as Rank;
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) {
    throw new Error(`Invalid card id: "${id}"`);
  }
  return { suit, rank };
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/**
 * Stable, human-friendly sort for displaying a hand: trump suit first (if
 * any), then the rest in a fixed suit order, each group ranked low to high.
 */
export function sortHand(cards: readonly Card[], trump: Suit | null): Card[] {
  const suitOrder: Suit[] = trump
    ? [trump, ...SUITS.filter((s) => s !== trump)]
    : [...SUITS];
  return cards.slice().sort((a, b) => {
    const suitDiff = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    return rankValue(a.rank) - rankValue(b.rank);
  });
}
