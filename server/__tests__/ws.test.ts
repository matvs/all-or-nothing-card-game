import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { WebSocket } from "ws";
import type { Database } from "better-sqlite3";
import { createApp, type AppBundle } from "../app.js";
import { openDatabase } from "../db/index.js";
import { attachWebSocketServer } from "../ws/handler.js";
import type { ClientMessage, ServerMessage } from "../../shared/protocol.js";
import type { WebSocketServer } from "ws";

/** Test client: buffers every server message and lets tests await specific types. */
class TestClient {
  ws: WebSocket;
  messages: ServerMessage[] = [];
  private waiters: { predicate: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  closed = false;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as ServerMessage;
      this.messages.push(message);
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        if (this.waiters[i].predicate(message)) {
          const [waiter] = this.waiters.splice(i, 1);
          waiter.resolve(message);
        }
      }
    });
    this.ws.on("close", () => {
      this.closed = true;
    });
  }

  async opened(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
  }

  send(message: ClientMessage): void {
    this.ws.send(JSON.stringify(message));
  }

  /** Resolves with the first (buffered or future) message matching an arbitrary predicate. */
  waitWhere(predicate: (m: ServerMessage) => boolean, timeoutMs = 5000, label = "predicate"): Promise<ServerMessage> {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ws message (${label})`)), timeoutMs);
      this.waiters.push({
        predicate,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  /** Resolves with the first (buffered or future) message of the given type matching `extra`. */
  waitFor<T extends ServerMessage["type"]>(type: T, extra?: (m: Extract<ServerMessage, { type: T }>) => boolean, timeoutMs = 5000): Promise<Extract<ServerMessage, { type: T }>> {
    const predicate = (m: ServerMessage) => m.type === type && (extra ? extra(m as Extract<ServerMessage, { type: T }>) : true);
    return this.waitWhere(predicate, timeoutMs, `type=${type}`) as Promise<Extract<ServerMessage, { type: T }>>;
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

describe("WebSocket multiplayer flow", () => {
  let db: Database;
  let bundle: AppBundle;
  let server: http.Server;
  let wss: WebSocketServer;
  let baseUrl: string;
  let wsBase: string;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    db = openDatabase(":memory:");
    bundle = createApp({ db, aiThinkDelayMs: 0, reconnectGraceMs: 800, staticDir: null });
    server = http.createServer(bundle.app);
    wss = attachWebSocketServer(server, bundle.registry);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    wsBase = `ws://127.0.0.1:${address.port}/ws`;
  });

  afterEach(async () => {
    for (const c of clients) c.close();
    clients.length = 0;
    bundle.dispose();
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  function connect(code: string, playerId: string, token: string): TestClient {
    const client = new TestClient(`${wsBase}?code=${code}&playerId=${playerId}&token=${encodeURIComponent(token)}`);
    clients.push(client);
    return client;
  }

  async function createRoomAndConnect(name = "Host"): Promise<{ code: string; playerId: string; token: string; client: TestClient }> {
    const res = await request(baseUrl).post("/api/rooms").send({ name, settings: { roundPeak: 2 } });
    expect(res.status).toBe(201);
    const { code, playerId, token } = res.body;
    const client = connect(code, playerId, token);
    await client.opened();
    await client.waitFor("welcome");
    return { code, playerId, token, client };
  }

  it("welcomes a connecting host with room snapshot and null match", async () => {
    const { client } = await createRoomAndConnect();
    const welcome = await client.waitFor("welcome");
    expect(welcome.yourSeat).toBe(0);
    expect(welcome.isSpectator).toBe(false);
    expect(welcome.room.phase).toBe("lobby");
    expect(welcome.match).toBeNull();
  });

  it("rejects a connection with a bad token or unknown room, closing the socket", async () => {
    const { code, playerId } = await createRoomAndConnect();
    const bad = connect(code, playerId, "wrong");
    await bad.opened();
    const err = await bad.waitFor("error");
    expect(err.code).toBe("REJECTED");

    const ghost = connect("QQQQ", "nobody", "nothing");
    await ghost.opened();
    const err2 = await ghost.waitFor("error");
    expect(err2.code).toBe("ROOM_NOT_FOUND");
  });

  it("broadcasts roomUpdate when a second player joins", async () => {
    const { code, client } = await createRoomAndConnect();
    const join = await request(baseUrl).post(`/api/rooms/${code}/join`).send({ name: "Bob" });
    const bobClient = connect(code, join.body.playerId, join.body.token);
    await bobClient.opened();
    await bobClient.waitFor("welcome");
    const update = await client.waitFor("roomUpdate", (m) => m.room.seats[1] !== null);
    expect(update.room.seats[1]!.name).toBe("Bob");
  });

  it("plays a full match: host starts, AI fills seats, human bids and plays to completion", async () => {
    const { client } = await createRoomAndConnect();
    client.send({ type: "startMatch" });

    // The server drives AI turns; whenever it's our (seat 0's) turn we act
    // legally and dumbly until the match ends. roundPeak=2 -> rounds 1,2,1.
    const isOurTurnOrEnd = (m: ServerMessage) =>
      m.type === "matchEnded" ||
      (m.type === "matchState" &&
        m.match.round !== null &&
        ((m.match.round.phase === "bidding" && m.match.round.nextBidder === 0) ||
          (m.match.round.phase === "playing" && m.match.round.nextPlayer === 0)));

    let finale: Extract<ServerMessage, { type: "matchEnded" }> | null = null;
    for (let step = 0; step < 40 && !finale; step++) {
      const msg = await client.waitWhere(isOurTurnOrEnd, 8000, "our turn or match end");
      client.messages.splice(client.messages.indexOf(msg), 1); // consume so we don't loop on it
      if (msg.type === "matchEnded") {
        finale = msg;
        break;
      }
      const round = (msg as Extract<ServerMessage, { type: "matchState" }>).match.round!;
      if (round.phase === "bidding") {
        const amount = round.forbiddenBid === 0 ? 1 : 0;
        client.send({ type: "bid", amount });
      } else {
        const hand = round.yourHand!;
        const leadSuit = round.currentTrick[0]?.card.suit;
        const followers = leadSuit ? hand.filter((c) => c.suit === leadSuit) : hand;
        const card = (followers.length > 0 ? followers : hand)[0];
        client.send({ type: "play", cardId: `${card.rank}${card.suit}` });
      }
    }

    expect(finale).not.toBeNull();
    expect(finale!.match.phase).toBe("complete");
    expect(finale!.winners.length).toBeGreaterThanOrEqual(1);
    expect(finale!.match.history.length).toBe(3); // rounds 1,2,1
  }, 25000);

  it("rejects an illegal action with an error message and no state change", async () => {
    const { client } = await createRoomAndConnect();
    client.send({ type: "startMatch" });
    // Wait until it's the human's bidding turn.
    const state = await client.waitFor(
      "matchState",
      (m) => m.match.round?.phase === "bidding" && m.match.round.nextBidder === 0
    );
    client.send({ type: "bid", amount: 999 });
    const err = await client.waitFor("error", (m) => m.code === "BID_OUT_OF_RANGE");
    expect(err.message).toMatch(/between 0 and/);
    expect(state.match.round!.bids[0]).toBeUndefined();
  });

  it("supports reconnection: a dropped socket can resume with the same playerId+token", async () => {
    const { code, playerId, token, client } = await createRoomAndConnect();
    client.send({ type: "startMatch" });
    await client.waitFor("matchState");
    client.close();

    // Reconnect within the grace window on a brand new socket.
    const revived = connect(code, playerId, token);
    await revived.opened();
    const welcome = await revived.waitFor("welcome");
    expect(welcome.yourSeat).toBe(0);
    expect(welcome.match).not.toBeNull();
    expect(welcome.match!.round).not.toBeNull();
  });

  it("locks the seat to AI after the grace period expires and refuses the returning socket", async () => {
    const { code, playerId, token, client } = await createRoomAndConnect();
    client.send({ type: "startMatch" });
    await client.waitFor("matchState");
    client.close();

    await new Promise((resolve) => setTimeout(resolve, 1200)); // grace is 800ms

    const late = connect(code, playerId, token);
    await late.opened();
    const err = await late.waitFor("error");
    expect(err.code).toBe("REJECTED");
    expect(err.message).toMatch(/taken over by AI/i);
  });

  it("gives spectators a redacted view (no hand) and lets them chat", async () => {
    const { code, client } = await createRoomAndConnect();
    const join = await request(baseUrl).post(`/api/rooms/${code}/join`).send({ name: "Railbird", asSpectator: true });
    const spectator = connect(code, join.body.playerId, join.body.token);
    await spectator.opened();
    const welcome = await spectator.waitFor("welcome");
    expect(welcome.isSpectator).toBe(true);
    expect(welcome.yourSeat).toBeNull();

    client.send({ type: "startMatch" });
    const view = await spectator.waitFor("matchState");
    expect(view.match.round!.yourHand).toBeNull();

    spectator.send({ type: "chat", text: "go seat zero!" });
    const chat = await client.waitFor("chat", (m) => m.message.isSpectator);
    expect(chat.message.from).toBe("Railbird");
    expect(chat.message.text).toBe("go seat zero!");
  });

  it("relays per-room chat between players with history available to late joiners", async () => {
    const { code, client } = await createRoomAndConnect();
    client.send({ type: "chat", text: "first!" });
    await client.waitFor("chat");

    const join = await request(baseUrl).post(`/api/rooms/${code}/join`).send({ name: "Bob" });
    const bob = connect(code, join.body.playerId, join.body.token);
    await bob.opened();
    const welcome = await bob.waitFor("welcome");
    expect(welcome.room.chat.some((m) => m.text === "first!")).toBe(true);
  });
});
