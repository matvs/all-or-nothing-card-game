import { h } from "./dom.js";

let container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (!container || !container.isConnected) {
    container = h("div.toast-stack", { role: "status", "aria-live": "polite" });
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(text: string, level: "info" | "warn" = "info", durationMs = 3600): void {
  const stack = ensureContainer();
  const toast = h(`div.toast.toast-${level}`, {}, text);
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-in"));
  setTimeout(() => {
    toast.classList.remove("toast-in");
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 400);
  }, durationMs);
  // Keep the stack from growing unbounded if messages flood in.
  while (stack.children.length > 5) stack.firstElementChild?.remove();
}
