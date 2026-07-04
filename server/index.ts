import { buildServer } from "./build.js";
import { env } from "./env.js";

const built = buildServer();

built.httpServer.listen(env.port, () => {
  const mode = env.isProduction
    ? "production (serving dist/)"
    : "development (frontend via Vite dev server)";
  console.log(
    `[all-or-nothing SET] ${mode} — http://127.0.0.1:${env.port} (native WebSocket realtime, chat + WebRTC voice signalling)`,
  );
});

function shutdown(signal: string): void {
  console.log(`[all-or-nothing SET] ${signal} received, shutting down…`);
  built.dispose();
  built.httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
