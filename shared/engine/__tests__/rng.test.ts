import { describe, expect, it } from "vitest";
import { mulberry32, seedFromString, shuffle } from "../rng.js";
import { buildDeck } from "../deck.js";

describe("mulberry32", () => {
  it("is deterministic for a given seed and varies across seeds", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const c = mulberry32(124);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    const seqC = Array.from({ length: 10 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const x of seqA) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("has a roughly uniform distribution across buckets", () => {
    const rng = mulberry32(999);
    const buckets = new Array(10).fill(0);
    const N = 100000;
    for (let i = 0; i < N; i++) buckets[Math.floor(rng() * 10)]++;
    for (const count of buckets) {
      // Each bucket should hold ~10% (allow a generous band).
      expect(count).toBeGreaterThan(N * 0.08);
      expect(count).toBeLessThan(N * 0.12);
    }
  });
});

describe("seedFromString", () => {
  it("is stable and distinguishes different strings", () => {
    expect(seedFromString("ABCD")).toBe(seedFromString("ABCD"));
    expect(seedFromString("ABCD")).not.toBe(seedFromString("ABCE"));
  });
});

describe("shuffle", () => {
  it("permutes without dropping, duplicating, or mutating the input", () => {
    const deck = buildDeck();
    const original = [...deck];
    const shuffled = shuffle(deck, mulberry32(5));
    expect(shuffled).toHaveLength(deck.length);
    expect(new Set(shuffled.map((c) => c.id)).size).toBe(deck.length);
    // Input not mutated.
    expect(deck).toEqual(original);
    // Deterministic for a seed.
    expect(shuffle(deck, mulberry32(5))).toEqual(shuffled);
    // Actually reorders (astronomically unlikely to be identity).
    expect(shuffled.map((c) => c.id)).not.toEqual(deck.map((c) => c.id));
  });
});
