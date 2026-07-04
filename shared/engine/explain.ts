import { ATTRIBUTE_LABELS, ATTRIBUTES, type Card } from "./types.js";

/**
 * One row of the "Explanation" table shown when a set is found (or rejected).
 * Mirrors the recovered original's getExplanation(): for each of the four
 * properties, is the value all-the-same across the three cards, and/or all
 * different. A valid SET has every row saying YES to exactly one column.
 */
export interface ExplanationRow {
  /** Display label: color / shape / filling / number (original UI labels). */
  readonly property: string;
  readonly allSame: boolean;
  readonly eachDifferent: boolean;
}

function allSame(values: readonly number[]): boolean {
  return values.every((v) => v === values[0]);
}

function eachDifferent(values: readonly number[]): boolean {
  return new Set(values).size === values.length;
}

/**
 * Build the explanation for three cards, in the exact property order the
 * original table used: color, shape, filling, number.
 */
export function explainTriple(a: Card, b: Card, c: Card): ExplanationRow[] {
  return ATTRIBUTES.map((attr) => {
    const values = [a[attr], b[attr], c[attr]] as number[];
    return {
      property: ATTRIBUTE_LABELS[attr],
      allSame: allSame(values),
      eachDifferent: eachDifferent(values),
    };
  });
}
