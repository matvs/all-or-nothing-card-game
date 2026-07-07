import { useCallback, useEffect, useState } from "react";
import {
  createVoiceMesh,
  isVoiceSupported,
  type VoiceMeshClient,
  type VoiceMeshState,
  type VoicePeer,
} from "@matvs/core-realtime/voice";
import { getSocket } from "../../net/socket.js";
import { bindPushToTalk } from "./pushToTalk.js";

/** One remote participant in the voice mesh and its live connection state. */
export type { VoicePeer };

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

const INITIAL: VoiceMeshState = {
  inVoice: false,
  connecting: false,
  talking: false,
  peers: [],
  error: null,
};

/**
 * Room voice, powered by the shared `@matvs/core-realtime` WebRTC mesh engine.
 *
 * This hook is a thin React adapter: it rides the room's existing native-WebSocket
 * game socket as the signalling transport (media stays peer-to-peer and never
 * touches the server), mirrors the mesh's state into React, and wires hold-to-talk
 * (V) via the shared `bindPushToTalk`. The push-to-talk behaviour, mute, glare-free
 * mesh bootstrapping and remote-audio playback all live in the module now.
 */
export function useVoice(roomId: string): UseVoice {
  const socket = getSocket();
  const [mesh, setMesh] = useState<VoiceMeshClient | null>(null);
  const [state, setState] = useState<VoiceMeshState>(INITIAL);

  // Build the mesh once the socket + room are available; tear it down on change
  // or unmount (dispose leaves voice, stops the mic, and detaches signalling).
  useEffect(() => {
    if (!socket || !roomId) return;
    const transport = {
      emit: (t: string, d?: unknown) => socket.emit(t, d),
      on: (t: string, h: (data: unknown) => void) => socket.on(t, h),
      off: (t: string, h: (data: unknown) => void) => socket.off(t, h),
    };
    const client = createVoiceMesh({ roomId, transport });
    setMesh(client);
    setState(client.getState());
    const unsubscribe = client.subscribe(() => setState(client.getState()));
    return () => {
      unsubscribe();
      client.dispose();
      setMesh(null);
      setState(INITIAL);
    };
  }, [socket, roomId]);

  // Push-to-talk: hold V while in voice. Handlers are global (on window) so the
  // key works without focusing anything; released automatically on blur/hide.
  useEffect(() => {
    if (!mesh || !state.inVoice) return;
    return bindPushToTalk({ setTalking: (on) => mesh.setTalking(on) });
  }, [mesh, state.inVoice]);

  const join = useCallback(async () => {
    await mesh?.join();
  }, [mesh]);
  const leave = useCallback(() => mesh?.leave(), [mesh]);
  const setTalking = useCallback((on: boolean) => mesh?.setTalking(on), [mesh]);

  return {
    supported: isVoiceSupported(),
    inVoice: state.inVoice,
    connecting: state.connecting,
    talking: state.talking,
    peers: [...state.peers],
    error: state.error,
    join,
    leave,
    setTalking,
  };
}
