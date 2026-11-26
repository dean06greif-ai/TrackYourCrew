import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { reachedMilestones, reachedCrewMilestones } from "../lib/milestones";

// Meilensteine im Dashboard (Plan 1e):
// 1. Eigene erreichte Meilensteine an den Server melden (der merkt sich, wann).
// 2. Neue Meilensteine aller Crew-Mitglieder als Toast zeigen, je Betrachter nur
//    einmal (Server-Liste "seen-effects", Typ "milestone") und nur, wenn sie
//    frisch sind (≤ 14 Tage), damit neue Freunde nicht mit Altem geflutet werden.
// 3. Crew-Ziele (ISS, Erde, Mond) aus der Summe aller Distanzen der Crew.
const FRESH_MS = 14 * 24 * 3600 * 1000;
const CREW_INIT = "crew:init";

export function useMilestones({ board, user, lang }) {
  const me = user?.user_id;
  const [seen, setSeen] = useState(null); // Set "<target>|<id>" oder null = noch nicht geladen
  const [queue, setQueue] = useState([]);
  const reportedRef = useRef("");

  useEffect(() => {
    if (!me) return;
    api.get("/me/seen-effects")
      .then(({ data }) => {
        const items = (data?.items || []).filter((i) => i.type === "milestone" && i.effect_id);
        setSeen(new Set(items.map((i) => `${i.target_user_id}|${i.effect_id}`)));
      })
      .catch(() => setSeen(new Set()));
  }, [me]);

  const markSeen = useCallback((target, id) => {
    setSeen((prev) => {
      const next = new Set(prev || []);
      next.add(`${target}|${id}`);
      return next;
    });
    api.post("/me/seen-effects", { target_user_id: target, type: "milestone", effect_id: id }).catch(() => {});
  }, []);

  // 1. Eigene Meilensteine melden (nur wenn etwas fehlt; Server entdoppelt).
  useEffect(() => {
    const mine = board?.users?.find((u) => u.user_id === me);
    if (!mine) return;
    const ids = reachedMilestones(mine, lang).map((m) => m.id);
    const known = new Set((mine.milestones || []).map((m) => m.id));
    const missing = ids.filter((id) => !known.has(id));
    // Ohne gespeicherte Meilensteine einmal pro Sitzung melden (auch leer): so legt
    // der Server die Liste an, und der erste echte Meilenstein kommt nicht still.
    if (!missing.length && known.size > 0) return;
    const sig = missing.join(",") || "init";
    if (reportedRef.current === sig) return;
    reportedRef.current = sig;
    api.post("/me/milestones", { ids: missing, for_user: me }).catch(() => { reportedRef.current = ""; });
  }, [board, me, lang]);

  // 2. + 3. Warteschlange der zu zeigenden Toasts.
  useEffect(() => {
    if (!board?.users || !seen) return;
    const now = Date.now();
    const add = [];
    for (const u of board.users) {
      for (const m of u.milestones || []) {
        if (m.silent || seen.has(`${u.user_id}|${m.id}`)) continue;
        if (!m.at || now - new Date(m.at).getTime() > FRESH_MS) continue;
        add.push({ key: `${u.user_id}|${m.id}`, target: u.user_id, id: m.id, entry: u, isMe: u.user_id === me });
      }
    }
    const crew = reachedCrewMilestones(board.users);
    if (board.users.length > 1) {
      if (!seen.has(`${me}|${CREW_INIT}`)) {
        // Erstes Mal: schon erreichte Crew-Ziele still merken.
        crew.forEach((c) => markSeen(me, c.id));
        markSeen(me, CREW_INIT);
      } else {
        for (const c of crew) {
          if (!seen.has(`${me}|${c.id}`)) add.push({ key: `${me}|${c.id}`, target: me, id: c.id, crew: true });
        }
      }
    }
    if (!add.length) return;
    setQueue((q) => {
      const have = new Set(q.map((x) => x.key));
      const fresh = add.filter((x) => !have.has(x.key));
      return fresh.length ? [...q, ...fresh] : q;
    });
  }, [board, seen, me, markSeen]);

  // Höchstens 3 gleichzeitig; beim Anzeigen als gesehen markieren.
  const visible = queue.slice(0, 3);
  useEffect(() => {
    for (const v of visible) {
      if (seen && !seen.has(v.key)) markSeen(v.target, v.id);
    }
  }, [visible, seen, markSeen]);

  const dismiss = useCallback((key) => setQueue((q) => q.filter((x) => x.key !== key)), []);
  return { toasts: visible, dismiss };
}
