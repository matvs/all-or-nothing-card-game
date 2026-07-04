import "./styles/md3.css";
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
const content = el("main", { class: "page" });
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

// ---- Theme --------------------------------------------------------------
function applyTheme(theme: "light" | "dark" | null): void {
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
}

function currentTheme(): "light" | "dark" {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initTheme(): void {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") applyTheme(saved);
  } catch {
    /* ignore */
  }
}

function buildAppBar(): HTMLElement {
  const brand = el(
    "button",
    { class: "app-bar__brand", type: "button", "aria-label": "Home", style: "background:none;border:none;cursor:pointer;color:inherit;font-size:1.15rem" },
    brandLogo(),
    el("span", {}, "All or Nothing"),
  );
  brand.addEventListener("click", goHome);

  const themeToggle = iconButton(icon("dark"), "Toggle light/dark theme", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  });

  return el("header", { class: "app-bar" }, brand, el("div", { class: "app-bar__spacer" }), themeToggle);
}

initTheme();
app.append(buildAppBar(), content);
goHome();
