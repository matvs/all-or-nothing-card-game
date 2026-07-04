import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Card,
  type ExplanationRow,
  type FoundSet,
  explainTriple,
  findAllSets,
  isSet,
  setKey,
  shuffledDeck,
} from "../../shared/engine/index.js";
import type { CardStatus } from "./SetCard.js";
import type { FoundSet as FoundSetEntry } from "./foundSets.js";

/** Fixed tableau size for the recovered single-player puzzle. */
const SOLO_BOARD_SIZE = 12;
const FLASH_MS = 650;

export type SoloAlert =
  | { kind: "info" }
  | { kind: "found" }
  | { kind: "already" }
  | { kind: "notset"; explanation: ExplanationRow[] };

/**
 * Deal a fresh 12-card solo board that is guaranteed to contain at least one
 * set (so the puzzle is always winnable). The original dealt 12 of the shuffled
 * 81 and asked you to find EVERY set among them without removing cards.
 */
function dealSolo(): { board: Card[]; allSets: FoundSet[] } {
  let last = { board: [] as Card[], allSets: [] as FoundSet[] };
  for (let attempt = 0; attempt < 60; attempt++) {
    const board = shuffledDeck().slice(0, SOLO_BOARD_SIZE);
    const allSets = findAllSets(board);
    last = { board, allSets };
    if (allSets.length > 0) return last;
  }
  return last;
}

export interface SinglePlayerGame {
  board: Card[];
  selectedIds: ReadonlySet<number>;
  statuses: ReadonlyMap<number, CardStatus>;
  found: FoundSetEntry[];
  setsTotal: number;
  foundCount: number;
  won: boolean;
  secondsPlayed: number;
  alert: SoloAlert;
  onActivate: (cardId: number) => void;
  playAgain: () => void;
}

/**
 * Faithful single-player SET: 12 cards stay on the table and you hunt for every
 * set among them against a running clock. Picking three cards evaluates the
 * pick; found sets accumulate in the side panel; finding them all wins.
 */
export function useSinglePlayerGame(): SinglePlayerGame {
  const [{ board, allSets }, setDeal] = useState(dealSolo);
  const [selected, setSelected] = useState<number[]>([]);
  const [statuses, setStatuses] = useState<Map<number, CardStatus>>(new Map());
  const [found, setFound] = useState<FoundSetEntry[]>([]);
  const [foundKeys, setFoundKeys] = useState<Set<string>>(new Set());
  const [alert, setAlert] = useState<SoloAlert>({ kind: "info" });
  const [secondsPlayed, setSecondsPlayed] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());

  /** True while a completed pick is flashing; input is locked briefly. */
  const locked = useRef(false);
  const flashTimer = useRef<number | null>(null);

  const setsTotal = allSets.length;
  const foundCount = found.length;
  const won = setsTotal > 0 && foundCount === setsTotal;

  // Timer: runs until every set is found.
  useEffect(() => {
    if (won) return;
    const id = window.setInterval(() => {
      setSecondsPlayed(Math.round((Date.now() - startedAt) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [won, startedAt]);

  const clearFlash = useCallback(() => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      setSelected([]);
      setStatuses(new Map());
      locked.current = false;
    }, FLASH_MS);
  }, []);

  const evaluate = useCallback(
    (ids: number[]) => {
      const cards = ids
        .map((id) => board.find((c) => c.id === id))
        .filter((c): c is Card => c !== undefined);
      if (cards.length !== 3) return;
      const [a, b, c] = cards;
      const flash = (status: CardStatus) => setStatuses(new Map(ids.map((id) => [id, status])));

      if (isSet(a, b, c)) {
        const key = setKey(cards);
        if (foundKeys.has(key)) {
          setAlert({ kind: "already" });
          flash("bad");
        } else {
          const explanation = explainTriple(a, b, c);
          setFound((prev) => [...prev, { cards: [a, b, c], explanation }]);
          setFoundKeys((prev) => new Set(prev).add(key));
          setAlert({ kind: "found" });
          flash("good");
        }
      } else {
        setAlert({ kind: "notset", explanation: explainTriple(a, b, c) });
        flash("bad");
      }
      locked.current = true;
      clearFlash();
    },
    [board, foundKeys, clearFlash],
  );

  const onActivate = useCallback(
    (cardId: number) => {
      if (locked.current || won) return;
      setSelected((prev) => {
        // Deselect a picked card.
        if (prev.includes(cardId)) {
          if (alert.kind !== "info") setAlert({ kind: "info" });
          return prev.filter((id) => id !== cardId);
        }
        // Starting a fresh pick after a full one clears the previous highlight.
        const base = prev.length >= 3 ? [] : prev;
        const next = [...base, cardId];
        if (alert.kind !== "info") setAlert({ kind: "info" });
        if (next.length === 3) evaluate(next);
        return next;
      });
    },
    [alert.kind, evaluate, won],
  );

  const playAgain = useCallback(() => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    locked.current = false;
    setDeal(dealSolo());
    setSelected([]);
    setStatuses(new Map());
    setFound([]);
    setFoundKeys(new Set());
    setAlert({ kind: "info" });
    setSecondsPlayed(0);
    setStartedAt(Date.now());
  }, []);

  useEffect(() => () => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
  }, []);

  const selectedIds = useMemo(() => new Set(selected), [selected]);

  return {
    board,
    selectedIds,
    statuses,
    found,
    setsTotal,
    foundCount,
    won,
    secondsPlayed,
    alert,
    onActivate,
    playAgain,
  };
}
