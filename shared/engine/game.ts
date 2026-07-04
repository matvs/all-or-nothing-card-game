import type { Card } from "./types.js";
import { type Rng, shuffle } from "./rng.js";
import { buildDeck } from "./deck.js";
import { hasSet, isSet } from "./set.js";

/** Standard SET tableau: 12 cards, growing by 3 when no set is present. */
export const INITIAL_BOARD = 12;
export const DEAL_STEP = 3;

/**
 * The shared card-table state used by BOTH the single-player game and each
 * multiplayer room. `board` holds face-up cards (positions are stable so the
 * UI can replace claimed cards in place); `deck` is the remaining draw pile,
 * drawn from the end.
 */
export interface Tableau {
  deck: Card[];
  board: Card[];
}

/** Deal one step of up to 3 cards from the deck onto the board. Returns count dealt. */
function dealStep(t: Tableau): number {
  let dealt = 0;
  for (let i = 0; i < DEAL_STEP && t.deck.length > 0; i++) {
    t.board.push(t.deck.pop()!);
    dealt++;
  }
  return dealt;
}

/**
 * Guarantee a set exists on the board: keep dealing 3 more until one appears
 * or the deck is empty. This is the "deal until a set exists" rule.
 */
export function ensureSet(t: Tableau): void {
  while (!hasSet(t.board) && t.deck.length > 0) {
    dealStep(t);
  }
}

/** True when the game cannot continue: no set on the board and no cards left. */
export function isGameOver(t: Tableau): boolean {
  return t.deck.length === 0 && !hasSet(t.board);
}

/** Start a fresh tableau: shuffle, deal 12, then top up until a set exists. */
export function newTableau(rng: Rng = Math.random): Tableau {
  const t: Tableau = { deck: shuffle(buildDeck(), rng), board: [] };
  while (t.board.length < INITIAL_BOARD && t.deck.length > 0) {
    t.board.push(t.deck.pop()!);
  }
  ensureSet(t);
  return t;
}

export type ClaimFailure = "not-a-set" | "unknown-card" | "duplicate-card" | "already-taken";

export interface ClaimResult {
  readonly ok: boolean;
  readonly reason?: ClaimFailure;
  /** The three removed cards, on success. */
  readonly removed?: readonly [Card, Card, Card];
}

/**
 * Attempt to claim a set by CARD ID (ids are stable across board mutations, so
 * they are safer than positional indices for networked play). On success the
 * three cards are removed and — if the board was at its normal size — replaced
 * from the deck in place; then the set guarantee is re-established.
 *
 * Server-authoritative: the caller (room / game) trusts only this result.
 */
export function claimSet(t: Tableau, cardIds: readonly [number, number, number]): ClaimResult {
  if (new Set(cardIds).size !== 3) return { ok: false, reason: "duplicate-card" };

  const idxs = cardIds.map((id) => t.board.findIndex((c) => c.id === id));
  if (idxs.some((i) => i < 0)) return { ok: false, reason: "already-taken" };

  const [a, b, c] = idxs.map((i) => t.board[i]) as [Card, Card, Card];
  if (!isSet(a, b, c)) return { ok: false, reason: "not-a-set" };

  if (t.board.length > INITIAL_BOARD) {
    // Board was expanded (extra rows dealt): removing shrinks it back toward
    // 12. Delete from the highest index first so earlier indices stay valid.
    [...idxs]
      .sort((x, y) => y - x)
      .forEach((i) => t.board.splice(i, 1));
  } else {
    // Normal size: replace each claimed card in place with a fresh draw, so
    // surrounding cards do not shift under the player. If the deck is empty,
    // leave a hole and compact afterwards.
    const holes: number[] = [];
    for (const i of idxs) {
      const next = t.deck.pop();
      if (next) t.board[i] = next;
      else holes.push(i);
    }
    if (holes.length > 0) {
      holes.sort((x, y) => y - x).forEach((i) => t.board.splice(i, 1));
    }
  }

  ensureSet(t);
  return { ok: true, removed: [a, b, c] };
}

/**
 * Player-initiated "No set here — deal 3 more". Only deals when the board
 * genuinely has no set (dealing while a set exists is not allowed in SET).
 * Returns how many cards were dealt (0 if a set was present or deck empty).
 */
export function dealMore(t: Tableau): number {
  if (hasSet(t.board)) return 0;
  return dealStep(t);
}
