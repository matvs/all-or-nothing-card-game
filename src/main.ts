import "./styles/main.css";
import { LocalSession } from "./game/localSession.js";
import type { GameSession } from "./game/session.js";
import { clearCredentials, createRoom, joinRoom, loadCredentials, RemoteSession, saveCredentials } from "./net/remoteSession.js";
import { h, setChildren } from "./ui/dom.js";
import { renderLobby } from "./ui/screens/lobby.js";
import { renderMenu, type MenuChoice } from "./ui/screens/menu.js";
import { renderTable, type TableController } from "./ui/screens/table.js";
import { showToast } from "./ui/toasts.js";

const root = document.getElementById("app") as HTMLElement;

let activeSession: GameSession | null = null;
let activeTable: TableController | null = null;
let lobbyUnsub: (() => void) | null = null;

function teardown(): void {
  activeTable?.dispose();
  activeTable = null;
  lobbyUnsub?.();
  lobbyUnsub = null;
  activeSession = null;
}

function showMenu(): void {
  teardown();
  renderMenu(root, handleMenuChoice);
}

function startSolo(choice: Extract<MenuChoice, { mode: "solo" }>): void {
  teardown();
  const session = new LocalSession({
    playerName: choice.name,
    difficulty: choice.difficulty,
    roundPeak: choice.roundPeak,
    dealerRestriction: choice.dealerRestriction,
  });
  activeSession = session;
  activeTable = renderTable(root, session, showMenu);
}

function enterMultiplayer(session: RemoteSession, myPlayerId: string): void {
  activeSession = session;

  // Multiplayer flows through two screens: lobby until the room starts,
  // then the table. Both are driven by the same session events.
  let onTable = false;
  const showTableOnce = () => {
    if (onTable) return;
    onTable = true;
    lobbyUnsub?.();
    lobbyUnsub = null;
    activeTable = renderTable(root, session, showMenu);
  };

  lobbyUnsub = session.subscribe((event) => {
    if (onTable) return;
    if (event.type === "room") {
      if (event.room.phase === "lobby") {
        renderLobby(root, session, event.room, myPlayerId, () => {
          session.leave();
          showMenu();
        });
      } else {
        showTableOnce();
      }
    } else if (event.type === "match") {
      showTableOnce();
    } else if (event.type === "connection" && event.status === "rejected") {
      showToast(event.detail ?? "Could not join the room.", "warn");
      showMenu();
    } else if (event.type === "chat" && event.message) {
      // Lobby chat arrives before the table exists; surface it as a toast.
      showToast(`${event.message.from}: ${event.message.text}`);
    } else if (event.type === "toast") {
      showToast(event.text, event.level);
    }
  });
}

async function handleMenuChoice(choice: MenuChoice): Promise<void> {
  if (choice.mode === "solo") {
    startSolo(choice);
    return;
  }
  try {
    if (choice.mode === "create") {
      const created = await createRoom(choice.name, {
        difficulty: choice.difficulty,
        roundPeak: choice.roundPeak,
        dealerRestriction: choice.dealerRestriction,
      });
      const session = new RemoteSession({ code: created.code, playerId: created.playerId, token: created.token });
      enterMultiplayer(session, created.playerId);
    } else {
      const joined = await joinRoom(choice.code, choice.name, choice.asSpectator);
      const session = new RemoteSession({ code: joined.code, playerId: joined.playerId, token: joined.token });
      enterMultiplayer(session, joined.playerId);
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not reach the server.", "warn");
  }
}

/** Reload/rejoin: if this browser session holds live credentials, resume the seat. */
function tryResume(): boolean {
  const creds = loadCredentials();
  if (!creds) return false;
  const session = new RemoteSession(creds);
  saveCredentials(creds);
  enterMultiplayer(session, creds.playerId);
  // If the server rejects (expired grace, room gone), the rejected handler
  // clears credentials and returns to the menu.
  const failsafe = session.subscribe((event) => {
    if (event.type === "connection" && event.status === "rejected") {
      clearCredentials();
      failsafe();
    }
  });
  return true;
}

setChildren(root, h("div.menu-screen", {}, h("p", {}, "Shuffling up…")));
if (!tryResume()) {
  showMenu();
}
