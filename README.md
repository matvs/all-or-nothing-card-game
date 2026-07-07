# All or Nothing — SET

A **SET** card game, faithfully restored from the owner's original
(`boardgames.matvs.dev`) and ported to typed, tested TypeScript. Every card has
four features, each with three values:

- **colour** — purple `#4B0082` · green `#228B22` · crimson `#DC143C`
- **shape** — square · circle · triangle
- **filling** — none (outline) · full (solid) · dashed (striped)
- **number** — one · two · three symbols

The 3⁴ combinations make an **81-card deck**. Three cards form a **set** when,
*for every one of the four features*, the values are **all the same or all
different**.

The card figures are a **pixel-faithful** port of the original
`features/gameCanvas/Card.js`: each card paints its symbols on its own
DPI-aware `<canvas>` — sharp 40px squares, r=20 circles, equilateral triangles,
symbols laid out **horizontally**, the "dashed" filling rendered as the
original's fine horizontal stripes — wrapped in CSS card chrome that provides
the white tile, the black border, the **hover-pop** (lift + scale) and the
`#02075d` selected highlight. Bootstrap 5.3 UI, light/dark (`data-bs-theme`),
keyboard- and screen-reader-friendly.

## Play

**Single-player** — twelve cards on the table and a running clock. Find *every*
set among them: cards stay put, each found set fills the side panel with its
three figures and an Explanation table, and finding them all wins. Wrong picks
show *why* (the NO/NO row). This mirrors the recovered `GameCanvasSingleplayer`.

**Multiplayer** — a shared, **server-authoritative** board. Log in, create or
join a room by its 4-letter code, take a coloured seat, and press Start (a round
begins once the seated players are ready or the countdown ends). Everyone races
on the *same* board; the first to claim a valid set scores it and fresh cards
drop in; a wrong claim costs a point. Live scoreboard, each player's **coloured
hand cursor**, and reconnect-with-token that keeps your seat and score.

- **Text chat** — over the same WebSocket connection, authors coloured by seat.
- **Voice chat** — an opt-in **WebRTC** mesh with **hold-to-talk**: hold the `V`
  key (or press-and-hold the on-screen button) to open your mic and release to
  mute, with a "● Live" indicator; it auto-mutes if the tab loses focus.
  Signalling is relayed by the server, audio is peer-to-peer.

## Architecture

One Node service serves the built frontend, the REST API (`/api`) and the
native WebSocket endpoint (`/ws`) on a single port (8462), **same-origin** so
there is no CORS. The SET engine is a pure, framework-free TypeScript module
shared verbatim by client and server, so the server can authoritatively
validate every claim.

```
shared/engine/    Pure SET logic: 81-card deck, seedable RNG, isSet (via the
                  (a+b+c) % 3 identity), findAllSets / hasSet / thirdCard,
                  the Tableau state machine (deal-until-set, claim/replace),
                  and the Explanation builder. Exhaustively tested.
shared/protocol   Native WebSocket wire contract (events, seat colours, payloads).
src/game/         cardFace.ts — the faithful canvas port of Card.js; SetCard /
                  Board tiles; the single-player game (useSinglePlayerGame).
src/features/     mainPage, session (Redux slice + thunks), modals (login /
                  create / join), alert bar, and room/ (the multiplayer UI).
src/features/room useRoom (game socket), RoomPage, ChatPanel, VoiceBar +
                  useVoice (WebRTC mesh), handCursor.
src/app/          Redux Toolkit store + typed hooks.
src/net/          Native WebSocket client wrapper (identity in the connect URL).
server/           Express app + static (app.ts), WsGateway (socket.ts, ws),
                  rooms/ (Room shared state + RoomRegistry), http/api.ts (REST),
                  build.ts (HTTP + WebSocket wiring), index.ts (entrypoint).
```

### Why native WebSockets
The realtime transport is **raw WebSockets** — the `ws` library on the server,
the browser's built-in `WebSocket` on the client — chosen for lowest latency
(no Socket.IO framing/overhead). A tiny JSON envelope `{ t: type, d: payload,
id? }` carries every event; `id` marks a request that expects a single ack reply
(used by the claim). A small client wrapper adds the niceties Socket.IO gave for
free: a synthetic `connect` event re-fired on reconnect, exponential-backoff
reconnection, an app-level ping, and request/ack. SET has no hidden information
— the whole board is public — so nothing needs server-side redaction; every
player in a room sees the same board. Cards travel as their canonical `0..80`
id (rebuild with `cardFromId`). The design is **server-authoritative**: the
client never says "I scored", it only asks "I claim these three ids" and the
server validates against the real board before awarding a point and dealing on.

## Develop

```bash
npm install
npm run dev         # Vite (:5173, HMR) + tsx server (:8462); open :5173
npm test            # 79 tests: engine, rooms, registry, REST, WebSocket e2e
npm run typecheck   # tsc --noEmit
npm run build       # -> dist/
docker compose up -d --build   # one container on 127.0.0.1:8462
```

### Verify (real browser, headless Chrome)

```bash
npm run build
npm run screenshot  # starts the server in-process, screenshots the single-player
                    # tableau (light/dark/selected/hover) AND asserts the three
                    # exact colours #4B0082/#228B22/#DC143C are actually painted.
npm run verify:mp   # two isolated headless clients: seats, start, a server-
                    # validated claim scored on BOTH clients, text chat both ways,
                    # and the WebRTC voice signalling handshake + push-to-talk.
```

The SET engine is verified exhaustively (`isSet` proven equivalent to
"all-same-or-all-different" across all triples; the deal guarantee holds across
many seeds; a full game plays to exhaustion without dealing a card twice).

See **runbook.md** for droplet deployment.

## Provenance
Restores and modernises the original SET implementation (canvas-drawn cards,
`findAllSets`, found-sets list, timer, native WebSocket rooms) recovered into
`recovered-src/`. The React + Redux client and the native WebSocket server are ported
to typed, tested TypeScript with the card design preserved pixel-for-pixel.
