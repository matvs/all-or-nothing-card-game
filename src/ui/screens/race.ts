import { button, el } from "../dom.js";

/** Placeholder — replaced by the full STOMP race screen once the server lands. */
export interface RaceOptions {
  intent:
    | { kind: "create"; name: string }
    | { kind: "join"; name: string; code: string };
  onExit: () => void;
}

export function createRaceScreen(opts: RaceOptions): { element: HTMLElement; destroy: () => void } {
  const element = el(
    "div",
    { class: "stack" },
    el("h2", { class: "headline-m" }, "Multiplayer race"),
    el("p", { class: "body-l" }, "Connecting…"),
    button("Back", { variant: "outlined", onClick: () => opts.onExit() }),
  );
  return { element, destroy: () => {} };
}
