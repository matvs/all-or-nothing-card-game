import type { Difficulty } from "../../ai/types.js";
import { MATCH_LENGTH_PRESETS, type MatchLengthPreset } from "../../engine/rounds.js";
import type { StatsResponse } from "../../../shared/protocol.js";
import { h, setChildren } from "../dom.js";
import { openRulesModal } from "../modals.js";
import { isSoundEnabled, setSoundEnabled } from "../sound.js";

const NAME_KEY = "aon.name";

export interface MenuChoiceSolo {
  mode: "solo";
  name: string;
  difficulty: Difficulty;
  roundPeak: number;
  dealerRestriction: boolean;
}
export interface MenuChoiceCreate {
  mode: "create";
  name: string;
  difficulty: Difficulty;
  roundPeak: number;
  dealerRestriction: boolean;
}
export interface MenuChoiceJoin {
  mode: "join";
  name: string;
  code: string;
  asSpectator: boolean;
}
export type MenuChoice = MenuChoiceSolo | MenuChoiceCreate | MenuChoiceJoin;

export function loadPlayerName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function savePlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}

function segControl<T extends string>(options: { value: T; label: string }[], initial: T, onChange: (v: T) => void): HTMLElement {
  const wrap = h("div.seg", { role: "group" });
  let current = initial;
  const buttons = options.map(({ value, label }) =>
    h(
      "button",
      {
        type: "button",
        "aria-pressed": String(value === current),
        onClick: () => {
          current = value;
          for (const [i, b] of buttons.entries()) b.setAttribute("aria-pressed", String(options[i].value === current));
          onChange(current);
        },
      },
      label
    )
  );
  setChildren(wrap, ...buttons);
  return wrap;
}

export function renderMenu(root: HTMLElement, onChoice: (choice: MenuChoice) => void): void {
  let difficulty: Difficulty = "medium";
  let lengthPreset: MatchLengthPreset = "standard";
  let dealerRestriction = true;
  let asSpectator = false;

  const nameInput = h("input", {
    type: "text",
    id: "player-name",
    maxLength: "20",
    value: loadPlayerName(),
    placeholder: "e.g. Matvs",
    autocomplete: "nickname",
  }) as HTMLInputElement;

  const codeInput = h("input.code-input", {
    type: "text",
    id: "room-code",
    maxLength: "4",
    placeholder: "ABCD",
    autocomplete: "off",
    spellcheck: "false",
    onInput: () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, "");
    },
  }) as HTMLInputElement;

  const soloError = h("p.menu-error", { "aria-live": "polite" });
  const joinError = h("p.menu-error", { "aria-live": "polite" });

  const requireName = (errorEl: HTMLElement): string | null => {
    const name = nameInput.value.trim();
    if (!name) {
      setChildren(errorEl, "First give yourself a name (top of the card).");
      nameInput.focus();
      return null;
    }
    savePlayerName(name);
    setChildren(errorEl, "");
    return name;
  };

  const statsLine = h("p.stats-line", { "aria-live": "polite" });
  const lookupStats = async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/stats/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error();
      const stats = (await res.json()) as StatsResponse;
      setChildren(
        statsLine,
        stats.gamesPlayed === 0
          ? `No multiplayer games on record for “${stats.name}” yet.`
          : `“${stats.name}”: ${stats.gamesWon} won of ${stats.gamesPlayed} multiplayer game${stats.gamesPlayed === 1 ? "" : "s"}.`
      );
    } catch {
      setChildren(statsLine, "Stats unavailable (server offline?).");
    }
  };

  const soundToggle = h(
    "button.btn.btn-quiet.btn-small",
    {
      type: "button",
      "aria-pressed": String(isSoundEnabled()),
      onClick: () => {
        const next = !isSoundEnabled();
        setSoundEnabled(next);
        soundToggle.setAttribute("aria-pressed", String(next));
        setChildren(soundToggle, next ? "Sound: on" : "Sound: off");
      },
    },
    isSoundEnabled() ? "Sound: on" : "Sound: off"
  );

  const screen = h(
    "div.menu-screen",
    {},
    h(
      "div.menu-card",
      {},
      h(
        "header.menu-masthead",
        {},
        h("h1.menu-title", {}, "All ", h("span.amp", {}, "or"), " Nothing"),
        underline(),
        h("p.menu-sub", {}, "A trick-taking game of exact promises. Bid true or score nothing.")
      ),
      h(
        "section.menu-panel",
        {},
        h("h2", {}, "Who's playing?"),
        h(
          "div.field-row",
          {},
          h("div.field", {}, h("label", { htmlFor: "player-name" }, "Your name"), nameInput),
          h("button.btn.btn-quiet.btn-small", { type: "button", onClick: lookupStats }, "My record"),
          soundToggle
        ),
        statsLine
      ),
      h(
        "div.menu-split",
        {},
        h(
          "section.menu-panel",
          {},
          h("h2", {}, "Solo table"),
          h(
            "div.field-row",
            {},
            h(
              "div.field",
              {},
              h("label", {}, "Opponents"),
              segControl<Difficulty>(
                [
                  { value: "easy", label: "Easy" },
                  { value: "medium", label: "Medium" },
                  { value: "hard", label: "Hard" },
                ],
                difficulty,
                (v) => (difficulty = v)
              )
            )
          ),
          h(
            "div.field-row",
            {},
            h(
              "div.field",
              {},
              h("label", {}, "Match length"),
              segControl<MatchLengthPreset>(
                [
                  { value: "short", label: "Short · 9" },
                  { value: "standard", label: "Standard · 15" },
                  { value: "long", label: "Long · 25" },
                ],
                lengthPreset,
                (v) => (lengthPreset = v)
              )
            )
          ),
          h(
            "label.check-row",
            {},
            h("input", {
              type: "checkbox",
              checked: dealerRestriction,
              onChange: (e: Event) => (dealerRestriction = (e.target as HTMLInputElement).checked),
            }),
            "Hook rule (dealer can't even the bids)"
          ),
          h(
            "div.menu-actions",
            {},
            h(
              "button.btn.btn-primary",
              {
                type: "button",
                onClick: () => {
                  const name = requireName(soloError);
                  if (!name) return;
                  onChoice({ mode: "solo", name, difficulty, roundPeak: MATCH_LENGTH_PRESETS[lengthPreset], dealerRestriction });
                },
              },
              "Deal me in"
            )
          ),
          soloError
        ),
        h(
          "section.menu-panel",
          {},
          h("h2", {}, "Play with people"),
          h(
            "div.menu-actions",
            {},
            h(
              "button.btn",
              {
                type: "button",
                onClick: () => {
                  const name = requireName(joinError);
                  if (!name) return;
                  onChoice({ mode: "create", name, difficulty, roundPeak: MATCH_LENGTH_PRESETS[lengthPreset], dealerRestriction });
                },
              },
              "Open a room"
            )
          ),
          h("p.lobby-hint", { style: { margin: "12px 0 6px" } }, "…or join one with a code:"),
          h(
            "div.field-row",
            {},
            h("div.field", {}, h("label", { htmlFor: "room-code" }, "Room code"), codeInput),
            h(
              "button.btn",
              {
                type: "button",
                onClick: () => {
                  const name = requireName(joinError);
                  if (!name) return;
                  if (codeInput.value.length !== 4) {
                    setChildren(joinError, "Codes are exactly 4 letters.");
                    codeInput.focus();
                    return;
                  }
                  onChoice({ mode: "join", name, code: codeInput.value, asSpectator });
                },
              },
              "Join"
            )
          ),
          h(
            "label.check-row",
            {},
            h("input", {
              type: "checkbox",
              onChange: (e: Event) => (asSpectator = (e.target as HTMLInputElement).checked),
            }),
            "Just watching (spectator)"
          ),
          joinError
        )
      ),
      h(
        "p.menu-footnote",
        {},
        h("button", { type: "button", onClick: openRulesModal }, "How to play"),
        " · Rooms hold 2–4 players; empty chairs are taken by the house AIs. ",
        h("br"),
        "Born as a shape-matching toy in 2018 — the court cards still remember."
      )
    )
  );

  setChildren(root, screen);
}

function underline(): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 300 14");
  svg.setAttribute("class", "menu-underline");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M4 9 C 60 3, 120 12, 170 7 S 270 6, 296 8");
  svg.appendChild(path);
  return svg;
}
