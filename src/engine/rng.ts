/**
 * Deterministic, seedable pseudo-random number generator.
 *
 * We use mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. It is not
 * cryptographically secure (fine: it only ever shuffles cards / breaks AI
 * ties, never anything security-sensitive), but it *is* fully deterministic:
 * the same seed always produces the same sequence, on any machine. That lets
 * tests assert exact deals, lets a match seed be logged for replay/debugging,
 * and lets the server and a client agree on a shuffle without transmitting
 * the whole deck order.
 */
export type RngFn = () => number;

export function mulberry32(seed: number): RngFn {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a 32-bit integer seed from any string (room codes, player ids, ...). */
export function seedFromString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Non-deterministic seed for "real" games (menu default). */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/**
 * Deterministically mix a match seed with a salt (e.g. round number) to get
 * a fresh per-round seed. Each round reshuffles a brand new 52-card deck —
 * this lets the whole match stay reproducible from one seed without the
 * engine having to carry a live RNG generator (a closure) inside its state,
 * which must stay plain, JSON-serializable data for the network layer.
 */
export function deriveSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 0x9e3779b1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Fisher-Yates shuffle. Pure: returns a new array, never mutates the input. */
export function shuffle<T>(items: readonly T[], rng: RngFn): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

/** Pick a random element (used sparingly by AI to break ties). */
export function pick<T>(items: readonly T[], rng: RngFn): T {
  if (items.length === 0) {
    throw new Error("pick() called with an empty array");
  }
  return items[Math.floor(rng() * items.length)];
}
