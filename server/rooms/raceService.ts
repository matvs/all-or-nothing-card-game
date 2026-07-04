import {
  CONNECT_HEADERS,
  USER_REPLY_QUEUE,
  appDest,
  roomTopic,
  type ChatPayload,
  type ClaimPayload,
  type RaceEvent,
  type ReplyMessage,
  type RoomMessage,
} from "../../shared/protocol.js";
import type { StompServer, StompSession } from "../stomp/server.js";
import type { RoomRegistry } from "./registry.js";
import type { Room } from "./room.js";

interface SessionData {
  code: string;
  playerId: string;
}

/**
 * Wires the STOMP transport to the room model. Every mutation is
 * server-authoritative: the browser only asks, the room decides, and the
 * result is broadcast to the room topic (public board) or replied privately.
 */
export class RaceService {
  private stomp: StompServer | null = null;

  constructor(private registry: RoomRegistry) {}

  setStomp(stomp: StompServer): void {
    this.stomp = stomp;
  }

  handlers() {
    return {
      authenticate: (headers: Record<string, string>): Record<string, unknown> =>
        this.authenticate(headers) as unknown as Record<string, unknown>,
      onSubscribe: (session: StompSession, destination: string) => this.onSubscribe(session, destination),
      onSend: (session: StompSession, destination: string, body: string) =>
        this.onSend(session, destination, body),
      onDisconnect: (session: StompSession) => this.onDisconnect(session),
    };
  }

  // ---- auth --------------------------------------------------------------
  private authenticate(headers: Record<string, string>): SessionData {
    const playerId = headers[CONNECT_HEADERS.login] ?? "";
    const token = headers[CONNECT_HEADERS.passcode] ?? "";
    const code = (headers[CONNECT_HEADERS.room] ?? "").toUpperCase();
    const room = this.registry.getRoom(code);
    if (!room) throw new Error(`No room ${code}`);
    if (!room.authenticate(playerId, token)) throw new Error("Bad credentials");
    room.setConnected(playerId, true);
    this.registry.markActive(code);
    return { code, playerId };
  }

  // ---- subscribe: push current state, announce presence ------------------
  private onSubscribe(session: StompSession, destination: string): void {
    const data = session.data as unknown as SessionData;
    if (!data?.code || destination !== roomTopic(data.code)) return;
    const room = this.registry.getRoom(data.code);
    if (!room) return;
    // The new subscriber gets the full state; everyone learns they joined.
    this.broadcast(room, { kind: "joined", name: room.playerName(data.playerId) });
  }

  // ---- send: route actions ----------------------------------------------
  private onSend(session: StompSession, destination: string, body: string): void {
    const data = session.data as unknown as SessionData;
    if (!data?.code) return;
    const room = this.registry.getRoom(data.code);
    if (!room) return;
    this.registry.markActive(data.code);

    if (destination === appDest(data.code, "start")) {
      const result = room.start(data.playerId);
      if ("error" in result) return this.reply(session, { type: "rejected", action: "start", reason: result.error });
      this.broadcast(room, result);
    } else if (destination === appDest(data.code, "claim")) {
      const payload = parse<ClaimPayload>(body);
      const cards = payload?.cards;
      if (!Array.isArray(cards) || cards.length !== 3) {
        return this.reply(session, { type: "rejected", action: "claim", reason: "Pick three cards" });
      }
      const outcome = room.claim(data.playerId, [cards[0], cards[1], cards[2]]);
      if (!outcome.ok) {
        return this.reply(session, { type: "rejected", action: "claim", reason: outcome.reason ?? "Invalid" });
      }
      this.broadcast(room, outcome.event);
      if (outcome.over) this.broadcast(room, { kind: "finished", winnerIds: room.toView().winnerIds });
    } else if (destination === appDest(data.code, "dealMore")) {
      const { event } = room.dealMore(data.playerId);
      if (event) this.broadcast(room, event);
      else this.reply(session, { type: "rejected", action: "dealMore", reason: "There is a set on the board" });
    } else if (destination === appDest(data.code, "chat")) {
      const payload = parse<ChatPayload>(body);
      const text = (payload?.text ?? "").toString().slice(0, 240).trim();
      if (text) this.broadcast(room, { kind: "chat", name: room.playerName(data.playerId), text });
    }
  }

  // ---- disconnect: mark offline, update roster ---------------------------
  private onDisconnect(session: StompSession): void {
    const data = session.data as unknown as SessionData;
    if (!data?.code) return;
    const room = this.registry.getRoom(data.code);
    if (!room) return;
    room.setConnected(data.playerId, false);
    this.broadcast(room, { kind: "left", name: room.playerName(data.playerId) });
  }

  // ---- helpers -----------------------------------------------------------
  private broadcast(room: Room, event?: RaceEvent): void {
    if (!this.stomp) return;
    const message: RoomMessage = event
      ? { type: "event", event, room: room.toView() }
      : { type: "state", room: room.toView() };
    this.stomp.publishJson(roomTopic(room.code), message);
  }

  private reply(session: StompSession, message: ReplyMessage): void {
    this.stomp?.sendJson(session, USER_REPLY_QUEUE, message);
  }
}

function parse<T>(body: string): T | null {
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}
