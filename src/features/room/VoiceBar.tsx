import Button from "react-bootstrap/Button";
import type { RoomPlayer } from "../../../shared/protocol.js";
import { PUSH_TO_TALK_KEY_LABEL } from "./pushToTalk.js";
import type { UseVoice } from "./useVoice.js";

/**
 * Voice channel controls: join/leave the WebRTC mesh and push-to-talk status.
 * The V key is wired globally by useVoice, so it works even when the button is
 * not focused. The button remains useful on touch devices.
 */
export function VoiceBar({ voice, players }: { voice: UseVoice; players: RoomPlayer[] }) {
  if (!voice.supported) {
    return (
      <div className="voice-bar">
        <span className="text-muted">
          {voice.unavailableReason === "insecure"
            ? "Voice needs a secure connection (HTTPS or localhost). Text chat works everywhere — or open the game on the computer at http://127.0.0.1."
            : "This browser has no WebRTC voice support. Text chat still works."}
        </span>
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
          >
            {voice.talking ? "Talking…" : `Hold ${PUSH_TO_TALK_KEY_LABEL} or press here`}
          </Button>
          <span className="voice-live" role="status" aria-live="polite">
            {voice.talking ? `● Live — ${PUSH_TO_TALK_KEY_LABEL} held` : ""}
          </span>
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
