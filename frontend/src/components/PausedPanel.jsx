import { Pause } from "@phosphor-icons/react";
import { useI18n } from "../i18n";

// Alle Übungen pausiert (ersetzt Urlaub/Krank, Dean 2026-11-25): ruhige Anzeige statt Werten,
// ohne Prozent oder Balken – soll niemanden demotivieren.
export default function PausedPanel({ isMe }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 gap-3" data-testid="paused-panel">
      <span className="w-16 h-16 flex items-center justify-center border border-[#333] bg-[#0E0E0E]">
        <Pause size={30} weight="fill" className="text-ink-2" />
      </span>
      <p className="font-anton text-2xl uppercase tracking-tight text-white">{t("pauseAll.title")}</p>
      <p className="text-xs text-ink-3 max-w-[16rem] leading-relaxed">{t(isMe ? "pauseAll.meText" : "pauseAll.friendText")}</p>
    </div>
  );
}
