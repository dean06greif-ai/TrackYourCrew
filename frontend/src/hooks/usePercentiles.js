import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { detectExerciseKind, exerciseLabel } from "../lib/exercises";
import { statKindItems, newPercentileLevels } from "../lib/percentiles";

// Prozent-Vergleiche (Plan 1e): eigene Übungsarten melden, dann einmalig zeigen, wenn man bei
// einer Übungsart neu zu den oberen 50/25/10/5/1 % gehört. Der Server liefert erst etwas,
// wenn genug Nutzer (STATS_MIN_USERS, 50) diese Art tracken – vorher bleibt alles still.
export function usePercentiles({ board, user, t }) {
  const me = board?.users?.find((u) => u.user_id === user?.user_id);
  const sentRef = useRef("");
  const checkedRef = useRef("");
  const items = me ? statKindItems(me.exercises || []) : [];
  const sig = JSON.stringify(items);
  const allTimeSig = me ? JSON.stringify(me.best_weeklies || {}) : "";

  useEffect(() => {
    if (!me || !items.length) return;
    let cancelled = false;
    (async () => {
      try {
        if (sentRef.current !== sig) {
          await api.post("/me/stat-kinds", { items });
          sentRef.current = sig;
        }
        // nur neu prüfen, wenn sich die Bestwerte geändert haben (spart Abfragen)
        if (checkedRef.current === allTimeSig) return;
        checkedRef.current = allTimeSig;
        const { data } = await api.get("/me/percentiles");
        if (cancelled) return;
        // Höchstens EINE Meldung pro Besuch (die beste) und erst ab „obere 25 %“ – „obere 50 %“ ist
        // eher Durchschnitt und steht nur in der Auswertung.
        const fresh = newPercentileLevels(data.kinds, data.seen).sort((x, y) => x.level - y.level);
        const show = fresh.find((n) => n.level <= 25);
        if (show) {
          const ex = (me.exercises || []).find((e) => detectExerciseKind(e.name) === show.kind);
          toast.success(t("pct.toast", { name: ex ? exerciseLabel(ex) : show.kind, level: show.level }), {
            id: `pct-${show.kind}-${show.level}`,
            duration: 6000,
            icon: "🏆",
          });
        }
        // gezeigte Meldung + stille 50-%-Stufen merken; weitere gute Stufen kommen beim nächsten Besuch
        for (const n of fresh.filter((x) => x === show || x.level > 25)) {
          api.post("/me/percentile-seen", { kind: n.kind, level: n.level }).catch(() => {});
        }
      } catch {
        sentRef.current = "";
        checkedRef.current = "";
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.user_id, sig, allTimeSig]);
}
