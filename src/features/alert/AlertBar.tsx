import { useEffect } from "react";
import Alert from "react-bootstrap/Alert";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../app/hooks.js";
import { clearAlert, selectAlert } from "../session/sessionSlice.js";

interface AlertBarProps {
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

/**
 * App-level alert banner, reproducing the recovered App.js getCurrentAlert():
 * contextual success/warning/danger messages with inline action links. Alerts
 * auto-dismiss after 3s unless flagged autoRemove:false.
 */
export function AlertBar({ onCreateRoom, onJoinRoom }: AlertBarProps) {
  const alert = useAppSelector(selectAlert);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const autoRemove = !alert || !("autoRemove" in alert) || alert.autoRemove !== false;
  useEffect(() => {
    if (!alert || !autoRemove) return;
    const id = window.setTimeout(() => dispatch(clearAlert()), 3000);
    return () => window.clearTimeout(id);
  }, [alert, autoRemove, dispatch]);

  if (!alert) return null;

  const dismiss = () => dispatch(clearAlert());
  const wrap = (variant: string, body: React.ReactNode) => (
    <div className="app-alert">
      <Alert variant={variant} onClose={dismiss} dismissible>
        {body}
      </Alert>
    </div>
  );

  switch (alert.key) {
    case "loggedIn":
      return wrap(
        "success",
        <span>
          Hello {alert.userName}, you were successfully logged in. You can now{" "}
          <Alert.Link onClick={() => { dismiss(); onCreateRoom(); }}>create a new room</Alert.Link> or{" "}
          <Alert.Link onClick={() => { dismiss(); onJoinRoom(); }}>join an existing one</Alert.Link>.
        </span>,
      );
    case "loggedOut":
      return wrap("warning", "You were successfully logged out.");
    case "createRoomApiSuccess":
      return wrap(
        "success",
        <span>
          Room <b>{alert.roomId}</b> was successfully created. Share the room id with your friends.{" "}
          <Alert.Link onClick={() => { dismiss(); navigate(`/room/${alert.roomId}`); }}>Join now</Alert.Link>
        </span>,
      );
    case "createRoomApiError":
      return wrap(
        "danger",
        <span>
          Room with id {alert.roomId} already exists.{" "}
          <Alert.Link onClick={() => { dismiss(); onCreateRoom(); }}>Try again</Alert.Link>
        </span>,
      );
    case "joinRoomError":
      return wrap(
        "danger",
        <span>
          Room with id {alert.roomId} does not exist.{" "}
          <Alert.Link onClick={() => { dismiss(); onJoinRoom(); }}>Try again</Alert.Link>
        </span>,
      );
    case "joinRoomSuccess":
      return wrap("success", `Joined room ${alert.roomId} successfully.`);
    case "newPlayerJoined":
      return wrap("success", `New player: ${alert.name} joined.`);
    case "message":
      return wrap(alert.variant, alert.text);
    default:
      return null;
  }
}
