/**
 * Wire contract between the browser and the multiplayer server for SET "race"
 * mode. Both sides import this module so the compiler keeps them in sync.
 *
 * Transport is STOMP over WebSocket (see server/stomp). SET has no hidden
 * information — the whole board is public — so, unlike a card game with hands,
 * nothing here needs server-side redaction: every player sees the same board.
 *
 * Cards travel as their canonical 0..80 id; rebuild with cardFromId().
 */

export const STOMP_ENDPOINT = "/stomp";
export const ROOM_CODE_LENGTH = 4;
export const NAME_MAX_LENGTH = 20;
export const CHAT_MAX_LENGTH = 240;

/** CONNECT frame header names used to authenticate a socket to a room+seat. */
export const CONNECT_HEADERS = {
  login: "login", // playerId
  passcode: "passcode", // reconnect token
  room: "room", // room code
} as const;

// ---------------------------------------------------------------------------
// STOMP destinations
// ---------------------------------------------------------------------------

/** Broadcast topic every member of a room subscribes to. */
export function roomTopic(code: string): string {
  return `/topic/room/${code.toUpperCase()}`;
}
/** Per-connection private replies (errors, rejected claims). */
export const USER_REPLY_QUEUE = "/user/queue/reply";

/** Client → server SEND destinations. */
export function appDest(code: string, action: RaceAction): string {
  return `/app/room/${code.toUpperCase()}/${action}`;
}
export type RaceAction = "start" | "claim" | "dealMore" | "chat";

// ---------------------------------------------------------------------------
// REST DTOs (room creation / join happen over HTTP, then STOMP authenticates)
// ---------------------------------------------------------------------------

export interface CreateRoomRequest {
  readonly name: string;
}
export interface JoinRoomRequest {
  readonly name: string;
}
export interface RoomCredentials {
  readonly code: string;
  readonly playerId: string;
  readonly token: string;
}
export interface ApiError {
  readonly error: string;
}

// ---------------------------------------------------------------------------
// Broadcast state + events (server → room topic)
// ---------------------------------------------------------------------------

export type RoomStatus = "lobby" | "playing" | "finished";

export interface PlayerView {
  readonly id: string;
  readonly name: string;
  readonly score: number;
  readonly connected: boolean;
}

export interface RoomView {
  readonly code: string;
  readonly status: RoomStatus;
  readonly hostId: string;
  /** Card ids currently face-up, in board order. */
  readonly board: number[];
  readonly deckRemaining: number;
  readonly players: PlayerView[];
  readonly round: number;
  readonly winnerIds: string[];
}

/** Lightweight events for animation / announcements, sent alongside state. */
export type RaceEvent =
  | { readonly kind: "claimed"; readonly by: string; readonly name: string; readonly cards: number[] }
  | { readonly kind: "dealt"; readonly count: number }
  | { readonly kind: "started"; readonly round: number }
  | { readonly kind: "finished"; readonly winnerIds: string[] }
  | { readonly kind: "joined"; readonly name: string }
  | { readonly kind: "left"; readonly name: string }
  | { readonly kind: "chat"; readonly name: string; readonly text: string };

/** Messages published to the room topic. */
export type RoomMessage =
  | { readonly type: "state"; readonly room: RoomView }
  | { readonly type: "event"; readonly event: RaceEvent; readonly room: RoomView };

/** Private replies to the requesting connection (USER_REPLY_QUEUE). */
export type ReplyMessage =
  | { readonly type: "rejected"; readonly action: RaceAction; readonly reason: string }
  | { readonly type: "error"; readonly message: string };

// ---------------------------------------------------------------------------
// Client → server payloads (SEND bodies)
// ---------------------------------------------------------------------------

export interface ClaimPayload {
  readonly cards: [number, number, number];
}
export interface ChatPayload {
  readonly text: string;
}
