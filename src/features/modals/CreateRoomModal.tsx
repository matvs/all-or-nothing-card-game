import { useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import { useNavigate } from "react-router-dom";
import { useAppDispatch } from "../../app/hooks.js";
import { ROOM_NAME_MAX_LENGTH } from "../../../shared/protocol.js";
import { createRoomApi } from "../session/sessionSlice.js";

/**
 * Create a multiplayer room. An empty name asks the server for a random 4-letter
 * code (the recovered behaviour); a custom name must be free. On success we
 * navigate straight into the room.
 */
export function CreateRoomModal({ show, onClose }: { show: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const roomId = inputRef.current?.value.trim() || undefined;
    setBusy(true);
    const created = await dispatch(createRoomApi(roomId));
    setBusy(false);
    if (created) {
      onClose();
      navigate(`/room/${created}`);
    }
  };

  return (
    <Modal show={show} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Create a room</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <Form.Group controlId="createRoomName">
            <Form.Label>Room name</Form.Label>
            <Form.Control
              type="text"
              placeholder="Leave empty for a random code"
              maxLength={ROOM_NAME_MAX_LENGTH}
              ref={inputRef}
              autoFocus
            />
            <Form.Text className="text-muted">
              Share the room name (or the generated code) with friends so they can join.
            </Form.Text>
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void create()} disabled={busy}>
          {busy ? "Creating…" : "Create"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
