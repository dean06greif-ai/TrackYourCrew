import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChartBar, X, Lightning, Trophy } from "@phosphor-icons/react";
import { api } from "../lib/api";
import ExerciseIcon from "./ExerciseIcon";
import { useI18n, weekdayNames, formatNumber } from "../i18n";
import { exerciseLabel } from "../lib/exercises";
import HistoryChart from "./HistoryChart";
import { ChallengeHistory } from "./Challenges";
import { detectExerciseKind } from "../lib/exercises";

export default function Insights({ open, onClose, meId }) {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [pct, setPct] = useState({});

  useEffect(() => {
    if (!open) return;
    setData(null);
    (async () => {
      try {
        const { data } = await api.get("/insights/me");
        setData(data);
        api.get("/me/percentiles").then((r) => setPct(r.data?.kinds || {})).catch(() => {});
      } catch (e) { /* ignore */ }
    })();
  }, [open]);

  // ✅ SCROLL BLOCKIEREN: Body overflow:hidden wenn Panel offen
  useEffect(() => {
    if (!open) return;
    
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    
    // Scrollbar-Breite ermitteln um Layout-Shift zu vermeiden
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          // iPhone: beim Ein-/Ausblenden der Adressleiste blitzte unten das Dashboard durch ->
          // Überlagerung auf die große Viewport-Höhe (lvh), Panel füllt sie ganz (Dean 2026-11-27)
          className="fixed top-0 left-0 right-0 z-50 flex justify-end h-screen [height:100lvh]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          data-testid="insights-overlay"
        >
          <div className="absolute inset-0 -bottom-24 bg-black/70 backdrop-blur-sm" />
          <motion.aside
            className="relative w-full sm:max-w-lg h-full bg-[#0A0A0A] border-l border-[#222] flex flex-col"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            onClick={(e) => e.stopPropagation()}
            data-testid="insights-panel"
          >
            <header className="flex items-center justify-between p-6 border-b border-[#1A1A1A] sticky top-0 bg-[#0A0A0A] z-10">
              <div className="flex items-center gap-2">
                <ChartBar size={20} weight="fill" className="text-[#CCFF00]" />
                <h2 className="font-anton text-2xl tracking-tight">{t("insights.title")}</h2>
              </div>
              <button onClick={onClose} className="text-ink-2 hover:text-white" data-testid="close-insights">
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-dark p-6 space-y-6" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom) + 100lvh - 100dvh)" }}>
              {!data ? (
                <p className="text-ink-3 text-sm uppercase tracking-widest">{t("common.loading")}</p>
              ) : data.weeks_tracked === 0 && !data.exercises.some((e) => (e.history || []).length) ? (
                <div className="border border-dashed border-[#222] p-8 text-center">
                  <p className="text-ink-3 text-sm uppercase tracking-widest mb-2">{t("insights.noData")}</p>
                  <p className="text-[10px] uppercase tracking-widest text-ink-3 text-balance">{t("insights.noDataHint")}</p>
                </div>
              ) : (
                <>
                  {data.weeks_tracked === 0 ? (
                    <div className="border border-dashed border-[#222] p-4 text-center" data-testid="insights-no-days">
                      <p className="text-ink-3 text-xs uppercase tracking-widest mb-1">{t("insights.noData")}</p>
                      <p className="text-[10px] uppercase tracking-widest text-ink-3 text-balance">{t("insights.noDataHint")}</p>
                    </div>
                  ) : (
                  <div className="border border-[#1A1A1A] bg-[#121212] p-4 flex items-center gap-3">
                    <Lightning size={20} weight="fill" className="text-[#CCFF00]" />
                    <p className="text-[11px] uppercase tracking-widest text-ink-2">
                      {data.weeks_tracked === 1 ? (
                        <>{t("insights.basedOnPre")} <span className="text-white font-anton text-base mx-1">1</span> {t("insights.basedOnWeek")}</>
                      ) : (
                        <>{t("insights.basedOnPre")} <span className="text-white font-anton text-base mx-1">{data.weeks_tracked}</span> {t("insights.basedOnWeeks")}</>
                      )}
                    </p>
                  </div>
                  )}

                  {data.exercises.filter((ex) => ex.type !== "activity").map((ex) => (
                    <ExerciseInsight key={ex.key} ex={ex} hasDays={data.weeks_tracked > 0} pct={(ex.variant || "").trim() ? null : pct[detectExerciseKind(ex.name)]} />
                  ))}
                </>
              )}
              {/* Challenges-Historie (Plan 12e) */}
              {data && <ChallengeHistory meId={meId} />}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ExerciseInsight({ ex, hasDays = true, pct = null }) {
  const { t, locale } = useI18n();
  const DAY_LABELS = weekdayNames(locale, "short");
  const DAY_LABELS_FULL = weekdayNames(locale, "long");
  // Defensive: Sicherstellen dass by_weekday existiert und ein Array ist
  const byWeekday = Array.isArray(ex.by_weekday) ? ex.by_weekday : [0, 0, 0, 0, 0, 0, 0];
  const maxVal = Math.max(...byWeekday, 1);

  // Defensive: Sicherstellen dass share_per_day existiert
  const sharePerDay = Array.isArray(ex.share_per_day) ? ex.share_per_day : [0, 0, 0, 0, 0, 0, 0];

  // Defensive: Sicherstellen dass consistency existiert
  const consistency = Array.isArray(ex.consistency) ? ex.consistency : [0, 0, 0, 0, 0, 0, 0];

  // Wochenschnitt: mit Tageswerten wie bisher, sonst aus den abgeschlossenen Wochen des Verlaufs.
  const pastWeeks = (ex.history || []).filter((h) => h.status === "completed" || h.status === "missed");
  const avgPerWeek = hasDays || !pastWeeks.length
    ? ex.avg_per_week
    : pastWeeks.reduce((sum, h) => sum + (h.value || 0), 0) / pastWeeks.length;
  const unitLower = (ex.unit || "").toLowerCase();
  const isDistance = unitLower.includes("km") || unitLower === "m" || unitLower.includes("mi");

  // Mindesthöhe = exakt so groß, dass die Total-Zahl bequem unten im Balken sitzt.
  // Darüber hinaus lineare Proportionalität: Tage mit höherem Wert wachsen deutlich.
  const MIN_FIT_PCT = 18; // ~32px bei h-44 (176px) – passt für 11px Zahl + Padding

  return (
    <div className="border border-[#1A1A1A] bg-[#121212] p-5 space-y-5" data-testid={`insight-${ex.key}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ color: ex.color }}>
          <ExerciseIcon icon={ex.icon} size={18} />
          <div>
            <h3 className="font-anton text-xl tracking-tight">{exerciseLabel(ex)}</h3>
            {/* Prozent-Vergleich (nur echte Daten, ab genug Nutzern) */}
            {pct && (
              <p className="text-[10px] uppercase tracking-widest text-ink-2 mt-0.5" data-testid={`insight-pct-${ex.key}`}>
                {t("pct.line", { top: pct.top_pct, n: pct.n })}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="font-anton text-2xl" style={{ color: ex.color }}>
            {formatNumber(avgPerWeek, locale, isDistance ? 1 : 0)}{ex.unit ? <span className="text-xs text-ink-3 ml-1">{ex.unit}/{t("common.weekShort")}</span> : <span className="text-xs text-ink-3 ml-1">{t("insights.avgPerWeek")}</span>}
          </p>
        </div>
      </div>

      {/* Verlauf über alle Wochen (Plan 5) */}
      <HistoryChart history={ex.history || []} color={ex.color} unit={ex.unit} bestWeek={ex.best_week} />

      {hasDays && (<>
      {/* Power Day callout */}
      {ex.power_day !== null && ex.power_day !== undefined && (
        <div className="flex items-stretch gap-2 text-[11px]">
          <div className="flex-1 border border-[#CCFF00]/40 bg-[#CCFF00]/[0.05] px-3 py-2" data-testid={`power-day-${ex.key}`}>
            <div className="flex items-center gap-1.5 text-[#CCFF00] uppercase tracking-widest text-[10px] mb-1">
              <Trophy size={11} weight="fill" /> Power-Day
            </div>
            <p className="font-anton text-base text-white leading-none">{DAY_LABELS_FULL[ex.power_day] || "—"}</p>
            <p className="text-[10px] text-ink-2 mt-1">{t("insights.shareOfTotal", { pct: formatNumber(sharePerDay[ex.power_day] || 0, locale, 1) })}</p>
          </div>
          {(() => {
            // Loser-Days: neue Liste `weakest_days` bevorzugt, sonst Fallback auf
            // den einzelnen `weakest_day` (Backward-Compat). Power-Day immer ausschließen.
            const rawWeakest = Array.isArray(ex.weakest_days)
              ? ex.weakest_days
              : (ex.weakest_day !== null && ex.weakest_day !== undefined ? [ex.weakest_day] : []);
            const weakList = rawWeakest.filter((i) => i !== ex.power_day);
            if (weakList.length === 0) return null;
            const names = weakList.map((i) => DAY_LABELS_FULL[i]).filter(Boolean);
            // Anzeige-Text: 1 Tag -> "Montag", 2 Tage -> "Montag & Dienstag",
            // 3+ Tage -> "Mo, Di & Mi" (kurz, damit nichts überläuft)
            let displayText;
            if (names.length === 1) {
              displayText = names[0];
            } else if (names.length === 2) {
              displayText = `${names[0]} & ${names[1]}`;
            } else {
              const shortNames = weakList.map((i) => DAY_LABELS[i]);
              displayText = `${shortNames.slice(0, -1).join(", ")} & ${shortNames[shortNames.length - 1]}`;
            }
            // Anteil: bei mehreren gleichen 0-Tagen ist der Anteil 0%
            const firstIdx = weakList[0];
            const share = formatNumber(sharePerDay[firstIdx] || 0, locale, 1);
            return (
              <div className="flex-1 border border-[#444] px-3 py-2" data-testid={`weak-day-${ex.key}`}>
                <div className="flex items-center gap-1.5 text-ink-2 uppercase tracking-widest text-[10px] mb-1">
                  Loser-Day{weakList.length > 1 ? "s" : ""}
                </div>
                <p className="font-anton text-base text-white leading-none break-words">{displayText}</p>
                <p className="text-[10px] text-ink-3 mt-1">
                  {weakList.length > 1 ? t("insights.daysShare", { n: weakList.length, pct: share }) : t("insights.share", { pct: share })}
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* Bar chart Mo-So – Layout in zwei Reihen:
          1) Bar-Area mit FIXER Höhe (h-44). Balken sind direkte Flex-Kinder,
             damit height: pct% sauber gegen die Parent-Höhe rechnet.
          2) Label-Reihe (Mo–So) darunter – jede Spalte mit flex-1, exakt unter
             dem zugehörigen Balken. */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-ink-3 mb-3">{t("insights.distribution")}</p>

        {/* Reihe 1: Balken */}
        <div className="flex items-end justify-between gap-1.5 h-44" data-testid={`distribution-${ex.key}`}>
          {DAY_LABELS.map((day, i) => {
            const v = byWeekday[i] || 0;
            const hasData = v > 0;
            const rawPct = maxVal > 0 ? (v / maxVal) * 100 : 0;
            const pct = hasData ? Math.max(MIN_FIT_PCT, rawPct) : 3;
            const isPower = i === ex.power_day;
            const label = hasData ? formatNumber(isDistance ? v : Math.round(v), locale, 1) : "";
            return (
              <div
                key={day}
                className="flex-1 min-w-0 relative transition-all"
                style={{
                  height: `${pct}%`,
                  background: hasData ? (isPower ? ex.color : `${ex.color}AA`) : "#222",
                  boxShadow: isPower && hasData ? `0 0 12px ${ex.color}` : "none",
                }}
                title={`${day}: ${v}${ex.unit ? ` ${ex.unit}` : ""}`}
              >
                {hasData && (
                  <span
                    className="absolute left-0 right-0 bottom-1 text-center font-anton tabular-nums text-[10px] md:text-[11px] leading-none text-black px-0.5"
                    style={{ textShadow: "0 1px 0 rgba(255,255,255,0.25)" }}
                  >
                    {label}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Reihe 2: Labels Mo–So – exakt unter dem jeweiligen Balken */}
        <div className="flex justify-between gap-1.5 mt-2">
          {DAY_LABELS.map((day, i) => {
            const isPower = i === ex.power_day;
            const hasData = (byWeekday[i] || 0) > 0;
            return (
              <span
                key={day}
                className={`flex-1 min-w-0 text-center text-[10px] uppercase tracking-widest ${isPower && hasData ? "text-white" : "text-ink-3"}`}
              >
                {day}
              </span>
            );
          })}
        </div>
      </div>

      {/* Consistency – farbcodiert nach Prozent:
          ≥80% grün, ≥60% gelb, ≥40% orange, <40% rot, <20% rot mit reduzierter Opacity */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-ink-3 mb-2">{t("insights.consistency")}</p>
        <div className="grid grid-cols-7 gap-1.5">
          {consistency.map((c, i) => {
            const color =
              c >= 80 ? "#00FF66" :
              c >= 60 ? "#FFD93D" :
              c >= 40 ? "#FF8C00" :
              "#FF3B30";
            const opacity = c >= 20 ? 1 : c > 0 ? 0.5 : 0.25;
            return (
              <div key={i} className="text-center">
                <div
                  className="h-2 mb-1"
                  style={{ background: color, opacity }}
                />
                <p className="text-[10px] text-ink-3 uppercase tracking-widest leading-none">{DAY_LABELS[i]}</p>
                <p className="text-[10px] text-white font-anton mt-0.5">{formatNumber(c, locale, 0)}%</p>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-ink-3 mt-2">{t("insights.consistencyHint")}</p>
      </div>
      </>)}
    </div>
  );
}