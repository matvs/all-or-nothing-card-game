import express, { type Express } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "./env.js";
import { createApiRouter } from "./http/api.js";
import { RaceService } from "./rooms/raceService.js";
import { RoomRegistry, type RegistryOptions } from "./rooms/registry.js";

export interface AppOptions {
  registry?: RoomRegistry;
  registryOptions?: RegistryOptions;
  /** Serve the built frontend from here (default: dist/ in production). */
  staticDir?: string | null;
}

export interface AppBundle {
  app: Express;
  registry: RoomRegistry;
  service: RaceService;
  dispose(): void;
}

export function createApp(options: AppOptions = {}): AppBundle {
  const registry = options.registry ?? new RoomRegistry(options.registryOptions);
  const service = new RaceService(registry);

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use("/api", createApiRouter(registry));

  const staticDir = options.staticDir === undefined ? defaultStaticDir() : options.staticDir;
  if (staticDir) {
    app.use(express.static(staticDir, { index: "index.html", maxAge: "1h" }));
    // SPA fallback for any non-API, non-STOMP GET.
    app.get(/^\/(?!api\/|stomp$).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  return {
    app,
    registry,
    service,
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
