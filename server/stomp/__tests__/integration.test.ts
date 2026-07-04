import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type IMessage } from "@stomp/stompjs";
import { WebSocket as NodeWebSocket } from "ws";
import { cardFromId, findFirstSet } from "../../../shared/engine/index.js";
import {
  CONNECT_HEADERS,
  USER_REPLY_QUEUE,
  appDest,
  roomTopic,
  type RoomMessage,
  type ReplyMessage,
} from "../../../shared/protocol.js";
import { buildServer, type BuiltServer } from "../../build.js";

let server: BuiltServer;
let baseHttp = "";
let wsUrl = "";

beforeAll(async () => {
  server = buildServer({ staticDir: null });
  await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
  const port = (server.httpServer.address() as AddressInfo).port;
  baseHttp = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}/stomp`;
});

afterAll(async () => {
  server.dispose();
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
});

interface Creds {
  code: string;
  playerId: string;
  token: string;
}

async function createRoom(name: string): Promise<Creds> {
  const res = await fetch(`${baseHttp}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as Creds;
}
async function joinRoom(code: string, name: string): Promise<Creds> {
  const res = await fetch(`${baseHttp}/api/rooms/${code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as Creds;
}

/** A connected STOMP client that records room + private messages. */
class TestClient {
  readonly rooms: RoomMessage[] = [];
  readonly replies: ReplyMessage[] = [];
  private client: Client;
  private waiters: { pred: (m: RoomMessage) => boolean; resolve: (m: RoomMessage) => void }[] = [];
  private replyWaiters: { resolve: (m: ReplyMessage) => void }[] = [];

  constructor(private creds: Creds) {
    this.client = new Client({
      webSocketFactory: () => new NodeWebSocket(wsUrl) as unknown as WebSocket,
      connectHeaders: {
        [CONNECT_HEADERS.login]: creds.playerId,
        [CONNECT_HEADERS.passcode]: creds.token,
        [CONNECT_HEADERS.room]: creds.code,
      },
      reconnectDelay: 0,
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
    });
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.onConnect = () => {
        this.client.subscribe(roomTopic(this.creds.code), (m: IMessage) => this.onRoom(m));
        this.client.subscribe(USER_REPLY_QUEUE, (m: IMessage) => this.onReply(m));
        resolve();
      };
      this.client.onStompError = (frame) => reject(new Error(frame.headers.message ?? "stomp error"));
      this.client.activate();
    });
  }

  private onRoom(message: IMessage): void {
    const parsed = JSON.parse(message.body) as RoomMessage;
    this.rooms.push(parsed);
    this.waiters = this.waiters.filter((w) => {
      if (w.pred(parsed)) {
        w.resolve(parsed);
        return false;
      }
      return true;
    });
  }

  private onReply(message: IMessage): void {
    const parsed = JSON.parse(message.body) as ReplyMessage;
    this.replies.push(parsed);
    const waiter = this.replyWaiters.shift();
    if (waiter) waiter.resolve(parsed);
  }

  waitForRoom(pred: (m: RoomMessage) => boolean, timeoutMs = 4000): Promise<RoomMessage> {
    const existing = this.rooms.find(pred);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for room message")), timeoutMs);
      this.waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  waitForReply(timeoutMs = 4000): Promise<ReplyMessage> {
    if (this.replies.length) return Promise.resolve(this.replies[this.replies.length - 1]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for reply")), timeoutMs);
      this.replyWaiters.push({
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  send(action: "start" | "claim" | "dealMore", body: unknown = {}): void {
    this.client.publish({ destination: appDest(this.creds.code, action), body: JSON.stringify(body) });
  }

  async disconnect(): Promise<void> {
    await this.client.deactivate();
  }
}

function boardSet(message: RoomMessage): [number, number, number] {
  const cards = message.room.board.map((id) => cardFromId(id));
  const set = findFirstSet(cards);
  if (!set) throw new Error("expected a set on the board");
  return set.cards.map((c) => c.id) as [number, number, number];
}

describe("STOMP multiplayer race (end to end)", () => {
  it("two players connect, race on a shared board, and the server validates claims", async () => {
    const hostCreds = await createRoom("Ada");
    const guestCreds = await joinRoom(hostCreds.code, "Bob");
    expect(guestCreds.code).toBe(hostCreds.code);

    const host = new TestClient(hostCreds);
    const guest = new TestClient(guestCreds);
    await host.connect();
    await guest.connect();

    // Host starts; both see a playing board of >= 12 cards.
    host.send("start");
    const playing = await guest.waitForRoom((m) => m.room.status === "playing" && m.room.board.length >= 12);
    expect(playing.room.round).toBe(1);

    // Guest claims a real set from the shared board -> server accepts, scores it.
    const set = boardSet(playing);
    guest.send("claim", { cards: set });
    const claimed = await host.waitForRoom(
      (m) => m.type === "event" && m.event.kind === "claimed" && m.event.by === guestCreds.playerId,
    );
    const guestScore = claimed.room.players.find((p) => p.id === guestCreds.playerId)!.score;
    expect(guestScore).toBe(1);
    // The claimed cards are no longer on the board.
    for (const id of set) expect(claimed.room.board).not.toContain(id);

    // An invalid claim gets a PRIVATE rejection, not a broadcast.
    const notASet = pickNonSet(claimed);
    host.send("claim", { cards: notASet });
    const reply = await host.waitForReply();
    expect(reply.type).toBe("rejected");
    if (reply.type === "rejected") expect(reply.action).toBe("claim");

    // Host's score is unchanged by the invalid claim.
    const afterReject = await host.waitForRoom((m) => m.room.status === "playing");
    expect(afterReject.room.players.find((p) => p.id === hostCreds.playerId)!.score).toBe(0);

    await host.disconnect();
    await guest.disconnect();
  });

  it("rejects a socket that presents a bad token", async () => {
    const creds = await createRoom("Ada");
    const bad = new TestClient({ ...creds, token: "not-the-token" });
    await expect(bad.connect()).rejects.toThrow();
  });

  it("lets a dropped player reconnect with their token and keep their score", async () => {
    const creds = await createRoom("Ada");
    const first = new TestClient(creds);
    await first.connect();
    first.send("start");
    const playing = await first.waitForRoom((m) => m.room.status === "playing");
    first.send("claim", { cards: boardSet(playing) });
    await first.waitForRoom((m) => m.type === "event" && m.event.kind === "claimed");

    // Simulate a connection drop.
    await first.disconnect();

    // Reconnect with the SAME credentials (playerId + token).
    const again = new TestClient(creds);
    await again.connect();
    const resumed = await again.waitForRoom(
      (m) => m.room.status === "playing" && m.room.players.some((p) => p.id === creds.playerId && p.connected),
    );
    const me = resumed.room.players.find((p) => p.id === creds.playerId)!;
    expect(me.score).toBe(1); // score survived the reconnect
    await again.disconnect();
  });
});

function pickNonSet(message: RoomMessage): [number, number, number] {
  const cards = message.room.board.map((id) => cardFromId(id));
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      for (let k = j + 1; k < cards.length; k++) {
        const [a, b, c] = [cards[i], cards[j], cards[k]];
        if ((a.color + b.color + c.color) % 3 !== 0) return [a.id, b.id, c.id];
      }
  throw new Error("no non-set triple found");
}
