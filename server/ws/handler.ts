import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { isValidRoomCode } from "../../shared/id.js";
import { WS_PATH, type ClientMessage } from "../../shared/protocol.js";
import type { RoomRegistry } from "../rooms/registry.js";

interface SocketContext {
  code: string;
  playerId: string;
}

/**
 * Attaches the realtime layer to an existing HTTP server. Clients connect to
 *   /ws?code=ABCD&playerId=...&token=...
 * where playerId+token come from the REST create/join call. The token is the
 * reconnection credential: it proves seat ownership across socket drops.
 */
export function attachWebSocketServer(server: HttpServer, registry: RoomRegistry): WebSocketServer {
  const wss = new WebSocketServer({ server, path: WS_PATH, maxPayload: 32 * 1024 });

  wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const code = (url.searchParams.get("code") ?? "").toUpperCase();
    const playerId = url.searchParams.get("playerId") ?? "";
    const token = url.searchParams.get("token") ?? "";

    if (!isValidRoomCode(code) || !playerId || !token) {
      closeWithError(socket, "BAD_HANDSHAKE", "Connect with ?code=XXXX&playerId=...&token=...");
      return;
    }
    const room = registry.getRoom(code);
    if (!room) {
      closeWithError(socket, "ROOM_NOT_FOUND", `No room with code ${code}.`);
      return;
    }
    const attached = room.attachSocket(playerId, token, socket);
    if (!attached.ok) {
      closeWithError(socket, "REJECTED", attached.reason);
      return;
    }
    registry.markActive(code);
    const ctx: SocketContext = { code, playerId };
    room.sendWelcome(playerId, attached.seat, attached.isSpectator);

    socket.on("message", (raw) => handleMessage(registry, ctx, socket, raw.toString()));
    socket.on("close", () => {
      // Only treated as a disconnect if the room still maps this player to THIS
      // socket (a reconnect may already have attached a fresh one).
      registry.getRoom(ctx.code)?.handleDisconnectIfCurrent(ctx.playerId, socket);
    });
    socket.on("error", () => {
      /* close event follows; nothing to do */
    });
  });

  return wss;
}

function handleMessage(registry: RoomRegistry, ctx: SocketContext, socket: WebSocket, raw: string): void {
  const room = registry.getRoom(ctx.code);
  if (!room) return;
  registry.markActive(ctx.code);

  let message: ClientMessage;
  try {
    message = JSON.parse(raw) as ClientMessage;
  } catch {
    socket.send(JSON.stringify({ type: "error", code: "BAD_JSON", message: "Messages must be JSON." }));
    return;
  }

  switch (message.type) {
    case "bid":
      room.handleBid(ctx.playerId, Number(message.amount));
      break;
    case "play":
      room.handlePlay(ctx.playerId, String(message.cardId));
      break;
    case "chat":
      room.handleChat(ctx.playerId, String(message.text ?? ""));
      break;
    case "startMatch": {
      const result = room.startMatch(ctx.playerId);
      if (!result.ok) room.sendError(ctx.playerId, "CANNOT_START", result.error);
      break;
    }
    case "updateSettings": {
      const result = room.updateSettings(ctx.playerId, message.settings ?? {});
      if (!result.ok) room.sendError(ctx.playerId, "CANNOT_UPDATE", result.error);
      break;
    }
    case "leaveRoom":
      room.leave(ctx.playerId);
      try {
        socket.close(1000, "left");
      } catch {
        /* already closing */
      }
      break;
    case "requestState":
      room.sendWelcome(ctx.playerId, room.seatIndexForPlayer(ctx.playerId), room.seatIndexForPlayer(ctx.playerId) === null);
      break;
    default:
      socket.send(JSON.stringify({ type: "error", code: "UNKNOWN_TYPE", message: "Unrecognized message type." }));
  }
}

function closeWithError(socket: WebSocket, code: string, message: string): void {
  try {
    socket.send(JSON.stringify({ type: "error", code, message }));
  } finally {
    socket.close(4000, code);
  }
}
