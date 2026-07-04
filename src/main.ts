import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/app.css";
import { createHomeScreen } from "./ui/screens/home.js";
import { SoloGame } from "./game/soloGame.js";
import { createRaceScreen } from "./ui/screens/race.js";
import { brandLogo } from "./ui/logo.js";
import { clear, el, iconButton } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import type { Difficulty, SoloMode } from "./game/highScores.js";

const THEME_KEY = "aon-set:theme";

interface Screen {
  element: HTMLElement;
  destroy?: () => void;
}

const app = document.getElementById("app")!;
const content = el("main", { class: "container py-4" });
let current: Screen | null = null;

function mount(screen: Screen): void {
  current?.destroy?.();
  current = screen;
  clear(content);
  content.appendChild(screen.element);
  window.scrollTo(0, 0);
}

function goHome(): void {
  mount({
    element: createHomeScreen({
      onPlaySolo: (mode, difficulty) => playSolo(mode, difficulty),
      onCreateRoom: (name) => playRace({ kind: "create", name }),
      onJoinRoom: (name, code) => playRace({ kind: "join", name, code }),
    }),
  });
}

function playSolo(mode: SoloMode, difficulty: Difficulty): void {
  const game = new SoloGame({ mode, difficulty, onExit: goHome });
  mount({ element: game.element, destroy: () => game.destroy() });
}

function playRace(intent:
  | { kind: "create"; name: string }
  | { kind: "join"; name: string; code: string }): void {
  const screen = createRaceScreen({ intent, onExit: goHome });
  mount(screen);
}

// ---- Theme (Bootstrap 5.3 native data-bs-theme) -------------------------
function applyTheme(theme: "light" | "dark"): void {
  document.documentElement.setAttribute("data-bs-theme", theme);
}

function currentTheme(): "light" | "dark" {
  const explicit = document.documentElement.getAttribute("data-bs-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initTheme(): void {
  let theme: "light" | "dark" = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") theme = saved;
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

function buildNavbar(): HTMLElement {
  const brand = el(
    "button",
    {
      class: "navbar-brand btn btn-link d-inline-flex align-items-center gap-2 p-0 m-0 fw-bold fs-5 text-white text-decoration-none",
      type: "button",
      "aria-label": "Home",
    },
    brandLogo(30),
    el("span", {}, "All or Nothing"),
  );
  brand.addEventListener("click", goHome);

  const themeToggle = iconButton(
    icon("dark", 20),
    "Toggle light/dark theme",
    () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* ignore */
      }
    },
    "btn btn-outline-light btn-sm",
  );

  const inner = el(
    "div",
    { class: "container d-flex align-items-center" },
    brand,
    el("div", { class: "ms-auto" }, themeToggle),
  );
  return el("nav", { class: "navbar bg-primary sticky-top shadow-sm", "data-bs-theme": "dark" }, inner);
}

initTheme();
app.append(buildNavbar(), content);
goHome();
