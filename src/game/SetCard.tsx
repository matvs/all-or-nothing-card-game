import type { Card } from "../../shared/engine/index.js";
import { describeCard } from "./cardFace.js";
import { useCardCanvas } from "./useCardCanvas.js";

export type CardStatus = "idle" | "good" | "bad" | "hint";

interface SetCardProps {
  card: Card;
  selected?: boolean;
  status?: CardStatus;
  disabled?: boolean;
  onActivate?: (cardId: number) => void;
}

/**
 * One interactive SET card: a DPI-aware canvas painting the ORIGINAL figures,
 * wrapped in a real <button> so the landscape card chrome — elevation, the
 * hover-pop (lift + shadow + border highlight) and the selected highlight — is
 * pure CSS and keyboard/screen-reader friendly.
 */
export function SetCard({ card, selected = false, status = "idle", disabled = false, onActivate }: SetCardProps) {
  const canvasRef = useCardCanvas(card);

  const classNames = [
    "set-card",
    selected ? "is-selected" : "",
    status === "good" ? "is-good" : "",
    status === "bad" ? "is-bad" : "",
    status === "hint" ? "is-hint" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classNames}
      aria-pressed={selected}
      aria-label={describeCard(card)}
      disabled={disabled}
      onClick={() => onActivate?.(card.id)}
    >
      <canvas ref={canvasRef} className="set-card__canvas" />
    </button>
  );
}

/** A small, non-interactive card used in the "Already found sets" thumbnails. */
export function MiniCard({ card }: { card: Card }) {
  const canvasRef = useCardCanvas(card);
  return (
    <div className="mini-card" title={describeCard(card)}>
      <canvas ref={canvasRef} className="set-card__canvas" />
    </div>
  );
}
