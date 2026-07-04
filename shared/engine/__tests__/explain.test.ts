import { describe, expect, it } from "vitest";
import { makeCard } from "../types.js";
import { explainTriple } from "../explain.js";
import { isSet } from "../set.js";

describe("explainTriple", () => {
  it("labels the four rows color / shape / filling / number in order", () => {
    const rows = explainTriple(makeCard(0, 0, 0, 0), makeCard(0, 0, 0, 1), makeCard(0, 0, 0, 2));
    expect(rows.map((r) => r.property)).toEqual(["color", "shape", "filling", "number"]);
  });

  it("marks all-same and all-different correctly for a valid set", () => {
    // color/shape/filling all identical, number all different -> a valid set.
    const a = makeCard(0, 0, 0, 0);
    const b = makeCard(0, 0, 0, 1);
    const c = makeCard(0, 0, 0, 2);
    expect(isSet(a, b, c)).toBe(true);
    const rows = explainTriple(a, b, c);
    const byProp = Object.fromEntries(rows.map((r) => [r.property, r]));
    expect(byProp.color).toMatchObject({ allSame: true, eachDifferent: false });
    expect(byProp.shape).toMatchObject({ allSame: true, eachDifferent: false });
    expect(byProp.filling).toMatchObject({ allSame: true, eachDifferent: false });
    expect(byProp.number).toMatchObject({ allSame: false, eachDifferent: true });
  });

  it("every valid set has exactly one YES per row", () => {
    const a = makeCard(0, 0, 0, 0);
    const b = makeCard(1, 1, 1, 1);
    const c = makeCard(2, 2, 2, 2);
    expect(isSet(a, b, c)).toBe(true);
    for (const row of explainTriple(a, b, c)) {
      expect(row.allSame !== row.eachDifferent).toBe(true);
    }
  });

  it("shows a NO/NO row for the attribute that breaks a non-set", () => {
    // colours all different, but numbers are 0,0,1 -> neither same nor different.
    const a = makeCard(0, 0, 0, 0);
    const b = makeCard(1, 0, 0, 0);
    const c = makeCard(2, 0, 0, 1);
    expect(isSet(a, b, c)).toBe(false);
    const number = explainTriple(a, b, c).find((r) => r.property === "number");
    expect(number).toMatchObject({ allSame: false, eachDifferent: false });
  });
});
