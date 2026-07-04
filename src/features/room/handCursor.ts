/**
 * A coloured hand/pointer cursor as an inline SVG data URI, one per seat colour.
 * The recovered original showed each remote player's mouse as a coloured hand;
 * we reproduce that with a self-contained SVG (no external asset needed).
 */
const CACHE = new Map<string, string>();

export function handCursorDataUri(color: string): string {
  const cached = CACHE.get(color);
  if (cached) return cached;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24">` +
    `<path d="M5 2 L5 17 L9 13 L12 20 L15 19 L12 12 L18 12 Z" ` +
    `fill="${color}" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round"/>` +
    `</svg>`;
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  CACHE.set(color, uri);
  return uri;
}
