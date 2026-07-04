/**
 * Core SET card model.
 *
 * A SET card has four attributes, each taking one of three values. We encode
 * every value as 0 | 1 | 2 (a "Triple") because the game's defining rule —
 * "for each attribute the three cards are all the same OR all different" —
 * collapses to a single arithmetic test: (a + b + c) % 3 === 0.
 *
 * The full deck is therefore the 3^4 = 81 distinct attribute combinations.
 */

export type Triple = 0 | 1 | 2;

/** Display metadata. Rendering maps these indices to concrete visuals. */
export const COLORS = ["red", "green", "purple"] as const;
export const SHAPES = ["square", "circle", "triangle"] as const;
export const SHADINGS = ["open", "solid", "striped"] as const;
/** Number of symbols actually drawn on the card (index 0 -> 1 symbol, etc.). */
export const COUNTS = [1, 2, 3] as const;

export type Color = (typeof COLORS)[number];
export type Shape = (typeof SHAPES)[number];
export type Shading = (typeof SHADINGS)[number];
export type Count = (typeof COUNTS)[number];

export const ATTRIBUTES = ["color", "shape", "shading", "count"] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

export const DECK_SIZE = 81;

/**
 * A single card. `id` is the canonical 0..80 identity derived from the four
 * attribute values, so two cards are equal iff their ids match. It doubles as
 * the wire representation for multiplayer (send an id, rebuild the card).
 */
export interface Card {
  readonly id: number;
  readonly color: Triple;
  readonly shape: Triple;
  readonly shading: Triple;
  readonly count: Triple;
}

/** Pack four attribute values into the canonical 0..80 id (base-3 digits). */
export function cardId(color: Triple, shape: Triple, shading: Triple, count: Triple): number {
  return ((color * 3 + shape) * 3 + shading) * 3 + count;
}

export function makeCard(color: Triple, shape: Triple, shading: Triple, count: Triple): Card {
  return { id: cardId(color, shape, shading, count), color, shape, shading, count };
}

/** Inverse of {@link cardId}: rebuild a card from its id (0..80). */
export function cardFromId(id: number): Card {
  if (!Number.isInteger(id) || id < 0 || id >= DECK_SIZE) {
    throw new RangeError(`card id out of range: ${id}`);
  }
  const count = (id % 3) as Triple;
  const shading = (Math.floor(id / 3) % 3) as Triple;
  const shape = (Math.floor(id / 9) % 3) as Triple;
  const color = (Math.floor(id / 27) % 3) as Triple;
  return { id, color, shape, shading, count };
}

/** Human-facing symbol count (1..3) for a card. */
export function symbolCount(card: Card): Count {
  return COUNTS[card.count];
}
