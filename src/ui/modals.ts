import type { SeatIndex } from "../engine/types.js";
import { SUIT_NAMES } from "../engine/types.js";
import type { ClientMatchView, RoomSnapshot } from "../../shared/protocol.js";
import { h, setChildren } from "./dom.js";
import { suitSymbol } from "./cards.js";

/** Generic modal scaffold with focus trap-lite (Escape + backdrop close). */
export function openModal(title: string, body: HTMLElement, opts?: { wide?: boolean; onClose?: () => void }): HTMLElement {
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    opts?.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  const closeBtn = h("button.modal-close", { type: "button", onClick: close, "aria-label": "Close dialog" }, "×");
  const panel = h(
    `div.modal-panel${opts?.wide ? ".modal-wide" : ""}`,
    { role: "dialog", "aria-modal": "true", "aria-label": title },
    h("div.modal-head", {}, h("h2.modal-title", {}, title), closeBtn),
    body
  );
  const overlay = h("div.modal-overlay", {
    onClick: (e: MouseEvent) => {
      if (e.target === overlay) close();
    },
  }, panel);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  closeBtn.focus();
  return overlay;
}

export function openRulesModal(): void {
  const body = h("div.rules-body");
  body.innerHTML = `
    <p><strong>All or Nothing</strong> is a trick-taking game where the only thing that matters is
    keeping your word: bid <em>exactly</em> how many tricks you'll take. One over, one under — nothing.</p>

    <h3>The deal</h3>
    <ul>
      <li>Four seats, standard 52-card deck, aces high.</li>
      <li>A match climbs from a 1-card hand up to the peak (default 8) and back down: 1,2,…,8,…,2,1.</li>
      <li>After dealing, the next card is flipped: its suit is <strong>trump</strong>.
          If the deck is fully dealt (13-card hands), the round is played with <strong>no trump</strong>.</li>
      <li>The deal rotates clockwise every round.</li>
    </ul>

    <h3>Bidding</h3>
    <ul>
      <li>Starting left of the dealer, each player bids 0…hand-size tricks. Bids are open.</li>
      <li><strong>Hook rule:</strong> the dealer bids last and may not bring the total to
          exactly the hand size — someone must always fail.</li>
    </ul>

    <h3>Play</h3>
    <ul>
      <li>Left of the dealer leads the first trick; you must <strong>follow suit</strong> if you can.</li>
      <li>Void in the led suit? Play anything — including trump, which beats every plain card.</li>
      <li>Highest trump wins the trick, else highest card of the led suit. Winner leads next.</li>
    </ul>

    <h3>Scoring — all or nothing</h3>
    <table class="rules-scoring">
      <tr><th>Result</th><th>Points</th></tr>
      <tr><td>Missed your bid (over or under)</td><td><strong>0</strong></td></tr>
      <tr><td>Made an ordinary bid <em>b</em> exactly</td><td>10 + 2×<em>b</em></td></tr>
      <tr><td>Made a <strong>Nothing</strong> (bid 0)</td><td>10 + hand size</td></tr>
      <tr><td>Made an <strong>All</strong> (bid every trick)</td><td>20 + 2×hand size</td></tr>
    </table>
    <p>The extremes carry the biggest rewards because they are the boldest promises —
    that's the namesake. Highest total after the last round wins the match.</p>

    <h3>Heritage</h3>
    <p class="rules-footnote">The court cards wear a triangle (J), circle (Q) and square (K) —
    a keepsake from this project's first life as a 2018 shape-matching prototype.</p>
  `;
  openModal("How to play", body, { wide: true });
}

function seatName(room: RoomSnapshot | null, seat: SeatIndex): string {
  return room?.seats[seat]?.name ?? `Seat ${seat + 1}`;
}

export function buildScoreSheet(match: ClientMatchView, room: RoomSnapshot | null, mySeat: SeatIndex | null): HTMLElement {
  const seats: SeatIndex[] = [0, 1, 2, 3];
  const header = h(
    "tr",
    {},
    h("th.score-round-col", {}, "Round"),
    ...seats.map((s) =>
      h(`th${s === mySeat ? ".score-you" : ""}`, {}, seatName(room, s))
    )
  );

  const rows = match.history.map((r) => {
    const trump = r.trump ? suitSymbol(r.trump) : "—";
    return h(
      "tr",
      {},
      h("td.score-round-col", {}, `${r.roundNumber} · ${r.handSize}♯ ${trump}`),
      ...seats.map((s) => {
        const made = r.tricksWon[s] === r.bids[s];
        const cell = h(
          `td.score-cell.${made ? "score-made" : "score-missed"}${s === mySeat ? ".score-you" : ""}`,
          {},
          h("span.score-bid", { title: `bid ${r.bids[s]}, took ${r.tricksWon[s]}` }, `${r.tricksWon[s]}/${r.bids[s]}`),
          h("span.score-points", {}, made ? `+${r.scores[s]}` : "0")
        );
        return cell;
      })
    );
  });

  const totals = h(
    "tr.score-totals",
    {},
    h("td.score-round-col", {}, "Total"),
    ...seats.map((s) => h(`td${s === mySeat ? ".score-you" : ""}`, {}, String(match.totalScores[s])))
  );

  const upcoming = match.phase === "in_progress" && match.round
    ? h("p.score-upnext", {}, `Up next: round ${match.round.roundNumber} of ${match.roundSequence.length} — ${match.round.handSize} card${match.round.handSize > 1 ? "s" : ""}${match.round.trump ? `, trump ${SUIT_NAMES[match.round.trump]} ${suitSymbol(match.round.trump)}` : ", no trump"}`)
    : null;

  const wrap = h("div.score-sheet-wrap");
  const table = h("table.score-sheet");
  setChildren(table, h("thead", {}, header), h("tbody", {}, ...rows, totals));
  setChildren(wrap, table, upcoming ?? "");
  return wrap;
}

export function openScoreSheetModal(match: ClientMatchView, room: RoomSnapshot | null, mySeat: SeatIndex | null, opts?: { title?: string; onClose?: () => void }): void {
  openModal(opts?.title ?? "Score sheet", buildScoreSheet(match, room, mySeat), { wide: true, onClose: opts?.onClose });
}

export function openMatchEndModal(
  match: ClientMatchView,
  room: RoomSnapshot | null,
  mySeat: SeatIndex | null,
  winners: SeatIndex[],
  onExit: () => void
): void {
  const youWon = mySeat !== null && winners.includes(mySeat);
  const winnerNames = winners.map((s) => seatName(room, s)).join(" & ");
  const headline = youWon ? "You take the table!" : `${winnerNames} take${winners.length > 1 ? "" : "s"} the table`;
  const body = h(
    "div",
    {},
    h("p.match-end-line", {}, `Final scores after ${match.history.length} rounds:`),
    buildScoreSheet(match, room, mySeat),
    h(
      "div.modal-actions",
      {},
      h("button.btn.btn-primary", { type: "button", onClick: () => {
        document.querySelector(".modal-overlay")?.remove();
        onExit();
      } }, "Back to menu")
    )
  );
  openModal(headline, body, { wide: true });
}
