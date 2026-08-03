import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";

function makeApp(): Express {
  // IdP auth is stubbed: "pw" is the only good password, and the verified table name is
  // always the account's ("Alice"/"Bob" by username) — never free-form input.
  return createApp({
    staticDir: null,
    registryOptions: { seedRooms: [] },
    apiDeps: {
      authenticate: async (username: string, password: string) =>
        password === "pw"
          ? { ok: true as const, name: username === "bob" ? "Bob" : "Alice" }
          : { ok: false as const, status: 401, message: "Invalid username or password." },
    },
  }).app;
}

describe("REST API", () => {
  let app: Express;
  beforeEach(() => {
    app = makeApp();
  });

  it("GET /api/health reports ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it("POST /api/login authenticates real credentials and returns the VERIFIED identity + token", async () => {
    const res = await request(app).post("/api/login").send({ username: "alice", password: "pw" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Alice" });
    expect(res.body.id).toBeTruthy();
    expect(res.body.token).toBeTruthy();
  });

  it("POST /api/login rejects missing credentials — no anonymous play", async () => {
    const res = await request(app).post("/api/login").send({ username: "alice" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: true, errorCode: "missingCredentials" });
  });

  it("POST /api/login rejects bad credentials with the IdP's status", async () => {
    const res = await request(app).post("/api/login").send({ username: "alice", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: true, errorCode: "authFailed" });
  });

  it("POST /api/welcome restores a session for a known token", async () => {
    const login = await request(app).post("/api/login").send({ username: "bob", password: "pw" });
    const res = await request(app).post("/api/welcome").send({ token: login.body.token });
    expect(res.body).toMatchObject({ foundSession: true });
    expect(res.body.player).toMatchObject({ name: "Bob" });
  });

  it("POST /api/welcome reports no session for an unknown token", async () => {
    const res = await request(app).post("/api/welcome").send({ token: "nope" });
    expect(res.body).toEqual({ foundSession: false });
  });

  it("POST /api/rooms creates a named room and rejects a duplicate", async () => {
    const first = await request(app).post("/api/rooms").send({ roomId: "ROOMX" });
    expect(first.body).toEqual({ id: "ROOMX" });
    const dup = await request(app).post("/api/rooms").send({ roomId: "ROOMX" });
    expect(dup.body).toMatchObject({ error: true, errorCode: "alreadyExists" });
  });

  it("POST /api/rooms with no name returns a generated code", async () => {
    const res = await request(app).post("/api/rooms").send({});
    expect(res.body.id).toMatch(/^[A-Z]{4}$/);
  });

  it("POST /api/rooms/join validates existence", async () => {
    await request(app).post("/api/rooms").send({ roomId: "ROOMX" });
    const ok = await request(app).post("/api/rooms/join").send({ roomId: "ROOMX" });
    expect(ok.body).toMatchObject({ id: "ROOMX" });
    expect(Array.isArray(ok.body.players)).toBe(true);

    const missing = await request(app).post("/api/rooms/join").send({ roomId: "ghost" });
    expect(missing.body).toMatchObject({ error: true, errorCode: "roomDoesNotExist" });
  });
});
