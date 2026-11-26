// Dashboard-Mikro neben „Fortschritt eintragen“ (Dean 2026-11-26).
// An = auch Eintragen- und Stoppuhr-Mikro gelten als an (eine gemeinsame Erkennung, lib/voiceHub).
// Formular zu: „heute 10 km gelaufen … fertig“ trägt direkt ein (oder öffnet die Prüfen-Ansicht bei
// „Erst bestätigen“). Immer: „starte die Stoppuhr (für Plank)“ – fehlt bei mehreren Stoppuhr-Übungen
// der Name, fragt die Gerätestimme „Für welche Übung?“. Geht nach 10 s Stille aus.
import { useEffect, useRef } from "react";
import { Microphone, MicrophoneSlash } from "@phosphor-icons/react";
import { useI18n } from "../i18n";
import { useMicEnabled } from "../lib/mic";
import { speechLang, isTimeUnit } from "../lib/stopwatch";
import { parseVoiceLog, findSpokenExercise } from "../lib/voiceLog";
import { isActivity } from "../lib/activities";
import {
  useVoiceChannel, useSilenceTimeout, useGlobalVoice, setGlobalVoice, cleanSpeech, routeStopwatch, SW_EVENT,
} from "../lib/voiceHub";

const GLOBAL_TIMEOUT_MS = 10000;
const QUIET_MS = 900;
const SILENCE_MS = 2500;
const ASK_MS = 8000;

export function GlobalMicButton({ className = "" }) {
  const { t } = useI18n();
  const allowed = useMicEnabled();
  const on = useGlobalVoice();
  if (!allowed) return null;
  return (
    <button
      type="button"
      onClick={(e) => { setGlobalVoice(!on); e.currentTarget.blur(); }}
      aria-pressed={on}
      title={on ? t("voice.globalOff") : t("voice.globalOn")}
      aria-label={on ? t("voice.globalOff") : t("voice.globalOn")}
      data-testid="global-mic"
      className={`shrink-0 w-12 md:w-14 flex items-center justify-center border transition-colors focus:outline-none ${on ? "border-[#FF3B30] text-[#FF3B30] bg-[#FF3B30]/10" : "border-[#333] text-ink-2 [@media(hover:hover)]:hover:text-[#CCFF00] [@media(hover:hover)]:hover:border-[#CCFF00]/60"} ${className}`}
    >
      {on ? <Microphone size={20} weight="fill" className="animate-pulse" /> : <MicrophoneSlash size={20} weight="bold" />}
    </button>
  );
}

function sayDevice(text, lang) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang(lang);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* ohne Stimme: Hinweis steht trotzdem im Toast */ }
}

/**
 * exercises: eigene Übungen; formOpen: Eintrage-Formular offen (dann trägt das Formular-Mikro ein);
 * panelOpen: Formular-Mikro läuft (dann zählt dessen 30-s-Grenze statt der 10 s);
 * openForm(): Formular öffnen (für die Stoppuhr); onItems(items): erkannte Einträge (Formular zu);
 * onHeard(text): Anzeige; onAsk(text): Rückfrage anzeigen.
 */
export function useGlobalVoiceRouter({ exercises, todayIdx, formOpen, panelOpen, openForm, onItems, onHeard, onAsk }) {
  const { t, lang } = useI18n();
  const on = useGlobalVoice();
  const allowed = useMicEnabled();
  useEffect(() => { if (!allowed && on) setGlobalVoice(false); }, [allowed, on]);
  const st = useRef({ buf: "", quiet: 0, silence: 0, ask: null, askTimer: 0, last: "" });
  const props = useRef({});
  props.current = { exercises, todayIdx, formOpen, openForm, onItems, onHeard, onAsk };
  const off = () => setGlobalVoice(false);
  const bump = useSilenceTimeout(on && !panelOpen, GLOBAL_TIMEOUT_MS, off);
  useEffect(() => {
    if (on) return undefined;
    const v = st.current;
    v.buf = ""; v.ask = null;
    window.clearTimeout(v.quiet); window.clearTimeout(v.silence); window.clearTimeout(v.askTimer);
    return undefined;
  }, [on]);

  const swList = () => (props.current.exercises || []).filter((e) => !isActivity(e) && isTimeUnit(e.unit) && !e.paused);
  const fire = (cmd, key) => {
    const p = props.current;
    const send = () => window.dispatchEvent(new CustomEvent(SW_EVENT, { detail: key ? { cmd, key } : { cmd, active: true } }));
    if (key && !p.formOpen) { p.openForm?.(); window.setTimeout(send, 450); } else send();
  };

  // ganzen Satz auswerten (Endergebnis oder Sprechpause)
  const decide = (raw, isFinal) => {
    const v = st.current;
    const text = cleanSpeech(raw);
    if (!text || (text === v.last && !isFinal)) return;
    if (text === v.last && routeStopwatch(text, swList(), findSpokenExercise)) return; // nach Pause schon erledigt
    v.last = text;
    window.setTimeout(() => { if (v.last === text) v.last = ""; }, 1500);
    const list = swList();
    if (v.ask) {
      const ex = findSpokenExercise(text, list);
      if (ex) {
        const cmd = v.ask;
        v.ask = null;
        window.clearTimeout(v.askTimer);
        props.current.onAsk?.("");
        fire(cmd, ex.key);
        return;
      }
    }
    const route = routeStopwatch(text, list, findSpokenExercise);
    if (route) {
      v.buf = "";
      if (route.ask) {
        v.ask = route.cmd;
        const q = t("voice.whichExercise");
        props.current.onAsk?.(q);
        sayDevice(q, lang);
        window.clearTimeout(v.askTimer);
        v.askTimer = window.setTimeout(() => { v.ask = null; props.current.onAsk?.(""); }, ASK_MS);
      } else fire(route.cmd, route.key);
      return;
    }
    // Einträge nur aus Endergebnissen (sonst zählt ein Satz doppelt); bei offenem Formular trägt dessen Mikro ein
    if (!isFinal || props.current.formOpen) return;
    v.buf = `${v.buf} ${text}`.trim();
    const r = parseVoiceLog(v.buf, props.current.exercises || [], props.current.todayIdx);
    window.clearTimeout(v.silence);
    const flush = () => {
      const res = parseVoiceLog(v.buf, props.current.exercises || [], props.current.todayIdx);
      v.buf = "";
      if (res.items.length) props.current.onItems?.(res.items);
    };
    if (r.done) flush();
    else if (r.items.length) v.silence = window.setTimeout(flush, SILENCE_MS);
  };

  useVoiceChannel(on, lang, (texts, isFinal) => {
    bump();
    const v = st.current;
    const shown = cleanSpeech(texts[0]);
    if (shown) props.current.onHeard?.(shown);
    window.clearTimeout(v.quiet);
    if (isFinal) decide(texts[0], true);
    else v.quiet = window.setTimeout(() => decide(texts[0], false), QUIET_MS);
  }, () => off());
  return on;
}
