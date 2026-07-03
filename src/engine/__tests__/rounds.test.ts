import { describe, expect, it } from "vitest";
import { buildRoundSequence, MATCH_LENGTH_PRESETS } from "../rounds.js";

describe("buildRoundSequence", () => {
  it("climbs from 1 to the peak and back down to 1", () => {
    expect(buildRoundSequence(3)).toEqual([1, 2, 3, 2, 1]);
  });

  it("handles a peak of 1 (a single one-card round)", () => {
    expect(buildRoundSequence(1)).toEqual([1]);
  });

  it("has length 2*peak - 1", () => {
    for (const peak of [1, 2, 5, 8, 13]) {
      expect(buildRoundSequence(peak)).toHaveLength(2 * peak - 1);
    }
  });

  it("matches the documented presets", () => {
    expect(buildRoundSequence(MATCH_LENGTH_PRESETS.short)).toHaveLength(9);
    expect(buildRoundSequence(MATCH_LENGTH_PRESETS.standard)).toHaveLength(15);
    expect(buildRoundSequence(MATCH_LENGTH_PRESETS.long)).toHaveLength(25);
  });

  it("rejects an out-of-range peak", () => {
    expect(() => buildRoundSequence(0)).toThrow();
    expect(() => buildRoundSequence(14)).toThrow();
    expect(() => buildRoundSequence(1.5)).toThrow();
  });
});
