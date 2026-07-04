import { beforeEach, describe, expect, it } from "vitest";
import { isValidRoomCode } from "../../../shared/id.js";
import { RoomRegistry } from "../registry.js";

describe("RoomRegistry players", () => {
  let reg: RoomRegistry;
  beforeEach(() => {
    reg = new RoomRegistry({ seedRooms: [] });
  });

  it("creates a player with an id and a reconnect token", () => {
    const p = reg.createPlayer("Alice");
    expect(p.name).toBe("Alice");
    expect(p.id).toBeTruthy();
    expect(p.token).toBeTruthy();
    expect(reg.playerByToken(p.token)).toEqual(p);
  });

  it("returns undefined for an unknown or missing token", () => {
    expect(reg.playerByToken("nope")).toBeUndefined();
    expect(reg.playerByToken(undefined)).toBeUndefined();
  });

  it("resolves a handshake identity by token", () => {
    const p = reg.createPlayer("Bob");
    expect(reg.resolveIdentity({ token: p.token, playerId: p.id })).toEqual(p);
    expect(reg.resolveIdentity({ token: "bad", playerId: p.id })).toBeUndefined();
  });
});

describe("RoomRegistry rooms", () => {
  let reg: RoomRegistry;
  beforeEach(() => {
    reg = new RoomRegistry({ seedRooms: [] });
  });

  it("creates a named room", () => {
    expect(reg.createRoom("LOBBY")).toEqual({ id: "LOBBY" });
    expect(reg.roomCount).toBe(1);
  });

  it("rejects a duplicate room name", () => {
    reg.createRoom("LOBBY");
    expect(reg.createRoom("LOBBY")).toMatchObject({ error: true, errorCode: "alreadyExists" });
  });

  it("generates a valid random code when no name is given", () => {
    const res = reg.createRoom();
    expect("error" in res).toBe(false);
    if (!("error" in res)) expect(isValidRoomCode(res.id)).toBe(true);
  });

  it("rejects a forbidden or over-long room name", () => {
    expect(reg.createRoom("fuck")).toMatchObject({ error: true, errorCode: "invalidName" });
    expect(reg.createRoom("x".repeat(21))).toMatchObject({ error: true, errorCode: "invalidName" });
  });

  it("getOrCreateRoom creates once then returns the same instance", () => {
    const a = reg.getOrCreateRoom("Z");
    const b = reg.getOrCreateRoom("Z");
    expect(a).toBe(b);
    expect(reg.roomCount).toBe(1);
  });

  it("getRoom is undefined for an unknown room; deleteRoom removes", () => {
    expect(reg.getRoom("ghost")).toBeUndefined();
    reg.createRoom("TEMP");
    reg.deleteRoom("TEMP");
    expect(reg.getRoom("TEMP")).toBeUndefined();
    expect(reg.roomCount).toBe(0);
  });

  it("seeds requested demo rooms", () => {
    const seeded = new RoomRegistry({ seedRooms: ["demo", "party"] });
    expect(seeded.getRoom("demo")).toBeDefined();
    expect(seeded.getRoom("party")).toBeDefined();
    expect(seeded.roomCount).toBe(2);
  });
});
