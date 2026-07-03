import http from "node:http";
import { createApp } from "./app.js";
import { getDb } from "./db/index.js";
import { env } from "./env.js";
import { attachWebSocketServer } from "./ws/handler.js";

const bundle = createApp({ db: getDb() });
const server = http.createServer(bundle.app);
const wss = attachWebSocketServer(server, bundle.registry);

server.listen(env.port, () => {
  console.log(
    `[all-or-nothing] ${env.nodeEnv} server listening on http://127.0.0.1:${env.port} ` +
      `(ws at /ws, db at ${env.dbPath}${env.isProduction ? ", serving dist/" : ", frontend via Vite dev server"})`
  );
});

function shutdown(signal: string): void {
  console.log(`[all-or-nothing] ${signal} received, shutting down...`);
  bundle.dispose();
  wss.close();
  server.close(() => process.exit(0));
  // Hard exit if sockets refuse to drain in time.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
