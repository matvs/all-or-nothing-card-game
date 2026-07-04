import { rankValue } from "../engine/deck.js";
import type { Card, Rank, Suit } from "../engine/types.js";

/**
 * Every card face is drawn as inline SVG — no external assets. The pip cards
 * follow classic layouts; the court cards carry this project's heritage: the
 * original 2018 "All or Nothing" prototype was a shape-matching game of
 * triangles, circles and squares, so here the Jack wears the triangle, the
 * Queen the circle, and the King the square.
 */

const SUIT_PATHS: Record<Suit, string> = {
  // viewBox for glyphs: 0 0 100 100, centered forms
  S: "M50 8 C38 26 14 42 14 60 C14 74 26 82 37 78 C42 76 46 73 47 69 C46 79 42 86 34 92 L66 92 C58 86 54 79 53 69 C54 73 58 76 63 78 C74 82 86 74 86 60 C86 42 62 26 50 8 Z",
  H: "M50 90 C30 72 12 56 12 38 C12 24 22 14 34 14 C42 14 48 18 50 24 C52 18 58 14 66 14 C78 14 88 24 88 38 C88 56 70 72 50 90 Z",
  D: "M50 6 L82 50 L50 94 L18 50 Z",
  C: "M50 10 C41 10 34 17 34 26 C34 31 36 35 40 38 C36 36 31 35 27 35 C17 35 10 43 10 52 C10 62 17 69 27 69 C35 69 41 65 44 59 C43 71 39 82 32 90 L68 90 C61 82 57 71 56 59 C59 65 65 69 73 69 C83 69 90 62 90 52 C90 43 83 35 73 35 C69 35 64 36 60 38 C64 35 66 31 66 26 C66 17 59 10 50 10 Z",
};

export function suitColorClass(suit: Suit): "red" | "black" {
  return suit === "H" || suit === "D" ? "red" : "black";
}

function suitGlyph(suit: Suit, x: number, y: number, size: number, flipped = false): string {
  const transform = `translate(${x - size / 2} ${y - size / 2}) scale(${size / 100})${flipped ? ` rotate(180 50 50)` : ""}`;
  return `<path d="${SUIT_PATHS[suit]}" transform="${transform}"/>`;
}

/** Pip positions on a 250x350 card, classic arrangements. y<175 renders upright, y>175 flipped. */
const PIP_LAYOUTS: Record<string, [number, number][]> = {
  A: [[125, 175]],
  "2": [[125, 85], [125, 265]],
  "3": [[125, 85], [125, 175], [125, 265]],
  "4": [[80, 85], [170, 85], [80, 265], [170, 265]],
  "5": [[80, 85], [170, 85], [125, 175], [80, 265], [170, 265]],
  "6": [[80, 85], [170, 85], [80, 175], [170, 175], [80, 265], [170, 265]],
  "7": [[80, 85], [170, 85], [125, 130], [80, 175], [170, 175], [80, 265], [170, 265]],
  "8": [[80, 85], [170, 85], [125, 130], [80, 175], [170, 175], [125, 220], [80, 265], [170, 265]],
  "9": [[80, 80], [170, 80], [80, 143], [170, 143], [125, 175], [80, 207], [170, 207], [80, 270], [170, 270]],
  "10": [[80, 80], [170, 80], [125, 112], [80, 143], [170, 143], [80, 207], [170, 207], [125, 238], [80, 270], [170, 270]],
};

/** Heritage court figures: J=triangle, Q=circle, K=square (from the 2018 prototype). */
function courtFigure(rank: Rank, suit: Suit): string {
  const stroke = `stroke-width="7" fill="none" stroke="currentColor"`;
  const crown = `<path d="M85 92 L95 72 L110 88 L125 62 L140 88 L155 72 L165 92 Z" fill="currentColor" opacity="0.9"/>`;
  if (rank === "J") {
    return `${crown}<path d="M125 118 L180 218 L70 218 Z" ${stroke}/><path d="M125 148 L157 208 L93 208 Z" fill="currentColor" opacity="0.28"/>${suitGlyph(suit, 125, 190, 44)}`;
  }
  if (rank === "Q") {
    return `${crown}<circle cx="125" cy="180" r="57" ${stroke}/><circle cx="125" cy="180" r="40" fill="currentColor" opacity="0.28"/>${suitGlyph(suit, 125, 180, 44)}`;
  }
  return `${crown}<rect x="70" y="125" width="110" height="110" ${stroke}/><rect x="87" y="142" width="76" height="76" fill="currentColor" opacity="0.28"/>${suitGlyph(suit, 125, 180, 44)}`;
}

function cornerMarks(rank: Rank, suit: Suit): string {
  const label = rank === "10" ? "10" : rank;
  const fontSize = rank === "10" ? 40 : 46;
  return `
    <g>
      <text x="30" y="52" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="currentColor" font-family="Georgia, 'Times New Roman', serif">${label}</text>
      ${suitGlyph(suit, 30, 84, 34)}
    </g>
    <g transform="rotate(180 125 175)">
      <text x="30" y="52" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="currentColor" font-family="Georgia, 'Times New Roman', serif">${label}</text>
      ${suitGlyph(suit, 30, 84, 34)}
    </g>`;
}

function faceMarkup(card: Card): string {
  const { rank, suit } = card;
  let center: string;
  if (rank === "J" || rank === "Q" || rank === "K") {
    center = courtFigure(rank, suit);
  } else if (rank === "A") {
    center = suitGlyph(suit, 125, 175, 110);
  } else {
    center = PIP_LAYOUTS[rank]
      .map(([x, y]) => suitGlyph(suit, x, y, 52, y > 175))
      .join("");
  }
  return `${cornerMarks(rank, suit)}${center}`;
}

/** Full card face SVG string (used inside a .playing-card element). */
export function cardFaceSvg(card: Card): string {
  return `<svg viewBox="0 0 250 350" aria-hidden="true" focusable="false">
    <rect x="4" y="4" width="242" height="342" rx="18" class="card-paper"/>
    ${faceMarkup(card)}
  </svg>`;
}

/** Card back: linen cross-hatch with the three heritage shapes in a badge. */
export function cardBackSvg(): string {
  return `<svg viewBox="0 0 250 350" aria-hidden="true" focusable="false">
    <rect x="4" y="4" width="242" height="342" rx="18" class="card-paper"/>
    <rect x="16" y="16" width="218" height="318" rx="12" class="card-back-field"/>
    <path class="card-back-lines" d="${backHatch()}"/>
    <g class="card-back-badge">
      <circle cx="125" cy="175" r="46" class="badge-disc"/>
      <path d="M125 148 L145 183 L105 183 Z" class="badge-shape"/>
      <circle cx="112" cy="196" r="11" class="badge-shape"/>
      <rect x="130" y="186" width="20" height="20" class="badge-shape"/>
    </g>
  </svg>`;
}

function backHatch(): string {
  const lines: string[] = [];
  for (let i = -350; i < 250; i += 22) {
    lines.push(`M${i} 16 L${i + 318} 334`);
    lines.push(`M${i + 318} 16 L${i} 334`);
  }
  return lines.join(" ");
}

export function cardAriaLabel(card: Card): string {
  const rankNames: Record<Rank, string> = {
    "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven",
    "8": "eight", "9": "nine", "10": "ten", J: "jack", Q: "queen", K: "king", A: "ace",
  };
  const suitNames: Record<Suit, string> = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
  return `${rankNames[card.rank]} of ${suitNames[card.suit]}`;
}

export function suitSymbol(suit: Suit): string {
  return { S: "♠", H: "♥", D: "♦", C: "♣" }[suit];
}

/** Sort helper for displaying hands (engine sortHand needs trump context; re-export shape). */
export { rankValue };
