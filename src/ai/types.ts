import type { MatchState, RoundState, SeatIndex } from "../engine/types.js";

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

/** Everything an AI decision needs: its own seat, the live round, and the match. */
export interface AiContext {
  readonly round: RoundState;
  readonly seat: SeatIndex;
  readonly match: MatchState;
}
