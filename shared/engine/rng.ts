/**
 * Deterministic, seedable pseudo-random number generation.
 *
 * A seedable RNG lets tests reproduce exact deals and lets a multiplayer room
 * derive a repeatable shuffle from its 4-letter code (useful for debugging and
 * for "same seed = same board" guarantees). Math.random is the default when no
 * determinism is needed.
 */

export type Rng = () => number;

/** mulberry32 — a small, fast 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a stable 32-bit seed from a string (FNV-1a). */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Fisher-Yates shuffle. Returns a NEW array; never mutates the input.
 * Unbiased given a uniform `rng` (unlike the original's swap-N-times hack).
 */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}
