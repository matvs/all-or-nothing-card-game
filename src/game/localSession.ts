import { estimateBid } from "../ai/bid.js";
import { chooseCard } from "../ai/play.js";
import type { AiContext, Difficulty } from "../ai/types.js";
import { parseCardId } from "../engine/deck.js";
import { createMatch, getWinners, isMatchComplete, placeBid, playCard } from "../engine/match.js";
import { mulberry32, randomSeed } from "../engine/rng.js";
import type { MatchState, SeatIndex } from "../engine/types.js";
import type { ChatMessage, ClientMatchView, RoomSettings, RoomSnapshot } from "../../shared/protocol.js";
import { toClientMatchView } from "../../shared/views.js";
import { SessionEmitter, type GameSession, type SessionEvent } from "./session.js";

export interface LocalGameOptions {
  playerName: string;
  difficulty: Difficulty;
  roundPeak: number;
  dealerRestriction: boolean;
  seed?: number;
  /** AI pacing; lowered in tests. */
  aiThinkDelayMs?: number;
}

const AI_SEATS: SeatIndex[] = [1, 2, 3];
const AI_NAMES: Record<Difficulty, [string, string, string]> = {
  easy: ["Breezy Ben", "Casual Cleo", "Dozy Dex"],
  medium: ["Ben", "Cleo", "Dex"],
  hard: ["Sharp Ben", "Counting Cleo", "Dead-eye Dex"],
};

/**
 * Single-player session: you at seat 0 versus three AI opponents, the whole
 * engine running in the browser. Emits exactly the same events a remote
 * session would, so the table UI can't tell the difference.
 */
export class LocalSession implements GameSession {
  readonly kind = "local" as const;
  readonly mySeat: SeatIndex = 0;
  readonly isSpectator = false;
  readonly roomCode = null;

  private emitter = new SessionEmitter();
  private match: MatchState;
  private options: LocalGameOptions;
  private rng: () => number;
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private endedEmitted = false;

  constructor(options: LocalGameOptions) {
    this.options = options;
    const seed = options.seed ?? randomSeed();
    this.rng = mulberry32(seed ^ 0x5eed);
    this.match = createMatch(
      { roundPeak: options.roundPeak, dealerRestriction: options.dealerRestriction, seed },
      Math.floor(this.rng() * 4) as SeatIndex
    );
  }

  subscribe(listener: (event: SessionEvent) => void): () => void {
    const unsubscribe = this.emitter.subscribe(listener);
    // New subscribers immediately get the current state (mirrors ws "welcome").
    queueMicrotask(() => {
      if (this.disposed) return;
      listener({ type: "room", room: this.getRoom()! });
      listener({ type: "match", match: this.getMatch()! });
      this.scheduleAiIfNeeded();
    });
    return unsubscribe;
  }

  getRoom(): RoomSnapshot {
    const names = AI_NAMES[this.options.difficulty];
    return {
      code: "SOLO",
      phase: this.match.phase === "complete" ? "complete" : "playing",
      hostPlayerId: "you",
      seats: [
        { seat: 0, playerId: "you", name: this.options.playerName, isAi: false, connected: true },
        ...AI_SEATS.map((seat, i) => ({
          seat,
          playerId: null,
          name: names[i],
          isAi: true,
          connected: true,
          difficulty: this.options.difficulty,
        })),
      ],
      spectatorCount: 0,
      spectatorNames: [],
      settings: {
        difficulty: this.options.difficulty,
        roundPeak: this.options.roundPeak,
        dealerRestriction: this.options.dealerRestriction,
      },
      chat: [],
    };
  }

  getMatch(): ClientMatchView {
    return toClientMatchView(this.match, this.mySeat);
  }

  bid(amount: number): void {
    const result = placeBid(this.match, this.mySeat, amount);
    if (!result.ok) {
      this.emitter.emit({ type: "toast", text: result.error.message, level: "warn" });
      return;
    }
    this.applyTransition(result.state);
  }

  play(id: string): void {
    let card;
    try {
      card = parseCardId(id);
    } catch {
      this.emitter.emit({ type: "toast", text: `Unknown card ${id}.`, level: "warn" });
      return;
    }
    const result = playCard(this.match, this.mySeat, card);
    if (!result.ok) {
      this.emitter.emit({ type: "toast", text: result.error.message, level: "warn" });
      return;
    }
    this.applyTransition(result.state);
  }

  sendChat(text: string): void {
    // Solo tables are quiet places; give the lonely chatter a wink.
    const message: ChatMessage = {
      id: String(Date.now()),
      from: this.options.playerName,
      text,
      ts: Date.now(),
      isSpectator: false,
    };
    this.emitter.emit({ type: "chat", message });
  }

  startMatch(): void {
    /* Local matches start at construction. */
  }

  updateSettings(_patch: Partial<RoomSettings>): void {
    /* Settings are fixed once a local match begins. */
  }

  leave(): void {
    this.disposed = true;
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.emitter.emit({ type: "connection", status: "closed" });
  }

  private applyTransition(next: MatchState): void {
    this.match = next;
    this.emitter.emit({ type: "match", match: this.getMatch() });
    if (isMatchComplete(next)) {
      if (!this.endedEmitted) {
        this.endedEmitted = true;
        this.emitter.emit({ type: "room", room: this.getRoom() });
        this.emitter.emit({ type: "ended", match: this.getMatch(), winners: getWinners(next) });
      }
      return;
    }
    this.scheduleAiIfNeeded();
  }

  private aiSeatToAct(): SeatIndex | null {
    const round = this.match.round;
    if (!round || this.match.phase === "complete") return null;
    const seat = round.phase === "bidding" ? round.nextBidder : round.phase === "playing" ? round.nextPlayer : null;
    return seat !== null && seat !== this.mySeat ? seat : null;
  }

  private scheduleAiIfNeeded(): void {
    if (this.disposed || this.aiTimer !== null) return;
    const seat = this.aiSeatToAct();
    if (seat === null) return;
    const base = this.options.aiThinkDelayMs ?? 700;
    const delay = base <= 0 ? 0 : base + Math.floor(this.rng() * 350);
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      this.playOneAiTurn();
    }, delay);
  }

  private playOneAiTurn(): void {
    if (this.disposed) return;
    const seat = this.aiSeatToAct();
    if (seat === null) return;
    const round = this.match.round!;
    const ctx: AiContext = { round, seat, match: this.match };
    if (round.phase === "bidding") {
      const amount = estimateBid(ctx, this.options.difficulty, this.rng);
      const result = placeBid(this.match, seat, amount);
      if (result.ok) this.applyTransition(result.state);
    } else {
      const card = chooseCard(ctx, this.options.difficulty, this.rng);
      const result = playCard(this.match, seat, card);
      if (result.ok) this.applyTransition(result.state);
    }
  }
}
