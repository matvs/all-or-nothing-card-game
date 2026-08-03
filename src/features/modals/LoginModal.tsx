import { useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import { useAppDispatch } from "../../app/hooks.js";
import { API_BASE } from "../../config.js";
import { loginApi } from "../session/sessionSlice.js";

/**
 * Real sign-in: credentials go to the central identity provider (Keycloak / the fleet
 * IdP) via the game server — the old "type any name" prompt is gone. The display name
 * shown in rooms is the verified account's, so nobody can play as anyone else.
 */
export function LoginModal({ show, onClose }: { show: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registerUrl, setRegisterUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    void fetch(`${API_BASE}/auth/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: { registerUrl?: string | null } | null) => {
        if (!cancelled) setRegisterUrl(cfg?.registerUrl ?? null);
      })
      .catch(() => {
        /* the link is optional */
      });
    return () => {
      cancelled = true;
    };
  }, [show]);

  const login = async () => {
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    const failure = await dispatch(loginApi(username.trim(), password));
    setBusy(false);
    if (failure) {
      setError(failure);
    } else {
      setError(null);
      setPassword("");
      onClose();
    }
  };

  return (
    <Modal show={show} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Sign in</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <h4>Playing requires your Matvs account</h4>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            void login();
          }}
        >
          <Form.Group controlId="loginUsername" className="mb-2">
            <Form.Label>Username</Form.Label>
            <Form.Control
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              autoFocus
            />
          </Form.Group>
          <Form.Group controlId="loginPassword">
            <Form.Label>Password</Form.Label>
            <Form.Control
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            <Form.Text className="text-muted">
              Your table name is your account&apos;s — be nice to the others.
            </Form.Text>
          </Form.Group>
          {/* A real submit button so Enter works in both fields. */}
          <button type="submit" hidden aria-hidden="true" />
        </Form>
        {registerUrl ? (
          <p className="mt-3 mb-0">
            No account yet?{" "}
            <a href={registerUrl} target="_blank" rel="noreferrer">
              Create one in the account portal
            </a>{" "}
            — the owner approves new players.
          </p>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={() => void login()} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
