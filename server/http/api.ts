import { Router } from "express";
import {
  type CreateRoomRequest,
  type JoinRoomRequest,
  type LoginRequest,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
} from "../../shared/protocol.js";
import type { RoomRegistry } from "../rooms/registry.js";

const FORBIDDEN_NAMES = new Set(["kurwa", "dick", "fuck", "cyril"]);

function validName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.trim().length >= NAME_MIN_LENGTH &&
    name.trim().length <= NAME_MAX_LENGTH &&
    !FORBIDDEN_NAMES.has(name.trim().toLowerCase())
  );
}

/**
 * REST surface, mounted under /api. Everything else (realtime gameplay, chat,
 * voice signalling) runs over Socket.IO. Same-origin in production, so there is
 * no CORS to configure.
 */
export function createApiRouter(registry: RoomRegistry): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: registry.roomCount });
  });

  router.post("/login", (req, res) => {
    const { name } = req.body as LoginRequest;
    if (!validName(name)) {
      res.status(400).json({ error: true, errorCode: "invalidName" });
      return;
    }
    const identity = registry.createPlayer(name.trim());
    res.json({ id: identity.id, name: identity.name, token: identity.token });
  });

  router.post("/welcome", (req, res) => {
    const { token } = (req.body ?? {}) as { token?: string };
    const identity = registry.playerByToken(token);
    if (identity) {
      res.json({ foundSession: true, player: identity });
      return;
    }
    res.json({ foundSession: false });
  });

  router.post("/rooms", (req, res) => {
    const { roomId } = (req.body ?? {}) as CreateRoomRequest;
    res.json(registry.createRoom(roomId));
  });

  router.post("/rooms/join", (req, res) => {
    const { roomId } = (req.body ?? {}) as JoinRoomRequest;
    const room = roomId ? registry.getRoom(roomId) : undefined;
    if (room && room.active) {
      res.json({ id: room.id, players: room.roster() });
      return;
    }
    res.json({ id: roomId, error: true, errorCode: "roomDoesNotExist" });
  });

  return router;
}
