import type { Card } from "../../shared/engine/index.js";
import { registerSetCard, type CardVisualState, type SetCardElement } from "../render/setCardElement.js";
import { el } from "./dom.js";

registerSetCard();

/**
 * A reusable grid of <set-card> tiles with selection handling. Emits
 * onComplete once three cards are selected; the owner decides validity
 * (locally in solo, or by asking the server in race mode).
 */
export class CardBoard {
  readonly element: HTMLElement;
  private tiles: SetCardElement[] = [];
  private selected = new Set<number>();
  private locked = false;

  constructor(private onComplete: (cards: [number, number, number]) => void) {
    this.element = el("div", { class: "board", role: "grid", "aria-label": "SET board" });
  }

  setBoard(cards: readonly Card[]): void {
    for (let i = 0; i < cards.length; i++) {
      let tile = this.tiles[i];
      if (!tile) {
        tile = document.createElement("set-card") as SetCardElement;
        tile.setAttribute("role", "gridcell");
        tile.addEventListener("card-activate", (e) =>
          this.toggle((e as CustomEvent<{ cardId: number }>).detail.cardId),
        );
        this.tiles[i] = tile;
        this.element.appendChild(tile);
      }
      tile.card = cards[i];
      tile.selected = this.selected.has(cards[i].id);
      tile.state = "idle";
      tile.disable(this.locked);
    }
    while (this.tiles.length > cards.length) this.tiles.pop()?.remove();
    // Drop selections for cards that left the board.
    const present = new Set(cards.map((c) => c.id));
    for (const id of [...this.selected]) if (!present.has(id)) this.selected.delete(id);
    this.syncSelection();
  }

  private toggle(cardId: number): void {
    if (this.locked) return;
    if (this.selected.has(cardId)) this.selected.delete(cardId);
    else {
      if (this.selected.size >= 3) return;
      this.selected.add(cardId);
    }
    this.syncSelection();
    if (this.selected.size === 3) {
      const trio = [...this.selected] as [number, number, number];
      this.onComplete(trio);
    }
  }

  private syncSelection(): void {
    for (const tile of this.tiles) {
      const card = tile.card;
      if (card) tile.selected = this.selected.has(card.id);
    }
  }

  clearSelection(): void {
    this.selected.clear();
    this.syncSelection();
    for (const tile of this.tiles) tile.state = "idle";
  }

  flash(cardIds: number[], state: CardVisualState): void {
    for (const tile of this.tiles) {
      if (tile.card && cardIds.includes(tile.card.id)) tile.state = state;
    }
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    for (const tile of this.tiles) tile.disable(locked);
  }

  selectedIds(): number[] {
    return [...this.selected];
  }
}
