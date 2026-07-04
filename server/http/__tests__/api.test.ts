import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";

function makeApp(): Express {
  return createApp({ staticDir: null, registryOptions: { seedRooms: [] } }).app;
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

  it("POST /api/login accepts a valid name and returns an identity + token", async () => {
    const res = await request(app).post("/api/login").send({ name: "Alice" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Alice" });
    expect(res.body.id).toBeTruthy();
    expect(res.body.token).toBeTruthy();
  });

  it("POST /api/login rejects a too-short name", async () => {
    const res = await request(app).post("/api/login").send({ name: "ab" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: true, errorCode: "invalidName" });
  });

  it("POST /api/login rejects a forbidden name", async () => {
    const res = await request(app).post("/api/login").send({ name: "fuck" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: true, errorCode: "invalidName" });
  });

  it("POST /api/welcome restores a session for a known token", async () => {
    const login = await request(app).post("/api/login").send({ name: "Bob" });
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
