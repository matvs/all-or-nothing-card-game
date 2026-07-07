import { makeCard, type Card } from "../../../shared/engine/index.js";

/** A single guided example on the How-to-Play tutorial page. */
export interface GuidedExample {
  /** Short headline shown on the stepper tab. */
  title: string;
  /** The three example cards, painted on the live example board. */
  cards: [Card, Card, Card];
  /** Plain-language explanation shown under the board. */
  note: string;
  /** The verdict the example is meant to teach (asserted by unit tests). */
  expected: boolean;
}

/**
 * The three worked examples that walk a new player through the rule: two valid
 * sets (all-different, then same-colour/rest-different) and one near-miss. Each
 * `expected` verdict is checked against the real engine in the unit tests, so
 * the tutorial can never silently teach a wrong example.
 */
export const guidedExamples: GuidedExample[] = [
  {
    title: "Every property is different",
    cards: [makeCard(0, 0, 0, 0), makeCard(1, 1, 1, 1), makeCard(2, 2, 2, 2)],
    note: "Color, shape, filling and number all use 0, 1 and 2 exactly once.",
    expected: true,
  },
  {
    title: "Some same, some different",
    cards: [makeCard(0, 1, 0, 2), makeCard(0, 2, 1, 0), makeCard(0, 0, 2, 1)],
    note: "Color is the same on all three cards. Shape, filling and number are all different.",
    expected: true,
  },
  {
    title: "Almost, but not a set",
    cards: [makeCard(0, 0, 0, 0), makeCard(0, 1, 1, 1), makeCard(1, 2, 2, 2)],
    note: "The colors are two purple and one green, so color is neither all same nor all different.",
    expected: false,
  },
];

/**
 * A fixed nine-card tableau for the "try it yourself" practice lab. It contains
 * real sets to hunt for and is kept stable (not shuffled) so the tutorial is
 * deterministic.
 */
export const practiceCards: Card[] = [
  makeCard(0, 0, 0, 0),
  makeCard(1, 1, 1, 1),
  makeCard(2, 2, 2, 2),
  makeCard(0, 1, 2, 0),
  makeCard(1, 2, 0, 1),
  makeCard(2, 0, 1, 2),
  makeCard(0, 2, 1, 1),
  makeCard(1, 0, 2, 2),
  makeCard(2, 1, 0, 0),
];
