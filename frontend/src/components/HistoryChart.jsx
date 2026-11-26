import { useEffect, useRef } from "react";
import { useI18n, formatNumber } from "../i18n";

// "Deine Entwicklung" (Plan 5): Wochenwert als Balken, Ziel als Strich, Bestwoche
// markiert. Viele Wochen: waagerecht scrollbar, startet bei der aktuellen Woche.
export default function HistoryChart({ history = [], color = "#CCFF00", unit = "", bestWeek = null }) {
  const { t, locale } = useI18n();
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [history.length]);
  if (!history.length) return null;

  const max = Math.max(1, ...history.map((h) => Math.max(h.value || 0, h.goal || 0))) * 1.2; // Platz über dem höchsten Balken für den Stern
  const u = unit ? ` ${unit}` : "";
  const fmt = (v) => formatNumber(v, locale);

  return (
    <div data-testid="history-chart">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-widest text-ink-2">{t("insights.history")}</p>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-ink-3">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2" style={{ background: color }} />{t("insights.value")}</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-[2px] bg-white/70" />{t("insights.goal")}</span>
        </div>
      </div>
      <div ref={scrollRef} className="overflow-x-auto scrollbar-dark pb-1">
        <div className="flex items-end gap-1 min-w-full w-max px-[2px]" style={{ height: 132 }}>
          {history.map((h) => {
            const isBest = h.week === bestWeek;
            const valPct = Math.max(0, Math.min(100, (h.value / max) * 100));
            const goalPct = Math.max(0, Math.min(100, (h.goal / max) * 100));
            const paused = h.status === "paused";
            const fill = h.status === "completed" ? color : h.status === "current" ? `${color}99` : "#3A3A3A";
            return (
              <div
                key={h.week}
                className="relative flex flex-col items-center justify-end h-full flex-1 min-w-[16px] max-w-[28px]"
                title={`${t("common.week")} ${h.week}: ${fmt(h.value)}${u} / ${fmt(h.goal)}${u}`}
                data-testid={`history-week-${h.week}`}
              >
                <div className="relative w-full" style={{ height: 112 }}>
                  {paused ? (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2A2A2A]" />
                  ) : (
                    <>
                      <div className="absolute bottom-0 left-0 right-0" style={{ height: `${valPct}%`, background: fill, minHeight: h.value > 0 ? 2 : 0 }} />
                      {h.goal > 0 && <div className="absolute left-[-2px] right-[-2px] h-[2px] bg-white/70" style={{ bottom: `calc(${goalPct}% - 1px)` }} />}
                    </>
                  )}
                  {isBest && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 text-[11px] font-bold leading-[14px] px-[3px] text-black"
                      style={{ bottom: `calc(${Math.max(valPct, goalPct)}% + 4px)`, background: color }}
                      data-testid="history-best"
                    >
                      ★
                    </span>
                  )}
                </div>
                <span className={`mt-1 text-[10px] leading-[14px] tabular-nums ${h.status === "current" ? "text-white" : "text-ink-3"}`}>{h.week}</span>
              </div>
            );
          })}
        </div>
      </div>
      {bestWeek && (
        <p className="text-[10px] uppercase tracking-widest text-ink-3 mt-2">
          ★ {t("insights.best")}: {t("common.week")} {bestWeek} · {fmt(history.find((h) => h.week === bestWeek)?.value || 0)}{u}
        </p>
      )}
    </div>
  );
}
