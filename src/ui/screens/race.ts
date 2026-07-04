import { cardFromId } from "../../../shared/engine/index.js";
import type { RaceEvent, ReplyMessage, RoomView } from "../../../shared/protocol.js";
import { RaceClient, type ConnStatus } from "../../net/raceClient.js";
import { announce, button, clear, el, iconButton, snackbar } from "../dom.js";
import { icon } from "../icons.js";
import { CardBoard } from "../cardBoard.js";

export interface RaceOptions {
  intent:
    | { kind: "create"; name: string }
    | { kind: "join"; name: string; code: string };
  onExit: () => void;
}

export function createRaceScreen(opts: RaceOptions): { element: HTMLElement; destroy: () => void } {
  const screen = new RaceScreen(opts);
  return { element: screen.element, destroy: () => screen.destroy() };
}

class RaceScreen {
  readonly element: HTMLElement;
  private client: RaceClient;
  private room: RoomView | null = null;
  private status: ConnStatus = "connecting";
  private lastClaim: number[] = [];

  private titleEl: HTMLElement;
  private statusChip: HTMLElement;
  private body: HTMLElement;
  private board: CardBoard;

  constructor(private opts: RaceOptions) {
    this.client = new RaceClient({
      onState: (room) => this.onState(room),
      onEvent: (event, room) => this.onEvent(event, room),
      onReply: (reply) => this.onReply(reply),
      onStatus: (status, detail) => this.onStatus(status, detail),
    });
    this.board = new CardBoard((trio) => this.attemptClaim(trio));

    this.titleEl = el("h2", { class: "headline-m" }, "Race");
    this.statusChip = el("div", { class: "chip" }, "Connecting…");
    this.body = el("div", {});

    const back = iconButton(icon("back"), "Leave room", () => this.opts.onExit());
    this.element = el(
      "div",
      { class: "stack" },
      el("div", { class: "row" }, back, this.titleEl, el("div", { class: "spacer" }), this.statusChip),
      this.body,
    );

    this.renderConnecting();
    void this.begin();
  }

  private async begin(): Promise<void> {
    try {
      if (this.opts.intent.kind === "create") await this.client.create(this.opts.intent.name);
      else await this.client.join(this.opts.intent.name, this.opts.intent.code);
      try {
        localStorage.setItem("aon-set:name", this.opts.intent.name);
      } catch {
        /* ignore */
      }
    } catch (err) {
      this.renderError(err instanceof Error ? err.message : "Could not connect");
    }
  }

  destroy(): void {
    void this.client.disconnect();
  }

  private get myId(): string {
    return this.client.playerId;
  }

  // ---- network callbacks -------------------------------------------------
  private onState(room: RoomView): void {
    const prevStatus = this.room?.status;
    this.room = room;
    this.titleEl.textContent = `Race · ${room.code}`;
    this.render();
    if (room.status === "finished" && prevStatus !== "finished") this.announceWinner(room);
  }

  private onEvent(event: RaceEvent, room: RoomView): void {
    this.room = room;
    this.titleEl.textContent = `Race · ${room.code}`;
    switch (event.kind) {
      case "claimed": {
        const mine = event.by === this.myId;
        const msg = mine ? "You found a set!" : `${event.name} found a set`;
        snackbar(msg, mine ? "ok" : "info", 1600);
        announce(msg);
        break;
      }
      case "dealt":
        snackbar(`${event.count} more cards dealt`, "info", 1400);
        break;
      case "started":
        announce("New race started.");
        break;
      case "joined":
        snackbar(`${event.name} joined`, "info", 1200);
        break;
      case "left":
        snackbar(`${event.name} left`, "info", 1200);
        break;
      case "chat":
        snackbar(`${event.name}: ${event.text}`, "info", 2200);
        break;
    }
    this.render();
    if (room.status === "finished") this.announceWinner(room);
  }

  private onReply(reply: ReplyMessage): void {
    if (reply.type === "rejected") {
      snackbar(reply.reason, "err", 1800);
      if (reply.action === "claim" && this.lastClaim.length) {
        this.board.flash(this.lastClaim, "bad");
        this.board.clearSelection();
      }
    } else if (reply.type === "error") {
      snackbar(reply.message, "err");
    }
  }

  private onStatus(status: ConnStatus, detail?: string): void {
    this.status = status;
    const label: Record<ConnStatus, string> = {
      connecting: "Connecting…",
      connected: "Connected",
      reconnecting: "Reconnecting…",
      closed: "Disconnected",
      error: detail ?? "Error",
    };
    this.statusChip.textContent = label[status];
    this.statusChip.style.color =
      status === "connected" ? "var(--md-sys-color-primary)" : "var(--md-sys-color-on-surface-variant)";
    if (status === "error" && detail) snackbar(detail, "err");
  }

  // ---- actions -----------------------------------------------------------
  private attemptClaim(trio: [number, number, number]): void {
    this.lastClaim = trio;
    this.client.claim(trio);
    this.board.clearSelection();
  }

  private amHost(): boolean {
    return !!this.room && this.room.hostId === this.myId;
  }

  // ---- rendering ---------------------------------------------------------
  private renderConnecting(): void {
    clear(this.body);
    this.body.appendChild(
      el(
        "div",
        { class: "panel" },
        el("p", { class: "body-l" }, "Connecting to the room…"),
      ),
    );
  }

  private renderError(message: string): void {
    clear(this.body);
    this.body.appendChild(
      el(
        "div",
        { class: "panel" },
        el("h3", { class: "title-l" }, "Could not join"),
        el("p", { class: "body-m" }, message),
        button("Back to menu", { variant: "outlined", onClick: () => this.opts.onExit() }),
      ),
    );
  }

  private render(): void {
    if (!this.room) return this.renderConnecting();
    if (this.room.status === "lobby") this.renderLobby();
    else this.renderGame();
  }

  private renderLobby(): void {
    const room = this.room!;
    clear(this.body);

    const codeBox = el(
      "div",
      { class: "surface", style: "padding:20px;text-align:center;display:flex;flex-direction:column;gap:8px;align-items:center" },
      el("span", { class: "label-l", style: "color:var(--md-sys-color-on-surface-variant)" }, "Room code"),
      el("div", { class: "display-l mono", style: "letter-spacing:10px" }, room.code),
      button("Copy code", {
        variant: "text",
        onClick: () => {
          navigator.clipboard?.writeText(room.code).then(
            () => snackbar("Code copied", "ok", 1200),
            () => snackbar(room.code, "info"),
          );
        },
      }),
    );

    const actions = el("div", { class: "row" });
    if (this.amHost()) {
      actions.appendChild(
        button("Start race", { variant: "filled", size: "lg", icon: icon("play", 20), onClick: () => this.client.start() }),
      );
    } else {
      actions.appendChild(el("p", { class: "body-l" }, "Waiting for the host to start…"));
    }

    this.body.appendChild(
      el(
        "div",
        { class: "game" },
        el("div", { class: "stack" }, codeBox, actions),
        this.buildScoreboard("Players"),
      ),
    );
  }

  private renderGame(): void {
    const room = this.room!;
    const myScore = room.players.find((p) => p.id === this.myId)?.score ?? 0;

    // Update the shared board tiles.
    this.board.setBoard(room.board.map((id) => cardFromId(id)));
    this.board.setLocked(room.status !== "playing");

    const hud = el(
      "div",
      { class: "hud" },
      el("div", { class: "hud__stat" }, el("span", {}, "Round"), el("span", { class: "mono" }, String(room.round))),
      el("div", { class: "hud__stat" }, el("span", {}, "Your score"), el("span", { class: "mono" }, String(myScore))),
      el("div", { class: "hud__stat" }, el("span", {}, "Deck"), el("span", { class: "mono" }, String(room.deckRemaining))),
      el("div", { class: "hud__spacer" }),
      room.status === "playing"
        ? button("No set? Deal 3", { variant: "tonal", icon: icon("add", 20), onClick: () => this.client.dealMore() })
        : this.amHost()
          ? button("Play again", { variant: "filled", icon: icon("refresh", 20), onClick: () => this.client.start() })
          : el("span", { class: "chip" }, "Game over"),
    );

    const left = el("div", { class: "stack" });
    if (room.status === "finished") left.appendChild(this.buildWinnerBanner(room));
    left.append(hud, this.board.element);

    clear(this.body);
    this.body.appendChild(el("div", { class: "game" }, left, this.buildScoreboard("Scores")));
  }

  private buildWinnerBanner(room: RoomView): HTMLElement {
    const names = room.winnerIds.map((id) => room.players.find((p) => p.id === id)?.name ?? "?");
    const text =
      names.length === 0
        ? "No sets found — it's a draw"
        : names.length === 1
          ? `${names[0]} wins!`
          : `Draw: ${names.join(" & ")}`;
    return el(
      "div",
      { class: "home-card home-card--accent", style: "flex-direction:row;align-items:center;gap:12px" },
      icon("trophy", 28),
      el("h3", { class: "title-l" }, text),
    );
  }

  private buildScoreboard(heading: string): HTMLElement {
    const room = this.room!;
    const list = el("div", { class: "stack", style: "gap:8px" });
    for (const p of room.players) {
      const row = el(
        "div",
        { class: `player-row${p.id === this.myId ? " is-me" : ""}` },
        el("span", { class: `dot${p.connected ? " on" : ""}`, title: p.connected ? "online" : "offline" }),
        el("span", { class: "name" }, p.name + (p.id === this.myId ? " (you)" : "")),
        p.id === room.hostId ? el("span", { class: "host-badge" }, "HOST") : null,
        el("span", { class: "score mono" }, String(p.score)),
      );
      list.appendChild(row);
    }
    return el("div", { class: "panel" }, el("h3", { class: "title-m" }, heading), list);
  }

  private announceWinner(room: RoomView): void {
    const names = room.winnerIds.map((id) => room.players.find((p) => p.id === id)?.name ?? "?");
    announce(names.length === 1 ? `${names[0]} wins the race.` : "The race is a draw.");
  }
}
