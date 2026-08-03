import { useEffect, useState } from "react";
import Container from "react-bootstrap/Container";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "./app/hooks.js";
import { AlertBar } from "./features/alert/AlertBar.js";
import { HowToPlayPage } from "./features/mainPage/HowToPlayPage.js";
import { MainPage } from "./features/mainPage/MainPage.js";
import { CreateRoomModal } from "./features/modals/CreateRoomModal.js";
import { JoinRoomModal } from "./features/modals/JoinRoomModal.js";
import { LoginModal } from "./features/modals/LoginModal.js";
import { selectUser, welcomeApi } from "./features/session/sessionSlice.js";
import { SinglePlayerPage } from "./game/SinglePlayerPage.js";
import { RoomPage } from "./features/room/RoomPage.js";

/**
 * App shell: the recovered landing + modal flow (Login / Create room / Join
 * room) with an app-level alert banner, plus client-side routes to the
 * single-player puzzle and the multiplayer rooms. Auto-logs-in on load from a
 * stored token so a refresh keeps your identity.
 */
export function App() {
  const user = useAppSelector(selectUser);
  const dispatch = useAppDispatch();

  const [showLogin, setShowLogin] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!user) void dispatch(welcomeApi());
    // Only attempt the silent welcome once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => (user ? setShowCreate(true) : setShowLogin(true));
  const openJoin = () => (user ? setShowJoin(true) : setShowLogin(true));

  return (
    <div className="app-shell">
      <Container fluid className="pt-3">
        <AlertBar onCreateRoom={openCreate} onJoinRoom={openJoin} />
      </Container>

      <Routes>
        <Route
          path="/"
          element={
            <MainPage
              user={user}
              onLogin={() => setShowLogin(true)}
              onCreateRoom={openCreate}
              onJoinRoom={openJoin}
            />
          }
        />
        <Route path="/how-to-play" element={<HowToPlayPage />} />
        <Route
          path="/singleplayer"
          element={
            <RequireUser signedIn={!!user} onLogin={() => setShowLogin(true)}>
              <SinglePlayerPage />
            </RequireUser>
          }
        />
        <Route
          path="/room/:roomId"
          element={
            <RequireUser signedIn={!!user} onLogin={() => setShowLogin(true)}>
              <RoomPage />
            </RequireUser>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <LoginModal show={showLogin} onClose={() => setShowLogin(false)} />
      <CreateRoomModal show={showCreate} onClose={() => setShowCreate(false)} />
      <JoinRoomModal show={showJoin} onClose={() => setShowJoin(false)} />
    </div>
  );
}

/**
 * The play gate: reading the rules is open, PLAYING requires a signed-in account —
 * single-player included. Renders the sign-in prompt in place of the game.
 */
function RequireUser({
  signedIn,
  onLogin,
  children,
}: {
  signedIn: boolean;
  onLogin: () => void;
  children: JSX.Element;
}) {
  if (signedIn) return children;
  return (
    <Container className="py-5 text-center">
      <h2>Sign in to play</h2>
      <p className="text-muted">All or Nothing needs your Matvs account — no anonymous games.</p>
      <button type="button" className="btn btn-primary btn-lg" onClick={onLogin}>
        Sign in
      </button>
    </Container>
  );
}
