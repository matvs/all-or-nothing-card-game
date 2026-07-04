import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { cardFromId, findAllSets } from "../../shared/engine/index.js";
import { SEAT_COLORS } from "../../shared/protocol.js";
import type { GameState, RoomPlayer, RoomSnapshot } from "../../shared/protocol.js";
import { buildServer } from "../build.js";
import type { PlayerIdentity } from "../rooms/room.js";

let built: ReturnType<typeof buildServer>;
let url: string;
const clients: TestClient[] = [];

/** Minimal native-WebSocket test client speaking the `{ t, d, id }` protocol. */
class TestClient {
  private ws: WebSocket;
  private reqId = 1;
  private readonly acks = new Map<number, (d: unknown) => void>();
  private readonly waiters: { type: string; pred: (d: unknown) => boolean; resolve: (d: unknown) => void }[] = [];

  constructor(identity: PlayerIdentity) {
    const q = new URLSearchParams({ token: identity.token, playerId: identity.id, name: identity.name });
    this.ws = new WebSocket(`${url}/ws?${q.toString()}`);
    this.ws.on("message", (raw) => {
      const env = JSON.parse(raw.toString()) as { t: string; d?: unknown; id?: number };
      if (env.t === "__ack" && typeof env.id === "number") {
        this.acks.get(env.id)?.(env.d);
        this.acks.delete(env.id);
        return;
      }
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        const w = this.waiters[i];
        if (w.type === env.t && w.pred(env.d)) {
          this.waiters.splice(i, 1);
          w.resolve(env.d);
        }
      }
    });
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.on("open", () => resolve());
      this.ws.on("error", reject);
    });
  }

  emit(t: string, d?: unknown): void {
    this.ws.send(JSON.stringify({ t, d }));
  }

  request<T = unknown>(t: string, d: unknown): Promise<T> {
    const id = this.reqId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`ack timeout for ${t}`)), 8000);
      this.acks.set(id, (resp) => {
        clearTimeout(timer);
        resolve(resp as T);
      });
      this.ws.send(JSON.stringify({ t, d, id }));
    });
  }

  waitFor<T = unknown>(type: string, pred: (d: T) => boolean = () => true, timeout = 8000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeout);
      this.waiters.push({
        type,
        pred: pred as (d: unknown) => boolean,
        resolve: (d) => {
          clearTimeout(timer);
          resolve(d as T);
        },
      });
    });
  }

  async join(roomId: string): Promise<RoomSnapshot> {
    const snap = this.waitFor<RoomSnapshot>("room:state");
    this.emit("room:join", roomId);
    return snap;
  }

  close(): void {
    this.ws.close();
  }
}

async function connect(identity: PlayerIdentity): Promise<TestClient> {
  const c = new TestClient(identity);
  clients.push(c);
  await c.open();
  return c;
}

function makePlayers(...names: string[]): PlayerIdentity[] {
  return names.map((n) => built.registry.createPlayer(n));
}

beforeAll(async () => {
  built = buildServer({ staticDir: null, registryOptions: { seedRooms: [] } });
  await new Promise<void>((r) => built.httpServer.listen(0, "127.0.0.1", r));
  url = `ws://127.0.0.1:${(built.httpServer.address() as AddressInfo).port}`;
});

afterAll(() => {
  built.dispose();
  built.httpServer.close();
});

afterEach(() => {
  while (clients.length) clients.pop()?.close();
});

describe("native WebSocket realtime gateway", () => {
  it("shows two joined clients in each other's roster", async () => {
    const [alice, bob] = makePlayers("Alice", "Bob");
    const a = await connect(alice);
    await a.join("S1");
    const b = await connect(bob);
    const rosterOnA = a.waitFor<RoomPlayer[]>("room:players", (list) => list.length === 2);
    await b.join("S1");
    const list = await rosterOnA;
    expect(list.map((p) => p.name).sort()).toEqual(["Alice", "Bob"]);
  });

  it("validates a claim, awards a point and broadcasts it to everyone", async () => {
    const [alice, bob] = makePlayers("Alice", "Bob");
    const a = await connect(alice);
    const b = await connect(bob);
    await a.join("S2");
    await b.join("S2");
    a.emit("room:sit", { roomId: "S2", color: SEAT_COLORS[0] });
    b.emit("room:sit", { roomId: "S2", color: SEAT_COLORS[1] });

    const startedOnA = a.waitFor<GameState>("game:started");
    a.emit("game:start", "S2");
    b.emit("game:start", "S2");
    const game = await startedOnA;

    const cardIds = findAllSets(game.board.map(cardFromId))[0].cards.map((c) => c.id);
    const acceptedOnB = b.waitFor<{ playerId: string; points: number }>("game:claimAccepted");
    const scoreOnB = b.waitFor<RoomPlayer[]>(
      "room:players",
      (list) => (list.find((p) => p.id === alice.id)?.points ?? 0) === 1,
    );
    const ack = await a.request<{ ok: boolean }>("game:claim", { roomId: "S2", cardIds });

    expect(ack.ok).toBe(true);
    const accepted = await acceptedOnB;
    expect(accepted.playerId).toBe(alice.id);
    expect(accepted.points).toBe(1);
    await scoreOnB;
  });

  it("relays chat messages between clients", async () => {
    const [alice, bob] = makePlayers("Alice", "Bob");
    const a = await connect(alice);
    const b = await connect(bob);
    await a.join("S3");
    await b.join("S3");

    const msgOnA = a.waitFor<{ name: string; text: string }>("chat:message");
    b.emit("chat:send", { roomId: "S3", text: "hey there" });
    expect(await msgOnA).toMatchObject({ name: "Bob", text: "hey there" });
  });

  it("relays WebRTC voice signalling and reports peers leaving", async () => {
    const [alice, bob] = makePlayers("Alice", "Bob");
    const a = await connect(alice);
    const b = await connect(bob);
    await a.join("S4");
    await b.join("S4");

    const peersOnA = a.waitFor("voice:peers");
    a.emit("voice:join", "S4");
    await peersOnA;
    const peersOnB = b.waitFor<string[]>("voice:peers");
    b.emit("voice:join", "S4");
    expect(await peersOnB).toContain(alice.id);

    const signalOnA = a.waitFor<{ from: string }>("voice:signal");
    b.emit("voice:signal", { roomId: "S4", to: alice.id, data: { kind: "candidate", candidate: {} } });
    expect((await signalOnA).from).toBe(bob.id);

    const peerLeftOnA = a.waitFor<string>("voice:peerLeft", (id) => id === bob.id);
    b.close();
    expect(await peerLeftOnA).toBe(bob.id);
  });

  it("keeps a player's score across a reconnect with the same token", async () => {
    const [alice, bob] = makePlayers("Alice", "Bob");
    const a = await connect(alice);
    const b = await connect(bob);
    await a.join("S5");
    await b.join("S5");
    a.emit("room:sit", { roomId: "S5", color: SEAT_COLORS[0] });
    b.emit("room:sit", { roomId: "S5", color: SEAT_COLORS[1] });

    const startedOnA = a.waitFor<GameState>("game:started");
    a.emit("game:start", "S5");
    b.emit("game:start", "S5");
    const game = await startedOnA;

    const cardIds = findAllSets(game.board.map(cardFromId))[0].cards.map((c) => c.id);
    await a.request("game:claim", { roomId: "S5", cardIds });

    a.close();
    const a2 = await connect(alice); // same identity/token
    const snap = await a2.join("S5");
    expect(snap.players.find((p) => p.id === alice.id)?.points).toBe(1);
  });
});
