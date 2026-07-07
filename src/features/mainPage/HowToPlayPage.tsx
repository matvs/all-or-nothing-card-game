import { useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Table from "react-bootstrap/Table";
import { useNavigate } from "react-router-dom";
import { explainTriple, isSet, type Card } from "../../../shared/engine/index.js";
import { ExplanationTable } from "../../components/ExplanationTable.js";
import { Board } from "../../game/Board.js";
import type { CardStatus } from "../../game/SetCard.js";
import { guidedExamples, practiceCards } from "./tutorialData.js";

function ruleVerdict(cards: [Card, Card, Card] | null) {
  if (!cards) return null;
  return {
    ok: isSet(cards[0], cards[1], cards[2]),
    rows: explainTriple(cards[0], cards[1], cards[2]),
  };
}

export function HowToPlayPage() {
  const navigate = useNavigate();
  const [exampleIndex, setExampleIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());

  const example = guidedExamples[exampleIndex];
  const exampleVerdict = ruleVerdict(example.cards);
  const pickedCards = useMemo(() => {
    const cards = practiceCards.filter((card) => selectedIds.has(card.id));
    return cards.length === 3 ? (cards as [Card, Card, Card]) : null;
  }, [selectedIds]);
  const pickedVerdict = ruleVerdict(pickedCards);

  const statuses = useMemo(() => {
    if (!pickedVerdict) return undefined;
    const next = new Map<number, CardStatus>();
    for (const id of selectedIds) next.set(id, pickedVerdict.ok ? "good" : "bad");
    return next;
  }, [pickedVerdict, selectedIds]);

  const activateCard = (cardId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
        return next;
      }
      if (next.size >= 3) next.clear();
      next.add(cardId);
      return next;
    });
  };

  return (
    <Container fluid className="how-page">
      <div className="page-toolbar">
        <Button variant="outline-secondary" onClick={() => navigate("/")}>
          Home
        </Button>
        <Button variant="success" onClick={() => navigate("/singleplayer")}>
          Practice in single player
        </Button>
      </div>

      <section className="how-hero">
        <p className="eyebrow">Interactive tutorial</p>
        <h1>How to Play All or Nothing</h1>
        <p>
          Pick exactly three cards. For each row below, the three values must be all the same or all
          different. One mixed row breaks the set.
        </p>
      </section>

      <section className="tutorial-grid" aria-label="Guided rule examples">
        <div>
          <div className="tutorial-stepper" role="tablist" aria-label="Rule examples">
            {guidedExamples.map((item, index) => (
              <button
                key={item.title}
                type="button"
                className={index === exampleIndex ? "is-active" : ""}
                onClick={() => setExampleIndex(index)}
              >
                {index + 1}. {item.title}
              </button>
            ))}
          </div>

          <div className="tutorial-example-board">
            <Board cards={example.cards} disabled />
          </div>
          <Alert variant={exampleVerdict?.ok ? "success" : "danger"}>{example.note}</Alert>
        </div>

        <div className="tutorial-rule-card">
          <h2>Rule Check</h2>
          {exampleVerdict && <ExplanationTable rows={exampleVerdict.rows} />}
          <Table size="sm" className="mt-3 mb-0">
            <tbody>
              <tr>
                <th>YES + NO</th>
                <td>The property is all the same.</td>
              </tr>
              <tr>
                <th>NO + YES</th>
                <td>The property is all different.</td>
              </tr>
              <tr>
                <th>NO + NO</th>
                <td>The selected cards are not a set.</td>
              </tr>
            </tbody>
          </Table>
        </div>
      </section>

      <section className="practice-lab" aria-label="Try finding a set">
        <div className="practice-lab__header">
          <div>
            <p className="eyebrow">Try it</p>
            <h2>Choose three cards</h2>
          </div>
          <Button variant="outline-secondary" onClick={() => setSelectedIds(new Set())}>
            Clear picks
          </Button>
        </div>

        <Board cards={practiceCards} selectedIds={selectedIds} statuses={statuses} onActivate={activateCard} />

        {selectedIds.size < 3 ? (
          <Alert variant="info" className="mt-3">
            Pick {3 - selectedIds.size} more {3 - selectedIds.size === 1 ? "card" : "cards"}.
          </Alert>
        ) : pickedVerdict ? (
          <Alert variant={pickedVerdict.ok ? "success" : "danger"} className="mt-3">
            {pickedVerdict.ok ? "That is a set." : "That is not a set."} The table shows exactly why.
          </Alert>
        ) : null}

        {pickedVerdict && <ExplanationTable rows={pickedVerdict.rows} />}
      </section>
    </Container>
  );
}
