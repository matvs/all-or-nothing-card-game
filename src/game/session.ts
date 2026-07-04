import type { SeatIndex } from "../engine/types.js";
import type { ChatMessage, ClientMatchView, RoomSettings, RoomSnapshot } from "../../shared/protocol.js";

/**
 * One interface for both game modes. The table screen renders a GameSession
 * without knowing whether moves resolve in-process (solo vs AI) or over a
 * WebSocket (multiplayer) — both emit the same redacted view models.
 */
export type SessionEvent =
  | { type: "room"; room: RoomSnapshot }
  | { type: "match"; match: ClientMatchView }
  | { type: "ended"; match: ClientMatchView; winners: SeatIndex[] }
  | { type: "chat"; message: ChatMessage }
  | { type: "toast"; text: string; level: "info" | "warn" }
  | { type: "connection"; status: "connected" | "reconnecting" | "rejected" | "closed"; detail?: string };

export interface GameSession {
  readonly kind: "local" | "remote";
  readonly mySeat: SeatIndex | null;
  readonly isSpectator: boolean;
  /** Multiplayer room code, or null for solo play. */
  readonly roomCode: string | null;
  subscribe(listener: (event: SessionEvent) => void): () => void;
  getRoom(): RoomSnapshot | null;
  getMatch(): ClientMatchView | null;
  bid(amount: number): void;
  play(cardId: string): void;
  sendChat(text: string): void;
  startMatch(): void;
  updateSettings(patch: Partial<RoomSettings>): void;
  leave(): void;
}

export class SessionEmitter {
  private listeners = new Set<(event: SessionEvent) => void>();

  subscribe(listener: (event: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: SessionEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}
