import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Container from "react-bootstrap/Container";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";
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

const howToPlay = (
  <Popover id="popover-how-to-play">
    <Popover.Header as="h3">How to Play</Popover.Header>
    <Popover.Body>
      Find a <strong>set</strong> of three cards. For each of the four properties —{" "}
      <strong>color</strong>, <strong>shape</strong>, <strong>filling</strong> and{" "}
      <strong>number</strong> — the three cards must be either <em>all the same</em> or{" "}
      <em>all different</em>. Click three cards; if they form a set you score, otherwise you can
      see why in the explanation table.
    </Popover.Body>
  </Popover>
);

/**
 * The recovered landing page: the "All or Nothing Card Game" jumbotron with a
 * How-to-Play popover, plus the SinglePlayer and MultiPlayer cards.
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
            <p>
              <OverlayTrigger trigger="click" placement="right" overlay={howToPlay} rootClose>
                <Button variant="info">How to Play</Button>
              </OverlayTrigger>
            </p>
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
                <div>
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
