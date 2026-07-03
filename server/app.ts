import express, { type Express } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { createStatsStore, type StatsStore } from "./db/stats.js";
import { env } from "./env.js";
import { createApiRouter } from "./http/api.js";
import { RoomRegistry } from "./rooms/registry.js";

export interface AppBundle {
  app: Express;
  registry: RoomRegistry;
  statsStore: StatsStore;
  dispose(): void;
}

export interface AppOptions {
  db: Database;
  aiThinkDelayMs?: number;
  reconnectGraceMs?: number;
  /** Serve the built frontend from this directory (production). */
  staticDir?: string | null;
}

export function createApp(options: AppOptions): AppBundle {
  const statsStore = createStatsStore(options.db);
  const registry = new RoomRegistry({
    statsStore,
    aiThinkDelayMs: options.aiThinkDelayMs ?? env.aiThinkDelayMs,
    reconnectGraceMs: options.reconnectGraceMs ?? env.reconnectGraceSeconds * 1000,
  });

  const app = express();
  app.disable("x-powered-by");
  app.use("/api", createApiRouter(registry, statsStore));

  const staticDir = options.staticDir === undefined ? defaultStaticDir() : options.staticDir;
  if (staticDir) {
    app.use(express.static(staticDir, { index: "index.html", maxAge: "1h" }));
    // SPA fallback: any non-API, non-ws GET renders the app shell.
    app.get(/^\/(?!api\/|ws$).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  return {
    app,
    registry,
    statsStore,
    dispose() {
      registry.dispose();
    },
  };
}

function defaultStaticDir(): string | null {
  if (!env.isProduction) return null;
  const dist = path.resolve(process.cwd(), "dist");
  return existsSync(dist) ? dist : null;
}
