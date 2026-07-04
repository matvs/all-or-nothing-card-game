import type { Card } from "../../shared/engine/index.js";
import { COLORS, SHADINGS, SHAPES, symbolCount } from "../../shared/engine/index.js";

/**
 * The three symbol colours, drawn on canvas. Chosen to be vivid and mutually
 * distinct on both the light (paper) and dark surfaces. Shape, shading and
 * count give three further redundant channels, so colour is never the only
 * signal (important for colour-vision accessibility).
 */
export const SYMBOL_COLORS: readonly [string, string, string] = ["#e0403b", "#1da35a", "#8a4fdb"];

/** Slightly darker rims used to keep striped/solid symbols crisp on paper. */
export const SYMBOL_RIMS: readonly [string, string, string] = ["#b32b27", "#137a41", "#6a35bd"];

export function colorFor(card: Card): string {
  return SYMBOL_COLORS[card.color];
}
export function rimFor(card: Card): string {
  return SYMBOL_RIMS[card.color];
}

/** A spoken/screen-reader description, e.g. "two striped green circles". */
export function describeCard(card: Card): string {
  const n = symbolCount(card);
  const color = COLORS[card.color];
  const shading = SHADINGS[card.shading];
  const shape = SHAPES[card.shape];
  const plural = n === 1 ? "" : "s";
  const shadeWord = shading === "solid" ? "solid" : shading === "open" ? "open" : "striped";
  return `${n} ${shadeWord} ${color} ${shape}${plural}`;
}
