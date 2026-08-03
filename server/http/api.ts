import { Router } from "express";
import {
  type CreateRoomRequest,
  type JoinRoomRequest,
  type LoginRequest,
} from "../../shared/protocol.js";
import type { RoomRegistry } from "../rooms/registry.js";
import { authenticate, enduserAuthConfig, registerUrlFor, type AuthOutcome } from "./enduserAuth.js";

export interface ApiDeps {
  /** Injectable for tests — production authenticates against the central IdP. */
  authenticate?: (username: string, password: string) => Promise<AuthOutcome>;
}

/**
 * REST surface, mounted under /api. Everything else (realtime gameplay, chat,
 * voice signalling) runs over a native WebSocket. Same-origin in production, so there is
 * no CORS to configure.
 */
export function createApiRouter(registry: RoomRegistry, deps: ApiDeps = {}): Router {
  const router = Router();
  const cfg = enduserAuthConfig();
  const doAuth = deps.authenticate ?? ((u: string, p: string) => authenticate(cfg, u, p));

  router.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: registry.roomCount });
  });

  // The login modal asks where account creation lives (Keycloak's account console).
  router.get("/auth/config", (_req, res) => {
    res.json({ registerUrl: registerUrlFor(cfg) });
  });

  // Real sign-in: credentials are checked at the central IdP and the display name is the
  // VERIFIED identity's — the old free-form nickname login is gone. Only then does the
  // game mint its session token (the socket credential), so playing requires an account.
  router.post("/login", (req, res) => {
    const { username, password } = (req.body ?? {}) as Partial<LoginRequest>;
    if (typeof username !== "string" || !username.trim() || typeof password !== "string" || !password) {
      res.status(400).json({ error: true, errorCode: "missingCredentials", message: "Username and password are required." });
      return;
    }
    void doAuth(username.trim(), password).then((outcome) => {
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: true, errorCode: "authFailed", message: outcome.message });
        return;
      }
      const identity = registry.createPlayer(outcome.name);
      res.json({ id: identity.id, name: identity.name, token: identity.token });
    });
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
