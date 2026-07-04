# Runbook — all-or-nothing

## What is this
"All or Nothing" is a trick-taking bidding card game: bid *exactly* how many
tricks you will take, and miss by even one (over or under) to score nothing.
It ships as one Node service that serves a Vite/TypeScript frontend plus a
REST + WebSocket API. Play solo against three AI opponents (three difficulty
levels, all in-browser) or open a 4-letter room code for realtime multiplayer
with AI fill-ins, reconnection grace, spectators, per-room chat and persistent
win/loss stats. There is **no LLM** anywhere — the AI is pure heuristic
TypeScript — so ORCHESTRATION.md §4 (AI provider adapter) does not apply.

## Prerequisites
- **Local:** Node 20+ (Node 24 tested) and npm. Native `better-sqlite3` builds
  during `npm install` (needs python3 + a C++ toolchain; already present on
  this dev box and installed inside the Docker builder stage).
- **Droplet:** Docker Engine + docker compose v2, host nginx + certbot, DNS
  control over `matvs.dev`. No database server needed (SQLite).

## Run locally (dev)
```bash
npm install                 # first time; compiles better-sqlite3

# Two processes at once (Vite on :5173 proxying /api + /ws to the API on :8462):
npm run dev
#   → open http://localhost:5173

# …or run them separately:
npm run dev:web             # Vite dev server on :5173
npm run dev:server          # API + WS on :8462 (tsx watch)
```
Environment variables (all optional locally; see `.env.example`):
| var | meaning | default |
|---|---|---|
| `PORT` | HTTP+WS port | `8462` |
| `DB_PATH` | SQLite file (stats) | `./data/allornothing.sqlite3` |
| `NODE_ENV` | `production` serves built `dist/`; else expects Vite dev | `development` |
| `RECONNECT_GRACE_SECONDS` | disconnect → AI-takeover window | `60` |
| `AI_THINK_DELAY_MS` | AI "thinking" pause before it acts (ms) | `550` |

Tests / checks (no network, no external services — safe in the sandbox):
```bash
npm test          # 214 unit + integration tests (engine, AI legality, server, ws)
npm run typecheck # tsc --noEmit, strict
npm run build     # Vite production bundle → dist/
npm run smoke     # end-to-end prod-path check (needs a prior `npm run build`)
```

## Run locally (docker)
```bash
docker compose up -d --build
#   → open http://127.0.0.1:8462   (frontend, API and WS all on one port)
docker compose logs -f app
docker compose down                # add -v to also wipe the stats volume
```
Click "Deal me in" for a solo game, or "Open a room" and share the 4-letter
code with a second browser/tab to test multiplayer.

## Deploy to DigitalOcean droplet
1. **DNS A record:** point `allornothing.matvs.dev` → droplet IP (same A-record
   pattern as the other apps).
2. **Ship the release** to `/opt/allornothing`:
   ```bash
   rsync -az --delete --exclude node_modules --exclude dist --exclude data \
     ./ root@<droplet>:/opt/allornothing/
   # (or: git clone/pull the repo into /opt/allornothing)
   ```
3. **.env** — none is strictly required (compose sets everything), but to
   override defaults create `/opt/allornothing/.env`:
   ```
   PORT=8462                       # keep in sync with compose + nginx if changed
   DB_PATH=/data/allornothing.sqlite3   # inside the container; volume-backed
   NODE_ENV=production             # serve dist/
   RECONNECT_GRACE_SECONDS=60      # reconnection window before AI takes a seat
   AI_THINK_DELAY_MS=600           # AI pacing (ms) so humans can follow the play
   ```
4. **Build & start:**
   ```bash
   cd /opt/allornothing
   docker compose up -d --build
   docker compose ps              # app should be "healthy" within ~10s
   ```
5. **nginx vhost + TLS:**
   ```bash
   sudo cp nginx/allornothing.matvs.dev.conf /etc/nginx/sites-available/
   sudo ln -s /etc/nginx/sites-available/allornothing.matvs.dev.conf /etc/nginx/sites-enabled/
   sudo certbot --nginx -d allornothing.matvs.dev
   sudo nginx -t && sudo systemctl reload nginx
   ```
6. **Smoke test:**
   ```bash
   curl -s https://allornothing.matvs.dev/api/health          # {"ok":true,...}
   curl -sI https://allornothing.matvs.dev/ | grep -i content-type   # text/html
   # In a browser: open the site, "Deal me in", play a hand; open a room and
   # join it from a second device to confirm WebSocket play + reconnection.
   ```

## Operations
- **Logs:** `docker compose logs -f app` (or `--since 1h`). Startup prints the
  bound port, DB path, and whether it is serving `dist/`.
- **Backup** (the only stateful thing is the SQLite stats DB in the named
  volume). One-liner, safe while running (uses SQLite's online backup):
  ```bash
  docker compose exec -T app node -e "const D=require('better-sqlite3');const d=new D(process.env.DB_PATH);d.backup('/data/backup-'+Date.now()+'.sqlite3').then(()=>{console.log('ok');process.exit(0)})"
  # copy it out of the volume:
  docker cp allornothing:/data/. /opt/allornothing/backups/
  ```
  Cron (daily 03:30, keep 14 days):
  ```
  30 3 * * * cd /opt/allornothing && docker compose exec -T app sh -c 'cp "$DB_PATH" /data/backup-$(date +\%F).sqlite3' && find /opt/allornothing/backups -name 'backup-*.sqlite3' -mtime +14 -delete
  ```
- **Restore:** stop the app, drop the backup file in as the DB, restart:
  ```bash
  docker compose stop app
  docker cp ./backups/backup-YYYY-MM-DD.sqlite3 allornothing:/data/allornothing.sqlite3
  docker compose start app
  ```
- **Upgrade:** ship the new code, then `docker compose up -d --build` (the data
  volume persists across rebuilds). Zero-downtime is unnecessary for a game;
  the rebuild swaps in a few seconds.
- **Rollback:** `git checkout <previous-tag>` (or previous release dir) and
  `docker compose up -d --build`. The stats DB schema is additive/idempotent,
  so older code reads it fine.

## Troubleshooting
1. **`better-sqlite3` fails to build** (local or in the image): ensure
   python3 + make + g++ are available. The Docker builder installs them; if a
   local `npm install` fails, install build tools or use the container.
   In this dev sandbox the npm cache is read-only — prefix installs with
   `npm_config_cache="$TMPDIR/npm-cache"`.
2. **WebSocket won't connect / games freeze at "reconnecting…"**: the nginx
   `/ws` block must send `Upgrade`/`Connection` headers (it does in the shipped
   vhost). Verify `map $http_upgrade $connection_upgrade` is present and
   `proxy_read_timeout` is generous. Check `docker compose logs app` for the
   handshake and confirm the container is healthy.
3. **Blank page / 404 on assets**: the image must contain a fresh `dist/`.
   Rebuild with `docker compose up -d --build`; confirm `NODE_ENV=production`
   (only then does the server serve `dist/` and the SPA fallback).
4. **Stats not persisting across restarts**: confirm the `allornothing_data`
   volume is mounted and `DB_PATH` points inside it (`/data/...`). `docker
   compose down` (without `-v`) keeps the volume; `-v` deletes it.
5. **Port already in use**: something else holds `8462`. Change `PORT` in the
   compose env **and** the nginx `proxy_pass`, then rebuild + reload nginx.
