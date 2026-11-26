import { useState, useCallback, useRef } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { translate, getLang } from "../i18n";

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

  const fetchBoard = useCallback(async () => {
    if (!user?.user_id) return;

    try {
      const { data } = await api.get(`/board`);
      setBoard(data);
      boardCache = data;

      if (!livePresenceRef.current && Array.isArray(data?.online_user_ids)) {
        setOnlineUserIds(new Set(data.online_user_ids));
      }

      return data;
    } catch (error) {
      console.error("Failed to fetch board:", error);
      toast.error(translate(getLang(), "board.loadFailed"), { duration: 2500 });
      throw error;
    }
  }, [user?.user_id]);

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