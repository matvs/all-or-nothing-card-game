import type { Card } from "../../shared/engine/index.js";
import { describeCard } from "./palette.js";
import { drawCardFace } from "./symbols.js";

export type CardVisualState = "idle" | "hint" | "good" | "bad";

/**
 * <set-card> — one SET card rendered on its own DPI-aware canvas.
 *
 * Why a canvas-per-tile instead of one big canvas (as the original had):
 *  - each tile is a real focusable button (keyboard + screen-reader friendly),
 *  - the card surface/elevation/selection styles live in CSS on the element,
 *  - responsive CSS grid handles layout; the canvas just paints the symbols,
 *  - crisp on HiDPI and re-paints on resize / monitor DPR change.
 *
 * It still honours the brief: the CARD FACE is canvas-drawn, exactly like the
 * original. Activation (click / Enter / Space) dispatches a `card-activate`
 * CustomEvent carrying the card id.
 */
export class SetCardElement extends HTMLElement {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private _card: Card | null = null;
  private _selected = false;
  private observer: ResizeObserver | null = null;

  constructor() {
    super();
    this.canvas = document.createElement("canvas");
    this.canvas.className = "set-card__canvas";
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  connectedCallback(): void {
    if (!this.contains(this.canvas)) this.appendChild(this.canvas);
    this.setAttribute("role", "button");
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.setAttribute("aria-pressed", String(this._selected));

    this.addEventListener("click", this.onActivate);
    this.addEventListener("keydown", this.onKeydown);

    this.observer = new ResizeObserver(() => this.paint());
    this.observer.observe(this);
    this.paint();
  }

  disconnectedCallback(): void {
    this.removeEventListener("click", this.onActivate);
    this.removeEventListener("keydown", this.onKeydown);
    this.observer?.disconnect();
    this.observer = null;
  }

  set card(card: Card | null) {
    this._card = card;
    if (card) {
      this.dataset.cardId = String(card.id);
      this.setAttribute("aria-label", describeCard(card));
    } else {
      delete this.dataset.cardId;
      this.removeAttribute("aria-label");
    }
    this.paint();
  }
  get card(): Card | null {
    return this._card;
  }

  set selected(value: boolean) {
    this._selected = value;
    this.classList.toggle("is-selected", value);
    this.setAttribute("aria-pressed", String(value));
  }
  get selected(): boolean {
    return this._selected;
  }

  set state(state: CardVisualState) {
    this.classList.remove("is-hint", "is-good", "is-bad");
    if (state === "hint") this.classList.add("is-hint");
    else if (state === "good") this.classList.add("is-good");
    else if (state === "bad") this.classList.add("is-bad");
  }

  disable(disabled: boolean): void {
    this.classList.toggle("is-disabled", disabled);
    if (disabled) {
      this.setAttribute("aria-disabled", "true");
      this.tabIndex = -1;
    } else {
      this.removeAttribute("aria-disabled");
      this.tabIndex = 0;
    }
  }

  private onActivate = (): void => {
    if (this.classList.contains("is-disabled")) return;
    if (this._card == null) return;
    this.dispatchEvent(
      new CustomEvent<{ cardId: number }>("card-activate", {
        detail: { cardId: this._card.id },
        bubbles: true,
      }),
    );
  };

  private onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      this.onActivate();
    }
  };

  /** DPI-aware repaint of the card face. */
  private paint(): void {
    const rect = this.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    if (this.canvas.width !== pxW) this.canvas.width = pxW;
    if (this.canvas.height !== pxH) this.canvas.height = pxH;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, cssW, cssH);
    if (this._card) drawCardFace(this.ctx, this._card, cssW, cssH);
  }
}

/** Register the element once (safe under HMR / repeated imports). */
export function registerSetCard(): void {
  if (typeof customElements !== "undefined" && !customElements.get("set-card")) {
    customElements.define("set-card", SetCardElement);
  }
}
