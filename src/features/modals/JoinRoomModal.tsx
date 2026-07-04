import { useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import { useNavigate } from "react-router-dom";
import { useAppDispatch } from "../../app/hooks.js";
import { joinRoomApi } from "../session/sessionSlice.js";

/**
 * Join an existing room by its id/code. The server validates existence; on
 * failure the session thunk raises a "room does not exist" alert.
 */
export function JoinRoomModal({ show, onClose }: { show: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const join = async () => {
    const roomId = inputRef.current?.value.trim();
    if (!roomId) return;
    setBusy(true);
    const ok = await dispatch(joinRoomApi(roomId));
    setBusy(false);
    if (ok) {
      onClose();
      navigate(`/room/${roomId}`);
    }
  };

  return (
    <Modal show={show} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Join a room</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={(e) => { e.preventDefault(); void join(); }}>
          <Form.Group controlId="joinRoomName">
            <Form.Label>Room name or code</Form.Label>
            <Form.Control type="text" placeholder="e.g. ABCD" ref={inputRef} autoFocus />
            <Form.Text className="text-muted">Enter the room id a friend shared with you.</Form.Text>
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void join()} disabled={busy}>
          {busy ? "Joining…" : "Join"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
