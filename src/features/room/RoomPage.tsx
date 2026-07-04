import { useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Container from "react-bootstrap/Container";
import Modal from "react-bootstrap/Modal";
import Row from "react-bootstrap/Row";
import { useNavigate, useParams } from "react-router-dom";
import type { ExplanationRow } from "../../../shared/engine/index.js";
import { SEAT_COLORS, type SeatColor } from "../../../shared/protocol.js";
import type { RoomPlayer } from "../../../shared/protocol.js";
import { ExplanationTable } from "../../components/ExplanationTable.js";
import { FoundSetsPanel } from "../../components/FoundSetsPanel.js";
import { Board } from "../../game/Board.js";
import { ChatPanel } from "./ChatPanel.js";
import { handCursorDataUri } from "./handCursor.js";
import { useRoom } from "./useRoom.js";

/** Coloured seat swatches; click a free one to take that seat. */
function SeatPicker({
  players,
  meColor,
  onSit,
}: {
  players: RoomPlayer[];
  meColor: SeatColor | null | undefined;
  onSit: (color: SeatColor) => void;
}) {
  return (
    <div className="seat-picker">
      <span className="text-muted">Seat:</span>
      {SEAT_COLORS.map((color) => {
        const holder = players.find((p) => p.color === color);
        const mine = meColor === color;
        const takenByOther = holder && holder.color === color && !mine;
        return (
          <button
            key={color}
            type="button"
            className={`seat-swatch${mine ? " is-mine" : ""}`}
            style={{ backgroundColor: color }}
            disabled={Boolean(takenByOther)}
            title={holder ? holder.name : "Take this seat"}
            aria-label={mine ? `Your seat (${color})` : holder ? `${holder.name}'s seat` : `Take seat ${color}`}
            onClick={() => onSit(color)}
          />
        );
      })}
    </div>
  );
}

/** Live roster: each seated/joined player with colour, score and online dot. */
function Roster({ players }: { players: RoomPlayer[] }) {
  const seated = players.filter((p) => p.color);
  const watching = players.filter((p) => !p.color);
  return (
    <div className="roster">
      {seated.map((p) => (
        <div key={p.id} className={`roster__player${p.online ? "" : " is-offline"}`}>
          <span className="roster__swatch" style={{ backgroundColor: p.color ?? "#ccc" }} />
          <span style={{ color: p.color ?? undefined }}>{p.name}</span>
          <span className="roster__points">· {p.points}</span>
        </div>
      ))}
      {watching.map((p) => (
        <div key={p.id} className={`roster__player${p.online ? "" : " is-offline"}`}>
          <span className="roster__swatch" style={{ backgroundColor: "#bbb" }} />
          <span>{p.name}</span>
          <span className="text-muted">· watching</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The multiplayer table: a shared, server-authoritative SET board. Take a
 * coloured seat, press Start (a 2+ player round begins once everyone seated is
 * ready or the countdown ends), then race to claim sets. Everyone sees the same
 * board, live scores and each other's coloured hand cursors.
 */
export function RoomPage() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
  const room = useRoom(roomId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [whyRows, setWhyRows] = useState<ExplanationRow[] | null>(null);

  if (room.needsLogin) {
    return (
      <Container fluid className="room-page">
        <div className="room-header">
          <h3>
            Room <span className="room-code">{roomId}</span>
          </h3>
          <Button variant="outline-secondary" onClick={() => navigate("/")}>
            Home
          </Button>
        </div>
        <Alert variant="warning">
          You need to log in before joining a room. <Alert.Link onClick={() => navigate("/")}>Go to
          the home page</Alert.Link> and log in first.
        </Alert>
      </Container>
    );
  }

  const seated = Boolean(room.me?.color);
  const winnerNames = room.gameOver
    ? room.players.filter((p) => room.gameOver?.winnerIds.includes(p.id)).map((p) => p.name)
    : [];

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    room.onPointerMove(Math.round(e.clientX - rect.left), Math.round(e.clientY - rect.top));
  };

  const renderAlert = () => {
    switch (room.alert.kind) {
      case "found":
        return <Alert variant="success">{room.alert.name} found a set!</Alert>;
      case "already":
        return <Alert variant="warning">Those cards were already taken.</Alert>;
      case "rejected":
        return <Alert variant="warning">That claim could not be made.</Alert>;
      case "notset":
        return (
          <Alert variant="danger">
            You lose a point — it is not a set,{" "}
            <Alert.Link onClick={() => setWhyRows((room.alert as { explanation: ExplanationRow[] }).explanation)}>
              see why.
            </Alert.Link>
          </Alert>
        );
      default:
        return room.game.running ? (
          <Alert variant="info">
            There {room.game.setsAvailable === 1 ? "is" : "are"} {room.game.setsAvailable}{" "}
            {room.game.setsAvailable === 1 ? "set" : "sets"} on the board · {room.game.deckRemaining}{" "}
            cards left in the deck.
          </Alert>
        ) : null;
    }
  };

  return (
    <Container fluid className="room-page" ref={containerRef} onMouseMove={handleMouseMove}>
      {/* Remote players' coloured hand cursors. */}
      {room.cursors.map((c) => (
        <img
          key={c.playerId}
          className="hand-cursor"
          src={handCursorDataUri(c.color ?? "#888")}
          alt=""
          style={{ left: c.x, top: c.y }}
        />
      ))}

      <div className="room-header">
        <h3>
          Room <span className="room-code">{roomId}</span>
        </h3>
        <Button variant="outline-secondary" onClick={() => navigate("/")}>
          Home
        </Button>
      </div>

      <Roster players={room.players} />
      <SeatPicker players={room.players} meColor={room.me?.color} onSit={room.sit} />

      <Row>
        <Col lg={7} className="game-board-col">
          <div className="game-toolbar">
            <div>
              <Button variant="success" onClick={room.start} disabled={!seated || room.game.running}>
                {room.countdown !== null ? `Starting in ${room.countdown}…` : "Start"}
              </Button>
              {!seated && <span className="text-muted ms-2">Take a seat to play.</span>}
            </div>
          </div>

          {room.game.running ? (
            <Board
              cards={room.boardCards}
              selectedIds={room.selectedIds}
              statuses={room.statuses}
              onActivate={room.activateCard}
            />
          ) : (
            <Alert variant="secondary">
              {room.countdown !== null
                ? `Game starting in ${room.countdown}… (waiting for other players to press Start)`
                : "Waiting to start. Everyone takes a seat, then press Start (needs at least two players)."}
            </Alert>
          )}

          {renderAlert()}
        </Col>

        <Col lg={5}>
          <div className="mb-3">
            <h2 className="h5 mb-2">Chat</h2>
            <ChatPanel messages={room.chat} onSend={room.sendChat} />
          </div>
          <FoundSetsPanel sets={room.found} />
        </Col>
      </Row>

      <Modal show={room.gameOver !== null} onHide={room.clearGameOver} centered>
        <Modal.Header closeButton>
          <Modal.Title>Game over</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {winnerNames.length === 1
            ? `${winnerNames[0]} wins! 🎉`
            : winnerNames.length > 1
              ? `It's a tie between ${winnerNames.join(", ")}!`
              : "No more sets — the deck is empty."}
          <ul className="mt-3 mb-0">
            {[...room.players]
              .filter((p) => p.color)
              .sort((a, b) => b.points - a.points)
              .map((p) => (
                <li key={p.id} style={{ color: p.color ?? undefined }}>
                  {p.name}: {p.points}
                </li>
              ))}
          </ul>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={room.clearGameOver}>
            Ok
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={whyRows !== null} onHide={() => setWhyRows(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Why is this not a set?</Modal.Title>
        </Modal.Header>
        <Modal.Body>{whyRows && <ExplanationTable rows={whyRows} />}</Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => setWhyRows(null)}>
            Ok
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
