import { randomUUID } from "node:crypto";
import { estimateBid } from "../../src/ai/bid.js";
import { chooseCard } from "../../src/ai/play.js";
import type { AiContext, Difficulty } from "../../src/ai/types.js";
import { parseCardId } from "../../src/engine/deck.js";
import { createMatch, getWinners, placeBid, playCard } from "../../src/engine/match.js";
import { toClientMatchView } from "../../shared/views.js";
import type { RngFn } from "../../src/engine/rng.js";
import { randomSeed } from "../../src/engine/rng.js";
import type { EngineError, MatchState, SeatIndex } from "../../src/engine/types.js";
import type { StatsStore } from "../db/stats.js";
import {
  CHAT_HISTORY_LIMIT,
  type ChatMessage,
  type ClientMatchView,
  type RoomPhase,
  type RoomSettings,
  type RoomSnapshot,
  type SeatSummary,
  type ServerMessage,
} from "../../shared/protocol.js";
import { sanitizeChatText, sanitizeName } from "../util.js";

/** Minimal structural subset of `ws`'s WebSocket — keeps Room unit-testable without real sockets. */
export interface OutboundSocket {
  send(data: string): void;
}

interface SeatOccupant {
  playerId: string;
  token: string;
  name: string;
  isAi: boolean;
  aiDifficulty: Difficulty | null;
  /** True once the 60s reconnection grace has expired — control never returns to the human. */
  aiTakeoverPermanent: boolean;
  /**
   * The human name this seat is attributed to for aggregate stats, surviving
   * AI takeover. Null for seats that were AI fill-ins from the start.
   */
  originalHumanName: string | null;
  connected: boolean;
  socket: OutboundSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

interface SpectatorOccupant {
  playerId: string;
  token: string;
  name: string;
  socket: OutboundSocket | null;
}

export interface RoomDeps {
  statsStore: StatsStore;
  /** ms of simulated "thinking" before an AI acts; 0 makes AI turns resolve on the next microtask (tests). */
  aiThinkDelayMs: number;
  reconnectGraceMs: number;
  rng?: RngFn;
  now?: () => number;
}

const SEAT_INDICES: SeatIndex[] = [0, 1, 2, 3];

export class Room {
  readonly code: string;
  readonly createdAt: number;
  hostPlayerId = "";
  settings: RoomSettings;
  phase: RoomPhase = "lobby";
  seats: (SeatOccupant | null)[] = [null, null, null, null];
  spectators = new Map<string, SpectatorOccupant>();
  chat: ChatMessage[] = [];
  match: MatchState | null = null;

  private deps: RoomDeps;
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(code: string, settings: RoomSettings, deps: RoomDeps) {
    this.code = code;
    this.createdAt = (deps.now ?? Date.now)();
    this.settings = settings;
    this.deps = deps;
  }

  private rng(): number {
    return (this.deps.rng ?? Math.random)();
  }

  // ---------------------------------------------------------------- lobby

  /** Adds the very first player (the host). Only ever called once, right after construction. */
  addHost(name: string): { playerId: string; token: string; seat: SeatIndex } {
    const result = this.addPlayerToSeat(name, 0);
    this.hostPlayerId = result.playerId;
    return result;
  }

  join(name: string, opts?: { asSpectator?: boolean }): { playerId: string; token: string; seat: SeatIndex | null; isSpectator: boolean } {
    const wantsSpectator = opts?.asSpectator ?? false;
    const freeSeat = this.phase === "lobby" && !wantsSpectator ? (this.seats.findIndex((s) => s === null) as SeatIndex | -1) : -1;
    if (freeSeat !== -1) {
      const result = this.addPlayerToSeat(name, freeSeat as SeatIndex);
      return { ...result, isSpectator: false };
    }
    const result = this.addSpectator(name);
    return { ...result, seat: null, isSpectator: true };
  }

  private addPlayerToSeat(name: string, seat: SeatIndex): { playerId: string; token: string; seat: SeatIndex } {
    const playerId = randomUUID();
    const token = randomUUID();
    const cleanName = sanitizeName(name);
    this.seats[seat] = {
      playerId,
      token,
      name: cleanName,
      isAi: false,
      aiDifficulty: null,
      aiTakeoverPermanent: false,
      originalHumanName: cleanName,
      connected: false,
      socket: null,
      reconnectTimer: null,
    };
    return { playerId, token, seat };
  }

  private addSpectator(name: string): { playerId: string; token: string } {
    const playerId = randomUUID();
    const token = randomUUID();
    this.spectators.set(playerId, { playerId, token, name: sanitizeName(name), socket: null });
    return { playerId, token };
  }

  isFull(): boolean {
    return this.seats.every((s) => s !== null);
  }

  humanCount(): number {
    return this.seats.filter((s) => s && !s.isAi).length;
  }

  /** Starts the match: fills empty seats with AI, deals round 1, and broadcasts. */
  startMatch(requesterId: string): { ok: true } | { ok: false; error: string } {
    if (requesterId !== this.hostPlayerId) return { ok: false, error: "Only the host can start the match." };
    if (this.phase !== "lobby") return { ok: false, error: "The match has already started." };
    if (this.humanCount() < 1) return { ok: false, error: "At least one seated player is required to start." };

    for (const seat of SEAT_INDICES) {
      if (!this.seats[seat]) {
        this.seats[seat] = {
          playerId: `ai-${seat}-${randomUUID()}`,
          token: "",
          name: aiName(seat),
          isAi: true,
          aiDifficulty: this.settings.difficulty,
          aiTakeoverPermanent: false,
          originalHumanName: null,
          connected: true,
          socket: null,
          reconnectTimer: null,
        };
      }
    }

    this.phase = "playing";
    const dealerStart = Math.floor(this.rng() * 4) as SeatIndex;
    this.match = createMatch(
      { roundPeak: this.settings.roundPeak, dealerRestriction: this.settings.dealerRestriction, seed: randomSeed() },
      dealerStart
    );

    this.broadcastRoomUpdate();
    this.broadcastMatchState();
    this.scheduleAiTurnIfNeeded();
    return { ok: true };
  }

  updateSettings(requesterId: string, patch: Partial<RoomSettings>): { ok: true } | { ok: false; error: string } {
    if (requesterId !== this.hostPlayerId) return { ok: false, error: "Only the host can change settings." };
    if (this.phase !== "lobby") return { ok: false, error: "Settings are locked once the match has started." };
    const roundPeak = patch.roundPeak !== undefined ? clampInt(patch.roundPeak, 1, 13) : this.settings.roundPeak;
    this.settings = {
      difficulty: patch.difficulty ?? this.settings.difficulty,
      roundPeak,
      dealerRestriction: patch.dealerRestriction ?? this.settings.dealerRestriction,
    };
    this.broadcastRoomUpdate();
    return { ok: true };
  }

  // ------------------------------------------------------------ gameplay

  /** Human seat lookup for actions: null unless the player currently controls the seat. */
  private actingSeatFor(playerId: string): SeatIndex | null {
    const seat = this.seatIndexForPlayer(playerId);
    if (seat === null) return null;
    return this.seats[seat]!.isAi ? null : seat;
  }

  handleBid(playerId: string, amount: number): void {
    const seat = this.actingSeatFor(playerId);
    if (seat === null || !this.match) return this.sendError(playerId, "NOT_SEATED", "You are not seated at this table.");
    const result = placeBid(this.match, seat, amount);
    if (!result.ok) return this.sendError(playerId, result.error.code, result.error.message);
    this.applyMatchTransition(result.state);
  }

  handlePlay(playerId: string, rawCardId: string): void {
    const seat = this.actingSeatFor(playerId);
    if (seat === null || !this.match) return this.sendError(playerId, "NOT_SEATED", "You are not seated at this table.");
    let card;
    try {
      card = parseCardId(rawCardId);
    } catch {
      return this.sendError(playerId, "BAD_CARD", `"${rawCardId}" is not a valid card id.`);
    }
    const result = playCard(this.match, seat, card);
    if (!result.ok) return this.sendError(playerId, result.error.code, result.error.message);
    this.applyMatchTransition(result.state);
  }

  handleChat(playerId: string, rawText: string): void {
    const text = sanitizeChatText(rawText);
    if (!text) return;
    const seatIdx = this.seatIndexForPlayer(playerId);
    const spectator = this.spectators.get(playerId);
    const from = seatIdx !== null ? this.seats[seatIdx]!.name : spectator?.name;
    if (!from) return;
    const message: ChatMessage = {
      id: randomUUID(),
      from,
      text,
      ts: (this.deps.now ?? Date.now)(),
      isSpectator: seatIdx === null,
    };
    this.chat.push(message);
    if (this.chat.length > CHAT_HISTORY_LIMIT) this.chat.shift();
    this.broadcastSame({ type: "chat", message });
  }

  private applyMatchTransition(newState: MatchState): void {
    const wasComplete = this.match?.phase === "complete";
    this.match = newState;
    if (newState.phase === "complete" && !wasComplete) {
      this.finalizeMatch();
    } else {
      this.broadcastMatchState();
      this.scheduleAiTurnIfNeeded();
    }
  }

  private finalizeMatch(): void {
    this.phase = "complete";
    const winners = getWinners(this.match!);
    for (const seat of SEAT_INDICES) {
      const occ = this.seats[seat];
      // Anyone who started the match as a human gets a game on their record,
      // even if AI finished the hand for them — but an AI-carried seat can't
      // earn the departed human a *win*.
      if (occ?.originalHumanName) {
        const wonAsHuman = winners.includes(seat) && !occ.isAi;
        this.deps.statsStore.recordResult(occ.originalHumanName, wonAsHuman);
      }
    }
    this.broadcastRoomUpdate();
    for (const seat of SEAT_INDICES) {
      const occ = this.seats[seat];
      const view = this.toMatchView(seat);
      if (occ?.socket && view) this.send(occ.socket, { type: "matchEnded", match: view, winners });
    }
    const spectatorView = this.toMatchView(null);
    if (spectatorView) {
      for (const spec of this.spectators.values()) {
        if (spec.socket) this.send(spec.socket, { type: "matchEnded", match: spectatorView, winners });
      }
    }
  }

  // -------------------------------------------------------------- AI turns

  private isAiTurnPending(): boolean {
    if (!this.match || this.phase !== "playing") return false;
    const round = this.match.round;
    if (!round) return false;
    const seat = round.phase === "bidding" ? round.nextBidder : round.phase === "playing" ? round.nextPlayer : null;
    if (seat === null) return false;
    return this.seats[seat]?.isAi === true;
  }

  private scheduleAiTurnIfNeeded(): void {
    if (this.disposed || !this.isAiTurnPending()) return;
    if (this.deps.aiThinkDelayMs <= 0) {
      queueMicrotask(() => this.playOneAiTurn());
    } else {
      const jitter = Math.floor(this.rng() * 300);
      this.aiTimer = setTimeout(() => this.playOneAiTurn(), this.deps.aiThinkDelayMs + jitter);
    }
  }

  private playOneAiTurn(): void {
    this.aiTimer = null;
    if (this.disposed || !this.match || this.phase !== "playing") return;
    const round = this.match.round;
    if (!round) return;

    if (round.phase === "bidding" && round.nextBidder !== null) {
      const seat = round.nextBidder;
      const occ = this.seats[seat];
      if (!occ?.isAi) return;
      const ctx: AiContext = { round, seat, match: this.match };
      const amount = estimateBid(ctx, occ.aiDifficulty ?? "medium", () => this.rng());
      const result = placeBid(this.match, seat, amount);
      if (result.ok) this.applyMatchTransition(result.state);
      return;
    }
    if (round.phase === "playing" && round.nextPlayer !== null) {
      const seat = round.nextPlayer;
      const occ = this.seats[seat];
      if (!occ?.isAi) return;
      const ctx: AiContext = { round, seat, match: this.match };
      const card = chooseCard(ctx, occ.aiDifficulty ?? "medium", () => this.rng());
      const result = playCard(this.match, seat, card);
      if (result.ok) this.applyMatchTransition(result.state);
    }
  }

  // --------------------------------------------------------- connections

  seatIndexForPlayer(playerId: string): SeatIndex | null {
    const idx = this.seats.findIndex((s) => s?.playerId === playerId);
    return idx === -1 ? null : (idx as SeatIndex);
  }

  /** Attaches a live socket for a returning player/spectator identified by (playerId, token). */
  attachSocket(playerId: string, token: string, socket: OutboundSocket): { ok: true; seat: SeatIndex | null; isSpectator: boolean } | { ok: false; reason: string } {
    const seatIdx = this.seatIndexForPlayer(playerId);
    if (seatIdx !== null) {
      const occ = this.seats[seatIdx]!;
      if (occ.aiTakeoverPermanent) {
        return { ok: false, reason: "Your seat was taken over by AI after the reconnection window expired." };
      }
      if (occ.token !== token) return { ok: false, reason: "Invalid reconnection token." };
      occ.connected = true;
      occ.socket = socket;
      if (occ.reconnectTimer) {
        clearTimeout(occ.reconnectTimer);
        occ.reconnectTimer = null;
      }
      this.broadcastRoomUpdate();
      this.broadcastToast(`${occ.name} reconnected.`, "info");
      return { ok: true, seat: seatIdx, isSpectator: false };
    }
    const spectator = this.spectators.get(playerId);
    if (spectator && spectator.token === token) {
      spectator.socket = socket;
      return { ok: true, seat: null, isSpectator: true };
    }
    return { ok: false, reason: "Room, player, or token not recognized." };
  }

  handleDisconnect(playerId: string): void {
    const seatIdx = this.seatIndexForPlayer(playerId);
    if (seatIdx !== null) {
      const occ = this.seats[seatIdx]!;
      if (occ.isAi) return;
      occ.connected = false;
      occ.socket = null;
      this.broadcastRoomUpdate();
      if (occ.reconnectTimer) clearTimeout(occ.reconnectTimer);
      occ.reconnectTimer = setTimeout(() => this.expireReconnectGrace(seatIdx), this.deps.reconnectGraceMs);
      this.broadcastToast(`${occ.name} disconnected. Reconnecting for up to ${Math.round(this.deps.reconnectGraceMs / 1000)}s...`, "warn");
      return;
    }
    const spectator = this.spectators.get(playerId);
    if (spectator) {
      this.spectators.delete(playerId);
    }
  }

  /**
   * Disconnect triggered by a specific socket's close event. Ignored when
   * that socket is no longer the player's current one — i.e. the player
   * already reconnected on a fresh socket before the old one finished
   * closing, which is the normal order of events during a page reload.
   */
  handleDisconnectIfCurrent(playerId: string, socket: OutboundSocket): void {
    const seatIdx = this.seatIndexForPlayer(playerId);
    if (seatIdx !== null) {
      if (this.seats[seatIdx]!.socket !== socket) return;
      this.handleDisconnect(playerId);
      return;
    }
    const spectator = this.spectators.get(playerId);
    if (spectator && spectator.socket === socket) {
      this.handleDisconnect(playerId);
    }
  }

  private expireReconnectGrace(seat: SeatIndex): void {
    const occ = this.seats[seat];
    if (!occ || occ.connected || occ.isAi) return;
    if (this.phase === "lobby") {
      // No game to protect yet: just free the seat.
      this.seats[seat] = null;
      this.reassignHostIfNeeded(occ.playerId);
      this.broadcastRoomUpdate();
      return;
    }
    occ.isAi = true;
    occ.aiTakeoverPermanent = true;
    occ.aiDifficulty = this.settings.difficulty;
    occ.reconnectTimer = null;
    this.reassignHostIfNeeded(occ.playerId);
    this.broadcastRoomUpdate();
    this.broadcastToast(`${occ.name}'s seat is now played by AI.`, "warn");
    this.scheduleAiTurnIfNeeded();
  }

  /**
   * Voluntary departure. In the lobby the seat frees up; mid-match the seat
   * flips to AI immediately and permanently (leaving is explicit — no grace).
   */
  leave(playerId: string): void {
    const seatIdx = this.seatIndexForPlayer(playerId);
    if (seatIdx !== null) {
      const occ = this.seats[seatIdx]!;
      if (occ.isAi) return;
      if (occ.reconnectTimer) {
        clearTimeout(occ.reconnectTimer);
        occ.reconnectTimer = null;
      }
      occ.socket = null;
      occ.connected = false;
      if (this.phase === "lobby") {
        this.seats[seatIdx] = null;
      } else {
        occ.isAi = true;
        occ.aiTakeoverPermanent = true;
        occ.aiDifficulty = this.settings.difficulty;
        this.broadcastToast(`${occ.name} left — an AI takes over the seat.`, "warn");
      }
      this.reassignHostIfNeeded(playerId);
      this.broadcastRoomUpdate();
      this.scheduleAiTurnIfNeeded();
      return;
    }
    if (this.spectators.delete(playerId)) {
      this.broadcastRoomUpdate();
    }
  }

  /** If the departing player hosted the room, promote the first remaining human. */
  private reassignHostIfNeeded(departingPlayerId: string): void {
    if (this.hostPlayerId !== departingPlayerId) return;
    const nextHuman = this.seats.find((s) => s && !s.isAi);
    if (nextHuman) {
      this.hostPlayerId = nextHuman.playerId;
      this.broadcastToast(`${nextHuman.name} is now the host.`, "info");
    }
  }

  hasAnyConnection(): boolean {
    if ([...this.spectators.values()].some((s) => s.socket)) return true;
    return this.seats.some((s) => s && !s.isAi && s.connected);
  }

  dispose(): void {
    this.disposed = true;
    if (this.aiTimer) clearTimeout(this.aiTimer);
    for (const seat of this.seats) {
      if (seat?.reconnectTimer) clearTimeout(seat.reconnectTimer);
    }
  }

  // ------------------------------------------------------------- views

  toRoomSnapshot(): RoomSnapshot {
    return {
      code: this.code,
      phase: this.phase,
      hostPlayerId: this.hostPlayerId,
      seats: this.seats.map((s, i): SeatSummary | null =>
        s
          ? {
              seat: i as SeatIndex,
              playerId: s.isAi ? null : s.playerId,
              name: s.name,
              isAi: s.isAi,
              connected: s.isAi ? true : s.connected,
              difficulty: s.isAi ? s.aiDifficulty ?? undefined : undefined,
            }
          : null
      ),
      spectatorCount: this.spectators.size,
      spectatorNames: [...this.spectators.values()].map((s) => s.name),
      settings: this.settings,
      chat: this.chat.slice(-30),
    };
  }

  toMatchView(forSeat: SeatIndex | null): ClientMatchView | null {
    return this.match ? toClientMatchView(this.match, forSeat) : null;
  }

  // --------------------------------------------------------- broadcasting

  private send(socket: OutboundSocket, message: ServerMessage): void {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // Best-effort: a dead socket will be cleaned up by its own close handler.
    }
  }

  sendError(playerId: string, code: string, message: string): void {
    const socket = this.socketForPlayer(playerId);
    if (socket) this.send(socket, { type: "error", code, message });
  }

  private socketForPlayer(playerId: string): OutboundSocket | null {
    const seatIdx = this.seatIndexForPlayer(playerId);
    if (seatIdx !== null) return this.seats[seatIdx]!.socket;
    return this.spectators.get(playerId)?.socket ?? null;
  }

  private broadcastSame(message: ServerMessage): void {
    for (const occ of this.seats) if (occ?.socket) this.send(occ.socket, message);
    for (const spec of this.spectators.values()) if (spec.socket) this.send(spec.socket, message);
  }

  broadcastToast(text: string, level: "info" | "warn" = "info"): void {
    this.broadcastSame({ type: "toast", text, level });
  }

  broadcastRoomUpdate(): void {
    this.broadcastSame({ type: "roomUpdate", room: this.toRoomSnapshot() });
  }

  broadcastMatchState(): void {
    for (const seat of SEAT_INDICES) {
      const occ = this.seats[seat];
      const view = this.toMatchView(seat);
      if (occ?.socket && view) this.send(occ.socket, { type: "matchState", match: view });
    }
    const spectatorView = this.toMatchView(null);
    if (spectatorView) {
      for (const spec of this.spectators.values()) {
        if (spec.socket) this.send(spec.socket, { type: "matchState", match: spectatorView });
      }
    }
  }

  sendWelcome(playerId: string, seat: SeatIndex | null, isSpectator: boolean): void {
    const socket = this.socketForPlayer(playerId);
    if (!socket) return;
    this.send(socket, {
      type: "welcome",
      playerId,
      yourSeat: seat,
      isSpectator,
      room: this.toRoomSnapshot(),
      match: this.toMatchView(seat),
    });
  }
}

function aiName(seat: SeatIndex): string {
  const names = ["Ada (AI)", "Ben (AI)", "Cleo (AI)", "Dex (AI)"];
  return names[seat];
}

function clampInt(n: number, min: number, max: number): number {
  const rounded = Math.round(n);
  return Math.max(min, Math.min(max, Number.isFinite(rounded) ? rounded : min));
}

// Re-exported for callers that need to report a rejected action's shape.
export type { EngineError };
