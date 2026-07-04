import type { Difficulty } from "../../ai/types.js";
import type { GameSession } from "../../game/session.js";
import type { RoomSnapshot } from "../../../shared/protocol.js";
import { h, setChildren } from "../dom.js";
import { showToast } from "../toasts.js";

/**
 * Room lobby: shows the shareable code, seated players, host-editable
 * settings, and the start button. Re-rendered wholesale on each roomUpdate —
 * lobbies are small enough that diffing would be vanity.
 */
export function renderLobby(
  root: HTMLElement,
  session: GameSession,
  room: RoomSnapshot,
  myPlayerId: string,
  onLeave: () => void
): void {
  const isHost = room.hostPlayerId === myPlayerId;

  const seatCards = room.seats.map((seat, i) => {
    if (!seat) return h("div.lobby-seat.empty", {}, h("div.who", {}, "Empty chair"), h("div.tag", {}, "AI will sit here"));
    const hostMark = seat.playerId === room.hostPlayerId ? " · host" : "";
    const conn = seat.isAi ? "AI" : seat.connected ? "ready" : "connecting…";
    return h(
      `div.lobby-seat${seat.playerId === room.hostPlayerId ? ".host-seat" : ""}`,
      {},
      h("div.who", {}, seat.name),
      h("div.tag", {}, `Seat ${i + 1} · ${conn}${hostMark}`)
    );
  });

  const difficultySelect = h(
    "select",
    {
      id: "lobby-difficulty",
      disabled: !isHost,
      onChange: (e: Event) => session.updateSettings({ difficulty: (e.target as HTMLSelectElement).value as Difficulty }),
    },
    ...(["easy", "medium", "hard"] as const).map((d) =>
      h("option", { value: d, selected: room.settings.difficulty === d }, d[0].toUpperCase() + d.slice(1))
    )
  );

  const peakSelect = h(
    "select",
    {
      id: "lobby-peak",
      disabled: !isHost,
      onChange: (e: Event) => session.updateSettings({ roundPeak: Number((e.target as HTMLSelectElement).value) }),
    },
    ...[
      { v: 5, label: "Short (9 rounds)" },
      { v: 8, label: "Standard (15 rounds)" },
      { v: 13, label: "Long (25 rounds)" },
    ].map(({ v, label }) => h("option", { value: String(v), selected: room.settings.roundPeak === v }, label))
  );

  const hookCheck = h("input", {
    type: "checkbox",
    checked: room.settings.dealerRestriction,
    disabled: !isHost,
    onChange: (e: Event) => session.updateSettings({ dealerRestriction: (e.target as HTMLInputElement).checked }),
  });

  const copyBtn = h(
    "button.btn.btn-quiet.btn-small",
    {
      type: "button",
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(room.code);
          showToast(`Code ${room.code} copied.`);
        } catch {
          showToast("Couldn't copy — the code is right there though.", "warn");
        }
      },
    },
    "Copy code"
  );

  const humanCount = room.seats.filter((s) => s && !s.isAi).length;

  const screen = h(
    "div.lobby-screen",
    {},
    h(
      "div.lobby-card.menu-panel",
      {},
      h("h2", {}, "Table opened"),
      h("div.lobby-code-row", {}, h("div.lobby-code", { "aria-label": `Room code ${room.code.split("").join(" ")}` }, room.code), copyBtn),
      h("p.lobby-hint", {}, "Read this code to your friends — they join from the menu. Empty chairs get AI players when you start."),
      h("div.lobby-seats", {}, ...seatCards),
      h(
        "div.lobby-settings",
        {},
        h("div.field", {}, h("label", { htmlFor: "lobby-difficulty" }, "AI difficulty"), difficultySelect),
        h("div.field", {}, h("label", { htmlFor: "lobby-peak" }, "Match length"), peakSelect),
        h("label.check-row", {}, hookCheck, "Hook rule")
      ),
      h(
        "div.lobby-actions",
        {},
        isHost
          ? h(
              "button.btn.btn-primary",
              { type: "button", onClick: () => session.startMatch() },
              humanCount < 4 ? `Start with ${4 - humanCount} AI` : "Start match"
            )
          : h("p.lobby-hint", {}, "Waiting for the host to start…"),
        h("button.btn.btn-quiet", { type: "button", onClick: onLeave }, "Leave")
      ),
      room.spectatorCount > 0
        ? h("p.lobby-spectators", {}, `Watching from the rail: ${room.spectatorNames.join(", ")}`)
        : null
    )
  );

  setChildren(root, screen);
}
