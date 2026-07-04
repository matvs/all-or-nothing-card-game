# Runbook — all-or-nothing-card-game (SET)

## What is this
A SET card game: find sets of three cards where, for each of four attributes
(colour, shape, number, shading), the three cards are all the same or all
different. Canvas-rendered card tiles in a Material Design 3 interface. Two
ways to play: **solo** (relaxed or timed, three difficulties, hints,
localStorage high scores) and a real-time **multiplayer race** where everyone
competes on the same board — first to claim a valid set scores it and three
fresh cards drop in. Realtime transport is **STOMP over WebSocket**. One Node
service serves the built frontend, the REST API and the STOMP endpoint on a
single port, same-origin. Stateless: rooms are in-memory, solo scores live in
the browser. No database, no AI.

## Prerequisites
- Local: Node >= 20 (developed on 24), npm. No native modules, no DB.
- Droplet: Docker Engine + docker compose v2, host nginx + certbot, DNS access
  for `matvs.dev` (see apps/ORCHESTRATION.md and apps/DEPLOYMENT-WSL2.md).

## Run locally (dev)
Two processes (Vite for HMR + the API/STOMP server); Vite proxies `/api` and
`/stomp` to the server so the browser stays same-origin (no CORS).

```bash
npm install                 # first time (if the npm cache is read-only: npm install --cache "$TMPDIR/npmcache")
npm run dev                 # vite on :5173 + tsx server on :8462
# open http://localhost:5173
```

Individually:
```bash
npm run dev:web             # vite dev server (:5173)
npm run dev:server          # tsx watch server/index.ts (:8462)
```

Tests / typecheck / build:
```bash
npm test                    # 44 unit + integration tests (engine + server + STOMP e2e)
npm run typecheck           # tsc --noEmit
npm run build               # vite build -> dist/
```

Optional visual check (uses the sandbox chrome-headless-shell):
```bash
npm run build && npm run preview &                   # prod server on :8462 serving dist/
SHOT_URL=http://127.0.0.1:8462 npm run screenshot    # writes PNGs to $TMPDIR/set-shots
```

## Run locally (docker)
```bash
docker compose up -d --build
# open http://localhost:8462   (WSL2 forwards localhost to the loopback bind)
docker compose logs -f app
docker compose down
```
The service publishes on `127.0.0.1:8462` only. From the Windows browser use
`http://localhost:8462` (WSL2 localhost forwarding).

## Deploy to DigitalOcean droplet
1. **DNS**: add an A record `allornothing.matvs.dev` -> droplet IP.
2. **Ship the release** to `/opt/allornothing`:
   ```bash
   rsync -a --exclude node_modules --exclude dist --exclude .git \
     ./ root@<droplet>:/opt/allornothing/
   ```
3. **.env** — none required. The only knobs are `PORT` (default 8462) and
   `NODE_ENV=production` (already set in the image/compose). There is no
   database and no AI provider to configure.
4. **Build & run**:
   ```bash
   cd /opt/allornothing && docker compose up -d --build
   ```
5. **nginx + TLS**:
   ```bash
   sudo cp nginx/allornothing.matvs.dev.conf /etc/nginx/sites-available/
   sudo ln -s /etc/nginx/sites-available/allornothing.matvs.dev.conf /etc/nginx/sites-enabled/
   sudo certbot --nginx -d allornothing.matvs.dev
   sudo nginx -t && sudo systemctl reload nginx
   ```
   The vhost proxies `/` and `/api` normally and upgrades `/stomp` to a
   WebSocket (the `map $http_upgrade $connection_upgrade` block is included).
6. **Smoke test**:
   ```bash
   curl -s https://allornothing.matvs.dev/api/health         # {"ok":true,"rooms":0}
   curl -s -XPOST -H 'content-type: application/json' \
     -d '{"name":"Ada"}' https://allornothing.matvs.dev/api/rooms   # {code,playerId,token}
   ```
   Then open the site, create a room, open the printed code in a second
   browser/incognito, Start, and race.

## Operations
- **Logs**: `docker compose logs -f app`.
- **Health**: `GET /api/health` (also the container HEALTHCHECK).
- **Backup/restore**: nothing to back up — the app is stateless (in-memory
  rooms, browser-side solo scores). Empty idle rooms are swept after 30 min.
- **Upgrade**: `git pull` (or rsync) then `docker compose up -d --build`.
- **Rollback**: `git checkout <prev>` then rebuild; or `docker compose down`
  and redeploy the previous image.

## Troubleshooting
- **Multiplayer never connects / status stuck on "Reconnecting..."**: the
  `/stomp` WebSocket upgrade is not reaching the container. Check the nginx
  `location /stomp` block and the `$connection_upgrade` map; confirm
  `curl -I https://allornothing.matvs.dev/stomp` returns 400/426 (not 404).
- **CORS errors in the console**: you opened the Vite port in production
  instead of the server port. In prod the Node server serves the frontend on
  the same origin; open `:8462` (or the domain), not `:5173`.
- **`npm ci` fails in Docker**: the lockfile must match package.json. Run
  `npm install` locally to refresh `package-lock.json`, commit, redeploy.
- **Port already in use**: something else holds 8462 — change `PORT` in
  `docker-compose.yml` AND the nginx `proxy_pass`, or free the port.
- **Cards look blurry**: the canvas is DPI-aware and re-paints on resize; a
  hard refresh clears any stale cached bundle.
