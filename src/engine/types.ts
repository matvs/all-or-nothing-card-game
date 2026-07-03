/**
 * Core types for the "All or Nothing" trick-taking engine.
 *
 * The engine is a pure, dependency-free TypeScript module. It never touches
 * the DOM, the network, or a clock — every function is a deterministic,
 * immutable transformation: (state, action) -> Result<state>. This makes it
 * trivial to unit test and safe to run identically on the client (single
 * player / optimistic UI) and on the server (authoritative multiplayer).
 */

export type Suit = "S" | "H" | "D" | "C";

export const SUITS: readonly Suit[] = ["S", "H", "D", "C"];

export const SUIT_NAMES: Record<Suit, string> = {
  S: "Spades",
  H: "Hearts",
  D: "Diamonds",
  C: "Clubs",
};

/** Playing card rank. Ace is high. */
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export const RANKS: readonly Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
}

/** Stable string identifier for a card, e.g. "AS", "10H", "2C". Doubles as a Card. */
export type CardId = string;

/** The table always has exactly four seats; empty ones are AI-controlled. */
export type SeatIndex = 0 | 1 | 2 | 3;

export const SEATS: readonly SeatIndex[] = [0, 1, 2, 3];

export interface PlayedCard {
  readonly seat: SeatIndex;
  readonly card: Card;
}

export type RoundPhase = "bidding" | "playing" | "complete";
export type MatchPhase = "in_progress" | "complete";

export interface MatchSettings {
  /** Hand sizes climb 1..roundPeak then back down to 1. Must be 1..13. */
  readonly roundPeak: number;
  /** Classic "screw the dealer" rule: total bids may never equal the hand size. */
  readonly dealerRestriction: boolean;
  /** Seed for the deterministic shuffle RNG. Two matches with the same seed and
   * the same sequence of actions produce bit-identical results. */
  readonly seed: number;
}

export interface RoundResult {
  readonly roundNumber: number;
  readonly handSize: number;
  readonly trump: Suit | null;
  readonly dealer: SeatIndex;
  readonly bids: Record<SeatIndex, number>;
  readonly tricksWon: Record<SeatIndex, number>;
  /** Points earned in this round only (not cumulative). */
  readonly scores: Record<SeatIndex, number>;
}

export interface RoundState {
  readonly roundNumber: number;
  readonly handSize: number;
  /** null means a "No Trump" round (only possible when the deck is fully dealt). */
  readonly trump: Suit | null;
  readonly trumpCard: Card | null;
  readonly dealer: SeatIndex;
  readonly hands: Record<SeatIndex, Card[]>;
  readonly biddingOrder: readonly SeatIndex[];
  readonly bids: Partial<Record<SeatIndex, number>>;
  /** null once every seat has bid. */
  readonly nextBidder: SeatIndex | null;
  readonly currentTrick: PlayedCard[];
  readonly trickLeader: SeatIndex;
  /** null while phase === "bidding", or once the round is complete. */
  readonly nextPlayer: SeatIndex | null;
  readonly tricksWon: Record<SeatIndex, number>;
  readonly completedTricks: PlayedCard[][];
  readonly phase: RoundPhase;
}

export interface MatchState {
  readonly roundSequence: readonly number[];
  /** 0-based pointer into roundSequence; current round number is roundIndex + 1. */
  readonly roundIndex: number;
  readonly dealerStart: SeatIndex;
  readonly totalScores: Record<SeatIndex, number>;
  readonly history: RoundResult[];
  readonly round: RoundState | null;
  readonly phase: MatchPhase;
  readonly settings: MatchSettings;
}

export interface EngineError {
  readonly code:
    | "WRONG_PHASE"
    | "NOT_YOUR_TURN"
    | "BID_OUT_OF_RANGE"
    | "BID_FORBIDDEN"
    | "CARD_NOT_IN_HAND"
    | "MUST_FOLLOW_SUIT"
    | "MATCH_COMPLETE";
  readonly message: string;
}

export type EngineResult<T> = { ok: true; state: T } | { ok: false; error: EngineError };

export function ok<T>(state: T): EngineResult<T> {
  return { ok: true, state };
}

export function err<T>(code: EngineError["code"], message: string): EngineResult<T> {
  return { ok: false, error: { code, message } };
}
