import type { Card } from "../../shared/engine/index.js";
import { symbolCount } from "../../shared/engine/index.js";
import { colorFor, rimFor } from "./palette.js";

/**
 * Canvas rendering of a SET card face — the heart of the original game's
 * aesthetic, preserved and cleaned up. Draws the card's 1..3 symbols
 * (square / circle / triangle) in its colour with its shading
 * (open outline / solid fill / striped) into a content box of `w` x `h`
 * device-independent pixels. The caller is responsible for DPI scaling.
 */
export function drawCardFace(
  ctx: CanvasRenderingContext2D,
  card: Card,
  w: number,
  h: number,
): void {
  const count = symbolCount(card);

  // Symbols stack vertically and centre — the canonical SET layout. Size each
  // symbol to fit the tile with comfortable margins, and never larger than a
  // single-symbol card would look.
  const marginX = w * 0.16;
  const marginY = h * 0.12;
  const availW = w - marginX * 2;
  const availH = h - marginY * 2;

  const gapRatio = 0.28;
  // cellH * count + gap * (count - 1) = availH, gap = cellH * gapRatio
  const cellH = availH / (count + (count - 1) * gapRatio);
  const gap = cellH * gapRatio;

  const halfW = Math.min(availW, cellH * 1.9) / 2;
  const halfH = Math.min(cellH * 0.5, halfW * 0.62);

  const lineWidth = Math.max(2, Math.min(w, h) * 0.035);

  const totalH = count * cellH + (count - 1) * gap;
  let cy = (h - totalH) / 2 + cellH / 2;
  const cx = w / 2;

  for (let i = 0; i < count; i++) {
    drawSymbol(ctx, card, cx, cy, halfW, halfH, lineWidth);
    cy += cellH + gap;
  }
}

function drawSymbol(
  ctx: CanvasRenderingContext2D,
  card: Card,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  lineWidth: number,
): void {
  const fill = colorFor(card);
  const rim = rimFor(card);

  ctx.save();
  buildShapePath(ctx, card.shape, cx, cy, halfW, halfH);

  switch (card.shading) {
    case 0: // open — outline only
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = fill;
      ctx.stroke();
      break;
    case 1: // solid — filled
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = lineWidth * 0.6;
      ctx.strokeStyle = rim;
      ctx.stroke();
      break;
    case 2: // striped — clip to the shape and rule thin horizontal lines
      ctx.save();
      ctx.clip();
      ctx.lineWidth = Math.max(1.4, lineWidth * 0.5);
      ctx.strokeStyle = fill;
      const step = Math.max(4, halfH * 0.42);
      ctx.beginPath();
      for (let y = cy - halfH + step * 0.5; y < cy + halfH; y += step) {
        ctx.moveTo(cx - halfW, y);
        ctx.lineTo(cx + halfW, y);
      }
      ctx.stroke();
      ctx.restore();
      // Crisp outline around the striped shape.
      buildShapePath(ctx, card.shape, cx, cy, halfW, halfH);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = fill;
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Build (but do not paint) the path for a shape centred at (cx, cy). */
function buildShapePath(
  ctx: CanvasRenderingContext2D,
  shape: number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
): void {
  ctx.beginPath();
  switch (shape) {
    case 0: {
      // Rounded square/rectangle.
      const r = Math.min(halfW, halfH) * 0.35;
      roundedRect(ctx, cx - halfW, cy - halfH, halfW * 2, halfH * 2, r);
      break;
    }
    case 1: {
      // Ellipse / circle.
      ctx.ellipse(cx, cy, halfW, halfH, 0, 0, Math.PI * 2);
      break;
    }
    case 2: {
      // Upward triangle with a hair of rounding at the apex omitted for crispness.
      ctx.moveTo(cx, cy - halfH);
      ctx.lineTo(cx + halfW, cy + halfH);
      ctx.lineTo(cx - halfW, cy + halfH);
      ctx.closePath();
      break;
    }
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
