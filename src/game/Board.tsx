import type { Card } from "../../shared/engine/index.js";
import { type CardStatus, SetCard } from "./SetCard.js";

interface BoardProps {
  cards: Card[];
  selectedIds?: ReadonlySet<number>;
  statuses?: ReadonlyMap<number, CardStatus>;
  disabled?: boolean;
  onActivate?: (cardId: number) => void;
}

/**
 * The tableau: a responsive grid of landscape SET cards. Cards are keyed by
 * board position so that a claimed card replaced in place doesn't cause the
 * whole grid to reshuffle under the player.
 */
export function Board({ cards, selectedIds, statuses, disabled, onActivate }: BoardProps) {
  return (
    <div className="set-board" role="group" aria-label="SET board">
      {cards.map((card, index) => (
        <SetCard
          key={index}
          card={card}
          selected={selectedIds?.has(card.id)}
          status={statuses?.get(card.id) ?? "idle"}
          disabled={disabled}
          onActivate={onActivate}
        />
      ))}
    </div>
  );
}
