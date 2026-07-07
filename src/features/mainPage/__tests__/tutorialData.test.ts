import { describe, expect, it } from "vitest";
import { isSet } from "../../../../shared/engine/index.js";
import { guidedExamples, practiceCards } from "../tutorialData.js";

describe("How-to-Play guided examples", () => {
  it("teach the verdict they claim for every worked example", () => {
    for (const example of guidedExamples) {
      const [a, b, c] = example.cards;
      expect(isSet(a, b, c)).toBe(example.expected);
    }
  });

  it("include at least one valid set and one non-set", () => {
    const verdicts = guidedExamples.map((e) => e.expected);
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });
});

describe("How-to-Play practice tableau", () => {
  it("contains at least one findable set to practise on", () => {
    let found = false;
    for (let i = 0; i < practiceCards.length && !found; i++) {
      for (let j = i + 1; j < practiceCards.length && !found; j++) {
        for (let k = j + 1; k < practiceCards.length && !found; k++) {
          if (isSet(practiceCards[i], practiceCards[j], practiceCards[k])) found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it("has unique card ids so selection tracking is unambiguous", () => {
    const ids = new Set(practiceCards.map((c) => c.id));
    expect(ids.size).toBe(practiceCards.length);
  });
});
