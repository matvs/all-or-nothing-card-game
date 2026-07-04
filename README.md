# All or Nothing — SET

A **SET** card game. Every card has four features, each with three possible
values:

- **colour** — red · green · purple
- **shape** — square · circle · triangle
- **number** — one · two · three symbols
- **shading** — open (outline) · solid · striped

The 3⁴ combinations make an **81-card deck**. Three cards form a **set** when,
*for every one of the four features*, the values are **all the same or all
different**. Find them faster than everyone else.

Canvas-drawn card tiles (the original game's aesthetic, preserved) in a
**Material Design 3 / Material You** interface — light and dark, DPI-aware,
keyboard-navigable, screen-reader announced.

## Play

**Solo** — a board of 12 cards that grows by three whenever no set is present
(the classic "deal until a set exists" rule). Claim sets to score; three fresh
cards replace each claimed set.

- **Relaxed** — no clock; race your best clear time.
- **Timed** — three minutes; find as many as you can.
- **Difficulty** — *Easy* trims the deck to a single shading (a gentler
  three-feature game), *Normal* is the full deck, *Hard* drops the hints.
- Hints (reveal up to two cards of a real set), a "Deal 3" that only fires when
  the board genuinely has no set (so it teaches the rule), a found-sets list
  with canvas thumbnails, and high scores saved in your browser.

**Multiplayer race** — everyone plays the *same* board over **STOMP on a
WebSocket**. First to claim a valid set scores it and three new cards drop in;
the board and scores update live for the whole room. Share the **4-letter room
code**, reconnect with your token if your connection blips. Set validation is
**server-authoritative** — the browser asks, the server decides.

## Architecture

One Node service serves the built frontend, the REST API and the STOMP
endpoint on a single port (8462), **same-origin** so there is no CORS. The game
logic is a pure, framework-free TypeScript engine shared verbatim by the client
and the server.

```
shared/engine/   Pure SET logic: 81-card deck, seedable RNG, isSet (via the
                 (a+b+c) % 3 identity), findAllSets/hasSet/thirdCard, and a
                 Tableau state machine (deal-until-set, in-place claim/replace).
shared/protocol  Client/server wire contract + STOMP destinations.
src/render/      <set-card> custom element painting a card face on its own
                 DPI-aware canvas; palette; thumbnails.
src/game/        Solo game controller + localStorage high scores.
src/ui/          MD3 components, screens (home, solo, race), reusable board.
src/net/         @stomp/stompjs client wrapper.
server/stomp/    A compact STOMP 1.2 codec + broker over `ws`.
server/rooms/    Room (shared tableau, scores, host, reconnect), registry,
                 and the service wiring STOMP destinations to room actions.
server/http/     REST: create/join room, room summary, health.
```

### Why STOMP
The owner asked for STOMP specifically. Rather than pull in a heavyweight
broker, the server implements just enough of **STOMP 1.2** (CONNECT auth,
SUBSCRIBE/SEND/UNSUBSCRIBE, MESSAGE publish to topics and private per-connection
replies) over the `ws` library — a few hundred lines, fully unit-tested and
**wire-compatible with `@stomp/stompjs`** on the browser. Rooms broadcast state
on `/topic/room/{CODE}`; clients send actions to `/app/room/{CODE}/{action}`;
private rejections come back on `/user/queue/reply`.

## Develop

```bash
npm install
npm run dev        # Vite (:5173, HMR) + tsx API/STOMP server (:8462); open :5173
npm test           # 44 tests: engine, rooms, STOMP codec, REST, full STOMP e2e
npm run typecheck
npm run build      # -> dist/
docker compose up -d --build   # one container on 127.0.0.1:8462
```

The SET engine is verified exhaustively: `isSet` is proven equivalent to the
original "all same or all different" rule across all C(81,3) = 85 320 triples
(exactly 1080 sets), the deal guarantee holds across 500 seeds, and a full game
plays to exhaustion without ever dealing a card twice.

See **runbook.md** for deployment to the DigitalOcean droplet.

## Provenance
This restores and modernises the original SET implementation (canvas-drawn
cards, `findAllSets`, found-sets list, timer) that lived at commit `9b7cf09`.
The 2019 vanilla-JS core was ported to typed, tested TypeScript with behaviour
preserved; the UI was rebuilt in Material Design 3; and the single "there are N
sets" alert grew into solo modes plus a real-time multiplayer race.
