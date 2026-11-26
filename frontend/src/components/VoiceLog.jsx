// Fortschritt per Sprache eintragen (Dean 2026-11-26): Mikro-Knopf im Eintrage-Formular.
// Sprechen („heute 10 km gelaufen und 50 Liegestütze … das war's“) -> erkannte Einträge zum
// Prüfen (einzeln entfernbar) -> „Eintragen“ addiert sie und speichert wie gewohnt.
// Aufnahme endet bei einem Ende-Wort, nach 2,5 s Stille (wenn schon etwas erkannt ist) oder per Knopf;
// danach wird direkt eingetragen (Einstellung „Erst bestätigen“: vorher prüfen).
import { useCallback, useEffect, useRef, useState } from "react";
import { Microphone, X, Check } from "@phosphor-icons/react";
import { useI18n } from "../i18n";
import { parseVoiceLog, isDone } from "../lib/voiceLog";
import { matchVoiceCommand } from "../lib/stopwatch";
import { useMicEnabled } from "../lib/mic";
import { useVoiceChannel, useSilenceTimeout, cleanSpeech, mentionsStopwatch, kickVoice } from "../lib/voiceHub";
import { exerciseLabel } from "../lib/exercises";
import { formatAmount } from "../lib/amount";
import ExerciseIcon from "./ExerciseIcon";

const SpeechRec = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const SILENCE_MS = 2500;
const PANEL_TIMEOUT_MS = 30000; // Eintragen per Sprache: nach 30 s Stille aus (Dean 2026-11-26)

export function VoiceLogButton({ active, onClick }) {
  const { t, lang } = useI18n();
  const allowed = useMicEnabled();
  if (!allowed) return null;
  return (
    <button
      type="button"
      onClick={(e) => { if (!active) kickVoice(lang); onClick(e); }}
      aria-pressed={active}
      title={t("voice.button")}
      aria-label={t("voice.button")}
      data-testid="voice-log-button"
      className={`w-7 h-7 flex items-center justify-center transition-colors focus:outline-none ${active ? "text-black bg-[#FF3B30]" : "text-[#CCFF00] [@media(hover:hover)]:hover:bg-[#CCFF00]/15 active:bg-[#CCFF00]/15"}`}
    >
      <Microphone size={18} weight={active ? "fill" : "bold"} className={active ? "animate-pulse" : ""} />
    </button>
  );
}

// autoApply: „fertig“ bzw. Stille trägt direkt ein (Standard); sonst erst Prüfen-Ansicht („Erst bestätigen“).
// initialItems: schon erkannte Einträge (vom Dashboard-Mikro) -> gleich in der Prüfen-Ansicht.
// Hört bis 30 s Stille zu, dann onTimeout (bzw. onClose).
export function VoiceLogPanel({ exercises, todayIdx, dayNames, onApply, onClose, onTimeout, autoApply = false, initialItems = null }) {
  const { t, lang, locale } = useI18n();
  const [phase, setPhase] = useState(initialItems ? "review" : "listening"); // listening | review | error
  const [heard, setHeard] = useState("");
  const [items, setItems] = useState(initialItems || []);
  const [unknown, setUnknown] = useState([]);
  const [error, setError] = useState("");
  const finalRef = useRef("");
  const silenceRef = useRef(0);
  const stoppedRef = useRef(!!initialItems);

  const evaluate = useCallback((text) => parseVoiceLog(text, exercises, todayIdx), [exercises, todayIdx]);
  // Erkennung läuft unabhängig von Board-Aktualisierungen (neue exercises-Liste) weiter
  const evalRef = useRef(evaluate);
  evalRef.current = evaluate;
  const applyRef = useRef(onApply);
  applyRef.current = onApply;

  const finish = useCallback((text) => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    window.clearTimeout(silenceRef.current);
    const r = evalRef.current(text ?? finalRef.current);
    setItems(r.items);
    setUnknown(r.unknown);
    if (autoApply && r.items.length) { applyRef.current(r.items); return; }
    setPhase("review");
  }, [autoApply]);
  useEffect(() => () => window.clearTimeout(silenceRef.current), []);

  const listening = phase === "listening" && !!SpeechRec;
  const bump = useSilenceTimeout(listening, PANEL_TIMEOUT_MS, () => (onTimeout || onClose)?.());
  useEffect(() => { if (!SpeechRec) { setError("unsupported"); setPhase("error"); } }, []);
  useVoiceChannel(listening, lang, (texts, isFinal) => {
    if (stoppedRef.current) return;
    bump();
    const tr = cleanSpeech(texts[0]);
    // Stoppuhr-Befehle regelt das Dashboard-Mikro bzw. die Stoppuhr selbst
    if (!tr || mentionsStopwatch(tr) || (matchVoiceCommand(tr) && !/\d/.test(tr) && !isDone(tr))) return;
    if (isFinal) finalRef.current += ` ${tr}`;
    const all = `${finalRef.current} ${isFinal ? "" : tr}`.trim();
    setHeard(all);
    const r = evalRef.current(all);
    setItems(r.items);
    if (r.done) { finish(all); return; }
    // Stille abwarten: nur wenn schon etwas Brauchbares erkannt wurde
    window.clearTimeout(silenceRef.current);
    if (r.items.length) silenceRef.current = window.setTimeout(() => finish(all), SILENCE_MS);
  }, (code) => {
    // Safari beendet manchmal still: dann einfach auswerten, was schon gehört wurde
    if (code === "stopped") { finish(); return; }
    stoppedRef.current = true;
    setError(code);
    setPhase("error");
  });

  const byKey = Object.fromEntries(exercises.map((e) => [e.key, e]));
  const chip = (it, idx, removable) => {
    const ex = byKey[it.key];
    if (!ex) return null;
    return (
      <span key={`${it.key}-${it.day}-${idx}`} className="inline-flex items-center gap-1.5 border border-[#333] bg-[#0A0A0A] pl-2 pr-1 py-1 text-xs" data-testid="voice-item">
        <span className="w-2 h-2 shrink-0" style={{ background: ex.color || "#CCFF00" }} />
        <span className="text-white">{exerciseLabel(ex)}</span>
        <span className="text-[#CCFF00] font-bold">{ex.type === "activity" ? "✓" : `${it.mode === "add" ? "+" : "="}${formatAmount(it.amount, ex.unit, locale)}`}</span>
        {(it.day !== todayIdx || it.mode === "day") && <span className="text-ink-3">· {dayNames[it.day]}</span>}
        {removable && (
          <button type="button" onClick={() => setItems((l) => l.filter((_, i) => i !== idx))} className="ml-0.5 p-0.5 text-ink-3 hover:text-white" aria-label={t("common.remove")} data-testid="voice-item-remove">
            <X size={12} weight="bold" />
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="border border-[#333] bg-[#0E0E0E] p-3 space-y-2" data-testid="voice-panel">
      {phase === "listening" && (
        <>
          <div className="flex items-center gap-2">
            <span className="relative flex w-2.5 h-2.5"><span className="absolute inline-flex w-full h-full rounded-full bg-[#FF3B30] opacity-75 animate-ping" /><span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-[#FF3B30]" /></span>
            <p className="text-[10px] uppercase tracking-widest text-ink-2 flex-1">{t("voice.listening")}</p>
            <button type="button" onClick={() => finish()} className="text-[10px] uppercase tracking-widest text-[#CCFF00] hover:text-white" data-testid="voice-stop">{t("voice.stop")}</button>
            <button type="button" onClick={onClose} className="p-1 text-ink-3 hover:text-white" aria-label={t("common.cancel")} data-testid="voice-cancel"><X size={14} weight="bold" /></button>
          </div>
          <p className="text-xs text-ink-3 leading-relaxed">{heard ? <span className="text-ink-2">„{heard}“</span> : t("voice.example")}</p>
          {items.length > 0 && <div className="flex flex-wrap gap-1.5">{items.map((it, i) => chip(it, i, false))}</div>}
        </>
      )}
      {phase === "review" && (
        <>
          {heard && <p className="text-xs text-ink-3 leading-relaxed">„{heard}“</p>}
          {items.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">{items.map((it, i) => chip(it, i, true))}</div>
          ) : (
            <p className="text-xs text-ink-2" data-testid="voice-nothing">{t("voice.nothing")}</p>
          )}
          {unknown.length > 0 && <p className="text-[10px] text-ink-3">{t("voice.unknown", { text: unknown.join(", ") })}</p>}
          <div className="flex items-center gap-2 pt-1">
            {items.length > 0 && (
              <button type="button" onClick={() => onApply(items)} className="bg-[#CCFF00] text-black font-bold uppercase tracking-widest text-[11px] px-3 py-2 flex items-center gap-1.5 hover:bg-[#D4FF33]" data-testid="voice-apply">
                <Check size={14} weight="bold" /> {t("voice.apply")}
              </button>
            )}
            <button type="button" onClick={onClose} className="border border-[#333] text-ink-2 hover:text-white uppercase tracking-widest text-[11px] px-3 py-2" data-testid="voice-discard">{t("voice.discard")}</button>
          </div>
        </>
      )}
      {phase === "error" && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-[#FF3B30] flex-1">{t(`sw.err.${error === "unsupported" ? "generic" : error}`)}</p>
          <button type="button" onClick={onClose} className="p-1 text-ink-3 hover:text-white" aria-label={t("common.cancel")}><X size={14} weight="bold" /></button>
        </div>
      )}
    </div>
  );
}

// Rückmeldung nach dem Speichern per Sprache (Dean 2026-11-26): unter „Fortschritt gespeichert“ steht je
// Eintrag, was passiert ist – auch wenn sich nichts geändert hat („heute schon 10 drin“).
// rows: [{key, day, kind: add|day|set|same|done|doneSame, amount, from}]
export function VoiceSaved({ rows, exercises, todayIdx, dayNames, t, locale }) {
  const byKey = Object.fromEntries(exercises.map((e) => [e.key, e]));
  const dayLabel = (d) => (d === todayIdx ? t("voice.fbToday") : d === todayIdx - 1 ? t("voice.fbYesterday") : dayNames[d]);
  return (
    <ul className="mt-1 space-y-1" data-testid="voice-saved">
      {rows.map((r, i) => {
        const ex = byKey[r.key];
        if (!ex) return null;
        const name = exerciseLabel(ex);
        const v = formatAmount(r.amount, ex.unit, locale);
        const vars = { day: dayLabel(r.day), name, v, from: formatAmount(r.from || 0, ex.unit, locale) };
        const same = r.kind === "same" || r.kind === "doneSame";
        return (
          <li key={i} className={`flex items-center gap-1.5 text-xs ${same ? "opacity-60" : ""}`} data-testid={`voice-saved-${r.kind}`}>
            <span style={{ color: ex.color || "#CCFF00" }} className="shrink-0 flex"><ExerciseIcon icon={ex.icon} size={14} /></span>
            <span>{t(`voice.fb.${r.kind}`, vars)}</span>
          </li>
        );
      })}
    </ul>
  );
}
