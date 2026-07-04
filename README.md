# All or Nothing

A trick-taking card game built on one promise: **bid exactly how many tricks
you'll take, or score nothing.** One over or one under — it doesn't matter
which — wipes your round to zero. The boldest promises, taking *no* tricks
("Nothing") or *every* trick ("All"), pay the most.

Play **solo against three AI opponents** (three difficulty levels, all running
in your browser) or **open a room** and play realtime multiplayer with friends,
with AI filling any empty chairs.

- **Engine:** pure, dependency-free, fully unit-tested TypeScript.
- **Frontend:** Vite + TypeScript, hand-drawn SVG cards, animated dealing and
  trick-taking, mobile-responsive, optional synthesized sound (off by default).
- **Multiplayer:** Node (Express + `ws` + `better-sqlite3`), server-authoritative
  rules, 4-letter room codes, reconnection grace, spectators, per-room chat and
  persistent win/loss stats.
- **214 tests** green; ships with a Dockerfile, compose file, nginx vhost and a
  [runbook](./runbook.md).

---

## A note on the original game (heritage)

This repository began in 2018 as a tiny HTML-canvas prototype. Despite the
name, the original `js/all-or-nothing.js` did not implement a trick-taking
card game at all — it was an implementation of **SET**: a 12-card tableau of
symbol cards varying in four properties (colour, shape, filling, number), where
you hunt for valid "sets" of three in which every property is either all-same
or all-different across the three cards. There were no suits, ranks, tricks,
bids, or scoring rounds — nothing on which to hang a trick-taking "all or
nothing" bid.

So this build **completes the intent behind the name** rather than the
half-finished SET prototype: a coherent trick-taking game designed around the
"all or nothing" bid concept (bid your exact trick count; bonuses for the two
extremes). The prototype is not forgotten — its three geometric shapes live on
as the court-card figures: the **Jack wears a triangle, the Queen a circle, the
King a square.** The full, exact ruleset as implemented is below.

---

## Rules

### Table and deck
- **Four seats.** In multiplayer any empty seat is played by the house AI, so a
  full table of four is always in play.
- Standard **52-card deck**, no jokers. **Aces are high** (A > K > Q > J > 10 …).

### The match
A match is a sequence of rounds whose **hand size climbs from 1 up to a peak and
back down to 1**. Three presets:

| Preset | Peak | Rounds | Sequence |
|---|---|---|---|
| Short | 5 | 9 | 1,2,3,4,5,4,3,2,1 |
| Standard (default) | 8 | 15 | 1 … 8 … 1 |
| Long | 13 | 25 | 1 … 13 … 1 |

Small hands are sharp and high-variance (pure "all or nothing" territory); big
hands reward hand-reading. **Highest cumulative score after the final round wins.**

### The deal
- Each round, the dealer deals `handSize` cards to every seat, one at a time,
  clockwise starting to the dealer's left.
- The **next card off the deck is turned up; its suit is trump** for the round.
- If the hand size is 13 the whole deck is dealt and there is no card left to
  turn — that round is played at **No Trump**.
- **The deal rotates one seat clockwise** every round.

### Bidding
- Starting to the dealer's left and going clockwise (**the dealer bids last**),
  each player states how many tricks they intend to win, from `0` to `handSize`.
  All bids are open/visible.
- **The hook rule ("screw the dealer", on by default):** the total of all four
  bids may not equal the hand size, which forces the dealer off the balancing
  number. Because the bids can't sum to the number of available tricks, **at
  least one player is always set up to fail** — someone's promise must break.
  (Toggleable off in settings.)

### Playing the tricks
- The player to the dealer's left leads the first trick. The winner of each
  trick leads the next.
- You **must follow the led suit if you can**. If you can't, you may play
  anything — including a trump.
- A trick is won by the **highest trump** played, or if no trump was played, by
  the **highest card of the suit that was led**. Off-suit discards can never win.

### Scoring — all or nothing
At the end of a round each player scores **only if their trick count exactly
equals their bid.** Otherwise: **zero.**

| Result | Points |
|---|---|
| Missed the bid (too many **or** too few) | **0** |
| Made an ordinary bid *b* (0 < *b* < handSize) | **10 + 2 × *b*** |
| Made **Nothing** (bid 0, won 0) | **10 + handSize** |
| Made **All** (bid = handSize, won every trick) | **20 + 2 × handSize** |

The two extremes are the namesake, and they carry the biggest rewards because
they are the boldest, most brittle promises: commit to winning nothing, or to
sweeping the table, and get paid accordingly — or crash to zero. Taking every
trick ("All") always outscores refusing them all ("Nothing") on the same hand,
because it is strictly harder to pull off.

*Worked example (6-card hand):* bid 2 and take 2 → `10 + 2×2 = 14`. Bid 2 and
take 1 or 3 → `0`. Bid 0 and take 0 → `10 + 6 = 16`. Bid 6 and take all 6 →
`20 + 12 = 32`.

---

## The AI opponents

Three difficulty levels, all pure heuristic TypeScript (no LLM, no network):

- **Bidding** estimates hand strength from trump length and honours, plain-suit
  aces, and — on Hard — void suits (ruffing potential). Easy reads a noisier,
  weaker signal; Hard also leans into the extreme 0/all bids when a hand is
  nearly there, chasing the bigger bonus.
- **Card play** follows three intents depending on whether the seat still needs
  tricks: **win cheap** (take the trick with the lowest card that still wins),
  **dump safely** (shed the highest card that can't win, under cover of someone
  else's trick), and **defend the bid** (stop winning once the bid is met). Hard
  additionally counts the cards already played to lead cards that are provably
  high.

Crucially, **every difficulty routes its choices through the engine's own legal
move set**, so no AI can ever revoke or make an illegal play — this is asserted
by 97 full simulated matches across difficulty mixes, round lengths (including
the No-Trump round) and rule settings.

---

## Multiplayer

- **Open a room** to get a shareable **4-letter code** (from an alphabet with no
  ambiguous letters like I/O). Anyone enters it from the menu to join.
- **2–4 humans**; the host starts the match and any empty seats become AI.
- The **server is authoritative** — it runs the exact same engine, re-validates
  every bid and play, and only ever sends each player their own hand (opponents'
  cards are never transmitted; spectators see none).
- **Reconnection grace:** drop your connection and you have 60 seconds to rejoin
  the same seat (credentials live in `sessionStorage`, so a page reload
  resumes). After the window, an AI takes the seat for the rest of the match.
- **Spectators**, **per-room chat** (small, capped history), and **persistent
  aggregate stats** (games played / won by player name, in SQLite).

---

## Architecture

```
src/engine/     Pure game engine — deck, seedable RNG shuffle, deal, bidding,
                follow-suit trick resolution, all-or-nothing scoring, the
                round/match state machine. No DOM, no clock, no I/O. Immutable
                (state, action) -> Result<state>; runs identically on client
                and server.
src/ai/         Bid estimation + card-play heuristics, three difficulty levels.
src/game/       GameSession interface + LocalSession (engine + AI in-browser).
src/net/        RemoteSession — WebSocket client with auto-reconnect.
src/ui/         DOM helpers, SVG card faces, animation layer, sound, toasts,
                modals, and the menu / lobby / table screens.
shared/         Types shared by client and server: the wire protocol, room
                codes, and the per-seat "redacted view" projection used by both
                the server and the local game so the UI renders one shape.
server/         Express + ws + better-sqlite3. Room orchestration, reconnection,
                chat, stats; serves the built frontend in production.
```

The client and server share the engine and the view projection verbatim, so a
solo game and a networked game are literally the same UI driven by the same
view models — one implemented in-process, the other over a socket.

---

## Running it

```bash
npm install        # compiles the native better-sqlite3 addon
npm run dev        # Vite (:5173) + API/WS (:8462); open http://localhost:5173

npm test           # 214 tests: engine, AI legality, server, live WebSocket
npm run typecheck  # strict tsc --noEmit
npm run build      # production bundle → dist/
npm run smoke      # end-to-end prod-path check (after a build)
```

Docker:

```bash
docker compose up -d --build   # one service on http://127.0.0.1:8462
```

For droplet deployment (DNS, nginx vhost, TLS, backups, troubleshooting) see
**[runbook.md](./runbook.md)**.

---

## Testing

`npm test` runs 214 tests with Vitest, none touching the network or external
services:

- **Engine** — RNG determinism, dealing invariants, bidding order, the hook
  rule, follow-suit enforcement, trick resolution (trump/led-suit/discards),
  every scoring edge case, and full multi-round matches to completion.
- **AI** — bid range and monotonicity, the dealer-restriction never being
  violated, the win-cheap / dump-safely / defend-bid behaviours on crafted
  hands, and 97 full simulated matches proving the AI never makes an illegal
  move.
- **Server** — room lifecycle (fake sockets + fake timers for the reconnection
  grace), the REST API via supertest, and real-WebSocket integration tests that
  play a full human+AI match over the wire, cover spectators/chat, and exercise
  reconnection and AI takeover.

---

## Design

A **linen card-room**: warm paper tints, one confident oxblood accent, deep
green baize, a serif display face, and a hand-drawn feel — deliberately not the
interchangeable dark-glassmorphism look. All 52 card faces are drawn as inline
SVG (no image assets); court cards carry the 2018 prototype's triangle / circle
/ square. Dealing and trick-taking are animated (cards visibly fly), the active
turn is always signposted, and the between-rounds score sheet lays out every
bid, take and point. Respects `prefers-reduced-motion`, uses focus-visible
states, and targets WCAG AA contrast.
