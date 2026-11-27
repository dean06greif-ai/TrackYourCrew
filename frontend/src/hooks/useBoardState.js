import { useState, useCallback, useRef } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { translate, getLang } from "../i18n";
import { saveSnapshot, loadSnapshot, isNetworkError } from "../lib/offline";

/**
 * Custom Hook für Board State Management
 * Extrahiert aus Dashboard.jsx um Complexity zu reduzieren
 */

// Cache außerhalb des Hooks für Persistence über Navigation
let boardCache = null;

export function useBoardState(user) {
  const [board, setBoard] = useState(() => boardCache);
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  const [flashing, setFlashing] = useState({});
  // Sobald die Live-Verbindung den Online-Status meldet, ist sie maßgeblich.
  // Sonst könnte ein später eintreffendes Board den frischeren Stand überschreiben.
  const livePresenceRef = useRef(false);

  // Gegen Ruckler (Dean 2026-11-27): läuft schon ein Abruf, keinen zweiten parallel starten –
  // danach höchstens einmal nachladen (falls sich inzwischen etwas geändert hat).
  const inflight = useRef(null);
  const again = useRef(false);
  const fetchBoard = useCallback(async () => {
    if (!user?.user_id) return;
    if (inflight.current) { again.current = true; return inflight.current; }
    const run = (async () => {
      try { return await loadBoard(); } finally {
        inflight.current = null;
        if (again.current) { again.current = false; fetchBoardRef.current?.().catch(() => {}); }
      }
    })();
    inflight.current = run;
    return run;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id]);
  const fetchBoardRef = useRef(fetchBoard);
  fetchBoardRef.current = fetchBoard;

  const loadBoard = async () => {
    try {
      const { data } = await api.get(`/board`);
      setBoard(data);
      boardCache = data;
      saveSnapshot("board", { userId: user.user_id, data });

      if (!livePresenceRef.current && Array.isArray(data?.online_user_ids)) {
        setOnlineUserIds(new Set(data.online_user_ids));
      }

      return data;
    } catch (error) {
      // Offline: letzten Stand dieses Kontos zeigen (Dean 2026-11-26), kein Fehler-Toast
      if (isNetworkError(error)) {
        const snap = loadSnapshot("board")?.data;
        if (snap?.userId === user.user_id && snap.data) {
          if (!boardCache) { setBoard(snap.data); boardCache = snap.data; }
          return boardCache;
        }
      }
      console.error("Failed to fetch board:", error);
      toast.error(translate(getLang(), "board.loadFailed"), { duration: 2500 });
      throw error;
    }
  };

  // Live-Events (BACKLOG P4): nur die Karte der betroffenen Person neu laden. Mehrere Events kurz
  // hintereinander (z. B. Eintrag + Woche geschafft + Meilenstein) werden zu einem Abruf gebündelt.
  // Ist die Person (noch) nicht auf dem Board, wird wie bisher alles geladen.
  const refreshTimers = useRef({});
  const boardRef = useRef(board);
  boardRef.current = board;
  const refreshUser = useCallback((userId) => {
    if (!user?.user_id) return;
    if (!userId) { fetchBoard().catch(() => {}); return; }
    window.clearTimeout(refreshTimers.current[userId]);
    refreshTimers.current[userId] = window.setTimeout(async () => {
      delete refreshTimers.current[userId];
      try {
        const { data } = await api.get(`/board/users/${encodeURIComponent(userId)}`);
        const entry = data?.user;
        const onBoard = (boardRef.current?.users || []).some((u) => u.user_id === userId);
        if (!entry || !onBoard) { await fetchBoard(); return; }
        setBoard((prev) => {
          if (!prev) return prev;
          const next = { ...prev, users: (prev.users || []).map((u) => (u.user_id === userId ? { ...entry, is_online: u.is_online } : u)) };
          boardCache = next;
          return next;
        });
      } catch {
        fetchBoard().catch(() => {});
      }
    }, 150);
  }, [user?.user_id, fetchBoard]);

  const updateOnlineUsers = useCallback((userIds) => {
    if (Array.isArray(userIds)) {
      livePresenceRef.current = true;
      setOnlineUserIds(new Set(userIds));
    }
  }, []);

  const flashUser = useCallback((userId, duration = 2500) => {
    setFlashing((prev) => ({ ...prev, [userId]: Date.now() }));
    setTimeout(() => {
      setFlashing((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }, duration);
  }, []);

  return {
    board,
    setBoard,
    onlineUserIds,
    flashing,
    fetchBoard,
    refreshUser,
    updateOnlineUsers,
    flashUser,
  };
}