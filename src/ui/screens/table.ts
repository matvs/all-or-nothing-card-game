import { cardId, sortHand } from "../../engine/deck.js";
import { currentTrickWinner, legalPlays } from "../../engine/trick.js";
import { SUIT_NAMES, type Card, type SeatIndex } from "../../engine/types.js";
import { isExtremeBid, scoreRound } from "../../engine/scoring.js";
import type { GameSession } from "../../game/session.js";
import type { ChatMessage, ClientMatchView, ClientRoundView, RoomSnapshot } from "../../../shared/protocol.js";
import { animateCardToTrick, animateDeal, animateTrickSweep, centerOf, reducedMotion } from "../animate.js";
import { cardBackSvg, cardFaceSvg, cardAriaLabel, suitColorClass, suitSymbol } from "../cards.js";
import { h, setChildren } from "../dom.js";
import { buildScoreSheet, openModal, openMatchEndModal, openRulesModal, openScoreSheetModal } from "../modals.js";
import { isSoundEnabled, playCardSound, playDealSound, playScoreSound, playSweepSound, playTurnSound, setSoundEnabled } from "../sound.js";
import { showToast } from "../toasts.js";

type RelPos = "bottom" | "left" | "top" | "right";
const REL_ORDER: RelPos[] = ["bottom", "left", "top", "right"];

export interface TableController {
  dispose(): void;
}

export function renderTable(
  root: HTMLElement,
  session: GameSession,
  onExit: () => void
): TableController {
  const anchorSeat: SeatIndex = session.mySeat ?? 0;

  // ------------------------------------------------------------- skeleton
  const roundChip = h("span.round-chip");
  const trumpChip = h("span.trump-chip");
  const connStrip = h("div.conn-strip", { hidden: true });
  const felt = h("div.felt");
  const handDock = h("div.hand-dock");
  const chatDock = h("div.chat-dock");

  const soundBtn = h(
    "button.btn.btn-quiet.btn-small",
    {
      type: "button",
      "aria-pressed": String(isSoundEnabled()),
      onClick: () => {
        setSoundEnabled(!isSoundEnabled());
        soundBtn.setAttribute("aria-pressed", String(isSoundEnabled()));
        setChildren(soundBtn, isSoundEnabled() ? "Sound on" : "Sound off");
      },
    },
    isSoundEnabled() ? "Sound on" : "Sound off"
  );

  const topbar = h(
    "div.table-topbar",
    {},
    roundChip,
    trumpChip,
    h("span.spacer"),
    session.roomCode ? h("span.round-chip", { title: "Room code" }, session.roomCode) : null,
    h("button.btn.btn-quiet.btn-small", { type: "button", onClick: () => latest.match && openScoreSheetModal(latest.match, latest.room, session.mySeat) }, "Scores"),
    h("button.btn.btn-quiet.btn-small", { type: "button", onClick: openRulesModal }, "Rules"),
    soundBtn,
    h("button.btn.btn-quiet.btn-small", { type: "button", onClick: () => { session.leave(); onExit(); } }, "Leave")
  );

  const screen = h("div.table-screen", {}, connStrip, topbar, felt, handDock, chatDock);
  setChildren(root, screen);

  // --------------------------------------------------------------- state
  const latest: { match: ClientMatchView | null; room: RoomSnapshot | null } = { match: null, room: null };
  let renderedMatch: ClientMatchView | null = null;
  let lastMyPlayOrigin: { x: number; y: number } | null = null;
  let myTurnAnnounced = false;
  let disposed = false;

  const seatPlateEls = new Map<SeatIndex, HTMLElement>();
  const trickSlotEls = new Map<SeatIndex, HTMLElement>();

  const relOf = (seat: SeatIndex): RelPos => REL_ORDER[(seat - anchorSeat + 4) % 4];

  // ------------------------------------------------------------ rendering

  function seatPlate(seat: SeatIndex, view: ClientRoundView | null, room: RoomSnapshot | null): HTMLElement {
    const summary = room?.seats[seat];
    const name = seat === session.mySeat ? `${summary?.name ?? "You"} (you)` : summary?.name ?? `Seat ${seat + 1}`;
    const isActive =
      view !== null &&
      ((view.phase === "bidding" && view.nextBidder === seat) || (view.phase === "playing" && view.nextPlayer === seat));

    const bid = view?.bids[seat];
    const bidline =
      view === null
        ? ""
        : view.phase === "bidding"
          ? bid === undefined
            ? "bidding…"
            : `bid ${bid}`
          : `${view.tricksWon[seat]} of ${bid ?? "?"} tricks`;

    const plate = h(
      `div.seat-plate.seat-${relOf(seat)}${isActive ? ".active" : ""}`,
      {},
      view?.dealer === seat ? h("span.dealer-chip", { title: "Dealer" }, "D") : null,
      seat !== session.mySeat && view
        ? h(
            "div.opp-hand",
            { "aria-label": `${view.handCounts[seat]} cards in hand` },
            ...Array.from({ length: Math.min(view.handCounts[seat], 13) }, () => {
              const mini = h("span.mini-back");
              mini.innerHTML = cardBackSvg();
              return mini;
            })
          )
        : null,
      h(
        "div.plate",
        {},
        h(`span.disc${summary && !summary.isAi && !summary.connected ? ".off" : ""}`, { title: summary?.isAi ? "AI" : summary?.connected ? "connected" : "disconnected" }),
        name
      ),
      view ? h("div.bidline", {}, bidline) : null
    );
    seatPlateEls.set(seat, plate);
    return plate;
  }

  function trickCards(view: ClientRoundView): HTMLElement[] {
    trickSlotEls.clear();
    return view.currentTrick.map(({ seat, card }) => {
      const el = h(`div.trick-card.trick-pos-${relOf(seat)}.playing-card.${suitColorClass(card.suit)}`, {
        "aria-label": `${cardAriaLabel(card)} played by seat ${seat + 1}`,
      });
      el.innerHTML = cardFaceSvg(card);
      trickSlotEls.set(seat, el);
      return el;
    });
  }

  function bidPanel(view: ClientRoundView): HTMLElement | null {
    if (session.mySeat === null || view.phase !== "bidding" || view.nextBidder !== session.mySeat) return null;
    const buttons: HTMLElement[] = [];
    for (let n = 0; n <= view.handSize; n++) {
      const forbidden = view.forbiddenBid === n;
      const extreme = isExtremeBid(n, view.handSize);
      const note = n === 0 ? `+${scoreRound(0, 0, view.handSize)}` : n === view.handSize ? `+${scoreRound(n, n, view.handSize)}` : "";
      buttons.push(
        h(
          `button.bid-btn${extreme ? ".extreme" : ""}`,
          {
            type: "button",
            disabled: forbidden,
            title: forbidden ? "Hook rule: this would make bids add up to the hand size" : undefined,
            "aria-label": `Bid ${n}${n === 0 ? " (Nothing)" : n === view.handSize ? " (All)" : ""}${forbidden ? ", forbidden" : ""}`,
            onClick: () => session.bid(n),
          },
          String(n),
          note ? h("span.bid-note", {}, n === 0 ? `Nothing ${note}` : `ALL ${note}`) : null
        )
      );
    }
    return h(
      "div.bid-panel",
      {},
      h("h3", {}, "Your bid"),
      h(
        "p.bid-hint",
        {},
        `${view.handSize} card${view.handSize > 1 ? "s" : ""}, trump ${view.trump ? `${SUIT_NAMES[view.trump]} ${suitSymbol(view.trump)}` : "— none"}. Exact or nothing.`
      ),
      h("div.bid-grid", {}, ...buttons)
    );
  }

  function handFan(view: ClientRoundView | null): HTMLElement | null {
    if (session.mySeat === null) {
      return h("div.hand-fan", {}, h("p.lobby-hint", {}, "Spectating — hands are face down for you."));
    }
    if (!view?.yourHand) return null;
    const myTurnToPlay = view.phase === "playing" && view.nextPlayer === session.mySeat;
    const legal = myTurnToPlay ? legalPlays(view.yourHand, view.currentTrick) : [];
    const legalIds = new Set(legal.map(cardId));
    const sorted = sortHand(view.yourHand, view.trump);

    const fan = h("div.hand-fan", { role: "group", "aria-label": "Your hand" });
    for (const card of sorted) {
      const id = cardId(card);
      const isLegal = legalIds.has(id);
      const btn = h(
        `button.hand-card.playing-card.${suitColorClass(card.suit)}${myTurnToPlay && !isLegal ? ".illegal" : ""}${myTurnToPlay && isLegal ? ".playable-now" : ""}`,
        {
          type: "button",
          disabled: !myTurnToPlay || !isLegal,
          "aria-label": `${cardAriaLabel(card)}${myTurnToPlay ? (isLegal ? ", playable" : ", must follow suit") : ""}`,
          onClick: (e: Event) => {
            lastMyPlayOrigin = centerOf(e.currentTarget as Element);
            session.play(id);
          },
        }
      );
      btn.innerHTML = cardFaceSvg(card);
      fan.appendChild(btn);
    }
    return fan;
  }

  function centerNote(view: ClientRoundView | null, match: ClientMatchView): HTMLElement | null {
    if (!view) return null;
    if (view.phase === "bidding") {
      const who = view.nextBidder === session.mySeat ? "You are" : `${latest.room?.seats[view.nextBidder ?? 0]?.name ?? "…"} is`;
      return h("div.table-center-note", {}, `${who} bidding — round ${view.roundNumber} of ${match.roundSequence.length}`);
    }
    if (view.currentTrick.length === 0 && view.phase === "playing") {
      const leader = view.nextPlayer;
      const who = leader === session.mySeat ? "You lead" : `${latest.room?.seats[leader ?? 0]?.name ?? "…"} leads`;
      return h("div.table-center-note", {}, who);
    }
    return null;
  }

  function renderState(match: ClientMatchView): void {
    renderedMatch = match;
    const view = match.round;
    const room = latest.room;

    setChildren(roundChip, view ? `Round ${view.roundNumber}/${match.roundSequence.length} · ${view.handSize} cards` : "—");
    if (view?.trump) {
      trumpChip.hidden = false;
      setChildren(
        trumpChip,
        "Trump ",
        h(`span.sym.${suitColorClass(view.trump)}`, { "aria-hidden": "true" }, suitSymbol(view.trump)),
        h("span.visually-hidden", {}, SUIT_NAMES[view.trump]),
        view.trumpCard ? ` (${view.trumpCard.rank})` : ""
      );
    } else {
      trumpChip.hidden = false;
      setChildren(trumpChip, view ? "No trump" : "");
    }

    const seats: SeatIndex[] = [0, 1, 2, 3];
    const trickArea = h("div.trick-area", {}, ...(view ? trickCards(view) : []));
    setChildren(
      felt,
      ...seats.map((s) => seatPlate(s, view, room)),
      trickArea,
      centerNote(view, match) ?? "",
      view ? bidPanel(view) ?? "" : "",
      myTurnBanner(view) ?? ""
    );
    setChildren(handDock, handFan(view) ?? "");

    // Turn cues: title + one-shot chime.
    const isMyTurn =
      session.mySeat !== null &&
      view !== null &&
      ((view.phase === "bidding" && view.nextBidder === session.mySeat) ||
        (view.phase === "playing" && view.nextPlayer === session.mySeat));
    document.title = isMyTurn ? "● Your turn — All or Nothing" : "All or Nothing";
    if (isMyTurn && !myTurnAnnounced) {
      myTurnAnnounced = true;
      playTurnSound();
    } else if (!isMyTurn) {
      myTurnAnnounced = false;
    }
  }

  function myTurnBanner(view: ClientRoundView | null): HTMLElement | null {
    if (session.mySeat === null || !view) return null;
    if (view.phase === "bidding" && view.nextBidder === session.mySeat) return h("div.turn-banner", {}, "Your bid");
    if (view.phase === "playing" && view.nextPlayer === session.mySeat) return h("div.turn-banner", {}, "Your turn — pick a card");
    return null;
  }

  // -------------------------------------------------- animation sequencing

  let queue: Promise<void> = Promise.resolve();
  const enqueue = (job: () => Promise<void>) => {
    queue = queue.then(() => (disposed ? undefined : job())).catch(() => undefined);
  };

  function seatPoint(seat: SeatIndex) {
    return centerOf(seatPlateEls.get(seat) ?? felt);
  }

  function trickSlotPoint(seat: SeatIndex) {
    const el = trickSlotEls.get(seat);
    if (el) return centerOf(el);
    // Approximate the slot from the felt center shifted toward the seat.
    const feltCenter = centerOf(felt);
    const rel = relOf(seat);
    const dx = rel === "left" ? -70 : rel === "right" ? 70 : 0;
    const dy = rel === "top" ? -70 : rel === "bottom" ? 70 : 0;
    return { x: feltCenter.x + dx, y: feltCenter.y + dy };
  }

  async function animateNewTrickCard(prev: ClientMatchView, next: ClientMatchView): Promise<void> {
    const played = next.round!.currentTrick[next.round!.currentTrick.length - 1];
    const from = played.seat === session.mySeat && lastMyPlayOrigin ? lastMyPlayOrigin : seatPoint(played.seat);
    lastMyPlayOrigin = null;
    renderState(stateWithoutLastTrickCard(next));
    await animateCardToTrick(played.card, from, trickSlotPoint(played.seat));
    playCardSound();
    renderState(next);
  }

  function stateWithoutLastTrickCard(view: ClientMatchView): ClientMatchView {
    const round = view.round!;
    return { ...view, round: { ...round, currentTrick: round.currentTrick.slice(0, -1) } };
  }

  async function animateTrickCompletion(prev: ClientMatchView, next: ClientMatchView): Promise<void> {
    const prevRound = prev.round!;
    const completed = nextCompletedTrick(prev, next);
    if (!completed) {
      renderState(next);
      return;
    }
    // 1. Show the 4th card landing (the engine state jumps straight past it).
    const lastPlayed = completed[completed.length - 1];
    const syntheticFull: ClientMatchView = {
      ...prev,
      round: { ...prevRound, currentTrick: completed, nextPlayer: null },
    };
    const from = lastPlayed.seat === session.mySeat && lastMyPlayOrigin ? lastMyPlayOrigin : seatPoint(lastPlayed.seat);
    lastMyPlayOrigin = null;
    renderState({ ...syntheticFull, round: { ...syntheticFull.round!, currentTrick: completed.slice(0, -1) } });
    await animateCardToTrick(lastPlayed.card, from, trickSlotPoint(lastPlayed.seat));
    playCardSound();
    renderState(syntheticFull);

    // 2. Sweep the trick to its winner.
    const trump = prevRound.trump;
    const winner = currentTrickWinner(completed, trump);
    const flights = completed.map(({ seat, card }) => ({ card, from: trickSlotPoint(seat) }));
    await animateTrickSweep(flights, seatPoint(winner));
    playSweepSound();

    // 3. If that closed the round, show the score sheet before dealing on.
    if (next.history.length > prev.history.length) {
      await announceRoundScored(prev, next);
    }
    if (next.round && next.round.roundNumber !== prevRound.roundNumber) {
      renderState({ ...next, round: null });
      await runDealAnimation(next);
    }
    renderState(next);
  }

  function nextCompletedTrick(prev: ClientMatchView, next: ClientMatchView) {
    // Mid-round: the round object itself carries its latest finished trick.
    if (next.round && prev.round && next.round.roundNumber === prev.round.roundNumber) {
      return next.round.lastCompletedTrick;
    }
    // Round (or match) rolled over: the engine preserves the closing trick in history.
    const scored = next.history[next.history.length - 1];
    if (scored && prev.round && scored.roundNumber === prev.round.roundNumber && scored.finalTrick.length === 4) {
      return scored.finalTrick;
    }
    return null;
  }

  async function announceRoundScored(prev: ClientMatchView, next: ClientMatchView): Promise<void> {
    const scored = next.history[next.history.length - 1];
    if (session.mySeat !== null && scored) {
      playScoreSound(scored.tricksWon[session.mySeat] === scored.bids[session.mySeat]);
    }
    if (next.phase === "complete") return; // the match-end modal takes over
    await new Promise<void>((resolve) => {
      const summary = buildScoreSheet(next, latest.room, session.mySeat);
      const body = h(
        "div",
        {},
        summary,
        h("div.modal-actions", {}, h("button.btn.btn-primary", { type: "button", onClick: () => {
          overlay.remove();
          resolve();
        } }, "Deal the next round"))
      );
      const overlay = openModal(`Round ${scored?.roundNumber ?? "?"} scored`, body, {
        wide: true,
        onClose: resolve,
      });
      // Auto-continue so an absent player never blocks the table.
      setTimeout(() => {
        if (overlay.isConnected) {
          overlay.remove();
          resolve();
        }
      }, 9000);
    });
  }

  async function runDealAnimation(match: ClientMatchView): Promise<void> {
    const view = match.round;
    if (!view || reducedMotion()) return;
    const targets = ([0, 1, 2, 3] as SeatIndex[]).map((s) => seatPoint(s));
    let i = 0;
    await animateDeal(centerOf(felt), targets, Math.min(view.handSize, 6), () => playDealSound(i++));
  }

  // --------------------------------------------------------- event wiring

  const unsubscribe = session.subscribe((event) => {
    if (disposed) return;
    switch (event.type) {
      case "room":
        latest.room = event.room;
        if (renderedMatch) renderState(renderedMatch); // refresh nameplates/connection dots
        break;
      case "match": {
        const prev = latest.match;
        latest.match = event.match;
        enqueue(async () => {
          const next = event.match;
          if (!prev || !renderedMatch) {
            renderState({ ...next, round: next.round ? { ...next.round } : null });
            if (next.round && next.round.phase === "bidding" && next.history.length === 0 && next.round.currentTrick.length === 0 && Object.keys(next.round.bids).length === 0) {
              await runDealAnimation(next);
            }
            renderState(next);
            return;
          }
          const prevTrick = prev.round?.currentTrick.length ?? 0;
          const nextTrick = next.round?.currentTrick.length ?? 0;
          const sameRound = prev.round && next.round && prev.round.roundNumber === next.round.roundNumber && prev.roundIndex === next.roundIndex;

          if (sameRound && nextTrick === prevTrick + 1) {
            await animateNewTrickCard(prev, next);
          } else if (sameRound && prevTrick === 3 && nextTrick === 0) {
            await animateTrickCompletion(prev, next);
          } else if (!sameRound && prev.round && (next.history.length > prev.history.length)) {
            await animateTrickCompletion(prev, next);
          } else {
            renderState(next);
          }
        });
        break;
      }
      case "ended":
        enqueue(async () => {
          renderState(event.match);
          openMatchEndModal(event.match, latest.room, session.mySeat, event.winners, onExit);
        });
        break;
      case "chat":
        appendChat(event.message);
        break;
      case "toast":
        showToast(event.text, event.level);
        break;
      case "connection":
        if (event.status === "reconnecting") {
          connStrip.hidden = false;
          setChildren(connStrip, `Connection lost — reconnecting… ${event.detail ?? ""}`);
        } else if (event.status === "connected") {
          connStrip.hidden = true;
        } else if (event.status === "rejected") {
          connStrip.hidden = false;
          setChildren(connStrip, event.detail ?? "Connection rejected.");
          showToast(event.detail ?? "You can't rejoin this seat.", "warn");
          setTimeout(onExit, 2500);
        }
        break;
    }
  });

  // ----------------------------------------------------------------- chat

  let chatOpen = false;
  let unread = 0;
  const chatLog = h("div.chat-log", { "aria-live": "polite" });
  const chatInput = h("input", { type: "text", placeholder: "Say something…", maxLength: "300", "aria-label": "Chat message" }) as HTMLInputElement;
  const chatPanel = h(
    "div.chat-panel",
    { hidden: true },
    chatLog,
    h(
      "form.chat-form",
      {
        onSubmit: (e: Event) => {
          e.preventDefault();
          const text = chatInput.value.trim();
          if (!text) return;
          session.sendChat(text);
          chatInput.value = "";
        },
      },
      chatInput,
      h("button", { type: "submit" }, "Send")
    )
  );
  const chatBadge = h("span.chat-badge", { hidden: true });
  const chatToggle = h(
    "button.btn.btn-small.chat-toggle",
    {
      type: "button",
      "aria-expanded": "false",
      onClick: () => {
        chatOpen = !chatOpen;
        chatPanel.hidden = !chatOpen;
        chatToggle.setAttribute("aria-expanded", String(chatOpen));
        if (chatOpen) {
          unread = 0;
          chatBadge.hidden = true;
          chatInput.focus();
          chatLog.scrollTop = chatLog.scrollHeight;
        }
      },
    },
    "Chat ",
    chatBadge
  );

  if (session.kind === "remote") {
    setChildren(chatDock, chatPanel, chatToggle);
    for (const m of latest.room?.chat ?? []) appendChat(m, true);
  }

  function appendChat(message: ChatMessage, silent = false): void {
    if (session.kind !== "remote") {
      showToast(`${message.from}: ${message.text}`);
      return;
    }
    chatLog.appendChild(
      h(
        `div.chat-msg${message.isSpectator ? ".spectator" : ""}`,
        {},
        h("span.from", {}, `${message.from}${message.isSpectator ? " (rail)" : ""}: `),
        message.text
      )
    );
    while (chatLog.children.length > 60) chatLog.firstElementChild?.remove();
    chatLog.scrollTop = chatLog.scrollHeight;
    if (!chatOpen && !silent) {
      unread++;
      chatBadge.hidden = false;
      setChildren(chatBadge, String(Math.min(unread, 9)));
    }
  }

  return {
    dispose() {
      disposed = true;
      unsubscribe();
      document.title = "All or Nothing";
    },
  };
}
