import { Router } from "express";
import { isValidRoomCode } from "../../shared/id.js";
import { NAME_MAX_LENGTH } from "../../shared/protocol.js";
import type { RoomRegistry } from "../rooms/registry.js";

/** REST surface: room creation + join happen here, then STOMP authenticates. */
export function createApiRouter(registry: RoomRegistry): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: registry.roomCount() });
  });

  router.post("/rooms", (req, res) => {
    const name = readName(req.body?.name);
    if (!name) return res.status(400).json({ error: "A name is required" });
    const { room, playerId, token } = registry.createRoom(name);
    res.status(201).json({ code: room.code, playerId, token });
  });

  router.post("/rooms/:code/join", (req, res) => {
    const code = String(req.params.code ?? "").toUpperCase();
    if (!isValidRoomCode(code)) return res.status(400).json({ error: "Invalid room code" });
    const room = registry.getRoom(code);
    if (!room) return res.status(404).json({ error: "Room not found" });
    const name = readName(req.body?.name);
    if (!name) return res.status(400).json({ error: "A name is required" });
    const { playerId, token } = room.addPlayer(name);
    res.status(200).json({ code, playerId, token });
  });

  router.get("/rooms/:code", (req, res) => {
    const code = String(req.params.code ?? "").toUpperCase();
    if (!isValidRoomCode(code)) return res.status(400).json({ error: "Invalid room code" });
    const room = registry.getRoom(code);
    if (!room) return res.status(404).json({ error: "Room not found" });
    const view = room.toView();
    res.json({ code, status: view.status, players: view.players.length });
  });

  return router;
}

function readName(value: unknown): string | null {
  const name = String(value ?? "").trim().slice(0, NAME_MAX_LENGTH);
  return name.length > 0 ? name : null;
}
