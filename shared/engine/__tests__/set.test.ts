import { describe, expect, it } from "vitest";
import { buildDeck } from "../deck.js";
import {
  cardFromId,
  cardId,
  DECK_SIZE,
  makeCard,
  type Card,
  type Triple,
} from "../types.js";
import {
  countSets,
  findAllSets,
  findFirstSet,
  hasSet,
  isSet,
  setKey,
  thirdCardId,
} from "../set.js";

/**
 * Reference implementation of the original "all the same OR all different"
 * rule, kept ONLY in the test to prove the fast modulo isSet is equivalent
 * across the entire deck.
 */
function isSetReference(a: Card, b: Card, c: Card): boolean {
  const attrs: (keyof Card)[] = ["color", "shape", "shading", "count"];
  for (const attr of attrs) {
    const va = a[attr] as number;
    const vb = b[attr] as number;
    const vc = c[attr] as number;
    const allSame = va === vb && vb === vc;
    const allDiff = va !== vb && vb !== vc && va !== vc;
    if (!allSame && !allDiff) return false;
  }
  return true;
}

const deck = buildDeck();

describe("card id encoding", () => {
  it("builds exactly 81 unique cards covering every combination", () => {
    expect(deck).toHaveLength(DECK_SIZE);
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(DECK_SIZE);
    expect(Math.min(...ids)).toBe(0);
    expect(Math.max(...ids)).toBe(80);
  });

  it("cardFromId is the inverse of cardId for all 81 ids", () => {
    for (let id = 0; id < DECK_SIZE; id++) {
      const c = cardFromId(id);
      expect(c.id).toBe(id);
      expect(cardId(c.color, c.shape, c.shading, c.count)).toBe(id);
    }
  });

  it("rejects out-of-range ids", () => {
    expect(() => cardFromId(-1)).toThrow();
    expect(() => cardFromId(81)).toThrow();
    expect(() => cardFromId(1.5)).toThrow();
  });
});

describe("isSet equivalence with the reference rule (exhaustive)", () => {
  it("agrees on all C(81,3) = 85320 triples and counts exactly 1080 sets", () => {
    let sets = 0;
    let mismatches = 0;
    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) {
        for (let k = j + 1; k < deck.length; k++) {
          const fast = isSet(deck[i], deck[j], deck[k]);
          const ref = isSetReference(deck[i], deck[j], deck[k]);
          if (fast !== ref) mismatches++;
          if (fast) sets++;
        }
      }
    }
    expect(mismatches).toBe(0);
    // Known combinatorial fact: a full SET deck contains exactly 1080 sets.
    expect(sets).toBe(1080);
  });
});

describe("thirdCardId", () => {
  it("completes a set for every pair, and the third is always distinct", () => {
    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) {
        const third = thirdCardId(deck[i], deck[j]);
        expect(third).toBeGreaterThanOrEqual(0);
        expect(third).toBeLessThan(DECK_SIZE);
        expect(third).not.toBe(deck[i].id);
        expect(third).not.toBe(deck[j].id);
        expect(isSet(deck[i], deck[j], cardFromId(third))).toBe(true);
      }
    }
  });
});

describe("findAllSets / hasSet / findFirstSet", () => {
  const t = (color: Triple, shape: Triple, shading: Triple, count: Triple) =>
    makeCard(color, shape, shading, count);

  it("finds the single set among four carefully chosen cards", () => {
    // Three that form a set (all different colour, everything else equal) + a decoy.
    const board = [
      t(0, 0, 0, 0),
      t(1, 0, 0, 0),
      t(2, 0, 0, 0), // set with the two above
      t(1, 1, 1, 1), // decoy
    ];
    const all = findAllSets(board);
    expect(all).toHaveLength(1);
    expect(all[0].indices).toEqual([0, 1, 2]);
    expect(hasSet(board)).toBe(true);
    expect(findFirstSet(board)?.indices).toEqual([0, 1, 2]);
  });

  it("returns each set once with ascending indices even when interleaved", () => {
    const board = [
      t(0, 0, 0, 0), // 0
      t(1, 1, 1, 1), // 1
      t(2, 2, 2, 2), // 2  -> set {0,1,2}
      t(0, 0, 0, 1), // 3
      t(0, 0, 0, 2), // 4  -> set {0,3,4}
    ];
    const all = findAllSets(board);
    const keys = all.map((s) => s.indices.join(","));
    expect(keys).toContain("0,1,2");
    expect(keys).toContain("0,3,4");
    // No duplicates.
    expect(new Set(keys).size).toBe(keys.length);
    // Every reported set is genuinely a set with sorted indices.
    for (const s of all) {
      expect(isSet(s.cards[0], s.cards[1], s.cards[2])).toBe(true);
      expect(s.indices[0]).toBeLessThan(s.indices[1]);
      expect(s.indices[1]).toBeLessThan(s.indices[2]);
    }
  });

  it("reports no set for a known set-free board", () => {
    // A 'cap' style set-free collection: build until findAllSets is empty.
    const board = [
      t(0, 0, 0, 0),
      t(0, 0, 0, 1),
      t(0, 0, 1, 0),
      t(0, 1, 0, 0),
    ];
    // {0,0,0,0},{0,0,0,1} complete needs {0,0,0,2} — absent. Verify none present.
    expect(hasSet(board)).toBe(false);
    expect(findAllSets(board)).toHaveLength(0);
    expect(findFirstSet(board)).toBeNull();
    expect(countSets(board)).toBe(0);
  });

  it("findAllSets matches a brute-force triple scan on random boards", () => {
    const brute = (board: Card[]) => {
      const out: string[] = [];
      for (let i = 0; i < board.length; i++)
        for (let j = i + 1; j < board.length; j++)
          for (let k = j + 1; k < board.length; k++)
            if (isSet(board[i], board[j], board[k])) out.push(`${i},${j},${k}`);
      return out.sort();
    };
    // Deterministic pseudo-random sampling of boards.
    let seed = 12345;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let trial = 0; trial < 200; trial++) {
      const size = 6 + Math.floor(rand() * 15);
      const pool = [...deck];
      const board: Card[] = [];
      for (let n = 0; n < size; n++) {
        board.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
      }
      const fast = findAllSets(board)
        .map((s) => s.indices.join(","))
        .sort();
      expect(fast).toEqual(brute(board));
    }
  });
});

describe("setKey", () => {
  it("is order-independent", () => {
    const a = makeCard(0, 0, 0, 0);
    const b = makeCard(1, 1, 1, 1);
    const c = makeCard(2, 2, 2, 2);
    expect(setKey([a, b, c])).toBe(setKey([c, a, b]));
    expect(setKey([a, b, c])).toBe(`${a.id}-${b.id}-${c.id}`);
  });
});
