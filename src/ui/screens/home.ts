import { bestFor, formatTime, type Difficulty, type SoloMode } from "../../game/highScores.js";
import { button, el, snackbar } from "../dom.js";
import { icon } from "../icons.js";
import { ROOM_CODE_LENGTH } from "../../../shared/protocol.js";

export interface HomeCallbacks {
  onPlaySolo: (mode: SoloMode, difficulty: Difficulty) => void;
  onCreateRoom: (name: string) => void;
  onJoinRoom: (name: string, code: string) => void;
}

function segmented<T extends string>(
  options: { value: T; label: string }[],
  initial: T,
  onChange: (value: T) => void,
): { element: HTMLElement; get: () => T } {
  let current = initial;
  const wrap = el("div", { class: "segmented", role: "group" });
  const buttons = options.map((opt) => {
    const b = el("button", { type: "button", "aria-pressed": String(opt.value === current) }, opt.label);
    b.addEventListener("click", () => {
      current = opt.value;
      for (const other of buttons) other.setAttribute("aria-pressed", String(other === b));
      onChange(current);
    });
    wrap.appendChild(b);
    return b;
  });
  return { element: wrap, get: () => current };
}

export function createHomeScreen(cb: HomeCallbacks): HTMLElement {
  let mode: SoloMode = "relaxed";
  let difficulty: Difficulty = "normal";

  const bestChip = el("div", { class: "chip" });
  const refreshBest = () => {
    const best = bestFor(mode, difficulty);
    bestChip.replaceChildren(
      icon("trophy", 18),
      document.createTextNode(
        best
          ? `Best: ${best.bestScore} sets` + (best.bestTimeMs != null ? ` · ${formatTime(best.bestTimeMs)}` : "")
          : "No games yet",
      ),
    );
  };

  const modeSeg = segmented<SoloMode>(
    [
      { value: "relaxed", label: "Relaxed" },
      { value: "timed", label: "Timed 3:00" },
    ],
    mode,
    (v) => {
      mode = v;
      refreshBest();
    },
  );
  const diffSeg = segmented<Difficulty>(
    [
      { value: "easy", label: "Easy" },
      { value: "normal", label: "Normal" },
      { value: "hard", label: "Hard" },
    ],
    difficulty,
    (v) => {
      difficulty = v;
      refreshBest();
    },
  );
  refreshBest();

  const soloCard = el(
    "div",
    { class: "home-card" },
    el("h3", { class: "title-l" }, "Solo"),
    el("p", { class: "body-m" }, "Find as many sets as you can. Easy trims the deck to one shading; Timed gives you three minutes; Hard drops the hints."),
    el("div", { class: "field" }, el("label", {}, "Mode"), modeSeg.element),
    el("div", { class: "field" }, el("label", {}, "Difficulty"), diffSeg.element),
    bestChip,
    button("Play solo", {
      variant: "filled",
      size: "lg",
      icon: icon("play", 20),
      onClick: () => cb.onPlaySolo(modeSeg.get(), diffSeg.get()),
    }),
  );

  // ---- Multiplayer ----
  const nameInput = el("input", {
    type: "text",
    maxlength: "20",
    placeholder: "Your name",
    "aria-label": "Your name",
    value: suggestName(),
  }) as HTMLInputElement;
  const codeInput = el("input", {
    type: "text",
    maxlength: String(ROOM_CODE_LENGTH),
    class: "code-input",
    placeholder: "CODE",
    "aria-label": "Room code",
    autocapitalize: "characters",
  }) as HTMLInputElement;
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, ROOM_CODE_LENGTH);
  });

  const requireName = (): string | null => {
    const name = nameInput.value.trim();
    if (!name) {
      snackbar("Enter a name first", "err");
      nameInput.focus();
      return null;
    }
    return name;
  };

  const raceCard = el(
    "div",
    { class: "home-card home-card--accent" },
    el("h3", { class: "title-l" }, "Multiplayer race"),
    el("p", { class: "body-m" }, "Everyone races on the same board. First to claim a valid set scores it and three fresh cards drop in. Share the 4-letter room code."),
    el("div", { class: "field" }, el("label", {}, "Name"), nameInput),
    el(
      "div",
      { class: "row" },
      button("Create room", {
        variant: "filled",
        icon: icon("group", 20),
        onClick: () => {
          const name = requireName();
          if (name) cb.onCreateRoom(name);
        },
      }),
    ),
    el(
      "div",
      { class: "field" },
      el("label", {}, "Join with a code"),
      el(
        "div",
        { class: "row" },
        codeInput,
        button("Join", {
          variant: "tonal",
          onClick: () => {
            const name = requireName();
            if (!name) return;
            if (codeInput.value.length !== ROOM_CODE_LENGTH) {
              snackbar("Enter the 4-letter code", "err");
              codeInput.focus();
              return;
            }
            cb.onJoinRoom(name, codeInput.value);
          },
        }),
      ),
    ),
  );

  return el(
    "div",
    { class: "stack" },
    el(
      "div",
      { class: "hero" },
      el("h1", { class: "display-l" }, "Find the set."),
      el(
        "p",
        { class: "body-l" },
        "Three cards make a set when — for colour, shape, number and shading — each feature is all the same or all different across the three. Classic SET, canvas-drawn, now in Material You.",
      ),
    ),
    el("div", { class: "home-grid" }, soloCard, raceCard),
  );
}

function suggestName(): string {
  try {
    const saved = localStorage.getItem("aon-set:name");
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  const animals = ["Fox", "Lynx", "Wren", "Otter", "Hawk", "Vole", "Marten", "Heron"];
  return animals[Math.floor(Math.random() * animals.length)];
}
