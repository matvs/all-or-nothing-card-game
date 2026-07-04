import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import type { FoundSet } from "../game/foundSets.js";
import { MiniCard } from "../game/SetCard.js";
import { ExplanationTable } from "./ExplanationTable.js";

/**
 * "Already found sets:" — the recovered right-hand panel. Each found set shows
 * its three figures plus the Explanation table, exactly like the original
 * (which rendered the three canvas snapshots as images).
 */
export function FoundSetsPanel({ sets }: { sets: FoundSet[] }) {
  return (
    <div className="found-sets">
      <h2>
        Already <Badge bg="success">found</Badge> sets:
      </h2>
      <div className="found-sets__list">
        {sets.map((set, index) => (
          <Card key={index} className="found-set-card">
            <div className="found-set-card__cards">
              {set.cards.map((card) => (
                <MiniCard key={card.id} card={card} />
              ))}
            </div>
            <Card.Body>
              <Card.Title as="h6" className="mb-2">
                Explanation
                {set.by ? (
                  <span className="found-set-card__by" style={{ color: set.by.color ?? undefined }}>
                    {" "}
                    · {set.by.name}
                  </span>
                ) : null}
              </Card.Title>
              <ExplanationTable rows={set.explanation} />
            </Card.Body>
          </Card>
        ))}
      </div>
    </div>
  );
}
