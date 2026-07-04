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

    this.titleEl = el("h2", { class: "h4 mb-0" }, "Race");
    this.statusChip = el("span", { class: "badge rounded-pill text-bg-secondary" }, "Connecting…");
    this.body = el("div", {});

    const back = iconButton(icon("back"), "Leave room", () => this.opts.onExit());
    this.element = el(
      "div",
      {},
      el(
        "div",
        { class: "d-flex align-items-center gap-2 mb-3" },
        back,
        this.titleEl,
        el("div", { class: "ms-auto" }, this.statusChip),
      ),
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
    const tone =
      status === "connected" ? "text-bg-success" : status === "error" ? "text-bg-danger" : "text-bg-secondary";
    this.statusChip.className = `badge rounded-pill ${tone}`;
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
        { class: "card shadow-sm" },
        el("div", { class: "card-body" }, el("p", { class: "mb-0" }, "Connecting to the room…")),
      ),
    );
  }

  private renderError(message: string): void {
    clear(this.body);
    this.body.appendChild(
      el(
        "div",
        { class: "card shadow-sm" },
        el(
          "div",
          { class: "card-body d-flex flex-column gap-3 align-items-start" },
          el("h3", { class: "h5 mb-0" }, "Could not join"),
          el("p", { class: "mb-0" }, message),
          button("Back to menu", { variant: "outlined", onClick: () => this.opts.onExit() }),
        ),
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
      { class: "card shadow-sm text-center" },
      el(
        "div",
        { class: "card-body d-flex flex-column gap-2 align-items-center py-4" },
        el("span", { class: "small text-uppercase text-body-secondary fw-semibold" }, "Room code"),
        el("div", { class: "display-4 fw-bold font-monospace room-code" }, room.code),
        button("Copy code", {
          variant: "text",
          onClick: () => {
            navigator.clipboard?.writeText(room.code).then(
              () => snackbar("Code copied", "ok", 1200),
              () => snackbar(room.code, "info"),
            );
          },
        }),
      ),
    );

    const actionsCol = el("div", { class: "d-flex flex-column gap-3" }, codeBox);
    if (this.amHost()) {
      actionsCol.appendChild(
        button("Start race", { variant: "filled", size: "lg", icon: icon("play", 20), onClick: () => this.client.start() }),
      );
    } else {
      actionsCol.appendChild(el("p", { class: "lead text-body-secondary mb-0" }, "Waiting for the host to start…"));
    }

    this.body.appendChild(
      el(
        "div",
        { class: "row g-3" },
        el("div", { class: "col-12 col-lg-8" }, actionsCol),
        el("div", { class: "col-12 col-lg-4" }, this.buildScoreboard("Players")),
      ),
    );
  }

  private renderGame(): void {
    const room = this.room!;
    const myScore = room.players.find((p) => p.id === this.myId)?.score ?? 0;

    // Update the shared board tiles.
    this.board.setBoard(room.board.map((id) => cardFromId(id)));
    this.board.setLocked(room.status !== "playing");

    const bigNum = "fs-4 fw-bold font-monospace lh-1";
    const stat = (label: string, value: string): HTMLElement =>
      el(
        "div",
        { class: "d-flex flex-column pe-2" },
        el("span", { class: "small text-uppercase text-body-secondary lh-1 mb-1" }, label),
        el("span", { class: bigNum }, value),
      );

    const action =
      room.status === "playing"
        ? button("No set? Deal 3", { variant: "tonal", icon: icon("add", 20), onClick: () => this.client.dealMore() })
        : this.amHost()
          ? button("Play again", { variant: "filled", icon: icon("refresh", 20), onClick: () => this.client.start() })
          : el("span", { class: "badge rounded-pill text-bg-secondary align-self-center" }, "Game over");

    const hud = el(
      "div",
      { class: "card shadow-sm" },
      el(
        "div",
        { class: "card-body d-flex flex-wrap align-items-center gap-3 py-2" },
        stat("Round", String(room.round)),
        stat("Your score", String(myScore)),
        stat("Deck", String(room.deckRemaining)),
        el("div", { class: "ms-auto" }, action),
      ),
    );

    const left = el("div", { class: "d-flex flex-column gap-3" });
    if (room.status === "finished") left.appendChild(this.buildWinnerBanner(room));
    left.append(hud, this.board.element);

    clear(this.body);
    this.body.appendChild(
      el(
        "div",
        { class: "row g-3" },
        el("div", { class: "col-12 col-lg-8" }, left),
        el("div", { class: "col-12 col-lg-4" }, this.buildScoreboard("Scores")),
      ),
    );
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
      { class: "alert alert-primary d-flex align-items-center gap-2 mb-0", role: "alert" },
      icon("trophy", 24),
      el("span", { class: "fs-5 fw-semibold" }, text),
    );
  }

  private buildScoreboard(heading: string): HTMLElement {
    const room = this.room!;
    const list = el("ul", { class: "list-group list-group-flush" });
    for (const p of room.players) {
      const row = el(
        "li",
        { class: `list-group-item d-flex align-items-center gap-2${p.id === this.myId ? " list-group-item-primary" : ""}` },
        el("span", { class: `status-dot${p.connected ? " on" : ""}`, title: p.connected ? "online" : "offline" }),
        el("span", { class: "flex-grow-1 fw-semibold" }, p.name + (p.id === this.myId ? " (you)" : "")),
        p.id === room.hostId ? el("span", { class: "badge text-bg-primary" }, "HOST") : null,
        el("span", { class: "fw-bold font-monospace" }, String(p.score)),
      );
      list.appendChild(row);
    }
    return el(
      "div",
      { class: "card shadow-sm" },
      el("div", { class: "card-header fw-semibold" }, heading),
      list,
    );
  }

  private announceWinner(room: RoomView): void {
    const names = room.winnerIds.map((id) => room.players.find((p) => p.id === id)?.name ?? "?");
    announce(names.length === 1 ? `${names[0]} wins the race.` : "The race is a draw.");
  }
}
