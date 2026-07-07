# Runbook — all-or-nothing-card-game (SET)

## What is this
A SET card game: find sets of three cards where, for each of four features
(colour, shape, filling, number), the three cards are all the same or all
different. Faithful canvas-drawn card figures (a port of the recovered original
`Card.js`) in a Bootstrap 5.3 interface. Two ways to play:

- **Single-player** — twelve cards on the table, a running clock, find every set
  among them (cards stay put; found sets fill the side panel).
- **Multiplayer** — a shared, **server-authoritative** board over **native WebSockets**;
  coloured seats, live scores, coloured hand cursors, reconnect-with-token,
  **text chat**, opt-in **WebRTC hold-to-talk voice**, and collapsible side panels.

One Node service serves the built frontend, the REST API (`/api`) and the
native WebSocket endpoint (`/ws`) on a single port, same-origin. Stateless:
rooms are in-memory, there is no database and no AI.

## Controls & UI
- **How to Play** — a dedicated page at `/how-to-play` (the "How to Play" button
  on the landing page). It is an *interactive tutorial*: a stepper walks through
  three worked examples on a live card board, and a "try it yourself" practice
  lab lets you pick three cards and shows the rule-by-rule verdict. It is not a
  hover tooltip.
- **Voice push-to-talk** — in a room, join voice, then **hold the `V` key** to
  open your mic and release to mute (an on-screen "● Live" indicator and the
  glowing button show when you are transmitting). Press-and-hold the on-screen
  button works too (touch/mouse fallback). Typing in the chat box never triggers
  the mic, and the mic auto-mutes if the tab/window loses focus while `V` is held.
  Transport is the native-WebSocket signalling relay (no socket.io).
- **Collapsible panels** — the room's **Chat** and **Found sets** side panels each
  have a Collapse/Open toggle so you can reclaim space on small screens.

## Prerequisites
- Local: Node >= 20, npm. No native modules, no DB.
- Droplet: Docker Engine + docker compose v2, host nginx + certbot, DNS access
  for `matvs.dev` (see apps/ORCHESTRATION.md and apps/DEPLOYMENT-WSL2.md).

## Run locally (dev)
Two processes (Vite for HMR + the tsx server); Vite proxies `/api` and
`/ws` to the server so the browser stays same-origin (no CORS).

```bash
npm install                 # first time (read-only npm cache? add --cache "$TMPDIR/npmcache")
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
npm test                    # 79 tests (engine + rooms + registry + REST + WebSocket e2e)
npm run typecheck           # tsc --noEmit
npm run build               # vite build -> dist/
```

## Verify in a real browser (headless Chrome)
Both scripts start the production server **in-process** (serving `dist/`) and
drive the sandbox's chrome-headless-shell — no separate server needed.

```bash
npm run build
npm run screenshot          # single-player tableau (light/dark/selected/hover);
                            # ASSERTS the three exact colours #4B0082/#228B22/#DC143C
                            # are painted. PNGs in $TMPDIR/set-shots.
npm run verify:mp           # two isolated headless clients: seats, Start, a server-
                            # validated claim scored on BOTH clients, chat both ways,
                            # and the WebRTC voice signalling handshake + push-to-talk.
```

Note: chrome-headless-shell lacks `getUserMedia` and full ICE, so `verify:mp`
exercises the voice **signalling handshake** (relayed offer/answer + push-to-talk
toggle); live audio/ICE-`connected` works in a real browser and is covered by the
unit + WebSocket integration tests.

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
   `NODE_ENV=production` (already set in the image/compose). No database, no AI.
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
   The vhost proxies `/` and `/api` normally and upgrades `/ws` to a
   WebSocket (the `map $http_upgrade $connection_upgrade` block is included).
6. **Smoke test**:
   ```bash
   curl -s https://allornothing.matvs.dev/api/health                 # {"ok":true,"rooms":0}
   curl -s -XPOST -H 'content-type: application/json' \
     -d '{"name":"Ada"}' https://allornothing.matvs.dev/api/login    # {id,name,token}
   ```
   Then open the site, log in, create a room, open the printed code in a second
   browser/incognito, take seats, Start, and race.

## Operations
- **Logs**: `docker compose logs -f app`.
- **Health**: `GET /api/health` (also the container HEALTHCHECK).
- **Backup/restore**: nothing to back up — the app is stateless (in-memory
  rooms, browser-side solo state).
- **Upgrade**: `git pull` (or rsync) then `docker compose up -d --build`.
- **Rollback**: `git checkout <prev>` then rebuild; or `docker compose down`
  and redeploy the previous image.

## Troubleshooting
- **Multiplayer never connects / stuck reconnecting**: the `/ws`
  WebSocket upgrade is not reaching the container. Check the nginx
  `location /ws` block and the `$connection_upgrade` map; confirm
  `curl -I https://allornothing.matvs.dev/ws` returns 400 (not 404).
- **Voice won't connect across networks**: the mesh uses a public STUN server;
  strict/symmetric NATs need a TURN server (add it to `ICE_SERVERS` in
  `src/features/room/useVoice.ts`). Signalling still works; only media relay is
  affected.
- **CORS errors in the console**: you opened the Vite port in production instead
  of the server port. In prod the Node server serves the frontend on the same
  origin; open `:8462` (or the domain), not `:5173`.
- **`npm ci` fails in Docker**: the lockfile must match package.json. Run
  `npm install` locally to refresh `package-lock.json`, commit, redeploy.
- **Port already in use**: something else holds 8462 — change `PORT` in
  `docker-compose.yml` AND the nginx `proxy_pass`, or free the port.
- **Cards look blurry**: the canvas is DPI-aware and re-paints on resize; a hard
  refresh clears any stale cached bundle.
