import type { Card, Triple } from "./types.js";

/**
 * Three cards form a SET iff, for EVERY attribute, the three values are all
 * the same or all different. Because values are 0|1|2, that is equivalent to
 * their sum being divisible by 3 (3 same values -> 3v; three different ->
 * 0+1+2 = 3). This is both faster and less error-prone than the original
 * all-same-OR-all-different branching, and the two are proven equivalent by
 * the exhaustive test suite.
 */
export function isSet(a: Card, b: Card, c: Card): boolean {
  return (
    (a.color + b.color + c.color) % 3 === 0 &&
    (a.shape + b.shape + c.shape) % 3 === 0 &&
    (a.shading + b.shading + c.shading) % 3 === 0 &&
    (a.count + b.count + c.count) % 3 === 0
  );
}

/** The single attribute value that completes a set given two values. */
function completeValue(x: Triple, y: Triple): Triple {
  return ((3 - ((x + y) % 3)) % 3) as Triple;
}

/**
 * Given two DISTINCT cards there is exactly one card that completes a set with
 * them; this returns its canonical id. (For any a !== b the completion differs
 * from both a and b, so it is always a genuine third card.)
 */
export function thirdCardId(a: Card, b: Card): number {
  const color = completeValue(a.color, b.color);
  const shape = completeValue(a.shape, b.shape);
  const shading = completeValue(a.shading, b.shading);
  const count = completeValue(a.count, b.count);
  return ((color * 3 + shape) * 3 + shading) * 3 + count;
}

export interface FoundSet {
  /** Board indices in ascending order. */
  readonly indices: [number, number, number];
  readonly cards: [Card, Card, Card];
}

/**
 * Every set present on a board, each returned exactly once with ascending
 * indices. O(n^2): for each pair we look up the unique completing card and
 * only accept it when its index is greater than the pair (dedupe).
 */
export function findAllSets(board: readonly Card[]): FoundSet[] {
  const indexById = new Map<number, number>();
  board.forEach((card, idx) => indexById.set(card.id, idx));

  const found: FoundSet[] = [];
  for (let i = 0; i < board.length; i++) {
    for (let j = i + 1; j < board.length; j++) {
      const k = indexById.get(thirdCardId(board[i], board[j]));
      if (k !== undefined && k > j) {
        found.push({ indices: [i, j, k], cards: [board[i], board[j], board[k]] });
      }
    }
  }
  return found;
}

/** Fast presence check — does the board contain at least one set? */
export function hasSet(board: readonly Card[]): boolean {
  const ids = new Set(board.map((c) => c.id));
  for (let i = 0; i < board.length; i++) {
    for (let j = i + 1; j < board.length; j++) {
      // thirdCardId is always distinct from board[i]/board[j], so mere
      // presence of the completing id proves a set of three distinct cards.
      if (ids.has(thirdCardId(board[i], board[j]))) return true;
    }
  }
  return false;
}

/** The first set on the board, or null (used for hints). */
export function findFirstSet(board: readonly Card[]): FoundSet | null {
  const indexById = new Map<number, number>();
  board.forEach((card, idx) => indexById.set(card.id, idx));
  for (let i = 0; i < board.length; i++) {
    for (let j = i + 1; j < board.length; j++) {
      const k = indexById.get(thirdCardId(board[i], board[j]));
      if (k !== undefined && k > j) {
        return { indices: [i, j, k], cards: [board[i], board[j], board[k]] };
      }
    }
  }
  return null;
}

/** Count sets present (convenience for stats / puzzle displays). */
export function countSets(board: readonly Card[]): number {
  return findAllSets(board).length;
}

/** Canonical key for a set of three cards (order-independent) — for dedupe. */
export function setKey(cards: readonly Card[]): string {
  return cards
    .map((c) => c.id)
    .sort((a, b) => a - b)
    .join("-");
}
