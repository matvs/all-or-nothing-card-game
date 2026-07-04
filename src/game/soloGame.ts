import {
  buildDeck,
  cardFromId,
  claimSet,
  dealMore,
  findFirstSet,
  isGameOver,
  isSet,
  newTableau,
  countSets,
  type Card,
  type Tableau,
} from "../../shared/engine/index.js";
import { registerSetCard, type SetCardElement } from "../render/setCardElement.js";
import { describeCard } from "../render/palette.js";
import { miniCard } from "../render/mini.js";
import { announce, button, clear, dialog, el, iconButton, snackbar } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import {
  bestFor,
  formatTime,
  submitScore,
  type Difficulty,
  type SoloMode,
} from "./highScores.js";

registerSetCard();

const TIMED_DURATION_MS = 180_000;
const TIMED_PENALTY_MS = 5_000;

export interface SoloOptions {
  mode: SoloMode;
  difficulty: Difficulty;
  onExit: () => void;
}

function deckFor(difficulty: Difficulty): Card[] {
  const all = buildDeck();
  // Easy: single shading (solid) -> a 27-card, 3-attribute game for learning.
  return difficulty === "easy" ? all.filter((c) => c.shading === 1) : all;
}

export class SoloGame {
  readonly element: HTMLElement;
  private tableau: Tableau;
  private tiles: SetCardElement[] = [];
  private selected = new Set<number>();
  private foundSets: Card[][] = [];
  private score = 0;
  private hintLevel = 0;
  private busy = false;
  private ended = false;

  private startedAt = Date.now();
  private penaltyMs = 0;
  private elapsedMs = 0;
  private timer: number | null = null;

  private boardEl!: HTMLElement;
  private foundEl!: HTMLElement;
  private scoreValue!: HTMLElement;
  private timeValue!: HTMLElement;
  private deckValue!: HTMLElement;
  private setsValue!: HTMLElement | null;
  private hintBtn: HTMLButtonElement | null = null;

  constructor(private opts: SoloOptions) {
    this.tableau = newTableau(Math.random, deckFor(opts.difficulty));
    this.element = this.build();
    this.renderBoard();
    this.updateHud();
    this.timer = window.setInterval(() => this.tick(), 250);
    this.keyHandler = this.keyHandler.bind(this);
    window.addEventListener("keydown", this.keyHandler);
  }

  destroy(): void {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
    window.removeEventListener("keydown", this.keyHandler);
  }

  // ---- layout ------------------------------------------------------------
  private build(): HTMLElement {
    this.scoreValue = el("span", { class: "mono" }, "0");
    this.timeValue = el("span", { class: "mono" }, "0:00");
    this.deckValue = el("span", { class: "mono" }, "0");

    const stats: HTMLElement[] = [
      el("div", { class: "hud__stat" }, el("span", {}, "Score"), this.scoreValue),
      el("div", { class: "hud__stat" }, el("span", {}, this.opts.mode === "timed" ? "Time left" : "Time"), this.timeValue),
      el("div", { class: "hud__stat" }, el("span", {}, "Deck"), this.deckValue),
    ];
    if (this.opts.difficulty === "easy") {
      this.setsValue = el("span", { class: "mono" }, "0");
      stats.push(el("div", { class: "hud__stat" }, el("span", {}, "Sets here"), this.setsValue));
    } else {
      this.setsValue = null;
    }

    const dealBtn = button("Deal 3", {
      variant: "tonal",
      icon: icon("add", 20),
      onClick: () => this.onDealMore(),
    });
    const newBtn = button("New game", {
      variant: "outlined",
      icon: icon("refresh", 20),
      onClick: () => this.confirmNew(),
    });

    const hudActions = el("div", { class: "row" });
    if (this.opts.difficulty !== "hard") {
      this.hintBtn = button("Hint", { variant: "text", icon: icon("hint", 20), onClick: () => this.onHint() });
      hudActions.appendChild(this.hintBtn);
    }
    hudActions.append(dealBtn, newBtn);

    const hud = el(
      "div",
      { class: "hud" },
      ...stats,
      el("div", { class: "hud__spacer" }),
      hudActions,
    );

    this.boardEl = el("div", { class: "board", role: "grid", "aria-label": "SET board" });
    this.foundEl = el("div", { class: "found-list" });

    const panel = el(
      "div",
      { class: "panel" },
      el("h3", { class: "title-m" }, "Found sets"),
      this.foundEl,
    );
    this.renderFound();

    const back = iconButton(icon("back"), "Back to menu", () => this.opts.onExit());

    return el(
      "div",
      { class: "stack" },
      el("div", { class: "row" }, back, el("h2", { class: "headline-m" }, this.title())),
      el("div", { class: "game" }, el("div", { class: "stack" }, hud, this.boardEl), panel),
    );
  }

  private title(): string {
    const mode = this.opts.mode === "timed" ? "Timed" : "Relaxed";
    const diff = this.opts.difficulty[0].toUpperCase() + this.opts.difficulty.slice(1);
    return `${mode} · ${diff}`;
  }

  // ---- board rendering ---------------------------------------------------
  private renderBoard(): void {
    const board = this.tableau.board;
    // Grow / update tiles in place so focus and position stay stable.
    for (let i = 0; i < board.length; i++) {
      let tile = this.tiles[i];
      if (!tile) {
        tile = document.createElement("set-card") as SetCardElement;
        tile.setAttribute("role", "gridcell");
        tile.addEventListener("card-activate", (e) => {
          this.onCardActivate((e as CustomEvent<{ cardId: number }>).detail.cardId);
        });
        this.tiles[i] = tile;
        this.boardEl.appendChild(tile);
      }
      tile.card = board[i];
      tile.selected = this.selected.has(board[i].id);
      tile.state = "idle";
      tile.disable(this.ended);
    }
    // Remove surplus tiles (board shrank at end of deck).
    while (this.tiles.length > board.length) {
      this.tiles.pop()?.remove();
    }
  }

  private renderFound(): void {
    clear(this.foundEl);
    if (this.foundSets.length === 0) {
      this.foundEl.appendChild(el("div", { class: "empty-state" }, "No sets yet — pick three cards."));
      return;
    }
    // Newest first.
    for (let i = this.foundSets.length - 1; i >= 0; i--) {
      const row = el("div", { class: "found-set" });
      for (const card of this.foundSets[i]) row.appendChild(miniCard(card));
      this.foundEl.appendChild(row);
    }
  }

  // ---- interaction -------------------------------------------------------
  private onCardActivate(cardId: number): void {
    if (this.busy || this.ended) return;
    if (this.selected.has(cardId)) {
      this.selected.delete(cardId);
    } else {
      if (this.selected.size >= 3) return;
      this.selected.add(cardId);
    }
    this.hintLevel = 0;
    this.syncSelection();
    if (this.selected.size === 3) this.evaluate();
  }

  private syncSelection(): void {
    for (const tile of this.tiles) {
      const card = tile.card;
      if (card) tile.selected = this.selected.has(card.id);
      tile.state = "idle";
    }
  }

  private evaluate(): void {
    const ids = [...this.selected] as number[];
    const cards = ids.map((id) => cardFromId(id));
    const good = isSet(cards[0], cards[1], cards[2]);
    this.busy = true;
    const tiles = this.tiles.filter((t) => t.card && this.selected.has(t.card.id));

    if (good) {
      for (const t of tiles) t.state = "good";
      this.score++;
      this.foundSets.push(cards);
      this.renderFound();
      announce(`Set found. ${cards.map(describeCard).join(", ")}. Score ${this.score}.`);
      window.setTimeout(() => {
        claimSet(this.tableau, ids as [number, number, number]);
        this.selected.clear();
        this.busy = false;
        this.renderBoard();
        this.updateHud();
        if (isGameOver(this.tableau)) this.endGame("cleared");
      }, 300);
    } else {
      for (const t of tiles) t.state = "bad";
      if (this.opts.mode === "timed") this.penaltyMs += TIMED_PENALTY_MS;
      announce("Not a set.");
      snackbar("Not a set", "err", 1400);
      window.setTimeout(() => {
        this.selected.clear();
        this.busy = false;
        this.syncSelection();
        this.updateHud();
      }, 420);
    }
  }

  private onHint(): void {
    if (this.busy || this.ended) return;
    const set = findFirstSet(this.tableau.board);
    if (!set) {
      snackbar("No set on the board — deal 3 more", "info");
      return;
    }
    // Reveal one more card of the set each press (max 2 — the third is yours).
    this.hintLevel = Math.min(this.hintLevel + 1, 2);
    this.syncSelection();
    for (let i = 0; i < this.hintLevel; i++) {
      const target = this.tiles.find((t) => t.card?.id === set.cards[i].id);
      if (target) target.state = "hint";
    }
    if (this.opts.mode === "timed") this.penaltyMs += TIMED_PENALTY_MS;
    announce("Hint shown.");
  }

  private onDealMore(): void {
    if (this.busy || this.ended) return;
    if (countSets(this.tableau.board) > 0) {
      snackbar("There is a set here — keep looking!", "info");
      announce("There is a set on the board.");
      return;
    }
    const dealt = dealMore(this.tableau);
    if (dealt === 0) {
      snackbar("No more cards to deal", "info");
    } else {
      this.renderBoard();
      this.updateHud();
      announce(`Dealt ${dealt} more cards.`);
    }
  }

  private confirmNew(): void {
    dialog({
      title: "Start a new game?",
      body: [el("p", { class: "body-m" }, "Your current progress will be lost.")],
      actions: [
        { label: "Cancel" },
        { label: "New game", variant: "filled", onClick: () => this.restart() },
      ],
    });
  }

  private restart(): void {
    this.tableau = newTableau(Math.random, deckFor(this.opts.difficulty));
    this.tiles.forEach((t) => t.remove());
    this.tiles = [];
    this.selected.clear();
    this.foundSets = [];
    this.score = 0;
    this.hintLevel = 0;
    this.busy = false;
    this.ended = false;
    this.startedAt = Date.now();
    this.penaltyMs = 0;
    this.elapsedMs = 0;
    if (this.timer == null) this.timer = window.setInterval(() => this.tick(), 250);
    this.renderBoard();
    this.renderFound();
    this.updateHud();
  }

  // ---- timing & HUD ------------------------------------------------------
  private tick(): void {
    if (this.ended) return;
    this.elapsedMs = Date.now() - this.startedAt + this.penaltyMs;
    if (this.opts.mode === "timed" && this.remaining() <= 0) {
      this.endGame("time");
      return;
    }
    this.updateTime();
  }

  private remaining(): number {
    return Math.max(0, TIMED_DURATION_MS - this.elapsedMs);
  }

  private updateTime(): void {
    this.timeValue.textContent =
      this.opts.mode === "timed" ? formatTime(this.remaining()) : formatTime(this.elapsedMs);
  }

  private updateHud(): void {
    this.scoreValue.textContent = String(this.score);
    this.deckValue.textContent = String(this.tableau.deck.length);
    if (this.setsValue) this.setsValue.textContent = String(countSets(this.tableau.board));
    this.updateTime();
  }

  private endGame(reason: "time" | "cleared"): void {
    if (this.ended) return;
    this.ended = true;
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
    for (const tile of this.tiles) tile.disable(true);

    const timeMs = reason === "cleared" ? this.elapsedMs : TIMED_DURATION_MS;
    const completed = reason === "cleared";
    const { best, improved } = submitScore({
      mode: this.opts.mode,
      difficulty: this.opts.difficulty,
      score: this.score,
      timeMs,
      completed,
    });

    const headline =
      reason === "cleared" ? "Board cleared!" : "Time's up!";
    announce(`${headline} Final score ${this.score}.`);

    const lines: HTMLElement[] = [
      el("p", { class: "body-l" }, `You found ${this.score} set${this.score === 1 ? "" : "s"}.`),
    ];
    if (completed) lines.push(el("p", { class: "body-m" }, `Time: ${formatTime(this.elapsedMs)}`));
    if (improved) lines.push(el("p", { class: "label-l", style: "color:var(--md-sys-color-primary)" }, "New personal best!"));
    lines.push(
      el(
        "p",
        { class: "body-m", style: "color:var(--md-sys-color-on-surface-variant)" },
        `Best ${this.opts.mode}/${this.opts.difficulty}: ${best.bestScore} sets` +
          (best.bestTimeMs != null ? `, fastest clear ${formatTime(best.bestTimeMs)}` : ""),
      ),
    );

    dialog({
      title: headline,
      dismissable: false,
      body: lines,
      actions: [
        { label: "Home", onClick: () => this.opts.onExit() },
        { label: "Play again", variant: "filled", onClick: () => this.restart() },
      ],
    });
  }

  private keyHandler(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === "h" || e.key === "H") {
      if (this.opts.difficulty !== "hard") this.onHint();
    } else if (e.key === "d" || e.key === "D") {
      this.onDealMore();
    }
  }
}
