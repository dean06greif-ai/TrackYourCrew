// Teil der Nutzerkarte, ausgelagert aus UserCard.jsx (BACKLOG W1, 2026-11-25).
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Flame } from "@phosphor-icons/react";
import ExerciseIcon from "../ExerciseIcon";
import { useI18n } from "../../i18n";
import { paceToday, todayIdx } from "../../lib/pace";
import { exerciseLabel } from "../../lib/exercises";
import { formatAmount } from "../../lib/amount";

export function Bar({ value, goal, color, boosted }) {
  const pct = Math.min(100, goal > 0 ? (value / goal) * 100 : 0);
  return (
    <div className="h-2 bg-[#1A1A1A] w-full overflow-hidden border border-[#222] relative">
      <motion.div
        className="h-full"
        style={{ background: color, boxShadow: `0 0 10px ${color}80` }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
      {boosted && (
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "repeating-linear-gradient(45deg, transparent 0 6px, rgba(255,136,0,0.12) 6px 12px)"
        }} />
      )}
    </div>
  );
}

export function MetricRow({ exercise, value, canBoost, onBoost, onCancelBoost, isMe, showPace }) {
  const { t, locale } = useI18n();
  const goal = exercise.goal;
  const pct = goal > 0 ? Math.round((value / goal) * 100) : 0;
  const done = pct >= 100;
  const boosted = exercise.boosted_this_week;
  // Tagesziel „auf Kurs“ (Plan 12b): dezent, nur auf der eigenen Karte und nur wenn heute noch etwas fehlt.
  const day = todayIdx();
  const pace = showPace ? paceToday(goal, value, day, exercise.unit) : 0;
  // Nur als Hinweis beim Anklicken/Antippen der Übung, nicht beim Drüberfahren (Dean, 2026-11-25).
  // Klick daneben schließt ihn wieder.
  const [tip, setTip] = useState(false);
  const rowRef = useRef(null);
  useEffect(() => {
    if (!tip) return undefined;
    const close = (e) => { if (rowRef.current && !rowRef.current.contains(e.target)) setTip(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [tip]);
  const tipProps = pace > 0 ? {
    ref: rowRef,
    onClick: (e) => { if (!e.target.closest("button")) setTip((v) => !v); },
  } : {};
  return (
    <div {...tipProps} className={`relative space-y-2 ${boosted ? "px-3 -mx-3 py-2 -my-2 border border-[#FF8800]/30 bg-[#FF8800]/[0.04]" : ""}`} data-testid={`metric-${exercise.key}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <ExerciseIcon icon={exercise.icon} size={16} className="shrink-0" />
          <span className="text-xs uppercase tracking-[0.2em] text-ink-2 truncate" style={{ color: boosted ? "#FF8800" : undefined }}>
            {exerciseLabel(exercise)}
          </span>
          {boosted && (
            isMe ? (
              <button
                onClick={() => onCancelBoost(exercise.key)}
                data-testid={`boost-cancel-${exercise.key}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#FF8800] text-black text-[10px] font-bold tracking-widest uppercase hover:bg-[#FFA033] transition-colors"
                title={t("boost.cancel")}
              >
                <Flame size={10} weight="fill" /> BOOST
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#FF8800] text-black text-[10px] font-bold tracking-widest uppercase" data-testid={`boosted-badge-${exercise.key}`}>
                <Flame size={10} weight="fill" /> BOOST
              </span>
            )
          )}
        </div>
        <div className={`text-xs tracking-widest font-bold ${done ? "text-[#00FF66]" : "text-white"}`}>
          {pct}%{done && " ✓"}
        </div>
      </div>
      <div className="relative">
        <Bar value={value} goal={goal} color={exercise.color} boosted={boosted} />
        {pace > 0 && tip && (
          <p
            role="tooltip"
            className="absolute left-0 bottom-full mb-1.5 z-20 max-w-full bg-[#0A0A0A] border border-[#333] px-2.5 py-1.5 text-[11px] text-ink-2 leading-4 shadow-[0_6px_20px_rgba(0,0,0,0.6)] pointer-events-none"
            data-testid={`pace-${exercise.key}`}
          >
            {t(day === 6 ? "card.paceLast" : "card.paceToday", { n: formatAmount(pace, exercise.unit, locale) })}
          </p>
        )}
      </div>
      <div className="flex items-baseline justify-between font-anton">
        <span className="text-3xl text-white">{formatAmount(value, exercise.unit, locale)}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-2 tracking-wider">/ {formatAmount(goal, exercise.unit, locale)}</span>
          {canBoost && (
            <button
              onClick={() => onBoost(exercise.key)}
              data-testid={`boost-button-${exercise.key}`}
              className="ml-2 inline-flex items-center gap-1 px-2 py-1 border border-[#FF8800]/60 text-[#FF8800] hover:bg-[#FF8800] hover:text-black transition-colors text-[10px] uppercase tracking-widest"
              title={t("boost.tooltip", { pct: Number.isFinite(Number(exercise.progression_pct)) ? exercise.progression_pct : 10 })}
            >
              <Flame size={11} weight="fill" /> Boost
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

