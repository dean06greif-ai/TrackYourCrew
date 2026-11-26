import { useEffect, useMemo, useState } from "react";
import { Trophy, X } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import ExerciseIcon from "./ExerciseIcon";
import { RANK_BASE_UNITS, RANK_COLORS, getRankForExercise, parseUnit } from "../lib/ranks";
import { detectExerciseKind, exerciseLabel, normalizeName } from "../lib/exercises";
import { useI18n } from "../i18n";
import { isActivity } from "../lib/activities";
import { crewTable } from "../lib/score";
import { avatarSrc } from "../lib/api";
import useDragScroll from "../hooks/useDragScroll";

// Anzeige-Einheit je Familie (Werte werden in diese Einheit umgerechnet).
const FAMILY_UNIT = { distance_km: "km", time_sec: "min", count: "" };
const FAMILY_FACTOR = { distance_km: 1, time_sec: 1 / 60, count: 1 };

const normName = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// Gruppen-Schlüssel einer Übung: erkannte Übungsart (z. B. "klimm"), sonst der
// normalisierte Name. So landen "Klimmzüge" und "Pull-Ups" in derselben Liste
// (auch bei Arten ohne Rang, z. B. "Rudern" und "Rowing").
// Varianten ("+10 kg") bilden eine eigene Gruppe neben der Grundübung.
function groupOf(ex) {
  const kind = detectExerciseKind(ex.name) || detectExerciseKind(ex.key);
  const v = normalizeName(ex.variant);
  const suffix = v ? `|v:${v}` : "";
  if (kind) return { id: `k:${kind}${suffix}`, kind };
  return { id: `n:${normName(ex.name)}${suffix}`, kind: null };
}

// Wert einer Übung in die gemeinsame Einheit der Gruppe umrechnen.
function toGroupValue(kind, unit, value) {
  const family = kind ? RANK_BASE_UNITS[kind] : null;
  if (!family || family === "count") return value;
  const parsed = parseUnit(unit);
  if (!parsed) return value;
  const sameFamily =
    (family === "distance_km" && (parsed.kind === "distance" || parsed.kind === "steps")) ||
    (family === "time_sec" && parsed.kind === "time");
  const base = sameFamily ? value * parsed.toBase : value;
  return base * FAMILY_FACTOR[family];
}

function fmt(v, locale) {
  const n = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return n.toLocaleString(locale);
}

/**
 * All-Time-Ranking der Crew: pro Übungsart die Summe aller Wochen (inkl.
 * abgeschlossener Übungen), dazu der Rang (F–S+) aus dem Bestwert.
 * Rechnet nur mit Daten, die das Board ohnehin liefert.
 */
export default function Ranking({ open, onClose, users = [], meId }) {
  const { t, locale } = useI18n();
  const groups = useMemo(() => {
    const map = new Map();
    for (const u of users) {
      const all = [...(u.exercises || []), ...(u.archived_exercises || [])].filter((ex) => !isActivity(ex));
      for (const ex of all) {
        const g = groupOf(ex);
        if (!map.has(g.id)) {
          map.set(g.id, { id: g.id, kind: g.kind, name: exerciseLabel(ex), icon: ex.icon, color: ex.color, unit: ex.unit, rows: new Map(), mine: false });
        }
        const grp = map.get(g.id);
        if (u.user_id === meId) {
          grp.mine = true;
          grp.name = exerciseLabel(ex);
          grp.icon = ex.icon;
          grp.color = ex.color;
          grp.unit = ex.unit;
        }
        const total = toGroupValue(g.kind, ex.unit, Number(u.all_time?.[ex.key]) || 0);
        const rank = g.kind ? getRankForExercise(ex, Number(u.best_goals?.[ex.key]) || 0) : null;
        const prev = grp.rows.get(u.user_id);
        const better = (a, b) => (!a ? b : !b ? a : Object.keys(RANK_COLORS).indexOf(b.letter) > Object.keys(RANK_COLORS).indexOf(a.letter) ? b : a);
        grp.rows.set(u.user_id, {
          user: u,
          total: (prev?.total || 0) + total,
          rank: better(prev?.rank, rank),
        });
      }
    }
    const list = [...map.values()].map((g) => ({
      ...g,
      unitLabel: g.kind ? FAMILY_UNIT[RANK_BASE_UNITS[g.kind]] ?? g.unit : g.unit,
      rows: [...g.rows.values()].sort((a, b) => b.total - a.total),
    }));
    // Eigene Übungen zuerst, dann solche, die mehrere Leute machen.
    return list
      .filter((g) => g.mine || g.rows.length > 1)
      .sort((a, b) => Number(b.mine) - Number(a.mine) || b.rows.length - a.rows.length);
  }, [users, meId]);

  // Erster Reiter: Gesamtwertung der Crew über alle Übungen (Plan 5).
  const totalRows = useMemo(() => crewTable(users), [users]);
  const [activeId, setActiveId] = useState("total");
  const tabs = useDragScroll();
  const showTotal = activeId === "total" || !groups.some((g) => g.id === activeId);
  const active = groups.find((g) => g.id === activeId) || groups[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          data-testid="ranking-overlay"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.aside
            className="relative w-full max-w-md h-full bg-[#0A0A0A] border-l border-[#222] flex flex-col"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            onClick={(e) => e.stopPropagation()}
            data-testid="ranking-panel"
          >
            <header className="flex items-center justify-between p-6 border-b border-[#1A1A1A]">
              <div className="flex items-center gap-2">
                <Trophy size={20} weight="fill" className="text-[#CCFF00]" />
                <h2 className="font-anton text-2xl tracking-tight">{t("ranking.title")}</h2>
              </div>
              <button onClick={onClose} className="text-ink-2 hover:text-white" aria-label={t("common.close")} data-testid="close-ranking">
                <X size={18} />
              </button>
            </header>

            {users.length === 0 ? (
              <p className="p-6 text-ink-3 text-sm uppercase tracking-widest">{t("ranking.empty")}</p>
            ) : (
              <>
                {/* Reiter: seitlich wischen (Finger) oder ziehen/Mausrad (PC); Kanten zeigen, dass mehr da ist */}
                <div className="relative border-b border-[#1A1A1A]">
                <div ref={tabs.ref} className="flex gap-2 overflow-x-auto scrollbar-hide px-6 pt-5 pb-4 select-none cursor-grab active:cursor-grabbing" style={{ WebkitUserSelect: "none" }} data-testid="ranking-tabs">
                  <button
                    onClick={() => setActiveId("total")}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border text-[10px] uppercase tracking-widest transition-colors"
                    style={{
                      borderColor: showTotal ? "#CCFF00" : "#222",
                      color: showTotal ? "#0A0A0A" : "#8A8A8A",
                      background: showTotal ? "#CCFF00" : "transparent",
                    }}
                    data-testid="ranking-tab-total"
                  >
                    <Trophy size={12} weight="fill" /> {t("ranking.total")}
                  </button>
                  {groups.map((g) => {
                    const isActive = !showTotal && g.id === active?.id;
                    return (
                      <button
                        key={g.id}
                        onClick={() => setActiveId(g.id)}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border text-[10px] uppercase tracking-widest transition-colors"
                        style={{
                          borderColor: isActive ? g.color : "#222",
                          color: isActive ? "#0A0A0A" : "#8A8A8A",
                          background: isActive ? g.color : "transparent",
                        }}
                        data-testid={`ranking-tab-${g.id}`}
                      >
                        <ExerciseIcon icon={g.icon} size={12} /> {g.name}
                        <span className="opacity-60">· {g.rows.length}</span>
                      </button>
                    );
                  })}
                </div>
                <div aria-hidden className={`pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#0A0A0A] to-transparent transition-opacity ${tabs.edges.left ? "opacity-100" : "opacity-0"}`} />
                <div aria-hidden className={`pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-[#0A0A0A] to-transparent transition-opacity ${tabs.edges.right ? "opacity-100" : "opacity-0"}`} />
                </div>

                {showTotal ? (
                <div className="flex-1 overflow-y-auto scrollbar-dark p-6 space-y-2" data-testid="ranking-total">
                  {totalRows.map((r, idx) => {
                    const isMe = r.user.user_id === meId;
                    return (
                      <div
                        key={r.user.user_id}
                        className={`border bg-[#121212] p-3 flex items-center gap-3 ${isMe ? "border-[#CCFF00]/60" : "border-[#1A1A1A]"}`}
                        data-testid={`ranking-total-row-${r.user.user_id}`}
                      >
                        <div className={`font-anton text-2xl w-8 text-center ${idx === 0 ? "text-[#CCFF00]" : idx === 1 ? "text-[#CCCCCC]" : idx === 2 ? "text-[#A06B3A]" : "text-ink-3"}`}>
                          {String(idx + 1).padStart(2, "0")}
                        </div>
                        {r.user.picture ? (
                          <img src={avatarSrc(r.user.picture)} alt="" className="w-9 h-9 object-cover border border-[#333]" />
                        ) : (
                          <div className="w-9 h-9 bg-[#1A1A1A] border border-[#333] flex items-center justify-center font-anton">{r.user.name?.[0]?.toUpperCase()}</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-anton text-lg truncate leading-tight">{r.user.name}{isMe && <span className="text-[#CCFF00] text-xs ml-2 tracking-widest">{t("common.you")}</span>}</p>
                          <p className="text-[10px] uppercase tracking-widest text-ink-3 leading-tight truncate">{t(r.weeks === 1 ? "ranking.totalDetailOne" : "ranking.totalDetail", { weeks: r.weeks, streak: r.streak })}</p>
                        </div>
                        <div className="text-right min-w-[64px]">
                          <span className="font-anton text-xl text-[#CCFF00]">{fmt(r.points, locale)}</span>
                          <span className="text-[10px] text-ink-3 ml-1 uppercase">{t("ranking.points")}</span>
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-ink-3 leading-relaxed pt-2">{t("ranking.totalHow")}</p>
                </div>
                ) : (
                <div className="flex-1 overflow-y-auto scrollbar-dark p-6 space-y-2">
                  {active.rows.map((r, idx) => {
                    const isMe = r.user.user_id === meId;
                    return (
                      <div
                        key={r.user.user_id}
                        className={`border bg-[#121212] p-3 flex items-center gap-3 ${isMe ? "border-[#CCFF00]/60" : "border-[#1A1A1A]"}`}
                        data-testid={`ranking-row-${r.user.user_id}`}
                      >
                        <div className={`font-anton text-2xl w-8 text-center ${idx === 0 ? "text-[#CCFF00]" : idx === 1 ? "text-[#CCCCCC]" : idx === 2 ? "text-[#A06B3A]" : "text-ink-3"}`}>
                          {String(idx + 1).padStart(2, "0")}
                        </div>
                        {r.user.picture ? (
                          <img src={avatarSrc(r.user.picture)} alt="" className="w-9 h-9 object-cover border border-[#333]" />
                        ) : (
                          <div className="w-9 h-9 bg-[#1A1A1A] border border-[#333] flex items-center justify-center font-anton">{r.user.name?.[0]?.toUpperCase()}</div>
                        )}
                        <p className="flex-1 min-w-0 font-anton text-lg truncate">{r.user.name}{isMe && <span className="text-[#CCFF00] text-xs ml-2 tracking-widest">{t("common.you")}</span>}</p>
                        {r.rank && (
                          <span
                            className="font-anton text-sm w-8 h-8 flex items-center justify-center border"
                            style={{ color: r.rank.color, borderColor: r.rank.color, boxShadow: `0 0 8px ${r.rank.glow}` }}
                            title={`Rank ${r.rank.letter}`}
                          >
                            {r.rank.letter}
                          </span>
                        )}
                        <div className="text-right min-w-[64px]">
                          <span className="font-anton text-xl" style={{ color: active.color }}>{fmt(r.total, locale)}</span>
                          {active.unitLabel && <span className="text-[10px] text-ink-3 ml-1 uppercase">{active.unitLabel}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {active.rows.length === 1 && (
                    <p className="text-[11px] text-ink-3 leading-relaxed pt-2">
                      {t("ranking.alone")}
                    </p>
                  )}
                </div>
                )}
              </>
            )}
            {!showTotal && (
              <footer className="border-t border-[#1A1A1A] p-4 text-[10px] uppercase tracking-widest text-ink-3 text-balance">
                {t("ranking.footer")}
              </footer>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
