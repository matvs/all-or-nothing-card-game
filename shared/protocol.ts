/**
 * Wire contract between the browser and the multiplayer server.
 *
 * Transport is Socket.IO (the original game's choice; kept deliberately — see
 * README "Why Socket.IO over STOMP"). SET has no hidden information: the whole
 * board is public, so nothing here needs server-side redaction — every player
 * in a room sees the same board. Cards travel as their canonical 0..80 id;
 * rebuild them with cardFromId().
 *
 * The design is SERVER-AUTHORITATIVE: the client never tells the server "I
 * scored"; it only asks "I claim these three card ids" and the server validates
 * the set against the real board before awarding a point and dealing on.
 */

import type { ExplanationRow } from "./engine/index.js";

export const NAME_MIN_LENGTH = 3;
export const NAME_MAX_LENGTH = 12;
export const ROOM_NAME_MAX_LENGTH = 20;
export const CHAT_MAX_LENGTH = 240;

/** The five fixed seat colours a player can take in a room (original palette). */
export const SEAT_COLORS = ["#fe4a49", "#2ab7ca", "#f6cd61", "#7bc043", "#03396c"] as const;
export type SeatColor = (typeof SEAT_COLORS)[number];

/** Board size held face-up in multiplayer (original dealt a fixed 12). */
export const MULTIPLAYER_BOARD_SIZE = 12;
/** Seconds of "everyone press Start" countdown before a game begins. */
export const START_COUNTDOWN_SECONDS = 10;

// ---------------------------------------------------------------------------
// Shared data shapes
// ---------------------------------------------------------------------------

/** A player's public identity as broadcast to a room. */
export interface RoomPlayer {
  readonly id: string;
  readonly name: string;
  /** Seat colour once seated, else null (in the room but not yet playing). */
  color: SeatColor | null;
  points: number;
  online: boolean;
  /** Has pressed Start for the current round. */
  ready: boolean;
  /** Last known cursor position (for the hand cursors), room-relative. */
  x: number;
  y: number;
}

export interface ChatMessage {
  readonly id: string;
  readonly playerId: string;
  readonly name: string;
  readonly color: SeatColor | null;
  readonly text: string;
  readonly ts: number;
}

/** Public game state of a room. */
export interface GameState {
  readonly running: boolean;
  /** Face-up board as card ids (0..80). Empty when not running. */
  readonly board: number[];
  /** How many distinct sets currently exist on the board. */
  readonly setsAvailable: number;
  /** Cards remaining in the draw pile. */
  readonly deckRemaining: number;
}

/** Full snapshot delivered on join / reconnect. */
export interface RoomSnapshot {
  readonly roomId: string;
  readonly players: RoomPlayer[];
  readonly chat: ChatMessage[];
  readonly game: GameState;
  /** Player ids currently in the voice channel. */
  readonly voice: string[];
  /** Seconds left on a start countdown, or null. */
  readonly countdown: number | null;
}

// ---------------------------------------------------------------------------
// REST payloads (login / rooms)
// ---------------------------------------------------------------------------

export interface LoginRequest {
  name: string;
}
export interface LoginResponse {
  id: string;
  name: string;
  /** Opaque reconnect token; the client keeps it to restore identity + score. */
  token: string;
}
export interface WelcomeResponse {
  foundSession: boolean;
  player?: LoginResponse;
}
export interface CreateRoomRequest {
  roomId?: string;
}
export type CreateRoomResponse =
  | { id: string }
  | { id: string; error: true; errorCode: "alreadyExists" | "invalidName" };
export interface JoinRoomRequest {
  roomId: string;
}
export type JoinRoomResponse =
  | { id: string; players: RoomPlayer[] }
  | { id: string; error: true; errorCode: "roomDoesNotExist" };

// ---------------------------------------------------------------------------
// Socket.IO events
// ---------------------------------------------------------------------------

/** Handshake auth passed as io(url, { auth }). */
export interface SocketAuth {
  token: string;
  playerId: string;
  name: string;
}

/** A claim result the server sends back to the claimer via callback. */
export type ClaimAck =
  | { ok: true; cards: number[]; explanation: ExplanationRow[] }
  | {
      ok: false;
      reason: "not-a-set" | "unknown-card" | "duplicate-card" | "already-taken" | "not-running";
      explanation: ExplanationRow[] | null;
    };

export interface ServerToClientEvents {
  /** Full room snapshot (on join and on reconnect). */
  "room:state": (snapshot: RoomSnapshot) => void;
  /** Roster changed (seat taken, score changed, online/offline, left). */
  "room:players": (players: RoomPlayer[]) => void;
  /** Someone new entered the room (for the toast). */
  "room:playerJoined": (info: { id: string; name: string }) => void;

  /** Countdown ticked (seconds remaining) or ended (null). */
  "game:countdown": (secondsLeft: number | null) => void;
  /** A round started. */
  "game:started": (game: GameState) => void;
  /** Board changed after a claim / deal. */
  "game:board": (game: GameState) => void;
  /** A valid set was claimed by someone (broadcast to the whole room). */
  "game:claimAccepted": (info: {
    playerId: string;
    name: string;
    color: SeatColor | null;
    cards: number[];
    explanation: ExplanationRow[];
    points: number;
  }) => void;
  /** A claim failed (broadcast so scores stay in sync after the penalty). */
  "game:claimRejected": (info: { playerId: string; points: number }) => void;
  /** No more sets and the deck is empty. */
  "game:over": (info: { players: RoomPlayer[]; winnerIds: string[] }) => void;

  "chat:message": (message: ChatMessage) => void;

  "cursor:update": (info: { playerId: string; color: SeatColor | null; x: number; y: number }) => void;

  /** The set of peers currently in the voice channel (to build the mesh). */
  "voice:peers": (peerIds: string[]) => void;
  /** Relayed WebRTC signalling from another peer. */
  "voice:signal": (msg: { from: string; data: RtcSignalData }) => void;
  /** A peer left the voice channel. */
  "voice:peerLeft": (peerId: string) => void;
}

export interface ClientToServerEvents {
  "room:join": (roomId: string) => void;
  /** Take a coloured seat (or change seats). */
  "room:sit": (msg: { roomId: string; color: SeatColor }) => void;

  "game:start": (roomId: string) => void;
  /** Server-authoritative: claim three card ids; server validates. */
  "game:claim": (msg: { roomId: string; cardIds: number[] }, ack: (result: ClaimAck) => void) => void;

  "chat:send": (msg: { roomId: string; text: string }) => void;

  "cursor:move": (msg: { roomId: string; x: number; y: number }) => void;

  "voice:join": (roomId: string) => void;
  "voice:leave": (roomId: string) => void;
  "voice:signal": (msg: { roomId: string; to: string; data: RtcSignalData }) => void;
}

/** One WebRTC signalling payload (offer/answer SDP or an ICE candidate). */
export type RtcSignalData =
  | { kind: "description"; description: RTCSessionDescriptionInit }
  | { kind: "candidate"; candidate: RTCIceCandidateInit };
