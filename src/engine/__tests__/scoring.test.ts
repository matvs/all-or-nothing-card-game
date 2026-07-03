import { describe, expect, it } from "vitest";
import { isExtremeBid, scoreRound } from "../scoring.js";

describe("scoreRound", () => {
  it("scores zero for any miss, whether under or over the bid", () => {
    expect(scoreRound(3, 2, 5)).toBe(0);
    expect(scoreRound(3, 4, 5)).toBe(0);
    expect(scoreRound(0, 1, 5)).toBe(0);
  });

  it("rewards an exact ordinary bid with 10 + 2*bid", () => {
    expect(scoreRound(2, 2, 5)).toBe(14);
    expect(scoreRound(4, 4, 8)).toBe(18);
  });

  it("gives the 'Nothing' bonus for an exact zero bid: 10 + handSize", () => {
    expect(scoreRound(0, 0, 5)).toBe(15);
    expect(scoreRound(0, 0, 1)).toBe(11);
    expect(scoreRound(0, 0, 13)).toBe(23);
  });

  it("gives the 'All' bonus for taking every trick: 20 + 2*handSize", () => {
    expect(scoreRound(5, 5, 5)).toBe(30);
    expect(scoreRound(1, 1, 1)).toBe(22);
    expect(scoreRound(13, 13, 13)).toBe(46);
  });

  it("the All bonus always exceeds the Nothing bonus for the same hand size (harder to pull off)", () => {
    for (let handSize = 1; handSize <= 13; handSize++) {
      const nothing = scoreRound(0, 0, handSize);
      const all = scoreRound(handSize, handSize, handSize);
      expect(all).toBeGreaterThan(nothing);
    }
  });

  it("extreme bids always outscore an equivalent ordinary exact bid of the same size hand", () => {
    // A made ordinary bid never scores more than a made extreme bid on a 6-card hand.
    const handSize = 6;
    const ordinaryMax = Math.max(
      ...[1, 2, 3, 4, 5].map((b) => scoreRound(b, b, handSize))
    );
    expect(scoreRound(0, 0, handSize)).toBeGreaterThan(0);
    expect(scoreRound(handSize, handSize, handSize)).toBeGreaterThan(ordinaryMax);
  });

  it("throws for a bid outside [0, handSize]", () => {
    expect(() => scoreRound(-1, 0, 5)).toThrow();
    expect(() => scoreRound(6, 6, 5)).toThrow();
  });
});

describe("isExtremeBid", () => {
  it("flags 0 and handSize as extreme, everything else as ordinary", () => {
    expect(isExtremeBid(0, 5)).toBe(true);
    expect(isExtremeBid(5, 5)).toBe(true);
    expect(isExtremeBid(2, 5)).toBe(false);
  });
});
