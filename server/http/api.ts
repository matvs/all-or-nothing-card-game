import { Router, json, type Request, type Response } from "express";
import { isValidRoomCode } from "../../shared/id.js";
import type {
  ApiErrorResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  RoomSummaryResponse,
  StatsResponse,
} from "../../shared/protocol.js";
import type { StatsStore } from "../db/stats.js";
import type { RoomRegistry } from "../rooms/registry.js";
import { sanitizeName } from "../util.js";

function badRequest(res: Response, error: string): void {
  const body: ApiErrorResponse = { error };
  res.status(400).json(body);
}

function notFound(res: Response, error: string): void {
  const body: ApiErrorResponse = { error };
  res.status(404).json(body);
}

export function createApiRouter(registry: RoomRegistry, statsStore: StatsStore): Router {
  const router = Router();
  router.use(json({ limit: "16kb" }));

  router.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: registry.roomCount(), uptime: Math.round(process.uptime()) });
  });

  router.post("/rooms", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as CreateRoomRequest;
    const name = sanitizeName(body.name);
    const settings = typeof body.settings === "object" && body.settings !== null ? body.settings : undefined;
    const { room, playerId, token } = registry.createRoom(name, settings);
    const response: CreateRoomResponse = { code: room.code, playerId, token };
    res.status(201).json(response);
  });

  router.get("/rooms/:code", (req: Request, res: Response) => {
    const code = String(req.params.code ?? "").toUpperCase();
    if (!isValidRoomCode(code)) return badRequest(res, "Room codes are 4 letters, e.g. ABCD.");
    const room = registry.getRoom(code);
    if (!room) return notFound(res, `No room with code ${code}.`);
    const response: RoomSummaryResponse = {
      code: room.code,
      phase: room.phase,
      playerCount: room.humanCount(),
      spectatorCount: room.spectators.size,
      full: room.isFull(),
      settings: room.settings,
    };
    res.json(response);
  });

  router.post("/rooms/:code/join", (req: Request, res: Response) => {
    const code = String(req.params.code ?? "").toUpperCase();
    if (!isValidRoomCode(code)) return badRequest(res, "Room codes are 4 letters, e.g. ABCD.");
    const room = registry.getRoom(code);
    if (!room) return notFound(res, `No room with code ${code}. Check the code with whoever created it.`);
    const body = (req.body ?? {}) as JoinRoomRequest;
    const name = sanitizeName(body.name);
    const joined = room.join(name, { asSpectator: body.asSpectator === true });
    registry.markActive(code);
    const response: JoinRoomResponse = {
      code: room.code,
      playerId: joined.playerId,
      token: joined.token,
      seat: joined.seat,
      isSpectator: joined.isSpectator,
    };
    res.status(200).json(response);
  });

  router.get("/stats/top", (_req: Request, res: Response) => {
    res.json(statsStore.getTopStats(20));
  });

  router.get("/stats/:name", (req: Request, res: Response) => {
    const name = sanitizeName(req.params.name);
    const stats: StatsResponse = statsStore.getStats(name);
    res.json(stats);
  });

  return router;
}
