import { createServer, type Server as HttpServer } from "node:http";
import { Server as IoServer } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "../shared/protocol.js";
import { type AppOptions, createApp } from "./app.js";
import type { RoomRegistry } from "./rooms/registry.js";
import { SocketGateway } from "./socket.js";

export interface BuiltServer {
  httpServer: HttpServer;
  io: IoServer<ClientToServerEvents, ServerToClientEvents>;
  registry: RoomRegistry;
  gateway: SocketGateway;
  dispose(): void;
}

/**
 * Assemble the whole backend: Express (REST + static) + Socket.IO on the same
 * HTTP server and port. In production the browser hits one origin for the app,
 * the API and the WebSocket alike.
 */
export function buildServer(options: AppOptions = {}): BuiltServer {
  const { app, registry } = createApp(options);
  const httpServer = createServer(app);

  const io = new IoServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    // Same-origin in prod; in dev the Vite proxy forwards /socket.io here, so no
    // CORS is needed. Allow it explicitly only for local cross-port testing.
    cors: process.env.NODE_ENV === "production" ? undefined : { origin: true, credentials: true },
    maxHttpBufferSize: 1e6,
  });

  const gateway = new SocketGateway(io, registry);

  return {
    httpServer,
    io,
    registry,
    gateway,
    dispose() {
      gateway.dispose();
      io.close();
      registry.dispose();
    },
  };
}
