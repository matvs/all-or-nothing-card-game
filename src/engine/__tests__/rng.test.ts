import { describe, expect, it } from "vitest";
import { deriveSeed, mulberry32, pick, randomSeed, shuffle } from "../rng.js";

describe("mulberry32", () => {
  it("is deterministic: same seed produces the same sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds produce different sequences", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("always returns values in [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("deriveSeed", () => {
  it("is deterministic and salt-sensitive", () => {
    expect(deriveSeed(100, 1)).toBe(deriveSeed(100, 1));
    expect(deriveSeed(100, 1)).not.toBe(deriveSeed(100, 2));
    expect(deriveSeed(100, 1)).not.toBe(deriveSeed(101, 1));
  });
});

describe("shuffle", () => {
  it("returns a permutation of the input (same multiset, new array identity)", () => {
    const input = Array.from({ length: 52 }, (_, i) => i);
    const rng = mulberry32(9);
    const result = shuffle(input, rng);
    expect(result).not.toBe(input);
    expect(result.slice().sort((x, y) => x - y)).toEqual(input);
  });

  it("does not mutate the input array", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = input.slice();
    shuffle(input, mulberry32(3));
    expect(input).toEqual(copy);
  });

  it("is deterministic for a given seed", () => {
    const input = Array.from({ length: 10 }, (_, i) => i);
    const a = shuffle(input, mulberry32(555));
    const b = shuffle(input, mulberry32(555));
    expect(a).toEqual(b);
  });

  it("actually reorders a reasonably sized array", () => {
    const input = Array.from({ length: 52 }, (_, i) => i);
    const result = shuffle(input, mulberry32(1));
    expect(result).not.toEqual(input);
  });
});

describe("pick", () => {
  it("always returns an element from the array", () => {
    const items = ["a", "b", "c"];
    const rng = mulberry32(2);
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(pick(items, rng));
    }
  });

  it("throws on an empty array", () => {
    expect(() => pick([], mulberry32(1))).toThrow();
  });
});

describe("randomSeed", () => {
  it("returns an unsigned 32-bit integer", () => {
    const s = randomSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
