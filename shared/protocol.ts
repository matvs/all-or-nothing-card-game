/**
 * Contract between the browser client and the multiplayer server. Both
 * sides import this module directly (no code generation) so the compiler
 * keeps them honest. Nothing in here ever carries another seat's hidden
 * hand — that redaction happens once, server-side, in Room.toMatchView().
 */
import type {
  Card,
  MatchPhase,
  MatchSettings,
  RoundPhase,
  RoundResult,
  PlayedCard,
  SeatIndex,
  Suit,
} from "../src/engine/types.js";
import type { Difficulty } from "../src/ai/types.js";

export type RoomPhase = "lobby" | "playing" | "complete";

export interface RoomSettings {
  readonly difficulty: Difficulty;
  readonly roundPeak: number;
  readonly dealerRestriction: boolean;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  difficulty: "medium",
  roundPeak: 8,
  dealerRestriction: true,
};

export interface SeatSummary {
  readonly seat: SeatIndex;
  readonly playerId: string | null;
  readonly name: string;
  readonly isAi: boolean;
  readonly connected: boolean;
  readonly difficulty?: Difficulty;
}

export interface ChatMessage {
  readonly id: string;
  readonly from: string;
  readonly text: string;
  readonly ts: number;
  readonly isSpectator: boolean;
}

export interface RoomSnapshot {
  readonly code: string;
  readonly phase: RoomPhase;
  readonly hostPlayerId: string;
  readonly seats: (SeatSummary | null)[];
  readonly spectatorCount: number;
  readonly spectatorNames: string[];
  readonly settings: RoomSettings;
  readonly chat: ChatMessage[];
}

export interface ClientRoundView {
  readonly roundNumber: number;
  readonly handSize: number;
  readonly trump: Suit | null;
  readonly trumpCard: Card | null;
  readonly dealer: SeatIndex;
  /** Only populated for the recipient's own seat; null for spectators. */
  readonly yourHand: Card[] | null;
  readonly handCounts: Record<SeatIndex, number>;
  readonly biddingOrder: SeatIndex[];
  readonly bids: Partial<Record<SeatIndex, number>>;
  readonly nextBidder: SeatIndex | null;
  readonly currentTrick: PlayedCard[];
  readonly trickLeader: SeatIndex;
  readonly nextPlayer: SeatIndex | null;
  readonly tricksWon: Record<SeatIndex, number>;
  readonly lastCompletedTrick: PlayedCard[] | null;
  readonly phase: RoundPhase;
  /** The bid value the current (dealer) bidder may not choose, if any. */
  readonly forbiddenBid: number | null;
}

export interface ClientMatchView {
  readonly roundSequence: number[];
  readonly roundIndex: number;
  readonly totalScores: Record<SeatIndex, number>;
  readonly history: RoundResult[];
  readonly round: ClientRoundView | null;
  readonly phase: MatchPhase;
  readonly settings: MatchSettings;
}

// ---------------------------------------------------------------------------
// REST DTOs
// ---------------------------------------------------------------------------

export interface CreateRoomRequest {
  readonly name: string;
  readonly settings?: Partial<RoomSettings>;
}
export interface CreateRoomResponse {
  readonly code: string;
  readonly playerId: string;
  readonly token: string;
}

export interface JoinRoomRequest {
  readonly name: string;
  readonly asSpectator?: boolean;
}
export interface JoinRoomResponse {
  readonly code: string;
  readonly playerId: string;
  readonly token: string;
  readonly seat: SeatIndex | null;
  readonly isSpectator: boolean;
}

export interface RoomSummaryResponse {
  readonly code: string;
  readonly phase: RoomPhase;
  readonly playerCount: number;
  readonly spectatorCount: number;
  readonly full: boolean;
  readonly settings: RoomSettings;
}

export interface StatsResponse {
  readonly name: string;
  readonly gamesPlayed: number;
  readonly gamesWon: number;
}

export interface ApiErrorResponse {
  readonly error: string;
}

// ---------------------------------------------------------------------------
// WebSocket messages
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { type: "bid"; amount: number }
  | { type: "play"; cardId: string }
  | { type: "chat"; text: string }
  | { type: "startMatch" }
  | { type: "updateSettings"; settings: Partial<RoomSettings> }
  | { type: "leaveRoom" }
  | { type: "requestState" };

export type ServerMessage =
  | {
      type: "welcome";
      playerId: string;
      yourSeat: SeatIndex | null;
      isSpectator: boolean;
      room: RoomSnapshot;
      match: ClientMatchView | null;
    }
  | { type: "roomUpdate"; room: RoomSnapshot }
  | { type: "matchState"; match: ClientMatchView }
  | { type: "matchEnded"; match: ClientMatchView; winners: SeatIndex[] }
  | { type: "chat"; message: ChatMessage }
  | { type: "toast"; text: string; level: "info" | "warn" }
  | { type: "error"; code: string; message: string };

export const WS_PATH = "/ws";
export const ROOM_CODE_LENGTH = 4;
export const CHAT_MAX_LENGTH = 300;
export const CHAT_HISTORY_LIMIT = 100;
export const NAME_MAX_LENGTH = 20;
