import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Card, type ExplanationRow, cardFromId } from "../../../shared/engine/index.js";
import type {
  ChatMessage,
  ClaimAck,
  GameState,
  RoomPlayer,
  RoomSnapshot,
  SeatColor,
} from "../../../shared/protocol.js";
import { useAppSelector } from "../../app/hooks.js";
import { getSocket } from "../../net/socket.js";
import type { CardStatus } from "../../game/SetCard.js";
import type { FoundSet as FoundSetEntry } from "../../game/foundSets.js";
import { selectUser } from "../session/sessionSlice.js";

const EMPTY_GAME: GameState = { running: false, board: [], setsAvailable: 0, deckRemaining: 0 };
const FLASH_MS = 650;
const CURSOR_THROTTLE_MS = 50;

export type RoomAlert =
  | { kind: "info" }
  | { kind: "found"; name: string }
  | { kind: "already" }
  | { kind: "notset"; explanation: ExplanationRow[] }
  | { kind: "rejected" };

export interface RemoteCursor {
  playerId: string;
  color: SeatColor | null;
  x: number;
  y: number;
}

export interface UseRoom {
  needsLogin: boolean;
  players: RoomPlayer[];
  me: RoomPlayer | undefined;
  game: GameState;
  boardCards: Card[];
  countdown: number | null;
  found: FoundSetEntry[];
  cursors: RemoteCursor[];
  selectedIds: ReadonlySet<number>;
  statuses: ReadonlyMap<number, CardStatus>;
  alert: RoomAlert;
  gameOver: { players: RoomPlayer[]; winnerIds: string[] } | null;
  chat: ChatMessage[];
  sit: (color: SeatColor) => void;
  start: () => void;
  activateCard: (cardId: number) => void;
  onPointerMove: (x: number, y: number) => void;
  sendChat: (text: string) => void;
  clearGameOver: () => void;
}

/**
 * Owns the realtime room: joins over Socket.IO, mirrors the SERVER-AUTHORITATIVE
 * game state (roster, board, countdown, scores), and turns local card picks into
 * `game:claim` requests the server validates. Also relays cursor movements so
 * everyone sees each other's coloured hands.
 */
export function useRoom(roomId: string): UseRoom {
  const user = useAppSelector(selectUser);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [game, setGame] = useState<GameState>(EMPTY_GAME);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [found, setFound] = useState<FoundSetEntry[]>([]);
  const [cursors, setCursors] = useState<Map<string, RemoteCursor>>(new Map());
  const [selected, setSelected] = useState<number[]>([]);
  const [statuses, setStatuses] = useState<Map<number, CardStatus>>(new Map());
  const [alert, setAlert] = useState<RoomAlert>({ kind: "info" });
  const [gameOver, setGameOver] = useState<{ players: RoomPlayer[]; winnerIds: string[] } | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);

  const locked = useRef(false);
  const flashTimer = useRef<number | null>(null);
  const lastCursorSent = useRef(0);

  const socket = getSocket();
  const needsLogin = !user || !socket;

  // ---- wire the socket -----------------------------------------------------
  useEffect(() => {
    if (!socket || !roomId) return;

    const applySnapshot = (snap: RoomSnapshot) => {
      if (snap.roomId !== roomId) return;
      setPlayers(snap.players);
      setGame(snap.game);
      setCountdown(snap.countdown);
      setChat(snap.chat);
    };
    const onPlayers = (list: RoomPlayer[]) => setPlayers(list);
    const onCountdown = (secondsLeft: number | null) => setCountdown(secondsLeft);
    const onStarted = (state: GameState) => {
      setGame(state);
      setFound([]);
      setSelected([]);
      setStatuses(new Map());
      setGameOver(null);
      setAlert({ kind: "info" });
      locked.current = false;
    };
    const onBoard = (state: GameState) => {
      setGame(state);
      const present = new Set(state.board);
      setSelected((prev) => prev.filter((id) => present.has(id)));
    };
    const onClaimAccepted = (info: {
      playerId: string;
      name: string;
      color: SeatColor | null;
      cards: number[];
      explanation: ExplanationRow[];
      points: number;
    }) => {
      setFound((prev) => [
        ...prev,
        {
          cards: info.cards.map(cardFromId),
          explanation: info.explanation,
          by: { name: info.name, color: info.color },
        },
      ]);
      setAlert({ kind: "found", name: info.name });
    };
    const onOver = (info: { players: RoomPlayer[]; winnerIds: string[] }) => {
      setPlayers(info.players);
      setGameOver(info);
      setGame((g) => ({ ...g, running: false }));
    };
    const onCursor = (info: { playerId: string; color: SeatColor | null; x: number; y: number }) => {
      setCursors((prev) => {
        const next = new Map(prev);
        next.set(info.playerId, info);
        return next;
      });
    };
    const onChat = (message: ChatMessage) => setChat((prev) => [...prev, message]);

    socket.on("room:state", applySnapshot);
    socket.on("room:players", onPlayers);
    socket.on("game:countdown", onCountdown);
    socket.on("game:started", onStarted);
    socket.on("game:board", onBoard);
    socket.on("game:claimAccepted", onClaimAccepted);
    socket.on("game:over", onOver);
    socket.on("cursor:update", onCursor);
    socket.on("chat:message", onChat);

    const join = () => socket.emit("room:join", roomId);
    join();
    socket.on("connect", join);

    return () => {
      socket.off("room:state", applySnapshot);
      socket.off("room:players", onPlayers);
      socket.off("game:countdown", onCountdown);
      socket.off("game:started", onStarted);
      socket.off("game:board", onBoard);
      socket.off("game:claimAccepted", onClaimAccepted);
      socket.off("game:over", onOver);
      socket.off("cursor:update", onCursor);
      socket.off("chat:message", onChat);
      socket.off("connect", join);
    };
  }, [socket, roomId]);

  useEffect(() => () => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
  }, []);

  // ---- actions -------------------------------------------------------------
  const sit = useCallback((color: SeatColor) => socket?.emit("room:sit", { roomId, color }), [socket, roomId]);
  const start = useCallback(() => socket?.emit("game:start", roomId), [socket, roomId]);

  const clearFlashLater = useCallback(() => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      setStatuses(new Map());
      setSelected((prev) => prev.slice(0, 0)); // clear
      locked.current = false;
    }, FLASH_MS);
  }, []);

  const submitClaim = useCallback(
    (ids: number[]) => {
      if (!socket) return;
      locked.current = true;
      socket.emit("game:claim", { roomId, cardIds: ids }, (ack: ClaimAck) => {
        if (ack.ok) {
          setStatuses(new Map(ids.map((id) => [id, "good" as CardStatus])));
          // Board update from the server will clear the selection.
        } else {
          setStatuses(new Map(ids.map((id) => [id, "bad" as CardStatus])));
          if (ack.reason === "not-a-set" && ack.explanation) {
            setAlert({ kind: "notset", explanation: ack.explanation });
          } else if (ack.reason === "already-taken") {
            setAlert({ kind: "already" });
          } else {
            setAlert({ kind: "rejected" });
          }
        }
        clearFlashLater();
      });
    },
    [socket, roomId, clearFlashLater],
  );

  const activateCard = useCallback(
    (cardId: number) => {
      if (locked.current || !game.running) return;
      setSelected((prev) => {
        if (prev.includes(cardId)) return prev.filter((id) => id !== cardId);
        const base = prev.length >= 3 ? [] : prev;
        const next = [...base, cardId];
        if (alert.kind !== "info") setAlert({ kind: "info" });
        if (next.length === 3) submitClaim(next);
        return next;
      });
    },
    [game.running, alert.kind, submitClaim],
  );

  const onPointerMove = useCallback(
    (x: number, y: number) => {
      if (!socket) return;
      const now = Date.now();
      if (now - lastCursorSent.current < CURSOR_THROTTLE_MS) return;
      lastCursorSent.current = now;
      socket.emit("cursor:move", { roomId, x, y });
    },
    [socket, roomId],
  );

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed) socket?.emit("chat:send", { roomId, text: trimmed });
    },
    [socket, roomId],
  );

  const clearGameOver = useCallback(() => setGameOver(null), []);

  // ---- derived -------------------------------------------------------------
  const me = useMemo(() => players.find((p) => p.id === user?.id), [players, user?.id]);
  const boardCards = useMemo(() => game.board.map(cardFromId), [game.board]);
  const selectedIds = useMemo(() => new Set(selected), [selected]);
  const remoteCursors = useMemo(
    () => [...cursors.values()].filter((c) => c.playerId !== user?.id),
    [cursors, user?.id],
  );

  return {
    needsLogin,
    players,
    me,
    game,
    boardCards,
    countdown,
    found,
    cursors: remoteCursors,
    selectedIds,
    statuses,
    alert,
    gameOver,
    chat,
    sit,
    start,
    activateCard,
    onPointerMove,
    sendChat,
    clearGameOver,
  };
}
