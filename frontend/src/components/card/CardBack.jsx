// Teil der Nutzerkarte, ausgelagert aus UserCard.jsx (BACKLOG W1, 2026-11-25).
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Flag } from "@phosphor-icons/react";
import ExerciseIcon from "../ExerciseIcon";
import { useI18n, formatNumber } from "../../i18n";
import { exerciseLabel } from "../../lib/exercises";
import { distanceKm, moonPercent } from "../../lib/milestones";
import { milestoneTexts } from "../MilestoneToast";
import { RANK_COLORS, RANK_LETTER_ORDER, consumeRankUp, detectRankExercise, getRankForExercise, getRankThresholds } from "../../lib/ranks";
import { formatAmount, amountParts } from "../../lib/amount";
import { RadarChart } from "./RadarChart";
import { PyramidIcon, PyramidPopup, RankBadge } from "./Rank";
import { RankUpToast } from "./RankUpToast";

// Abgeschlossene Übungen (Historie bleibt, auch für Freunde sichtbar).
export function ArchiveList({ archived, allTime }) {
  const { t, locale } = useI18n();
  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1" data-testid="card-back-archive">
      {archived.map((a) => {
        const rate = a.weeks_total ? Math.round((a.weeks_done / a.weeks_total) * 100) : 0;
        return (
          <div key={a.key} className="border border-[#1A1A1A] bg-[#0E0E0E] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 min-w-0">
                <ExerciseIcon icon={a.icon} size={14} className="shrink-0" />
                <span className="font-anton text-base uppercase tracking-wider truncate" style={{ color: a.color }}>{exerciseLabel(a)}</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-ink-3 shrink-0">
                W{a.added_week}–W{Math.max(a.added_week, a.completed_week - 1)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-center">
              <div>
                <p className="font-anton text-lg text-white leading-none">{amountParts(allTime[a.key], a.unit, locale).num}<span className="text-[10px] text-ink-3"> {amountParts(allTime[a.key], a.unit, locale).unit}</span></p>
                <p className="text-[10px] uppercase tracking-widest text-ink-3 mt-1">{t("archive.total")}</p>
              </div>
              <div>
                <p className="font-anton text-lg text-white leading-none">{amountParts(a.last_goal, a.unit, locale).num}<span className="text-[10px] text-ink-3"> {amountParts(a.last_goal, a.unit, locale).unit}</span></p>
                <p className="text-[10px] uppercase tracking-widest text-ink-3 mt-1">{t("archive.lastGoal")}</p>
              </div>
              <div>
                <p className="font-anton text-lg leading-none" style={{ color: rate >= 70 ? "#00FF66" : "#CCFF00" }}>{a.weeks_done}/{a.weeks_total}</p>
                <p className="text-[10px] uppercase tracking-widest text-ink-3 mt-1">{t("archive.weeksDone")}</p>
              </div>
            </div>
            {a.history?.length > 0 && (
              <div className="flex gap-[3px] mt-2" aria-label="Verlauf">
                {a.history.slice(-16).map((h) => (
                  <span
                    key={h.week}
                    title={`${t("common.week")} ${h.week}: ${formatAmount(h.value, a.unit, locale)} / ${formatAmount(h.goal, a.unit, locale)}`}
                    className="h-1.5 flex-1"
                    style={{ background: h.status === "completed" ? a.color : "#2A2A2A" }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Erreichte Meilensteine (neueste zuerst) und der Weg zum Mond.
export function MilestoneList({ entry, isMe }) {
  const { t, locale } = useI18n();
  const items = [...(entry?.milestones || [])].reverse();
  const km = distanceKm(entry);
  const pct = moonPercent(km);
  const pctText = formatNumber(pct >= 10 ? Math.round(pct) : pct >= 0.1 ? Math.round(pct * 10) / 10 : Math.round(pct * 100) / 100, locale);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1" data-testid="card-back-milestones">
      {km > 0 && (
        <div className="border border-[#1A1A1A] bg-[#0E0E0E] p-3">
          <p className="text-[10px] uppercase tracking-widest text-ink-2">{t("ms.moon", { pct: pctText })}</p>
          <div className="h-1.5 mt-2 bg-[#1F1F1F]">
            <div className="h-full bg-[#CCFF00]" style={{ width: `${Math.max(1, Math.min(100, pct))}%` }} />
          </div>
        </div>
      )}
      {items.length === 0 && <p className="text-xs text-ink-3 text-center py-4">{t("ms.none")}</p>}
      {items.map((m) => {
        const info = milestoneTexts(t, locale, m.id, entry);
        if (!info) return null;
        const date = m.at ? new Date(m.at).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" }) : "";
        return (
          <div key={m.id} className="flex items-center gap-3 border border-[#1A1A1A] bg-[#0E0E0E] px-3 py-2">
            <span className="shrink-0 text-[#CCFF00]">
              {info.icon ? <ExerciseIcon icon={info.icon} size={16} className="flex" /> : <Flag size={16} weight="bold" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-anton text-sm uppercase tracking-wider text-white truncate">{info.title}</span>
              <span className="block text-[11px] text-ink-2 leading-snug">{isMe && !info.weight ? info.text : info.total ? t("ms.total", { value: info.total }) : info.text}</span>
            </span>
            {date && <span className="shrink-0 text-[10px] uppercase tracking-widest text-ink-3">{date}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function CardBack({ exercises, values, weekNumber, userId, bestGoals = {}, bestWeeklies = {}, archived = [], allTime = {}, entry = null, isMe = false }) {
  const { t, locale } = useI18n();
  // Reihenfolge der Radar-Achsen = Reihenfolge der Übungen aus den Einstellungen.
  const orderedExercises = exercises;

  const [selectedIdx, setSelectedIdx] = useState(0);
  // Radar-Modus: "week" = Wochenfortschritt, "rank" = Rang je Übung als Ring.
  const [radarMode, setRadarMode] = useState("week");

  // Pyramiden-Popup mit allen Rang-Grenzwerten der ausgewählten Übung.
  const [showPyramid, setShowPyramid] = useState(false);
  const pyramidWrapRef = useRef(null);

  // Rang-Up-Toasts (verschwinden nach ~4 s, siehe RankUpToast).
  const [rankToasts, setRankToasts] = useState([]);

  // Rang je Übung, ausschließlich aus den Serverwerten. Kein Browser-Speicher,
  // daher auf jedem Gerät und für jeden Betrachter gleich.
  const rankByKey = useMemo(() => {
    const out = {};
    for (const ex of orderedExercises) {
      const kind = detectRankExercise(ex);
      if (!kind) continue;
      const thresholds = getRankThresholds(kind, ex?.unit, ex?.variant);
      if (!thresholds || thresholds.length === 0) continue;
      const bestGoal = Number(bestGoals?.[ex.key]) || 0;
      let curIdx = 0;
      for (let i = 0; i < thresholds.length; i++) {
        if (bestGoal >= thresholds[i].min) curIdx = i;
      }
      const cur = thresholds[curIdx];
      const next = thresholds[curIdx + 1] || null;
      let subProgress = 0;
      if (next && next.min > cur.min) {
        subProgress = Math.max(0, Math.min(0.999, (bestGoal - cur.min) / (next.min - cur.min)));
      }
      const rankIndex = RANK_LETTER_ORDER.indexOf(cur.letter);
      out[ex.key] = {
        rankIndex: rankIndex >= 0 ? rankIndex : 0,
        subProgress,
        letter: cur.letter,
        color: (RANK_COLORS[cur.letter] || RANK_COLORS.F).color,
      };
    }
    return out;
  }, [orderedExercises, bestGoals]);

  // Rang-Up erkennen (gegenüber dem zuletzt auf diesem Gerät gesehenen Rang).
  useEffect(() => {
    const ups = [];
    for (const ex of orderedExercises) {
      const r = rankByKey[ex.key];
      if (!r) continue;
      if (consumeRankUp(userId, ex.key, r.letter)) {
        ups.push({
          id: `${userId || "anon"}-${ex.key}-${r.letter}-${Date.now()}`,
          exerciseName: exerciseLabel(ex),
          letter: r.letter,
          isMe,
          userName: entry?.name || "",
        });
      }
    }
    if (ups.length) setRankToasts((prev) => [...prev, ...ups]);
  }, [rankByKey, orderedExercises, userId, isMe, entry?.name]);

  const removeRankToast = (id) => {
    setRankToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const selected = orderedExercises[selectedIdx] || orderedExercises[0];
  if (!selected) return null;

  const currentVal = Number(values?.[selected.key]) || 0;
  const pct = selected.goal > 0 ? Math.round((currentVal / selected.goal) * 100) : 0;
  const done = pct >= 100;
  const rank = getRankForExercise(
    selected,
    Number(bestGoals?.[selected.key]) || 0,
    Number(bestWeeklies?.[selected.key]) || 0,
  );
  const radarValues = values || {};

  return (
    <div className="relative flex flex-col h-full gap-3" data-testid="card-back-inner">
      {/* 🏆 Rank-Up-Toasts (zentriert oben, schwebt über STATUS-Header) */}
      <div
        className="pointer-events-none absolute top-1 left-0 right-0 flex flex-col items-center gap-2 z-30 px-2"
        data-testid="rank-up-toast-container"
      >
        <AnimatePresence>
          {rankToasts.map((t) => (
            <RankUpToast
              key={t.id}
              exerciseName={t.exerciseName}
              letter={t.letter}
              isMe={t.isMe}
              userName={t.userName}
              onDismiss={() => removeRankToast(t.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* STATUS Header */}
      <div className="text-center border-b border-[#CCFF00]/30 pb-2">
        <p className="font-anton text-xl md:text-2xl tracking-[0.4em] text-[#CCFF00] leading-none">
          STATUS
        </p>
      </div>

      {/* Ausgewählte Übung GROSS oben + Rank-Badge rechts daneben */}
      <div className="text-center relative" data-testid="card-back-selected">
        <div className="flex items-center justify-center gap-2 mb-1">
          <ExerciseIcon icon={selected.icon} size={18} />
        </div>

        {/* 🔺 Pyramiden-Trigger oben-rechts der Card-Rückseite, auf gleicher
            Höhe wie das Übungs-Symbol (sogar leicht darüber). Stil identisch
            zum Info-Button auf der Vorderseite. Öffnet das Pyramid-Popup
            mit allen Schwellwerten der gerade ausgewählten Übung. */}
        {rank && (
          <>
            <div
              ref={pyramidWrapRef}
              className="absolute -top-1 right-0 z-20"
              data-testid={`card-back-pyramid-wrap-${rank.kind}`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPyramid((v) => !v);
                }}
                data-testid={`card-back-pyramid-button-${rank.kind}`}
                aria-label={t("rank.showThresholds")}
                title={t("rank.showThresholds")}
                aria-expanded={showPyramid}
                className={`group relative w-5 h-5 border bg-transparent flex items-center justify-center transition-all after:content-[''] after:absolute after:-inset-2.5 ${
                  showPyramid
                    ? "border-[#555] bg-[#1A1A1A]"
                    : "border-[#333] hover:border-[#555] hover:bg-[#0A0A0A]"
                }`}
                style={{ cursor: "pointer" }}
              >
                <PyramidIcon color={showPyramid ? "#CCCCCC" : "#888888"} active={false} size={17} />
              </button>
            </div>

            {/* 🔻 Popup liegt ALS GESCHWISTER des Buttons direkt im
                card-back-selected-Container. So füllt es die volle Innen-
                breite der Karte (links und rechts bündig innerhalb des
                Card-Padding/Rand), ohne den Karten-Rahmen zu verdecken. */}
            <AnimatePresence>
              {showPyramid && (() => {
                const kind = detectRankExercise(selected);
                const thresholds = kind ? getRankThresholds(kind, selected?.unit, selected?.variant) : null;
                if (!thresholds) return null;
                return (
                  <PyramidPopup
                    rank={rank}
                    thresholds={thresholds}
                    unit={selected?.unit || ""}
                    accentColor={selected?.color || "#CCFF00"}
                    onClose={() => setShowPyramid(false)}
                    anchorRef={pyramidWrapRef}
                  />
                );
              })()}
            </AnimatePresence>
          </>
        )}

        {/* Zwei-Spalten-Layout: Übung links | Rank-Badge rechts.
            Ohne Rank (z. B. eigene Übung) fällt der Block einfach auf
            die alte zentrierte Anzeige zurück. */}
        <div className={`flex ${rank ? "items-center justify-center gap-3 md:gap-4" : "flex-col items-center"}`}>
          <div className={rank ? "text-left flex-1 min-w-0" : "text-center"}>
            <h3
              className="font-anton text-2xl md:text-3xl uppercase tracking-[0.12em] leading-none truncate"
              style={{ color: selected.color }}
              data-testid="card-back-selected-name"
            >
              {exerciseLabel(selected)}
            </h3>
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-3 mt-2">
              {t("card.goalWeek")}{" "}{String(weekNumber).padStart(2, "0")}
            </p>
            <p className="font-anton text-xl text-white mt-1 leading-none">
              {formatAmount(currentVal, selected.unit, locale)}
              <span className="text-ink-3 text-sm ml-1">
                / {formatAmount(selected.goal, selected.unit, locale)}
              </span>
            </p>
            <p
              className={`text-[10px] tracking-[0.3em] mt-1 font-bold ${
                done ? "text-[#00FF66]" : "text-[#CCFF00]"
              }`}
            >
              {pct}%{done && " ✓"}
            </p>
          </div>

          {rank && (
            <div className="shrink-0 flex flex-col items-center" data-testid={`card-back-rank-${rank.kind}`}>
              <RankBadge rank={rank} size={88} />
              <p
                className="font-anton text-[10px] tracking-[0.35em] mt-1"
                style={{ color: rank.color }}
              >
                RANK
              </p>
              {/* "BEST · ..." erst ab S+ einblenden – darunter gibt es noch
                  ein nächstes Ziel, daher ist NEXT dort die relevantere Info.
                  Ab S+ existiert kein NEXT mehr → wir zeigen die persönliche
                  Bestleistung (höchster je erreichter Wochenwert). */}
              {rank.letter === "S+" && (
                <p className="text-[10px] uppercase tracking-[0.25em] text-ink-2 mt-0.5">
                  BEST · {formatAmount(rank.bestWeekly, selected.unit, locale)}
                </p>
              )}
              {rank.letter !== "S+" && rank.nextLetter && rank.nextMin != null && (
                <p className="text-[10px] uppercase tracking-[0.25em] text-ink-3 mt-0.5">
                  {t("card.next")} {rank.nextLetter} · {formatAmount(rank.nextMin, selected.unit, locale)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Trenn-Linie unter „Ausgewählte Übung + RANK"-Block, identisch
          gestaltet wie unter „STATUS" – grenzt den Übungs-/Rang-Header
          sauber vom Radar darunter ab. */}
      <div className="border-b border-[#CCFF00]/30" />

      {/* 🎛️ Reiter über dem Radar: WEEK | RANK. WEEK zeigt den Wochen-
          fortschritt wie gehabt, RANK stellt jede Übung als Position
          zwischen Rang-Ringen dar (F innen, ein Rang über höchstem außen). */}
      <div className="flex items-center justify-center gap-2" data-testid="card-back-radar-tabs">
        {[
          { key: "week", label: t("card.weekTab") },
          { key: "rank", label: "RANK" },
          ...(archived.length ? [{ key: "archive", label: t("card.archiveTab") }] : []),
          ...((entry?.milestones?.length || distanceKm(entry) > 0)
            ? [{ key: "milestones", label: <Flag size={12} weight="bold" className="block" />, aria: t("card.milestonesTab") }]
            : []),
        ].map((tab) => {
          const active = radarMode === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRadarMode(tab.key);
              }}
              data-testid={`card-back-radar-tab-${tab.key}`}
              aria-label={tab.aria}
              title={tab.aria}
              className="font-anton h-[25px] inline-flex items-center justify-center px-3 text-[10px] tracking-[0.35em] transition-colors duration-150"
              style={{
                color: active ? "#0A0A0A" : "#888",
                background: active ? "#CCFF00" : "transparent",
                border: `1px solid ${active ? "#CCFF00" : "#222"}`,
                boxShadow: active ? "0 0 10px rgba(204,255,0,0.35)" : "none",
                letterSpacing: "0.35em",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {radarMode === "archive" ? (
        <ArchiveList archived={archived} allTime={allTime} />
      ) : radarMode === "milestones" ? (
        <MilestoneList entry={entry} isMe={isMe} />
      ) : (
      <div className="relative flex-1 flex items-center justify-center min-h-0">
        <RadarChart
          exercises={orderedExercises}
          values={radarValues}
          selectedIdx={selectedIdx}
          onSelect={setSelectedIdx}
          size={250}
          mode={radarMode}
          rankByKey={rankByKey}
        />
      </div>
      )}
    </div>
  );
}

