import type { Database } from "better-sqlite3";
import type { StatsResponse } from "../../shared/protocol.js";

export interface StatsStore {
  recordResult(name: string, won: boolean): void;
  getStats(name: string): StatsResponse;
  getTopStats(limit?: number): StatsResponse[];
}

export function createStatsStore(db: Database): StatsStore {
  const upsert = db.prepare(`
    INSERT INTO player_stats (name, games_played, games_won, updated_at)
    VALUES (@name, 1, @won, @now)
    ON CONFLICT(name) DO UPDATE SET
      games_played = games_played + 1,
      games_won = games_won + @won,
      updated_at = @now
  `);
  const selectOne = db.prepare(`SELECT name, games_played, games_won FROM player_stats WHERE name = ?`);
  const selectTop = db.prepare(
    `SELECT name, games_played, games_won FROM player_stats ORDER BY games_won DESC, games_played DESC LIMIT ?`
  );

  function toResponse(row: { name: string; games_played: number; games_won: number } | undefined, name: string): StatsResponse {
    if (!row) return { name, gamesPlayed: 0, gamesWon: 0 };
    return { name: row.name, gamesPlayed: row.games_played, gamesWon: row.games_won };
  }

  return {
    recordResult(name: string, won: boolean) {
      upsert.run({ name, won: won ? 1 : 0, now: new Date().toISOString() });
    },
    getStats(name: string) {
      return toResponse(selectOne.get(name) as any, name);
    },
    getTopStats(limit = 10) {
      const rows = selectTop.all(limit) as { name: string; games_played: number; games_won: number }[];
      return rows.map((r) => toResponse(r, r.name));
    },
  };
}
