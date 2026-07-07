import { useCallback, useEffect, useRef, useState } from "react";
import type { RtcSignalData } from "../../../shared/protocol.js";
import { getSocket } from "../../net/socket.js";
import { isPushToTalkKey, isTypingTarget } from "./pushToTalk.js";

/** One remote participant in the voice mesh and its live connection state. */
export interface VoicePeer {
  id: string;
  state: RTCPeerConnectionState;
}

export interface UseVoice {
  supported: boolean;
  inVoice: boolean;
  connecting: boolean;
  talking: boolean;
  peers: VoicePeer[];
  error: string | null;
  join: () => Promise<void>;
  leave: () => void;
  setTalking: (on: boolean) => void;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

/**
 * A small WebRTC voice mesh over the room's native-WebSocket signalling relay.
 *
 * Push-to-talk: the mic track is added once but kept DISABLED, and only
 * enabled while the player holds the talk control. The newcomer always offers
 * to every existing peer (the server hands it the peer list on join), so
 * signalling is glare-free. Remote audio is played through detached <audio>
 * elements created after the user's Join gesture (so autoplay is allowed).
 */
export function useVoice(roomId: string): UseVoice {
  const supported =
    typeof RTCPeerConnection !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  const [inVoice, setInVoice] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [talking, setTalkingState] = useState(false);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const audioEls = useRef(new Map<string, HTMLAudioElement>());
  const pendingCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const localStream = useRef<MediaStream | null>(null);
  const inVoiceRef = useRef(false);

  const socket = getSocket();

  const updatePeerState = useCallback((id: string, state: RTCPeerConnectionState) => {
    setPeers((prev) => {
      const existing = prev.find((p) => p.id === id);
      if (existing) return prev.map((p) => (p.id === id ? { ...p, state } : p));
      return [...prev, { id, state }];
    });
  }, []);

  const closePeer = useCallback((id: string) => {
    pcs.current.get(id)?.close();
    pcs.current.delete(id);
    const el = audioEls.current.get(id);
    if (el) {
      el.srcObject = null;
      el.remove();
    }
    audioEls.current.delete(id);
    pendingCandidates.current.delete(id);
    setPeers((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const createPeer = useCallback(
    (peerId: string, isOfferer: boolean): RTCPeerConnection => {
      const existing = pcs.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcs.current.set(peerId, pc);
      updatePeerState(peerId, pc.connectionState);

      for (const track of localStream.current?.getTracks() ?? []) {
        pc.addTrack(track, localStream.current!);
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket?.emit("voice:signal", {
            roomId,
            to: peerId,
            data: { kind: "candidate", candidate: e.candidate.toJSON() },
          });
        }
      };
      pc.ontrack = (e) => {
        let el = audioEls.current.get(peerId);
        if (!el) {
          el = new Audio();
          el.autoplay = true;
          audioEls.current.set(peerId, el);
        }
        el.srcObject = e.streams[0] ?? null;
        void el.play().catch(() => undefined);
      };
      pc.onconnectionstatechange = () => {
        updatePeerState(peerId, pc.connectionState);
        if (pc.connectionState === "failed" || pc.connectionState === "closed") closePeer(peerId);
      };

      if (isOfferer) {
        void (async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket?.emit("voice:signal", {
              roomId,
              to: peerId,
              data: { kind: "description", description: offer },
            });
          } catch (err) {
            console.error("voice offer failed", err);
          }
        })();
      }
      return pc;
    },
    [roomId, socket, updatePeerState, closePeer],
  );

  const drainCandidates = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const queued = pendingCandidates.current.get(peerId);
    if (!queued) return;
    for (const c of queued) await pc.addIceCandidate(c).catch(() => undefined);
    pendingCandidates.current.delete(peerId);
  }, []);

  // ---- signalling wiring ---------------------------------------------------
  useEffect(() => {
    if (!socket) return;

    const onPeers = (peerIds: string[]) => {
      // We just joined: offer to each existing peer.
      for (const id of peerIds) createPeer(id, true);
    };
    const onSignal = async ({ from, data }: { from: string; data: RtcSignalData }) => {
      if (data.kind === "description") {
        if (data.description.type === "offer") {
          const pc = createPeer(from, false);
          await pc.setRemoteDescription(data.description);
          await drainCandidates(from, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("voice:signal", { roomId, to: from, data: { kind: "description", description: answer } });
        } else if (data.description.type === "answer") {
          const pc = pcs.current.get(from);
          if (pc) {
            await pc.setRemoteDescription(data.description);
            await drainCandidates(from, pc);
          }
        }
      } else {
        const pc = pcs.current.get(from);
        if (pc?.remoteDescription) {
          await pc.addIceCandidate(data.candidate).catch(() => undefined);
        } else {
          const q = pendingCandidates.current.get(from) ?? [];
          q.push(data.candidate);
          pendingCandidates.current.set(from, q);
        }
      }
    };
    const onPeerLeft = (peerId: string) => closePeer(peerId);

    socket.on("voice:peers", onPeers);
    socket.on("voice:signal", onSignal);
    socket.on("voice:peerLeft", onPeerLeft);
    return () => {
      socket.off("voice:peers", onPeers);
      socket.off("voice:signal", onSignal);
      socket.off("voice:peerLeft", onPeerLeft);
    };
  }, [socket, roomId, createPeer, closePeer, drainCandidates]);

  // ---- actions -------------------------------------------------------------
  const join = useCallback(async () => {
    if (!supported || !socket || inVoiceRef.current) return;
    setConnecting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      for (const t of stream.getAudioTracks()) t.enabled = false; // push-to-talk: silent until held
      localStream.current = stream;
      inVoiceRef.current = true;
      setInVoice(true);
      socket.emit("voice:join", roomId);
    } catch (err) {
      setError("Microphone access was denied.");
      console.error("getUserMedia failed", err);
    } finally {
      setConnecting(false);
    }
  }, [supported, socket, roomId]);

  const leave = useCallback(() => {
    if (!inVoiceRef.current) return;
    socket?.emit("voice:leave", roomId);
    for (const id of [...pcs.current.keys()]) closePeer(id);
    for (const t of localStream.current?.getTracks() ?? []) t.stop();
    localStream.current = null;
    inVoiceRef.current = false;
    setInVoice(false);
    setTalkingState(false);
    setPeers([]);
  }, [socket, roomId, closePeer]);

  const setTalking = useCallback((on: boolean) => {
    for (const t of localStream.current?.getAudioTracks() ?? []) t.enabled = on;
    setTalkingState(on);
  }, []);

  // Push-to-talk: hold the talk key (V) to open the mic, release to mute. The
  // handlers are global (on window) so the key works without focusing anything.
  useEffect(() => {
    if (!inVoice) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target) || !isPushToTalkKey(event.key)) return;
      event.preventDefault();
      setTalking(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || !isPushToTalkKey(event.key)) return;
      event.preventDefault();
      setTalking(false);
    };
    // Safety net: if the tab/window loses focus while the key is held down, the
    // keyup never arrives — force-mute so the mic is never left open unheard.
    const release = () => setTalking(false);
    const onVisibility = () => {
      if (document.hidden) release();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onVisibility);
      setTalking(false);
    };
  }, [inVoice, setTalking]);

  // Leave cleanly on unmount.
  useEffect(() => () => leave(), [leave]);

  return { supported, inVoice, connecting, talking, peers, error, join, leave, setTalking };
}
