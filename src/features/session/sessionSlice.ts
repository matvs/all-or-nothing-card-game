import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  CreateRoomResponse,
  JoinRoomResponse,
  LoginResponse,
  WelcomeResponse,
} from "../../../shared/protocol.js";
import { API_BASE, TOKEN_KEY } from "../../config.js";
import type { AppDispatch, RootState } from "../../app/store.js";
import { connectSocket, disconnectSocket } from "../../net/socket.js";

export type Player = LoginResponse;

/** Alert descriptors, mirroring the recovered App.js alert keys. */
export type AlertData =
  | { key: "loggedIn"; userName: string; autoRemove?: boolean }
  | { key: "loggedOut" }
  | { key: "createRoomApiSuccess"; roomId: string }
  | { key: "createRoomApiError"; roomId: string }
  | { key: "joinRoomError"; roomId: string }
  | { key: "joinRoomSuccess"; roomId: string }
  | { key: "newPlayerJoined"; name: string }
  | { key: "message"; variant: string; text: string };

interface SessionState {
  user: Player | null;
  alert: AlertData | null;
}

const initialState: SessionState = { user: null, alert: null };

const slice = createSlice({
  name: "session",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<Player | null>) {
      state.user = action.payload;
    },
    loggedIn(state, action: PayloadAction<Player>) {
      state.user = action.payload;
      state.alert = { key: "loggedIn", userName: action.payload.name, autoRemove: false };
    },
    loggedOut(state) {
      state.user = null;
      state.alert = { key: "loggedOut" };
    },
    setAlert(state, action: PayloadAction<AlertData | null>) {
      state.alert = action.payload;
    },
    clearAlert(state) {
      state.alert = null;
    },
  },
});

export const { setUser, loggedIn, loggedOut, setAlert, clearAlert } = slice.actions;
export default slice.reducer;

export const selectUser = (state: RootState): Player | null => state.session.user;
export const selectAlert = (state: RootState): AlertData | null => state.session.alert;

// -- helpers -----------------------------------------------------------------

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return (await res.json()) as T;
}

function persist(player: Player): void {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(player));
  } catch {
    /* ignore */
  }
}

function readPersisted(): Player | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Player) : null;
  } catch {
    return null;
  }
}

/** Open the realtime connection using the player's identity. */
function openSocket(player: Player): void {
  connectSocket({ token: player.token, playerId: player.id, name: player.name });
}

// -- thunks ------------------------------------------------------------------

/**
 * Real sign-in against the central IdP (via the game server). Resolves to `null` on
 * success or a human-readable failure message (bad credentials, awaiting approval,
 * IdP unreachable) the login modal shows inline.
 */
export const loginApi =
  (username: string, password: string) =>
  async (dispatch: AppDispatch): Promise<string | null> => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    } catch {
      return "Sign-in is temporarily unavailable.";
    }
    const data = (await res.json()) as (LoginResponse & { error?: boolean; message?: string });
    if (!res.ok || data.error) {
      return data.message ?? "Invalid username or password.";
    }
    persist(data);
    openSocket(data);
    dispatch(loggedIn(data));
    return null;
  };

/** Silent auto-login on page load if a stored token is still valid. */
export const welcomeApi =
  () =>
  async (dispatch: AppDispatch): Promise<void> => {
    const stored = readPersisted();
    if (!stored) return;
    const data = await postJson<WelcomeResponse>("/welcome", { token: stored.token });
    if (data.foundSession && data.player) {
      persist(data.player);
      openSocket(data.player);
      dispatch(setUser(data.player));
    } else {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {
        /* ignore */
      }
    }
  };

export const logoutApi =
  () =>
  async (dispatch: AppDispatch): Promise<void> => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    disconnectSocket();
    dispatch(loggedOut());
  };

export const createRoomApi =
  (roomId?: string) =>
  async (dispatch: AppDispatch): Promise<string | null> => {
    const data = await postJson<CreateRoomResponse>("/rooms", { roomId });
    if ("error" in data && data.error) {
      dispatch(setAlert({ key: "createRoomApiError", roomId: data.id }));
      return null;
    }
    dispatch(setAlert({ key: "createRoomApiSuccess", roomId: data.id }));
    return data.id;
  };

/** Validate a room exists (used by the Room page on mount). */
export const joinRoomApi =
  (roomId: string) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    const data = await postJson<JoinRoomResponse>("/rooms/join", { roomId });
    if ("error" in data && data.error) {
      dispatch(setAlert({ key: "joinRoomError", roomId }));
      return false;
    }
    return true;
  };
