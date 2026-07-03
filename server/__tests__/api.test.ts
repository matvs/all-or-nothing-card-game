import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Database } from "better-sqlite3";
import { createApp, type AppBundle } from "../app.js";
import { openDatabase } from "../db/index.js";

describe("HTTP API", () => {
  let db: Database;
  let bundle: AppBundle;

  beforeEach(() => {
    db = openDatabase(":memory:");
    bundle = createApp({ db, aiThinkDelayMs: 0, reconnectGraceMs: 1000, staticDir: null });
  });

  afterEach(() => {
    bundle.dispose();
    db.close();
  });

  it("GET /api/health reports ok and the live room count", async () => {
    const res = await request(bundle.app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.rooms).toBe(0);
  });

  it("POST /api/rooms creates a room with a 4-letter code and host credentials", async () => {
    const res = await request(bundle.app).post("/api/rooms").send({ name: "Alice" });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-Z]{4}$/);
    expect(res.body.playerId).toBeTruthy();
    expect(res.body.token).toBeTruthy();
    expect(bundle.registry.roomCount()).toBe(1);
  });

  it("POST /api/rooms honors custom settings and defaults the rest", async () => {
    const res = await request(bundle.app)
      .post("/api/rooms")
      .send({ name: "Alice", settings: { difficulty: "hard", roundPeak: 5 } });
    expect(res.status).toBe(201);
    const room = bundle.registry.getRoom(res.body.code)!;
    expect(room.settings.difficulty).toBe("hard");
    expect(room.settings.roundPeak).toBe(5);
    expect(room.settings.dealerRestriction).toBe(true);
  });

  it("GET /api/rooms/:code summarizes a room; join is case-insensitive on the code", async () => {
    const create = await request(bundle.app).post("/api/rooms").send({ name: "Alice" });
    const code: string = create.body.code;

    const summary = await request(bundle.app).get(`/api/rooms/${code.toLowerCase()}`);
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({ code, phase: "lobby", playerCount: 1, full: false });
  });

  it("POST /api/rooms/:code/join seats players 2-4, then overflows to spectator", async () => {
    const create = await request(bundle.app).post("/api/rooms").send({ name: "Alice" });
    const code: string = create.body.code;

    const seats: (number | null)[] = [];
    for (const name of ["Bob", "Cara", "Dan"]) {
      const join = await request(bundle.app).post(`/api/rooms/${code}/join`).send({ name });
      expect(join.status).toBe(200);
      expect(join.body.isSpectator).toBe(false);
      seats.push(join.body.seat);
    }
    expect(seats).toEqual([1, 2, 3]);

    const fifth = await request(bundle.app).post(`/api/rooms/${code}/join`).send({ name: "Eve" });
    expect(fifth.body.isSpectator).toBe(true);
    expect(fifth.body.seat).toBeNull();
  });

  it("supports joining explicitly as a spectator", async () => {
    const create = await request(bundle.app).post("/api/rooms").send({ name: "Alice" });
    const join = await request(bundle.app)
      .post(`/api/rooms/${create.body.code}/join`)
      .send({ name: "Railbird", asSpectator: true });
    expect(join.body.isSpectator).toBe(true);
  });

  it("404s an unknown room and 400s a malformed code", async () => {
    const missing = await request(bundle.app).get("/api/rooms/ZZZZ");
    expect(missing.status).toBe(404);
    const bad = await request(bundle.app).get("/api/rooms/nope!");
    expect(bad.status).toBe(400);
    const joinMissing = await request(bundle.app).post("/api/rooms/QQQQ/join").send({ name: "X" });
    expect(joinMissing.status).toBe(404);
  });

  it("sanitizes names: trims, collapses whitespace, caps length, defaults empties", async () => {
    const res = await request(bundle.app)
      .post("/api/rooms")
      .send({ name: "   A   very    long  name that goes on forever and ever  " });
    const room = bundle.registry.getRoom(res.body.code)!;
    expect(room.seats[0]!.name.length).toBeLessThanOrEqual(20);
    expect(room.seats[0]!.name).not.toMatch(/\s{2,}/);

    const empty = await request(bundle.app).post("/api/rooms").send({ name: "   " });
    const room2 = bundle.registry.getRoom(empty.body.code)!;
    expect(room2.seats[0]!.name).toBe("Player");
  });

  it("serves aggregate stats: zero for unknown names, real counts after recording", async () => {
    const unknown = await request(bundle.app).get("/api/stats/Nobody");
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ name: "Nobody", gamesPlayed: 0, gamesWon: 0 });

    bundle.statsStore.recordResult("Alice", true);
    bundle.statsStore.recordResult("Alice", false);
    bundle.statsStore.recordResult("Bob", false);

    const alice = await request(bundle.app).get("/api/stats/Alice");
    expect(alice.body).toEqual({ name: "Alice", gamesPlayed: 2, gamesWon: 1 });

    const top = await request(bundle.app).get("/api/stats/top");
    expect(top.status).toBe(200);
    expect(top.body[0].name).toBe("Alice");
    expect(top.body).toHaveLength(2);
  });

  it("stats persist across app restarts on the same database file", async () => {
    bundle.statsStore.recordResult("Persistent Pat", true);
    bundle.dispose();
    // Same db handle simulates re-opening the same file (schema is idempotent).
    const second = createApp({ db, aiThinkDelayMs: 0, reconnectGraceMs: 1000, staticDir: null });
    const res = await request(second.app).get("/api/stats/Persistent Pat");
    expect(res.body).toEqual({ name: "Persistent Pat", gamesPlayed: 1, gamesWon: 1 });
    second.dispose();
  });
});
