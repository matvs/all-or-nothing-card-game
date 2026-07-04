import { bestFor, formatTime, type Difficulty, type SoloMode } from "../../game/highScores.js";
import { button, el, snackbar } from "../dom.js";
import { icon } from "../icons.js";
import { ROOM_CODE_LENGTH } from "../../../shared/protocol.js";

export interface HomeCallbacks {
  onPlaySolo: (mode: SoloMode, difficulty: Difficulty) => void;
  onCreateRoom: (name: string) => void;
  onJoinRoom: (name: string, code: string) => void;
}

let segGroupSeq = 0;

/** A Bootstrap segmented control: a btn-group of radio toggle buttons. */
function segmented<T extends string>(
  options: { value: T; label: string }[],
  initial: T,
  onChange: (value: T) => void,
): { element: HTMLElement; get: () => T } {
  let current = initial;
  const name = `seg${++segGroupSeq}`;
  const wrap = el("div", { class: "btn-group", role: "group" });
  for (const opt of options) {
    const id = `${name}-${opt.value}`;
    const input = el("input", {
      type: "radio",
      class: "btn-check",
      name,
      id,
      autocomplete: "off",
      checked: opt.value === current,
    }) as HTMLInputElement;
    const label = el("label", { class: "btn btn-outline-primary", for: id }, opt.label);
    input.addEventListener("change", () => {
      if (input.checked) {
        current = opt.value;
        onChange(current);
      }
    });
    wrap.append(input, label);
  }
  return { element: wrap, get: () => current };
}

function field(labelText: string, control: HTMLElement): HTMLElement {
  return el("div", {}, el("label", { class: "form-label fw-semibold mb-1 d-block" }, labelText), control);
}

export function createHomeScreen(cb: HomeCallbacks): HTMLElement {
  let mode: SoloMode = "relaxed";
  let difficulty: Difficulty = "normal";

  const bestChip = el("span", {
    class: "badge rounded-pill text-bg-secondary d-inline-flex align-items-center gap-1 align-self-start fw-normal py-2 px-3",
  });
  const refreshBest = () => {
    const best = bestFor(mode, difficulty);
    bestChip.replaceChildren(
      icon("trophy", 16),
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
    { class: "col-12 col-lg-6" },
    el(
      "div",
      { class: "card h-100 shadow-sm" },
      el(
        "div",
        { class: "card-body d-flex flex-column gap-3" },
        el("h2", { class: "card-title h4 mb-0" }, "Solo"),
        el(
          "p",
          { class: "card-text text-body-secondary mb-0" },
          "Find as many sets as you can. Easy trims the deck to one shading; Timed gives you three minutes; Hard drops the hints.",
        ),
        field("Mode", modeSeg.element),
        field("Difficulty", diffSeg.element),
        bestChip,
        button("Play solo", {
          variant: "filled",
          size: "lg",
          icon: icon("play", 20),
          onClick: () => cb.onPlaySolo(modeSeg.get(), diffSeg.get()),
        }),
      ),
    ),
  );

  // ---- Multiplayer ----
  const nameInput = el("input", {
    type: "text",
    class: "form-control",
    maxlength: "20",
    placeholder: "Your name",
    "aria-label": "Your name",
    value: suggestName(),
  }) as HTMLInputElement;
  const codeInput = el("input", {
    type: "text",
    class: "form-control code-input",
    maxlength: String(ROOM_CODE_LENGTH),
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

  const createBtn = button("Create room", {
    variant: "filled",
    icon: icon("group", 20),
    onClick: () => {
      const name = requireName();
      if (name) cb.onCreateRoom(name);
    },
  });
  createBtn.classList.add("w-100");

  const joinBtn = button("Join", {
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
  });

  const raceCard = el(
    "div",
    { class: "col-12 col-lg-6" },
    el(
      "div",
      { class: "card h-100 shadow-sm border-primary" },
      el(
        "div",
        { class: "card-body d-flex flex-column gap-3" },
        el("h2", { class: "card-title h4 mb-0 text-primary" }, "Multiplayer race"),
        el(
          "p",
          { class: "card-text text-body-secondary mb-0" },
          "Everyone races on the same board. First to claim a valid set scores it and three fresh cards drop in. Share the 4-letter room code.",
        ),
        field("Name", nameInput),
        createBtn,
        el("hr", { class: "my-1" }),
        field("Join with a code", el("div", { class: "input-group" }, codeInput, joinBtn)),
      ),
    ),
  );

  return el(
    "div",
    {},
    el(
      "div",
      { class: "py-3 mb-2" },
      el("h1", { class: "display-4 fw-bold mb-2" }, "Find the set."),
      el(
        "p",
        { class: "lead text-body-secondary mb-0", style: "max-width:62ch" },
        "Three cards make a set when — for colour, shape, number and shading — each feature is all the same or all different across the three. Classic SET, canvas-drawn.",
      ),
    ),
    el("div", { class: "row g-4" }, soloCard, raceCard),
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
