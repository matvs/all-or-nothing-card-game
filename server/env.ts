import { existsSync } from "node:fs";
import path from "node:path";

// Load a local .env file if present (dev convenience). Node 20.6+/22+ ships
// process.loadEnvFile natively, so we avoid a dotenv dependency entirely.
const dotEnvPath = path.resolve(process.cwd(), ".env");
if (existsSync(dotEnvPath)) {
  try {
    process.loadEnvFile(dotEnvPath);
  } catch {
    // Non-fatal: fall back to whatever is already in process.env.
  }
}

function int(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  port: int(process.env.PORT, 8462),
  dbPath: process.env.DB_PATH ?? "./data/allornothing.sqlite3",
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: (process.env.NODE_ENV ?? "development") === "production",
  reconnectGraceSeconds: int(process.env.RECONNECT_GRACE_SECONDS, 60),
  /** Simulated AI "thinking" delay in ms; set to 0 in tests for speed. */
  aiThinkDelayMs: int(process.env.AI_THINK_DELAY_MS, 550),
};
