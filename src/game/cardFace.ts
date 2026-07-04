import { type Card, COLOR_HEX, COLORS, SHADINGS, SHAPES, symbolCount } from "../../shared/engine/index.js";

/**
 * FAITHFUL port of the recovered original `features/gameCanvas/Card.js` draw().
 *
 * Every constant and every coordinate is preserved from the original so the
 * figures are pixel-identical: sharp 40px squares, r=20 circles, equilateral
 * triangles (side 46.19), symbols laid out HORIZONTALLY with a 47.5px stride,
 * and "dashed" shading rendered as the original's vertical black/colour
 * gradient (which reads as horizontal stripes). Colours are the exact original
 * hex — purple #4B0082, green #228B22, crimson #DC143C.
 *
 * The only change: instead of one big 700x700 canvas, each card paints into its
 * own canvas of size `w`x`h` (kept at the original 150:100 = 3:2 landscape
 * ratio) so the surrounding card chrome — border, elevation, hover-pop,
 * selected highlight — can live in CSS. The card OUTLINE the original stroked in
 * black is intentionally omitted here; the CSS card border provides it.
 */

// --- original shapesProps ---------------------------------------------------
const SQUARE_SIZE = 40;
const CIRCLE_R = 20;
const TRIANGLE_SIZE = 46.19;
const CARD = { width: 150, height: 100, xOffset: -20, yOffset: -50 } as const;
const MARGIN_RIGHT = 47.5;

// Reference point that places the 150x100 card box at (0,0): x0 = -xOffset,
// y0 = -yOffset (so the box top-left = (x0+xOffset, y0+yOffset) = (0,0)).
const X0 = -CARD.xOffset; // 20
const Y0 = -CARD.yOffset; // 50

function drawSquarePath(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  x -= SQUARE_SIZE / 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + SQUARE_SIZE);
  ctx.lineTo(x + SQUARE_SIZE, y + SQUARE_SIZE);
  ctx.lineTo(x + SQUARE_SIZE, y);
  ctx.lineTo(x, y);
}

function drawTrianglePath(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const h = TRIANGLE_SIZE * Math.sqrt(3) * 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 0.5 * TRIANGLE_SIZE, y + h);
  ctx.lineTo(x + 0.5 * TRIANGLE_SIZE, y + h);
  ctx.lineTo(x, y);
}

function drawCirclePath(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.arc(x, y, CIRCLE_R, 0, 2 * Math.PI);
}

/**
 * Paint one card's figures into a `w`x`h` canvas content box. `w`/`h` are CSS
 * pixels; the caller handles devicePixelRatio scaling. Geometry is drawn in the
 * original 150x100 logical space and uniformly scaled to fit.
 */
export function drawCardFace(ctx: CanvasRenderingContext2D, card: Card, w: number, h: number): void {
  const scale = w / CARD.width;
  const color = COLOR_HEX[card.color];
  const shape = card.shape; // 0 square, 1 circle, 2 triangle
  const filling = card.shading; // 0 none, 1 full, 2 dashed
  const number = symbolCount(card); // 1..3

  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  ctx.save();
  // Vertical placement (exact original branch per shape).
  if (shape === 0) {
    ctx.translate(0, -1 * ((CARD.height + SQUARE_SIZE) / 2 + CARD.yOffset));
  } else if (shape === 2) {
    const hh = TRIANGLE_SIZE * Math.sqrt(3) * 0.5;
    ctx.translate(0, -1 * ((CARD.height + hh) / 2 + CARD.yOffset));
  } else {
    ctx.translate(0, -1 * ((CARD.height + CIRCLE_R * 2) / 2 + CARD.yOffset - CIRCLE_R));
  }

  // Horizontal placement per symbol count (exact original branch).
  const xTranslate = CARD.width / 2 + CARD.xOffset; // 55
  if (number === 1) ctx.translate(xTranslate, 0);
  else if (number === 2) ctx.translate(xTranslate - 25, 0);
  else ctx.translate(8, 0);

  for (let i = 0; i < number; i++) {
    const xoff = i * MARGIN_RIGHT;
    const yoff = 0;
    if (shape === 0) drawSquarePath(ctx, X0 + xoff, Y0 + yoff);
    else if (shape === 1) drawCirclePath(ctx, X0 + xoff, Y0 + yoff);
    else drawTrianglePath(ctx, X0 + xoff, Y0 + yoff);

    if (filling === 0) {
      ctx.stroke();
    } else if (filling === 1) {
      ctx.fill();
    } else {
      // Original "dashed": a vertical colour/white gradient over 275px, flipping
      // every 0.009 — reads as fine horizontal stripes clipped to the shape.
      const gx = X0 + xoff;
      const gy = Y0 + yoff - 150;
      const gradient = ctx.createLinearGradient(gx, gy, gx, gy + 275);
      let on = true;
      for (let t = 0; t <= 1; t += 0.009) {
        gradient.addColorStop(Math.min(t, 1), on ? color : "white");
        on = !on;
      }
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.fillStyle = color;
    }
  }
  ctx.restore();
  ctx.restore();
}

/** Accessible description of a card (colour, filling, count, shape). */
export function describeCard(card: Card): string {
  const n = symbolCount(card);
  const shape = SHAPES[card.shape];
  const plural = n > 1 ? `${shape}s` : shape;
  return `${n} ${SHADINGS[card.shading]} ${COLORS[card.color]} ${plural}`;
}
