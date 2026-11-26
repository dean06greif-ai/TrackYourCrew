import { useI18n } from "../i18n";
import { PAUSE_LOSS_TABLE } from "../lib/pause";

// Kleine Tabelle „Pause → Ziel danach“ (Dean, 2026-11-25). `weeks` hebt die aktuelle Spalte hervor.
export default function PauseLossInfo({ weeks = 0, compact = false }) {
  const { t } = useI18n();
  const label = (r) => (r.to == null ? t("pause.fromWeeks", { n: r.from }) : r.from === r.to ? t(r.from === 1 ? "pause.week" : "pause.weeks", { n: r.from }) : t("pause.range", { a: r.from, b: r.to }));
  return (
    <div className={compact ? "" : "mt-3"} data-testid="pause-loss-info">
      {!compact && <p className="text-xs text-ink-2 leading-relaxed mb-2">{t("pause.text")}</p>}
      <div className="grid grid-cols-5 border border-[#222] text-center">
        {PAUSE_LOSS_TABLE.map((r, i) => {
          const active = weeks > 0 && weeks >= r.from && (r.to == null || weeks <= r.to);
          return (
            <div key={i} className={`py-1.5 px-1 ${i ? "border-l border-[#222]" : ""} ${active ? "bg-[#CCFF00]/10" : ""}`}>
              <p className={`text-[9px] uppercase tracking-wider leading-tight ${active ? "text-[#CCFF00]" : "text-ink-3"}`}>{label(r)}</p>
              <p className={`font-anton text-base leading-tight mt-0.5 ${active ? "text-[#CCFF00]" : r.pct === 100 ? "text-white" : "text-ink-2"}`}>{r.pct} %</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
