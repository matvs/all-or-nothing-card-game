import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketAuth,
} from "../../shared/protocol.js";

export type AppClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppClientSocket | null = null;

/**
 * Connect (once) to the Socket.IO server with the player's identity in the
 * handshake auth so the server can restore their seat + score on reconnect.
 * Returns the shared singleton; safe to call repeatedly.
 */
export function connectSocket(auth: SocketAuth): AppClientSocket {
  if (socket) {
    socket.auth = auth as unknown as Record<string, unknown>;
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io({
    auth: auth as unknown as Record<string, unknown>,
    autoConnect: true,
    // Resilient reconnection: keep trying so a dropped player comes back with
    // their token and the server re-seats them.
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });
  return socket;
}

export function getSocket(): AppClientSocket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
