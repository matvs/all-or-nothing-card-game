import { useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import { useAppDispatch } from "../../app/hooks.js";
import { loginApi } from "../session/sessionSlice.js";

const FORBIDDEN = ["kurwa", "dick", "fuck", "Cyril"];

export function LoginModal({ show, onClose }: { show: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dispatch = useAppDispatch();
  const [error, setError] = useState<string | null>(null);

  const login = () => {
    const name = inputRef.current?.value.trim() ?? "";
    if (name.length >= 3 && name.length <= 12 && !FORBIDDEN.includes(name)) {
      dispatch(loginApi(name));
      setError(null);
      onClose();
    } else if (FORBIDDEN.includes(name)) {
      setError(`Name ${name} is forbidden.`);
    } else {
      setError("Name cannot be empty and has to contain at least 3 characters and not more than 12.");
    }
  };

  return (
    <Modal show={show} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Login</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <h4>In order to play, please introduce yourself</h4>
        <Form onSubmit={(e) => { e.preventDefault(); login(); }}>
          <Form.Group controlId="loginName">
            <Form.Label>Name: </Form.Label>
            <Form.Control type="text" placeholder="Neo" ref={inputRef} autoFocus />
            <Form.Text className="text-muted">
              Tip: After joining the room, remember to be nice to the others.
            </Form.Text>
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={login}>
          Login
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
