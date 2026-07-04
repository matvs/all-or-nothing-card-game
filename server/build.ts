import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import { type AppOptions, createApp } from "./app.js";
import type { RoomRegistry } from "./rooms/registry.js";
import { WsGateway } from "./socket.js";

export interface BuiltServer {
  httpServer: HttpServer;
  wss: WebSocketServer;
  registry: RoomRegistry;
  gateway: WsGateway;
  dispose(): void;
}

/**
 * Assemble the whole backend: Express (REST + static) + a NATIVE WebSocket
 * server (the `ws` library) on the same HTTP server and port, upgrading only at
 * `/ws`. In production the browser hits one origin for the app, the API and the
 * WebSocket alike — no Socket.IO, no CORS.
 */
export function buildServer(options: AppOptions = {}): BuiltServer {
  const { app, registry } = createApp(options);
  const httpServer = createServer(app);

  // maxPayload caps a single frame (defence against oversized messages).
  const wss = new WebSocketServer({ server: httpServer, path: "/ws", maxPayload: 1e6 });
  const gateway = new WsGateway(wss, registry);

  return {
    httpServer,
    wss,
    registry,
    gateway,
    dispose() {
      gateway.dispose();
      wss.close();
      registry.dispose();
    },
  };
}
