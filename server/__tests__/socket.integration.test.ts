import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { io as ioc, type Socket } from "socket.io-client";
import { cardFromId, findAllSets } from "../../shared/engine/index.js";
import { SEAT_COLORS } from "../../shared/protocol.js";
import type { GameState, RoomPlayer, RoomSnapshot } from "../../shared/protocol.js";
import { buildServer } from "../build.js";
import type { PlayerIdentity } from "../rooms/room.js";

let built: ReturnType<typeof buildServer>;
let url: string;
const clients: Socket[] = [];

beforeAll(async () => {
  built = buildServer({ staticDir: null, registryOptions: { seedRooms: [] } });
  await new Promise<void>((r) => built.httpServer.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(built.httpServer.address() as AddressInfo).port}`;
});

afterAll(() => {
  built.dispose();
  built.httpServer.close();
});

afterEach(() => {
  while (clients.length) clients.pop()?.disconnect();
});

function once<T = unknown>(socket: Socket, event: string, timeout = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function waitFor<T = unknown>(
  socket: Socket,
  event: string,
  predicate: (data: T) => boolean,
  timeout = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    const handler = (data: T) => {
      if (predicate(data)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(data);
      }
    };
    socket.on(event, handler);
  });
}

async function connect(identity: PlayerIdentity): Promise<Socket> {
  const s = ioc(url, {
    auth: { token: identity.token, playerId: identity.id, name: identity.name },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  clients.push(s);
  await once(s, "connect");
  return s;
}

async function join(socket: Socket, roomId: string): Promise<RoomSnapshot> {
  const snap = once<RoomSnapshot>(socket, "room:state");
  socket.emit("room:join", roomId);
  return snap;
}

function players(built_: typeof built, ...names: string[]): PlayerIdentity[] {
  return names.map((n) => built_.registry.createPlayer(n));
}

describe("Socket.IO realtime gateway", () => {
  it("shows two joined clients in each other's roster", async () => {
    const [alice, bob] = players(built, "Alice", "Bob");
    const a = await connect(alice);
    await join(a, "S1");
    const b = await connect(bob);
    const rosterOnA = waitFor<RoomPlayer[]>(a, "room:players", (list) => list.length === 2);
    await join(b, "S1");
    const list = await rosterOnA;
    expect(list.map((p) => p.name).sort()).toEqual(["Alice", "Bob"]);
  });

  it("validates a claim, awards a point and broadcasts it to everyone", async () => {
    const [alice, bob] = players(built, "Alice", "Bob");
    const a = await connect(alice);
    const b = await connect(bob);
    await join(a, "S2");
    await join(b, "S2");
    a.emit("room:sit", { roomId: "S2", color: SEAT_COLORS[0] });
    b.emit("room:sit", { roomId: "S2", color: SEAT_COLORS[1] });

    const startedOnA = once<GameState>(a, "game:started");
    a.emit("game:start", "S2");
    b.emit("game:start", "S2");
    const game = await startedOnA;

    const set = findAllSets(game.board.map(cardFromId))[0];
    const cardIds = set.cards.map((c) => c.id);

    const acceptedOnB = once<{ playerId: string; points: number }>(b, "game:claimAccepted");
    const scoreOnB = waitFor<RoomPlayer[]>(
      b,
      "room:players",
      (list) => (list.find((p) => p.id === alice.id)?.points ?? 0) === 1,
    );
    const ack = await new Promise<{ ok: boolean }>((resolve) =>
      a.emit("game:claim", { roomId: "S2", cardIds }, resolve),
    );

    expect(ack.ok).toBe(true);
    const accepted = await acceptedOnB;
    expect(accepted.playerId).toBe(alice.id);
    expect(accepted.points).toBe(1);
    await scoreOnB; // Bob's scoreboard reflects Alice's point.
  });

  it("relays chat messages between clients", async () => {
    const [alice, bob] = players(built, "Alice", "Bob");
    const a = await connect(alice);
    const b = await connect(bob);
    await join(a, "S3");
    await join(b, "S3");

    const msgOnA = once<{ name: string; text: string }>(a, "chat:message");
    b.emit("chat:send", { roomId: "S3", text: "hey there" });
    const msg = await msgOnA;
    expect(msg).toMatchObject({ name: "Bob", text: "hey there" });
  });

  it("relays WebRTC voice signalling and reports peers leaving", async () => {
    const [alice, bob] = players(built, "Alice", "Bob");
    const a = await connect(alice);
    const b = await connect(bob);
    await join(a, "S4");
    await join(b, "S4");

    a.emit("voice:join", "S4");
    await once(a, "voice:peers");
    const peersOnB = once<string[]>(b, "voice:peers");
    b.emit("voice:join", "S4");
    expect(await peersOnB).toContain(alice.id);

    const signalOnA = once<{ from: string }>(a, "voice:signal");
    b.emit("voice:signal", { roomId: "S4", to: alice.id, data: { kind: "candidate", candidate: {} } });
    expect((await signalOnA).from).toBe(bob.id);

    const peerLeftOnA = once<string>(a, "voice:peerLeft");
    b.disconnect();
    expect(await peerLeftOnA).toBe(bob.id);
  });

  it("keeps a player's score across a reconnect with the same token", async () => {
    const [alice, bob] = players(built, "Alice", "Bob");
    const a = await connect(alice);
    const b = await connect(bob);
    await join(a, "S5");
    await join(b, "S5");
    a.emit("room:sit", { roomId: "S5", color: SEAT_COLORS[0] });
    b.emit("room:sit", { roomId: "S5", color: SEAT_COLORS[1] });

    const startedOnA = once<GameState>(a, "game:started");
    a.emit("game:start", "S5");
    b.emit("game:start", "S5");
    const game = await startedOnA;

    const cardIds = findAllSets(game.board.map(cardFromId))[0].cards.map((c) => c.id);
    await new Promise((resolve) => a.emit("game:claim", { roomId: "S5", cardIds }, resolve));

    a.disconnect();
    // Reconnect as the same player and re-join: score must survive.
    const a2 = await connect(alice);
    const snap = await join(a2, "S5");
    expect(snap.players.find((p) => p.id === alice.id)?.points).toBe(1);
  });
});
