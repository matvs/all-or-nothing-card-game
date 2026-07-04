import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { Card } from "../../shared/engine/index.js";
import { drawCardFace } from "./cardFace.js";

/**
 * Paint a card's ORIGINAL figures into a canvas, DPI-aware and repainting on
 * resize. Shared by the interactive board tiles and the found-set thumbnails so
 * the figures are byte-for-byte identical everywhere.
 */
export function useCardCanvas(card: Card): RefObject<HTMLCanvasElement> {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const pxW = Math.round(w * dpr);
    const pxH = Math.round(h * dpr);
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawCardFace(ctx, card, w, h);
  }, [card]);

  useEffect(() => {
    paint();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [paint]);

  return canvasRef;
}
