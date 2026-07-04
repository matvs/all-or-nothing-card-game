import http from "node:http";
import { WebSocketServer } from "ws";
import { STOMP_ENDPOINT } from "../shared/protocol.js";
import { createApp, type AppBundle, type AppOptions } from "./app.js";
import { StompServer } from "./stomp/server.js";

export interface BuiltServer {
  httpServer: http.Server;
  wss: WebSocketServer;
  stomp: StompServer;
  bundle: AppBundle;
  dispose(): void;
}

/**
 * Assemble the full server (HTTP + STOMP-over-WebSocket) without listening.
 * index.ts listens on the configured port; tests listen on an ephemeral one.
 */
export function buildServer(options: AppOptions = {}): BuiltServer {
  const bundle = createApp(options);
  const httpServer = http.createServer(bundle.app);
  const wss = new WebSocketServer({ server: httpServer, path: STOMP_ENDPOINT, maxPayload: 64 * 1024 });
  const stomp = new StompServer(wss, bundle.service.handlers());
  bundle.service.setStomp(stomp);

  return {
    httpServer,
    wss,
    stomp,
    bundle,
    dispose() {
      wss.close();
      bundle.dispose();
    },
  };
}
