import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp, type AppBundle } from "../app.js";

let bundle: AppBundle;

beforeAll(() => {
  bundle = createApp({ staticDir: null });
});
afterAll(() => bundle.dispose());

describe("REST API", () => {
  it("reports health", async () => {
    const res = await request(bundle.app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("creates a room and returns credentials", async () => {
    const res = await request(bundle.app).post("/api/rooms").send({ name: "Ada" });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-Z]{4}$/);
    expect(typeof res.body.playerId).toBe("string");
    expect(typeof res.body.token).toBe("string");
  });

  it("rejects room creation without a name", async () => {
    const res = await request(bundle.app).post("/api/rooms").send({});
    expect(res.status).toBe(400);
  });

  it("joins an existing room and 404s on a missing one", async () => {
    const created = await request(bundle.app).post("/api/rooms").send({ name: "Ada" });
    const code = created.body.code as string;

    const join = await request(bundle.app).post(`/api/rooms/${code}/join`).send({ name: "Bob" });
    expect(join.status).toBe(200);
    expect(join.body.code).toBe(code);
    expect(join.body.playerId).not.toBe(created.body.playerId);

    const summary = await request(bundle.app).get(`/api/rooms/${code}`);
    expect(summary.status).toBe(200);
    expect(summary.body.players).toBe(2);
    expect(summary.body.status).toBe("lobby");

    const missing = await request(bundle.app).post("/api/rooms/ZZZZ/join").send({ name: "X" });
    expect(missing.status).toBe(404);
  });

  it("rejects malformed room codes", async () => {
    const res = await request(bundle.app).get("/api/rooms/12"); // wrong shape
    expect(res.status).toBe(400);
  });
});
