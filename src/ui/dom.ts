/** Tiny dependency-free DOM helpers + Bootstrap 5.3 button, toast, modal, a11y live region. */
import Modal from "bootstrap/js/dist/modal";
import Toast from "bootstrap/js/dist/toast";

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

// ---- Buttons (Bootstrap) --------------------------------------------------
interface ButtonOptions {
  variant?: "filled" | "tonal" | "outlined" | "text" | "danger";
  size?: "md" | "lg";
  icon?: SVGElement;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Map our semantic variants onto Bootstrap button classes. */
const VARIANT_CLASS: Record<NonNullable<ButtonOptions["variant"]>, string> = {
  filled: "btn-primary",
  tonal: "btn-secondary",
  outlined: "btn-outline-secondary",
  text: "btn-link",
  danger: "btn-danger",
};

export function button(label: string, opts: ButtonOptions = {}): HTMLButtonElement {
  const classes = [
    "btn",
    VARIANT_CLASS[opts.variant ?? "filled"],
    opts.size === "lg" ? "btn-lg" : "",
    "d-inline-flex",
    "align-items-center",
    "justify-content-center",
    "gap-2",
  ]
    .filter(Boolean)
    .join(" ");
  const b = el("button", { class: classes, type: "button" }) as HTMLButtonElement;
  if (opts.icon) b.appendChild(opts.icon);
  b.appendChild(document.createTextNode(label));
  if (opts.ariaLabel) b.setAttribute("aria-label", opts.ariaLabel);
  if (opts.disabled) b.disabled = true;
  if (opts.onClick) b.addEventListener("click", opts.onClick);
  return b;
}

export function iconButton(
  iconEl: SVGElement,
  ariaLabel: string,
  onClick: () => void,
  className = "btn btn-outline-secondary",
): HTMLButtonElement {
  const b = el("button", {
    class: `${className} d-inline-flex align-items-center justify-content-center`,
    type: "button",
    "aria-label": ariaLabel,
  }) as HTMLButtonElement;
  b.appendChild(iconEl);
  b.addEventListener("click", onClick);
  return b;
}

// ---- Toast (Bootstrap) ----------------------------------------------------
let toastHost: HTMLElement | null = null;
function ensureToastHost(): HTMLElement {
  if (!toastHost) {
    toastHost = el("div", {
      class: "toast-container position-fixed bottom-0 start-50 translate-middle-x p-3",
      style: "z-index:1090",
    });
    document.body.appendChild(toastHost);
  }
  return toastHost;
}

export function snackbar(message: string, variant: "info" | "ok" | "err" = "info", timeout = 2600): void {
  const host = ensureToastHost();
  const bg = variant === "ok" ? "text-bg-success" : variant === "err" ? "text-bg-danger" : "text-bg-dark";
  const toastEl = el(
    "div",
    { class: `toast align-items-center border-0 ${bg}`, role: "status", "aria-live": "polite", "aria-atomic": "true" },
    el("div", { class: "d-flex" }, el("div", { class: "toast-body" }, message)),
  );
  host.appendChild(toastEl);
  const toast = new Toast(toastEl, { delay: timeout, autohide: true });
  toastEl.addEventListener("hidden.bs.toast", () => toastEl.remove());
  toast.show();
}

// ---- Accessible live region ----------------------------------------------
let liveRegion: HTMLElement | null = null;
export function announce(message: string): void {
  if (!liveRegion) {
    liveRegion = el("div", { class: "visually-hidden", "aria-live": "assertive", role: "alert" });
    document.body.appendChild(liveRegion);
  }
  // Clear then set so repeated identical messages are still announced.
  liveRegion.textContent = "";
  window.setTimeout(() => {
    if (liveRegion) liveRegion.textContent = message;
  }, 30);
}

// ---- Modal (Bootstrap) ----------------------------------------------------
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
  const dismissable = opts.dismissable !== false;

  const footer = el("div", { class: "modal-footer" });
  const header = el(
    "div",
    { class: "modal-header" },
    el("h5", { class: "modal-title" }, opts.title),
    dismissable ? el("button", { type: "button", class: "btn-close", "aria-label": "Close" }) : null,
  );
  const modalEl = el(
    "div",
    { class: "modal fade", tabindex: "-1", "aria-modal": "true", role: "dialog", "aria-label": opts.title },
    el(
      "div",
      { class: "modal-dialog modal-dialog-centered" },
      el("div", { class: "modal-content" }, header, el("div", { class: "modal-body d-flex flex-column gap-2" }, ...opts.body), footer),
    ),
  );
  document.body.appendChild(modalEl);

  const modal = new Modal(modalEl, { backdrop: dismissable ? true : "static", keyboard: dismissable });
  const close = () => modal.hide();

  header.querySelector<HTMLButtonElement>(".btn-close")?.addEventListener("click", close);

  for (const action of opts.actions) {
    footer.appendChild(
      button(action.label, {
        variant: action.variant ?? "outlined",
        onClick: () => {
          action.onClick?.();
          if (!action.keepOpen) close();
        },
      }),
    );
  }

  modalEl.addEventListener("hidden.bs.modal", () => modalEl.remove());
  modal.show();
  return close;
}
