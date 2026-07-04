/**
 * Production-path smoke test. Wires up the EXACT production app object
 * (createApp with dist/ static serving + real http.Server + real
 * WebSocketServer), then exercises it end-to-end via fetch and the global
 * WebSocket: REST, static dist serving, SPA fallback, a full human+AI match
 * over the wire, and stats persistence. One process, clean exit — no shell
 * backgrounding (which the dev sandbox reaps between tool calls).
 *
 * Run:  node --import tsx scripts/smoke.mts
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync } from "node:fs";
import path from "node:path";
import { createApp } from "../server/app.js";
import { openDatabase } from "../server/db/index.js";
import { attachWebSocketServer } from "../server/ws/handler.js";

const distDir = path.resolve(process.cwd(), "dist");
if (!existsSync(distDir)) {
  console.error("FAIL: dist/ not found — run `npm run build` first.");
  process.exit(1);
}

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const db = openDatabase(":memory:");
const bundle = createApp({ db, aiThinkDelayMs: 0, reconnectGraceMs: 2000, staticDir: distDir });
const server = http.createServer(bundle.app);
const wss = attachWebSocketServer(server, bundle.registry);

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;
const BASE = `http://127.0.0.1:${port}`;
console.log(`Production app listening on ${BASE} (serving ${distDir})\n`);

try {
  // 1. REST health
  const health = await fetch(`${BASE}/api/health`);
  const healthBody = await health.json();
  check("REST /api/health returns ok", health.status === 200 && healthBody.ok === true, JSON.stringify(healthBody));

  // 2. dist index.html
  const index = await fetch(`${BASE}/`);
  const indexHtml = await index.text();
  check(
    "dist index.html served",
    index.status === 200 && indexHtml.includes("<title>All or Nothing</title>") && indexHtml.includes("/assets/"),
    `status=${index.status}`
  );

  // 3. hashed assets + favicon
  const cssMatch = indexHtml.match(/\/assets\/[^"]+\.css/);
  const jsMatch = indexHtml.match(/\/assets\/[^"]+\.js/);
  const css = cssMatch ? await fetch(`${BASE}${cssMatch[0]}`) : null;
  const js = jsMatch ? await fetch(`${BASE}${jsMatch[0]}`) : null;
  const favicon = await fetch(`${BASE}/favicon.svg`);
  check("hashed CSS asset served", !!css && css.status === 200 && (css.headers.get("content-type") ?? "").includes("css"), cssMatch?.[0]);
  check("hashed JS asset served", !!js && js.status === 200 && (js.headers.get("content-type") ?? "").includes("javascript"), jsMatch?.[0]);
  check("favicon.svg served from public/", favicon.status === 200 && (favicon.headers.get("content-type") ?? "").includes("svg"));

  // 4. SPA fallback: a deep link renders index, not 404
  const deep = await fetch(`${BASE}/room/ABCD`);
  const deepHtml = await deep.text();
  check("SPA fallback serves index for deep links", deep.status === 200 && deepHtml.includes("<title>All or Nothing</title>"), `status=${deep.status}`);

  // 5. REST room lifecycle
  const create = await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Alice" }),
  });
  const created = await create.json();
  check("POST /api/rooms creates a room", create.status === 201 && /^[A-Z]{4}$/.test(created.code), `code=${created.code}`);
  const join = await fetch(`${BASE}/api/rooms/${created.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Bob" }),
  });
  const joined = await join.json();
  check("POST join seats a second player", join.status === 200 && joined.seat === 1 && joined.isSpectator === false, `seat=${joined.seat}`);
  const summary = await fetch(`${BASE}/api/rooms/${created.code}`);
  const summaryBody = await summary.json();
  check("GET room summary reflects 2 players", summary.status === 200 && summaryBody.playerCount === 2, JSON.stringify(summaryBody));
  const bad = await fetch(`${BASE}/api/rooms/nope`);
  const missing = await fetch(`${BASE}/api/rooms/ZZZZ`);
  check("malformed code -> 400, unknown code -> 404", bad.status === 400 && missing.status === 404, `${bad.status}/${missing.status}`);

  // 6. live WebSocket full-match round-trip
  const wsResult = await playFullMatch(BASE, port);
  check("WS full human+AI match played to completion", wsResult.ended, `rounds=${wsResult.rounds}, acted=${wsResult.acted}, winners=[${wsResult.winners}]`);

  // 7. stats persisted for the human who finished a match
  const stats = await fetch(`${BASE}/api/stats/SmokeTester`);
  const statsBody = await stats.json();
  check("aggregate stats recorded after match", stats.status === 200 && statsBody.gamesPlayed === 1, JSON.stringify(statsBody));
} finally {
  wss.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  bundle.dispose();
  db.close();
}

console.log(`\n${failures === 0 ? "ALL SMOKE CHECKS PASSED" : `${failures} SMOKE CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

// ---------------------------------------------------------------------------

interface MatchResult {
  ended: boolean;
  rounds: number;
  acted: number;
  winners: number[];
}

async function playFullMatch(base: string, port: number): Promise<MatchResult> {
  const create = await fetch(`${base}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "SmokeTester", settings: { roundPeak: 2, difficulty: "easy" } }),
  });
  const { code, playerId, token } = await create.json();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?code=${code}&playerId=${playerId}&token=${encodeURIComponent(token)}`);

  return await new Promise<MatchResult>((resolve, reject) => {
    let acted = 0;
    const timer = setTimeout(() => reject(new Error("WS match timed out")), 15000);
    ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "startMatch" })));
    ws.addEventListener("error", (e: any) => {
      clearTimeout(timer);
      reject(new Error(`ws error: ${e?.message ?? e}`));
    });
    ws.addEventListener("message", (ev: MessageEvent) => {
      const m = JSON.parse(String(ev.data));
      if (m.type === "matchEnded") {
        clearTimeout(timer);
        ws.close();
        resolve({ ended: true, rounds: m.match.history.length, acted, winners: m.winners });
        return;
      }
      if (m.type !== "matchState") return;
      const r = m.match.round;
      if (r && r.phase === "bidding" && r.nextBidder === 0) {
        ws.send(JSON.stringify({ type: "bid", amount: r.forbiddenBid === 0 ? 1 : 0 }));
        acted++;
      } else if (r && r.phase === "playing" && r.nextPlayer === 0) {
        const hand = r.yourHand as { rank: string; suit: string }[];
        const lead = r.currentTrick[0]?.card.suit;
        const followers = lead ? hand.filter((c) => c.suit === lead) : hand;
        const card = (followers.length ? followers : hand)[0];
        ws.send(JSON.stringify({ type: "play", cardId: `${card.rank}${card.suit}` }));
        acted++;
      }
    });
  });
}
