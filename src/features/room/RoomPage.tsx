import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import { useNavigate, useParams } from "react-router-dom";

/**
 * Placeholder for the multiplayer room. The server (rooms, seats, claims, chat,
 * WebRTC voice signalling) is already in place; the interactive room UI is wired
 * up in the following steps.
 */
export function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
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
      <p className="text-muted">The multiplayer table is being set up…</p>
    </Container>
  );
}
