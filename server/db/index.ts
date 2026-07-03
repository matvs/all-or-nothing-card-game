import DatabaseConstructor, { type Database } from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { env } from "../env.js";

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS player_stats (
     name TEXT PRIMARY KEY,
     games_played INTEGER NOT NULL DEFAULT 0,
     games_won INTEGER NOT NULL DEFAULT 0,
     updated_at TEXT NOT NULL
   )`,
];

export function openDatabase(dbPath: string = env.dbPath): Database {
  if (dbPath !== ":memory:") {
    const dir = path.dirname(dbPath);
    mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseConstructor(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  for (const migration of MIGRATIONS) {
    db.exec(migration);
  }
  return db;
}

let sharedDb: Database | null = null;

/** Process-wide singleton for the server's own use; tests open their own instances. */
export function getDb(): Database {
  if (!sharedDb) sharedDb = openDatabase();
  return sharedDb;
}
