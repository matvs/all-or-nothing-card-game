import { type Card, type Triple, makeCard } from "./types.js";
import { type Rng, shuffle } from "./rng.js";

/**
 * The full, ordered 81-card deck: one card for every combination of the four
 * attributes. Order is deterministic (id ascending) so a fresh deck is always
 * identical before shuffling.
 */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  for (let color = 0; color < 3; color++) {
    for (let shape = 0; shape < 3; shape++) {
      for (let shading = 0; shading < 3; shading++) {
        for (let count = 0; count < 3; count++) {
          cards.push(makeCard(color as Triple, shape as Triple, shading as Triple, count as Triple));
        }
      }
    }
  }
  return cards;
}

/** A freshly shuffled 81-card deck. */
export function shuffledDeck(rng: Rng = Math.random): Card[] {
  return shuffle(buildDeck(), rng);
}
