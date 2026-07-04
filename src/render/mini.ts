import type { Card } from "../../shared/engine/index.js";
import { drawCardFace } from "./symbols.js";

/** A small standalone canvas thumbnail of a card (for the found-sets list). */
export function miniCard(card: Card, w = 34, h = 48): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "mini-card";
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCardFace(ctx, card, w, h);
  }
  return canvas;
}
