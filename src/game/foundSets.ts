import type { Card, ExplanationRow } from "../../shared/engine/index.js";
import type { SeatColor } from "../../shared/protocol.js";

/** One entry in the "Already found sets" panel. */
export interface FoundSet {
  readonly cards: Card[];
  readonly explanation: ExplanationRow[];
  /** Multiplayer only: who found it. */
  readonly by?: { name: string; color: SeatColor | null };
}
