import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Container from "react-bootstrap/Container";
import Modal from "react-bootstrap/Modal";
import ProgressBar from "react-bootstrap/ProgressBar";
import Row from "react-bootstrap/Row";
import { useNavigate } from "react-router-dom";
import type { ExplanationRow } from "../../shared/engine/index.js";
import { ExplanationTable } from "../components/ExplanationTable.js";
import { FoundSetsPanel } from "../components/FoundSetsPanel.js";
import { Board } from "./Board.js";
import { useSinglePlayerGame } from "./useSinglePlayerGame.js";

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * The recovered single-player game: twelve cards on the table and a running
 * clock. Find every set among them — cards stay put, found sets fill the side
 * panel, and finding them all wins.
 */
export function SinglePlayerPage() {
  const navigate = useNavigate();
  const game = useSinglePlayerGame();
  const [whyRows, setWhyRows] = useState<ExplanationRow[] | null>(null);

  const progress = game.setsTotal > 0 ? (game.foundCount / game.setsTotal) * 100 : 0;

  const renderAlert = () => {
    switch (game.alert.kind) {
      case "found":
        return <Alert variant="success">Congrats! You have found a set.</Alert>;
      case "already":
        return <Alert variant="warning">Set already found.</Alert>;
      case "notset":
        return (
          <Alert variant="danger">
            It is not a set,{" "}
            <Alert.Link onClick={() => setWhyRows((game.alert as { explanation: ExplanationRow[] }).explanation)}>
              see why.
            </Alert.Link>
          </Alert>
        );
      default:
        return (
          <Alert variant="info">
            There {game.setsTotal === 1 ? "is" : "are"} {game.setsTotal} total{" "}
            {game.setsTotal === 1 ? "set" : "sets"} on the board.
          </Alert>
        );
    }
  };

  return (
    <Container fluid className="game-page">
      <Row>
        <Col lg={7} className="game-board-col">
          <div className="game-toolbar">
            <div>
              <Button variant="warning" onClick={game.playAgain} className="me-2">
                Play again
              </Button>
              <Button variant="outline-secondary" onClick={() => navigate("/")}>
                Home
              </Button>
            </div>
            <h4 className="timer" aria-label="Time played">
              {formatTime(game.secondsPlayed)}
            </h4>
          </div>

          <Board
            cards={game.board}
            selectedIds={game.selectedIds}
            statuses={game.statuses}
            disabled={game.won}
            onActivate={game.onActivate}
          />

          <ProgressBar
            className="mt-3"
            variant="success"
            now={progress}
            label={
              game.setsTotal > 0
                ? `You have found ${game.foundCount} of ${game.setsTotal} sets`
                : ""
            }
          />
          {renderAlert()}
        </Col>

        <Col lg={5}>
          <FoundSetsPanel sets={game.found} />
        </Col>
      </Row>

      <Modal show={game.won} onHide={game.playAgain} centered>
        <Modal.Header>
          <Modal.Title>Congrats!</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          You have found all {game.setsTotal} sets in {formatTime(game.secondsPlayed)} — you are a
          winner!
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => navigate("/")}>
            Home
          </Button>
          <Button variant="primary" onClick={game.playAgain}>
            Play again
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={whyRows !== null} onHide={() => setWhyRows(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Why is this not a set?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted">
            A set needs every property to be <b>all the same</b> or <b>all different</b>. Any{" "}
            <b>NO / NO</b> row below is why this pick failed.
          </p>
          {whyRows && <ExplanationTable rows={whyRows} />}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => setWhyRows(null)}>
            Ok
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
