import Button from "react-bootstrap/Button";
import type { RoomPlayer } from "../../../shared/protocol.js";
import type { UseVoice } from "./useVoice.js";

/**
 * Voice channel controls: join/leave the WebRTC mesh and a push-to-talk button
 * (hold mouse or Space to transmit). Shows each connected peer with a state dot.
 */
export function VoiceBar({ voice, players }: { voice: UseVoice; players: RoomPlayer[] }) {
  if (!voice.supported) {
    return (
      <div className="voice-bar">
        <span className="text-muted">Voice chat is not supported in this browser.</span>
      </div>
    );
  }

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "player";
  const colorOf = (id: string) => players.find((p) => p.id === id)?.color ?? "#888";
  const dot = (state: string) =>
    state === "connected" ? "#28a745" : state === "failed" || state === "closed" ? "#dc3545" : "#f6a609";

  return (
    <div className="voice-bar">
      {!voice.inVoice ? (
        <Button variant="outline-primary" size="sm" onClick={() => void voice.join()} disabled={voice.connecting}>
          {voice.connecting ? "Connecting…" : "🎙 Join voice"}
        </Button>
      ) : (
        <>
          <Button
            variant={voice.talking ? "success" : "outline-success"}
            size="sm"
            className={`ptt-button${voice.talking ? " is-live" : ""}`}
            onPointerDown={() => voice.setTalking(true)}
            onPointerUp={() => voice.setTalking(false)}
            onPointerLeave={() => voice.setTalking(false)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") voice.setTalking(true);
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") voice.setTalking(false);
            }}
          >
            {voice.talking ? "🔴 Talking…" : "🎙 Hold to talk"}
          </Button>
          <Button variant="outline-secondary" size="sm" onClick={voice.leave}>
            Leave voice
          </Button>
          <div className="voice-bar__peers">
            {voice.peers.length === 0 ? (
              <span className="text-muted">Waiting for others to join voice…</span>
            ) : (
              voice.peers.map((p) => (
                <span key={p.id} className="voice-peer" data-state={p.state} title={p.state}>
                  <span
                    className="roster__swatch"
                    style={{ backgroundColor: colorOf(p.id), boxShadow: `0 0 0 2px ${dot(p.state)}` }}
                  />
                  <span style={{ color: colorOf(p.id) }}>{nameOf(p.id)}</span>
                </span>
              ))
            )}
          </div>
        </>
      )}
      {voice.error && <span className="text-danger">{voice.error}</span>}
    </div>
  );
}
