/** Tiny dependency-free DOM helpers + MD3 ripple, snackbar, dialog, a11y live region. */

type Props = Record<string, unknown>;
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = String(value);
    else if (key === "text") node.textContent = String(value);
    else if (key === "html") node.innerHTML = String(value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === "dataset" && typeof value === "object") {
      Object.assign(node.dataset, value as Record<string, string>);
    } else if (value === true) {
      node.setAttribute(key, "");
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

/** MD3 ripple: attaches a pointer-driven expanding circle to a positioned element. */
export function attachRipple(element: HTMLElement): void {
  element.addEventListener("pointerdown", (event) => {
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    element.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  });
}

interface ButtonOptions {
  variant?: "filled" | "tonal" | "outlined" | "text" | "danger";
  size?: "md" | "lg";
  icon?: SVGElement;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function button(label: string, opts: ButtonOptions = {}): HTMLButtonElement {
  const b = el("button", {
    class: `btn btn--${opts.variant ?? "filled"}${opts.size === "lg" ? " btn--lg" : ""}`,
    type: "button",
  }) as HTMLButtonElement;
  if (opts.icon) {
    opts.icon.classList.add("btn__icon");
    b.appendChild(opts.icon);
  }
  b.appendChild(document.createTextNode(label));
  if (opts.ariaLabel) b.setAttribute("aria-label", opts.ariaLabel);
  if (opts.disabled) b.disabled = true;
  if (opts.onClick) b.addEventListener("click", opts.onClick);
  attachRipple(b);
  return b;
}

export function iconButton(iconEl: SVGElement, ariaLabel: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", { class: "icon-btn", type: "button", "aria-label": ariaLabel }) as HTMLButtonElement;
  b.appendChild(iconEl);
  b.addEventListener("click", onClick);
  attachRipple(b);
  return b;
}

// ---- Snackbar -------------------------------------------------------------
let snackHost: HTMLElement | null = null;
function ensureSnackHost(): HTMLElement {
  if (!snackHost) {
    snackHost = el("div", { class: "snackbar-host", role: "status", "aria-live": "polite" });
    document.body.appendChild(snackHost);
  }
  return snackHost;
}

export function snackbar(message: string, variant: "info" | "ok" | "err" = "info", timeout = 2600): void {
  const host = ensureSnackHost();
  const bar = el("div", { class: `snackbar ${variant === "info" ? "" : variant}` }, message);
  host.appendChild(bar);
  setTimeout(() => {
    bar.style.opacity = "0";
    bar.style.transition = "opacity 180ms";
    setTimeout(() => bar.remove(), 200);
  }, timeout);
}

// ---- Accessible live region ----------------------------------------------
let liveRegion: HTMLElement | null = null;
export function announce(message: string): void {
  if (!liveRegion) {
    liveRegion = el("div", { class: "sr-only", "aria-live": "assertive", role: "alert" });
    document.body.appendChild(liveRegion);
  }
  // Clear then set so repeated identical messages are still announced.
  liveRegion.textContent = "";
  window.setTimeout(() => {
    if (liveRegion) liveRegion.textContent = message;
  }, 30);
}

// ---- Dialog ---------------------------------------------------------------
export interface DialogAction {
  label: string;
  variant?: ButtonOptions["variant"];
  onClick?: () => void;
  keepOpen?: boolean;
}
export function dialog(opts: {
  title: string;
  body: Child[];
  actions: DialogAction[];
  dismissable?: boolean;
}): () => void {
  const close = () => scrim.remove();
  const actionRow = el("div", { class: "actions" });
  for (const action of opts.actions) {
    actionRow.appendChild(
      button(action.label, {
        variant: action.variant ?? "text",
        onClick: () => {
          action.onClick?.();
          if (!action.keepOpen) close();
        },
      }),
    );
  }
  const box = el(
    "div",
    { class: "dialog", role: "dialog", "aria-modal": "true", "aria-label": opts.title },
    el("h2", { class: "title-l" }, opts.title),
    ...opts.body,
    actionRow,
  );
  const scrim = el("div", { class: "scrim" }, box);
  if (opts.dismissable !== false) {
    scrim.addEventListener("click", (e) => {
      if (e.target === scrim) close();
    });
  }
  document.body.appendChild(scrim);
  return close;
}
