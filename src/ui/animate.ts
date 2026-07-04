import type { Card } from "../engine/types.js";
import { cardBackSvg, cardFaceSvg, suitColorClass } from "./cards.js";
import { h } from "./dom.js";

/**
 * Ghost-card animation layer. Real cards render declaratively from state;
 * for motion we clone lightweight "ghost" cards into a fixed overlay and
 * fly them between measured screen positions with WAAPI. Every entry point
 * resolves immediately under prefers-reduced-motion.
 */

let layer: HTMLElement | null = null;

function ensureLayer(): HTMLElement {
  if (!layer || !layer.isConnected) {
    layer = h("div.fly-layer", { "aria-hidden": "true" });
    document.body.appendChild(layer);
  }
  return layer;
}

export function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface Point {
  x: number;
  y: number;
}

export function centerOf(el: Element | null): Point {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function makeGhost(card: Card | null, widthPx: number): HTMLElement {
  const ghost = h(`div.fly-card.playing-card${card ? `.${suitColorClass(card.suit)}` : ""}`);
  ghost.innerHTML = card ? cardFaceSvg(card) : cardBackSvg();
  ghost.style.width = `${widthPx}px`;
  return ghost;
}

function flyGhost(
  ghost: HTMLElement,
  from: Point,
  to: Point,
  opts: { durationMs: number; delayMs?: number; rotate?: number; fadeOut?: boolean }
): Promise<void> {
  const host = ensureLayer();
  host.appendChild(ghost);
  const w = ghost.offsetWidth || 74;
  const hgt = ghost.offsetHeight || w * 1.4;
  const place = (p: Point) => `translate(${p.x - w / 2}px, ${p.y - hgt / 2}px)`;
  ghost.style.transform = place(from);

  if (reducedMotion()) {
    ghost.remove();
    return Promise.resolve();
  }

  const animation = ghost.animate(
    [
      { transform: `${place(from)} rotate(0deg)`, opacity: 1 },
      {
        transform: `${place(to)} rotate(${opts.rotate ?? 0}deg)`,
        opacity: opts.fadeOut ? 0.1 : 1,
      },
    ],
    {
      duration: opts.durationMs,
      delay: opts.delayMs ?? 0,
      easing: "cubic-bezier(0.22, 0.9, 0.36, 1)",
      fill: "both",
    }
  );
  return animation.finished
    .catch(() => undefined)
    .then(() => {
      ghost.remove();
    });
}

/** Cards fly from the deck spot to each seat, staggered, as backs. */
export async function animateDeal(
  deckOrigin: Point,
  seatTargets: Point[],
  cardsPerSeat: number,
  onEach?: (index: number) => void
): Promise<void> {
  if (reducedMotion()) return;
  const flights: Promise<void>[] = [];
  let index = 0;
  for (let c = 0; c < cardsPerSeat; c++) {
    for (const target of seatTargets) {
      const ghost = makeGhost(null, 56);
      onEach?.(index);
      flights.push(
        flyGhost(ghost, deckOrigin, target, {
          durationMs: 320,
          delayMs: index * 55,
          rotate: (index % 2 === 0 ? 1 : -1) * 8,
        })
      );
      index++;
    }
  }
  await Promise.all(flights);
}

/** A played card flies from the acting seat (or your hand) to its trick slot. */
export function animateCardToTrick(card: Card, from: Point, to: Point): Promise<void> {
  const ghost = makeGhost(card, 74);
  return flyGhost(ghost, from, to, { durationMs: 340, rotate: 4 });
}

/** The four cards of a finished trick fly together to the winner's seat. */
export async function animateTrickSweep(cards: { card: Card; from: Point }[], winnerAt: Point): Promise<void> {
  if (reducedMotion()) return;
  await new Promise((r) => setTimeout(r, 520)); // let the table read the trick first
  await Promise.all(
    cards.map(({ card, from }, i) =>
      flyGhost(makeGhost(card, 64), from, winnerAt, {
        durationMs: 380,
        delayMs: i * 40,
        rotate: i % 2 ? -14 : 12,
        fadeOut: true,
      })
    )
  );
}
