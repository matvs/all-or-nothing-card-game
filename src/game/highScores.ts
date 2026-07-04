/** Local high-score persistence (no backend needed for solo play). */

export type SoloMode = "relaxed" | "timed";
export type Difficulty = "easy" | "normal" | "hard";

export interface BestEntry {
  /** Timed: most sets found in the window. Relaxed: sets found in best game. */
  bestScore: number;
  /** Relaxed: fastest full clear in ms (null = never cleared the deck). */
  bestTimeMs: number | null;
  games: number;
  updatedAt: string;
}

interface Store {
  version: 1;
  records: Record<string, BestEntry>;
}

const KEY = "aon-set:highscores:v1";

function keyFor(mode: SoloMode, difficulty: Difficulty): string {
  return `${mode}:${difficulty}`;
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (parsed && parsed.version === 1 && parsed.records) return parsed;
    }
  } catch {
    /* corrupt or unavailable storage — start fresh */
  }
  return { version: 1, records: {} };
}

function save(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage full / disabled — silently ignore, scores are a nicety */
  }
}

export function bestFor(mode: SoloMode, difficulty: Difficulty): BestEntry | null {
  return load().records[keyFor(mode, difficulty)] ?? null;
}

export interface GameOutcome {
  mode: SoloMode;
  difficulty: Difficulty;
  score: number;
  timeMs: number;
  completed: boolean; // relaxed: cleared the whole deck
}

/** Record a finished game; returns the (possibly updated) best and whether it improved. */
export function submitScore(outcome: GameOutcome): { best: BestEntry; improved: boolean } {
  const store = load();
  const key = keyFor(outcome.mode, outcome.difficulty);
  const prev = store.records[key];
  let improved = false;

  const best: BestEntry = prev
    ? { ...prev, games: prev.games + 1, updatedAt: new Date().toISOString() }
    : { bestScore: 0, bestTimeMs: null, games: 1, updatedAt: new Date().toISOString() };

  if (outcome.score > best.bestScore) {
    best.bestScore = outcome.score;
    improved = true;
  }
  if (outcome.mode === "relaxed" && outcome.completed) {
    if (best.bestTimeMs == null || outcome.timeMs < best.bestTimeMs) {
      best.bestTimeMs = outcome.timeMs;
      improved = true;
    }
  }

  store.records[key] = best;
  save(store);
  return { best, improved };
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
