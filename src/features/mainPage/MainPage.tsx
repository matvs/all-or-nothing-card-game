import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import { useNavigate } from "react-router-dom";
import { useAppDispatch } from "../../app/hooks.js";
import { logoutApi, type Player } from "../session/sessionSlice.js";

interface MainPageProps {
  user: Player | null;
  onLogin: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

/**
 * The recovered landing page: the "All or Nothing Card Game" jumbotron with a
 * dedicated How-to-Play tutorial page, plus the SinglePlayer and MultiPlayer cards.
 */
export function MainPage({ user, onLogin, onCreateRoom, onJoinRoom }: MainPageProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  return (
    <Container fluid>
      <Row>
        <Col>
          <div className="jumbotron">
            <h1>All or Nothing Card Game</h1>
            <p>You can play a single-player game or multiplayer.</p>
            <div className="main-actions">
              <Button variant="info" onClick={() => navigate("/how-to-play")}>
                How to Play
              </Button>
              <Button variant="outline-secondary" onClick={() => navigate("/singleplayer")}>
                Single player
              </Button>
            </div>
          </div>
        </Col>
      </Row>
      <Row>
        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title>SinglePlayer</Card.Title>
              <Card.Text>
                Find every set hidden in twelve cards. Beat the clock — the timer runs until you
                have found them all.
              </Card.Text>
              <Button variant="success" onClick={() => navigate("/singleplayer")}>
                Play
              </Button>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title>MultiPlayer</Card.Title>
              <Card.Text>
                {user
                  ? `Hello ${user.name}. Join an existing room or create a new one.`
                  : "First you need to log in."}
              </Card.Text>
              {user ? (
                <div className="main-actions">
                  <Button variant="success" onClick={onJoinRoom}>
                    Join
                  </Button>
                  <Button variant="primary" onClick={onCreateRoom}>
                    Create
                  </Button>
                  <Button variant="warning" onClick={() => dispatch(logoutApi())}>
                    Logout
                  </Button>
                </div>
              ) : (
                <Button variant="primary" onClick={onLogin}>
                  Login
                </Button>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
