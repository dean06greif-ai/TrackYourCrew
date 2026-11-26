import { useCallback, useEffect, useRef, useState } from "react";
import { Timer, Stop, Pause, X, Microphone, MicrophoneSlash, CaretLeft, CaretRight, Check, Play, SpeakerHigh, SpeakerSlash, ArrowCounterClockwise } from "@phosphor-icons/react";
import { useI18n, translate, LANGUAGES } from "../i18n";
import { useMicEnabled } from "../lib/mic";
import { duckDuring } from "../lib/audioSession";
import { useVoiceChannel, useSilenceTimeout, cleanSpeech, useGlobalVoice, setGlobalVoice, SW_EVENT, kickVoice } from "../lib/voiceHub";
import {
  formatClock, secondsToUnit, adjustSeconds, matchVoiceCommand, speechLang, coachCues, coachTargetSeconds,
} from "../lib/stopwatch";
import { clipId, cueText } from "../lib/coachClips";
import { getAudioCtx, unlockAudio, loadPackIndex, loadCoachClips, playCoachClip, stopCoachClips } from "../lib/coachAudio";

// Stoppuhr für Zeit-Übungen (Plan 13f) im Eintrag-Formular.
// - Start mit 3-2-1-Countdown (Piepton, mit Coach auch gesprochen), dann zählt die Zeit.
// - Startzeit im Browser-Speicher: Bildschirm aus oder neu geladen -> die Uhr läuft weiter.
// - Nach „Stopp“ mit ‹ › sekundengenau nachjustieren (gedrückt halten = schneller), dann eintragen.
// - Sprachsteuerung (Mikrofon-Knopf): „starte die Stoppuhr“, „stopp“, „von vorn“/„neu“, „eintragen“, „brich ab“ …
// - Sprachcoach (Lautsprecher-Knopf): sagt Zwischenzeiten, Halbzeit und kurz vor dem Ziel an
//   (Ziel = was diese Woche noch fehlt). Stimme = die beste Stimme des Geräts (Web Speech).
const PREFIX = "tyc_sw_";
const COACH_KEY = "tyc_sw_coach";
const COUNTDOWN = 3;

function readStart(id) {
  try {
    const v = Number(window.localStorage.getItem(PREFIX + id));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

// Pausiert (Dean 2026-11-26): bisher gelaufene Sekunden, eigener Schlüssel; übersteht Neuladen
function readPaused(id) {
  try {
    const raw = window.localStorage.getItem(PREFIX + id + "_p");
    const v = Number(raw);
    return raw != null && Number.isFinite(v) && v >= 0 ? v : null;
  } catch {
    return null;
  }
}
function writePaused(id, v) {
  try {
    if (v != null) window.localStorage.setItem(PREFIX + id + "_p", String(v));
    else window.localStorage.removeItem(PREFIX + id + "_p");
  } catch {
    /* egal */
  }
}

function writeStart(id, v) {
  try {
    if (v) window.localStorage.setItem(PREFIX + id, String(v));
    else window.localStorage.removeItem(PREFIX + id);
  } catch {
    /* egal */
  }
}

const SpeechRec = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
const canAudio = typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);

// Kurzer Ton (hoch = Start/Countdown, tief = Stopp)
function beep(freq, dur = 0.18) {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  } catch {
    /* egal */
  }
}

// Stimme für den Coach (Dean: Mann, energisch, aber neutral). Gerätestimmen (localService) reagieren
// sofort – Online-Stimmen („Google …“, „… Online“) brauchen vor jedem Satz eine Netzwerk-Runde und
// kamen deshalb verzögert. Reihenfolge: selbst gewählte Stimme > Gerätestimme mit Männernamen >
// sonstige Gerätestimme > Rest. Die Wahl merkt sich der Browser.
const VOICE_KEY = "tyc_sw_voice";
const PACK_KEY = "tyc_sw_coach_voice"; // "pack:<id>" (KI-Stimme) oder "device" (Gerätestimme)
const CLANG_KEY = "tyc_sw_coach_lang"; // Sprache des Coachs; leer = App-Sprache
const HARD_KEY = "tyc_sw_coach_hard"; // "1" = harte Ansagen
const MALE = /\b(stefan|conrad|killian|hans|markus|daniel|thomas|david|guy|christopher|eric|mark|james|george|jorge|pablo|alvaro|henri|paul|claude|thierry|male|mann|männlich)\b/i;

export function coachVoices(langTag) {
  if (!canSpeak) return [];
  const base = langTag.slice(0, 2).toLowerCase();
  return (window.speechSynthesis.getVoices() || []).filter((v) => (v.lang || "").toLowerCase().startsWith(base));
}

function pickVoice(langTag) {
  const voices = coachVoices(langTag);
  if (!voices.length) return null;
  let saved = "";
  try { saved = window.localStorage.getItem(VOICE_KEY) || ""; } catch { /* egal */ }
  const own = saved && voices.find((v) => v.name === saved);
  if (own) return own;
  const score = (v) => (v.localService ? 4 : 0) + (MALE.test(v.name) ? 3 : 0)
    + ((v.lang || "").toLowerCase() === langTag.toLowerCase() ? 1 : 0);
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

// interrupt: laufende/wartende Ansagen abbrechen (sonst stauen sie sich und kommen zu spät)
function speak(text, langTag, interrupt = false) {
  if (!canSpeak || !text) return;
  try {
    if (interrupt) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langTag;
    const v = pickVoice(langTag);
    if (v) u.voice = v;
    u.rate = 1.12;   // zügig, energisch
    u.pitch = 0.9;   // etwas tiefer, ruhig-neutral
    u.volume = 1;
    duckDuring(u); // iPhone: eigene Musik leiser statt gestoppt
    window.speechSynthesis.speak(u);
  } catch {
    /* egal */
  }
}

// Ansagen starten so viel früher, dass sie (inkl. Anlaufzeit der Stimme) auf der Sekunde landen
const SPEAK_LEAD = 0.35;

// Spracherkennung der Stoppuhr (eigenes Mikro, nur wenn das Dashboard-Mikro aus ist): läuft über die
// gemeinsame Erkennung (lib/voiceHub). Entschieden wird erst, wenn der Satz zu Ende ist (Endergebnis
// oder Sprechpause); bei mehreren Befehlen gilt der letzte (siehe matchVoiceCommand).
const QUIET_MS = 900; // so lange Stille = Satz zu Ende (falls der Browser kein Endergebnis schickt)
const MIC_TIMEOUT_MS = 60000; // Stoppuhr-Mikro geht nach 1 Minute Stille aus (Dean 2026-11-26)

function useVoice(on, lang, onCommand, onHeard, onError, onTimeout) {
  const st = useRef({ last: { cmd: null, at: 0 }, pending: null, quiet: 0, byPause: false });
  const bump = useSilenceTimeout(on, MIC_TIMEOUT_MS, onTimeout);
  const decide = (texts, viaPause) => {
    const v = st.current;
    v.pending = null;
    window.clearTimeout(v.quiet);
    const cmd = texts.map((x) => matchVoiceCommand(cleanSpeech(x))).find(Boolean);
    if (!viaPause && v.byPause) {
      v.byPause = false;
      if (cmd === v.last.cmd) return; // dasselbe Endergebnis kam nach der Pause noch einmal
    }
    if (viaPause) v.byPause = true;
    if (!cmd) return;
    const now = Date.now();
    if (cmd === v.last.cmd && now - v.last.at < 1200) return;
    v.last = { cmd, at: now };
    onCommand(cmd);
  };
  useEffect(() => () => window.clearTimeout(st.current.quiet), []);
  useVoiceChannel(on, lang, (texts, isFinal) => {
    bump();
    const shown = cleanSpeech(texts[0]);
    if (shown) onHeard?.(shown);
    const v = st.current;
    if (isFinal) decide(texts, false);
    else {
      v.pending = texts;
      window.clearTimeout(v.quiet);
      v.quiet = window.setTimeout(() => { if (v.pending) decide(v.pending, true); }, QUIET_MS);
    }
  }, onError);
}

// Pfeil-Knopf: Antippen = 1×, gedrückt halten = immer schneller
function HoldArrow({ dir, onStep, label, testid }) {
  const t1 = useRef(null);
  const t2 = useRef(null);
  const stop = () => {
    clearTimeout(t1.current);
    clearInterval(t2.current);
  };
  useEffect(() => stop, []);
  const start = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    stop();
    onStep(dir);
    const began = Date.now();
    t1.current = setTimeout(() => {
      t2.current = setInterval(() => {
        const held = Date.now() - began;
        onStep(dir * (held > 2500 ? 10 : held > 1200 ? 5 : 1));
      }, 90);
    }, 350);
  };
  const Icon = dir < 0 ? CaretLeft : CaretRight;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
      className="w-10 h-10 flex items-center justify-center border border-[#333] text-white hover:border-[#555] bg-[#121212] select-none"
      data-testid={testid}
    >
      <Icon size={16} weight="bold" />
    </button>
  );
}

export default function Stopwatch({ id, unit, color = "#CCFF00", onAdd, goal = 0, value = 0 }) {
  const { t, lang } = useI18n();
  const readLS = (key) => { try { return window.localStorage.getItem(key) || ""; } catch { return ""; } };
  const writeLS = (key, v) => { try { window.localStorage.setItem(key, v); } catch { /* egal */ } };
  // Sprache des Coachs (Dean 2026-11-25): voreingestellt die App-Sprache, sonst frei wählbar
  const [coachLangPref, setCoachLangPref] = useState(() => readLS(CLANG_KEY));
  const cLang = LANGUAGES.some((l) => l.code === coachLangPref) ? coachLangPref : lang;
  const langTag = speechLang(cLang);
  const ct = useCallback((key, vars) => translate(cLang, key, vars), [cLang]);
  // Harte Ansagen (eigene, freche Sätze) – an jeder Stimme umschaltbar
  const [hard, setHard] = useState(() => readLS(HARD_KEY) === "1");
  const [start, setStart] = useState(() => readStart(id));
  const [paused, setPaused] = useState(() => readPaused(id)); // Sekunden oder null
  const [now, setNow] = useState(Date.now());
  const [count, setCount] = useState(0); // 3,2,1 während des Countdowns, sonst 0
  const [review, setReview] = useState(null); // gestoppte Sekunden zum Nachjustieren
  const [listening, setListening] = useState(false);
  // Mikrofon in den Einstellungen ausgeschaltet -> kein Mikro-Knopf, laufendes Zuhören beenden
  const micAllowed = useMicEnabled();
  useEffect(() => { if (!micAllowed) setListening(false); }, [micAllowed]);
  const [micError, setMicError] = useState(null);
  const [heard, setHeard] = useState("");
  const [coach, setCoach] = useState(() => {
    try { return window.localStorage.getItem(COACH_KEY) === "1"; } catch { return false; }
  });
  const countTimer = useRef(0);
  // Stimmen des Geräts (kommen in Chrome erst nach „voiceschanged“)
  const [voices, setVoices] = useState(() => coachVoices(langTag));
  const [voiceName, setVoiceName] = useState(() => pickVoice(langTag)?.name || "");
  // KI-Stimmen (public/coach/<paket>/<ordner>/, Übersicht packs.json): zur Auswahl, sofort abspielbar.
  // Ordner = Sprache, harte Ansagen in „<sprache>-hart“. Erste Stimme der Liste (Ash · Beast) ist voreingestellt.
  // Ohne Aufnahmen (oder Wahl „Gerätestimme“) spricht die Stimme des Geräts.
  const [packIndex, setPackIndex] = useState([]);
  const [choice, setChoice] = useState(() => readLS(PACK_KEY));
  useEffect(() => {
    let alive = true;
    loadPackIndex().then((list) => { if (alive) setPackIndex(list); });
    return () => { alive = false; };
  }, []);
  const packList = packIndex.filter((p) => (p.langs || []).includes(cLang));
  const chosen = choice.startsWith("pack:") ? choice.slice(5) : "";
  const activeEntry = choice === "device" ? null : (packList.find((p) => p.id === chosen) || packList[0] || null);
  const activePack = activeEntry?.id || "";
  // Harte Sätze gibt es als Aufnahme nur bei manchen Stimmen; die Gerätestimme kann sie immer
  const hardAvailable = !activeEntry || (activeEntry.langs || []).includes(`${cLang}-hart`);
  const hardOn = hard && hardAvailable;
  const folder = hardOn && activePack ? `${cLang}-hart` : cLang;
  const live = useRef({});
  live.current = { pack: activePack, folder, hardOn };
  // Aufnahmen vorladen, sobald der Coach an ist (danach spielt jede Ansage ohne Verzögerung)
  useEffect(() => {
    if (coach && activePack) loadCoachClips(activePack, folder);
  }, [coach, folder, activePack]);
  const say = useCallback((cue, interrupt = false) => {
    const { pack, folder: f, hardOn: h } = live.current;
    if (pack && playCoachClip(pack, f, clipId(cue), interrupt)) return;
    speak(cueText(cue, ct, h), langTag, interrupt);
  }, [ct, langTag]);
  // Nach jeder Änderung einmal „Coach ist an“ in der neuen Einstellung (Aufnahmen vorher laden)
  const hello = (pack, f) => {
    if (pack) loadCoachClips(pack, f).then(() => say({ type: "on" }, true));
    else window.setTimeout(() => say({ type: "on" }, true), 30);
  };
  const pickCoachVoice = (val) => {
    unlockAudio();
    setChoice(val);
    writeLS(PACK_KEY, val);
    const pack = val.startsWith("pack:") ? val.slice(5) : "";
    const entry = packIndex.find((p) => p.id === pack);
    const h = hard && (!entry || (entry.langs || []).includes(`${cLang}-hart`));
    live.current = { pack, folder: h && pack ? `${cLang}-hart` : cLang, hardOn: h };
    hello(pack, live.current.folder);
  };
  const pickCoachLang = (code) => {
    unlockAudio();
    const v = code === lang ? "" : code; // App-Sprache = Standard, folgt späteren Wechseln der App-Sprache
    setCoachLangPref(v);
    writeLS(CLANG_KEY, v);
  };
  const toggleHard = () => {
    unlockAudio();
    const v = !hard;
    setHard(v);
    writeLS(HARD_KEY, v ? "1" : "0");
    live.current = { ...live.current, hardOn: v, folder: v && activePack ? `${cLang}-hart` : cLang };
    hello(activePack, live.current.folder);
  };
  // Sprache gewechselt: neue Aufnahmen laden und einmal hören lassen
  // Nur bei echtem Wechsel – nicht beim Öffnen des Formulars (StrictMode/Neu-Einhängen, Dean 2026-11-26)
  const prevLang = useRef(cLang);
  useEffect(() => {
    if (prevLang.current === cLang) return;
    prevLang.current = cLang;
    if (coach) hello(live.current.pack, live.current.folder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cLang]);
  const lastSecRef = useRef(0);
  const target = coachTargetSeconds(goal, value, unit);
  const targetRef = useRef(target);
  targetRef.current = target;

  // Refs: Sprachbefehle kommen aus einem Event-Handler und brauchen den aktuellen Stand.
  const startRef = useRef(start);
  startRef.current = start;
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const countRef = useRef(count);
  countRef.current = count;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const coachRef = useRef(coach);
  coachRef.current = coach;

  useEffect(() => {
    if (!start) return undefined;
    const iv = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(iv);
  }, [start]);
  useEffect(() => () => window.clearTimeout(countTimer.current), []);
  // Stimmen laden (Chrome liefert sie erst nach einem Ereignis)
  useEffect(() => {
    if (!canSpeak) return undefined;
    const h = () => {
      setVoices(coachVoices(langTag));
      setVoiceName((n) => n || pickVoice(langTag)?.name || "");
    };
    window.speechSynthesis.addEventListener?.("voiceschanged", h);
    h();
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", h);
  }, [langTag]);

  const sec = start ? Math.max(0, (now - start) / 1000) : 0;

  // Coach-Ansagen während die Uhr läuft
  useEffect(() => {
    if (!start) { if (pausedRef.current == null) lastSecRef.current = 0; return; }
    const prev = lastSecRef.current;
    lastSecRef.current = sec;
    if (!coachRef.current || sec <= prev) return;
    for (const c of coachCues(prev + SPEAK_LEAD, sec + SPEAK_LEAD, targetRef.current)) {
      if (c.type === "count") beep(660, 0.1);
      else if (c.type === "goal") beep(990, 0.3);
      say(c, c.type !== "half" && c.type !== "elapsed");
    }
  }, [sec, start, say]);


  const reallyStart = useCallback(() => {
    const s = Date.now();
    writeStart(id, s);
    lastSecRef.current = 0;
    setCount(0);
    setStart(s);
    setNow(s);
  }, [id]);

  // 3-2-1, dann zählt die Zeit
  const go = useCallback(() => {
    window.clearTimeout(countTimer.current);
    setReview(null);
    writePaused(id, null);
    setPaused(null);
    writeStart(id, 0);
    setStart(0);
    const step = (n) => {
      if (n === 0) {
        beep(1200, 0.25);
        if (coachRef.current) say({ type: "go" }, true);
        reallyStart();
        return;
      }
      setCount(n);
      beep(880, 0.12);
      if (coachRef.current) say({ type: "count", n }, true);
      countTimer.current = window.setTimeout(() => step(n - 1), 1000);
    };
    step(COUNTDOWN);
  }, [id, reallyStart, say]);

  const stop = useCallback(() => {
    const st = startRef.current;
    const p = pausedRef.current;
    if (!st && p == null) return;
    writeStart(id, 0);
    setStart(0);
    writePaused(id, null);
    setPaused(null);
    beep(440);
    setReview(Math.round(st ? (Date.now() - st) / 1000 : p));
  }, [id]);
  // Pause: Zeit anhalten, später genau dort weiter
  const pause = useCallback(() => {
    const st = startRef.current;
    if (!st) return;
    const el = (Date.now() - st) / 1000;
    lastSecRef.current = el;
    writeStart(id, 0);
    setStart(0);
    writePaused(id, el);
    setPaused(el);
    beep(520, 0.12);
  }, [id]);
  const resume = useCallback(() => {
    const p = pausedRef.current;
    if (p == null) return;
    const s = Date.now() - p * 1000;
    lastSecRef.current = p;
    writePaused(id, null);
    setPaused(null);
    writeStart(id, s);
    setStart(s);
    setNow(Date.now());
    beep(880, 0.12);
  }, [id]);
  const discard = useCallback(() => {
    window.clearTimeout(countTimer.current);
    setCount(0);
    writeStart(id, 0);
    setStart(0);
    writePaused(id, null);
    setPaused(null);
    setReview(null);
  }, [id]);
  const save = useCallback(() => {
    const r = reviewRef.current;
    if (r == null) return;
    setReview(null);
    const add = secondsToUnit(r, unit);
    if (add > 0) onAdd(add);
  }, [unit, onAdd]);

  const onVoice = useCallback((cmd) => {
    const running = !!startRef.current || countRef.current > 0;
    const isPaused = pausedRef.current != null;
    if (cmd === "start" || cmd === "resume") { if (isPaused) resume(); else if (!running && cmd === "start") go(); }
    else if (cmd === "pause") pause();
    else if (cmd === "stop") { if (countRef.current > 0) discard(); else stop(); }
    else if (cmd === "restart") go();
    else if (cmd === "save") {
      // „eintragen“ während sie läuft/pausiert: anhalten und gleich eintragen
      const st = startRef.current;
      if (st || isPaused) {
        const secs = Math.round(st ? (Date.now() - st) / 1000 : pausedRef.current);
        discard();
        beep(440);
        const add = secondsToUnit(secs, unit);
        if (add > 0) onAdd(add);
      } else save();
    }
    else if (cmd === "cancel") { beep(330); discard(); }
  }, [go, stop, save, discard, pause, resume, unit, onAdd]);
  const onMicError = useCallback((code) => { setListening(false); if (code !== "stopped") setMicError(code); }, []);
  // Dashboard-Mikro an: dann zählt dieses als an, die Befehle kommen vom Dashboard (Ereignis tyc:sw)
  const globalOn = useGlobalVoice();
  const micOn = listening || globalOn;
  useVoice(listening && !globalOn, lang, onVoice, setHeard, onMicError, () => setListening(false));
  useEffect(() => {
    const h = (e) => {
      const d = e.detail || {};
      // id = Test-ID des Eingabefelds „input-<key>“ (siehe Dashboard)
      if (d.key ? id === `input-${d.key}` : (d.active && (startRef.current || countRef.current > 0 || reviewRef.current != null || pausedRef.current != null))) onVoice(d.cmd);
    };
    window.addEventListener(SW_EVENT, h);
    return () => window.removeEventListener(SW_EVENT, h);
  }, [id, onVoice]);

  const toggleCoach = () => {
    const v = !coach;
    setCoach(v);
    try { window.localStorage.setItem(COACH_KEY, v ? "1" : "0"); } catch { /* egal */ }
    if (!v) { stopCoachClips(); return; }
    unlockAudio(); // im Klick freischalten, sonst blockt der Browser den Ton
    // gleich hören, wie die Stimme klingt; Aufnahmen kurz abwarten (beim ersten Mal werden sie geladen)
    let done = false;
    const greet = () => { if (!done) { done = true; say({ type: "on" }, true); } };
    if (activePack) loadCoachClips(activePack, folder).then(() => greet());
    else greet();
    window.setTimeout(greet, 1200);
  };

  const iconBtn = "h-8 w-8 shrink-0 flex items-center justify-center border transition-colors";
  const mic = SpeechRec && micAllowed ? (
    <button
      type="button"
      onClick={() => { setMicError(null); setHeard(""); if (globalOn) { setGlobalVoice(false); setListening(false); } else { if (!listening) kickVoice(lang); setListening((l) => !l); } }}
      aria-pressed={micOn}
      title={micOn ? t("sw.voiceOff") : t("sw.voiceOn")}
      aria-label={micOn ? t("sw.voiceOff") : t("sw.voiceOn")}
      data-testid={`${id}-stopwatch-mic`}
      className={`${iconBtn} ${micOn ? "border-[#FF3B30] text-[#FF3B30]" : "border-[#333] text-ink-2 hover:text-white hover:border-[#555]"}`}
    >
      {micOn ? <Microphone size={14} weight="fill" className="animate-pulse" /> : <MicrophoneSlash size={14} weight="bold" />}
    </button>
  ) : null;
  const coachBtn = canSpeak || canAudio ? (
    <button
      type="button"
      onClick={toggleCoach}
      aria-pressed={coach}
      title={coach ? t("sw.coachOff") : t("sw.coachOn")}
      aria-label={coach ? t("sw.coachOff") : t("sw.coachOn")}
      data-testid={`${id}-stopwatch-coach`}
      className={`${iconBtn} ${coach ? "border-[#CCFF00] text-[#CCFF00] bg-[#CCFF00]/10" : "border-[#333] text-ink-2 hover:text-white hover:border-[#555]"}`}
    >
      {coach ? <SpeakerHigh size={14} weight="fill" /> : <SpeakerSlash size={14} weight="bold" />}
    </button>
  ) : null;
  const tools = <div className="flex items-center gap-1.5">{coachBtn}{mic}</div>;

  const status = (
    <>
      {micOn && (
        <p className="text-[10px] text-ink-3 mt-1.5 leading-relaxed" data-testid={`${id}-stopwatch-voicehint`}>
          {review != null ? t("sw.voiceHintReview") : paused != null ? t("sw.voiceHintPaused") : start || count ? t("sw.voiceHintRunning") : t("sw.voiceHintIdle")}
          {heard && <span className="text-ink-2"> · {t("sw.heard", { text: heard.trim().slice(0, 40) })}</span>}
        </p>
      )}
      {micError && <p className="text-[10px] text-[#FF3B30] mt-1.5" data-testid={`${id}-stopwatch-micerror`}>{t(`sw.err.${["insecure", "not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"].includes(micError) ? micError : "generic"}`)}</p>}
      {coach && !start && !count && review == null && (
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {target > 0 && <p className="text-[10px] text-ink-3">{t("sw.coachTarget", { v: formatClock(target) })}</p>}
          <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
          {packList.length > 0 && (
            <select
              value={activePack ? `pack:${activePack}` : "device"}
              onChange={(e) => pickCoachVoice(e.target.value)}
              aria-label={t("sw.voicePick")}
              title={t("sw.voicePick")}
              className="ml-auto max-w-[11rem] h-7 bg-[#0A0A0A] border border-[#333] text-[10px] text-ink-2 px-1.5"
              data-testid={`${id}-stopwatch-pack`}
            >
              {packList.map((p) => <option key={p.id} value={`pack:${p.id}`}>{p.label}</option>)}
              <option value="device">{t("sw.deviceVoice")}</option>
            </select>
          )}
          <select
            value={cLang}
            onChange={(e) => pickCoachLang(e.target.value)}
            aria-label={t("sw.coachLang")}
            title={t("sw.coachLang")}
            className="h-7 bg-[#0A0A0A] border border-[#333] text-[10px] text-ink-2 px-1.5 uppercase"
            data-testid={`${id}-stopwatch-coachlang`}
          >
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.code.toUpperCase()}</option>)}
          </select>
          {hardAvailable && (
            <button
              type="button"
              onClick={toggleHard}
              aria-pressed={hardOn}
              title={t("sw.hardTitle")}
              className={`h-7 px-2 border text-[10px] uppercase tracking-widest font-bold transition-colors ${hardOn ? "border-[#FF3B30] text-[#FF3B30] bg-[#FF3B30]/10" : "border-[#333] text-ink-3 hover:text-white hover:border-[#555]"}`}
              data-testid={`${id}-stopwatch-hard`}
            >
              {t("sw.hard")}
            </button>
          )}
          </div>
          {!activePack && voices.length > 1 && (
            <select
              value={voiceName}
              onChange={(e) => {
                setVoiceName(e.target.value);
                try { window.localStorage.setItem(VOICE_KEY, e.target.value); } catch { /* egal */ }
                window.setTimeout(() => speak(cueText({ type: "on" }, ct, hardOn), langTag, true), 30);
              }}
              aria-label={t("sw.voicePick")}
              title={t("sw.voicePick")}
              className="ml-auto max-w-[11rem] h-7 bg-[#0A0A0A] border border-[#333] text-[10px] text-ink-2 px-1.5"
              data-testid={`${id}-stopwatch-voice`}
            >
              {voices.map((v) => (
                <option key={v.name} value={v.name}>{v.name.replace(/^(Microsoft|Google|Apple)\s+/i, "").replace(/\s*-\s*.*$/, "")}{v.localService ? "" : " ☁"}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </>
  );

  // Countdown 3-2-1
  if (count > 0) {
    return (
      <div className="mt-2" data-testid={`${id}-stopwatch-countdown`}>
        <div className="flex items-center gap-3">
          <span key={count} className="font-anton text-4xl leading-none tabular-nums animate-pulse" style={{ color }}>{count}</span>
          <span className="text-[10px] uppercase tracking-widest text-ink-3">{t("sw.getReady")}</span>
          <div className="ml-auto flex items-center gap-2">
            {tools}
            <button type="button" onClick={discard} aria-label={t("sw.cancel")} title={t("sw.cancel")} data-testid={`${id}-stopwatch-cancel-countdown`}
              className={`${iconBtn} border-[#333] text-ink-3 hover:text-white hover:border-[#555]`}>
              <X size={12} weight="bold" />
            </button>
          </div>
        </div>
        {status}
      </div>
    );
  }

  // Nachjustieren nach dem Stoppen
  if (review != null) {
    return (
      <div className="mt-2" data-testid={`${id}-stopwatch-review`}>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <HoldArrow dir={-1} onStep={(d) => setReview((r) => adjustSeconds(r, d))} label={t("sw.minus")} testid={`${id}-stopwatch-minus`} />
          <span className="min-w-[3.75rem] sm:min-w-[4.5rem] text-center font-anton text-2xl tabular-nums" style={{ color }} data-testid={`${id}-stopwatch-time`}>{formatClock(review)}</span>
          <HoldArrow dir={1} onStep={(d) => setReview((r) => adjustSeconds(r, d))} label={t("sw.plus")} testid={`${id}-stopwatch-plus`} />
          <button type="button" onClick={save} data-testid={`${id}-stopwatch-save`}
            className="ml-auto inline-flex items-center gap-1.5 h-10 px-2.5 sm:px-3 whitespace-nowrap shrink-0 bg-[#CCFF00] text-black font-bold uppercase tracking-widest text-[10px] hover:bg-[#D4FF33] transition-colors">
            <Check size={13} weight="bold" /> {t("sw.save")}
          </button>
          <button type="button" onClick={discard} aria-label={t("sw.cancel")} title={t("sw.cancel")} data-testid={`${id}-stopwatch-cancel`}
            className="h-10 w-10 shrink-0 flex items-center justify-center border border-[#333] text-ink-3 hover:text-white hover:border-[#555] transition-colors">
            <X size={13} weight="bold" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <p className="text-[10px] text-ink-3">{t("sw.adjustHint")}</p>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={go} aria-label={t("sw.restart")} title={t("sw.restart")} data-testid={`${id}-stopwatch-restart`}
              className={`${iconBtn} border-[#333] text-ink-2 hover:text-white hover:border-[#555]`}>
              <ArrowCounterClockwise size={14} weight="bold" />
            </button>
            {tools}
          </div>
        </div>
        {status}
      </div>
    );
  }

  // Pausiert
  if (paused != null) {
    return (
      <div className="mt-2" data-testid={`${id}-stopwatch-paused`}>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-anton text-xl tabular-nums opacity-70" style={{ color }}>
            <Pause size={16} weight="fill" /> {formatClock(paused)}
          </span>
          <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-ink-3 animate-pulse">{t("sw.paused")}</span>
          <div className="ml-auto flex items-center gap-1.5">
            {tools}
            <button type="button" onClick={resume} aria-label={t("sw.resume")} title={t("sw.resume")} data-testid={`${id}-stopwatch-resume`}
              className={`${iconBtn} border-[#CCFF00]/60 text-[#CCFF00] hover:bg-[#CCFF00]/10`}>
              <Play size={12} weight="fill" />
            </button>
            <button type="button" onClick={stop} data-testid={`${id}-stopwatch-stop`} aria-label={t("sw.stop")} title={t("sw.stop")}
              className="inline-flex items-center justify-center gap-1.5 h-8 w-8 sm:w-auto sm:px-3 whitespace-nowrap bg-[#CCFF00] text-black font-bold uppercase tracking-widest text-[10px] hover:bg-[#D4FF33] transition-colors">
              <Stop size={12} weight="fill" /> <span className="hidden sm:inline">{t("sw.stop")}</span>
            </button>
            <button type="button" onClick={discard} aria-label={t("sw.cancel")} title={t("sw.cancel")} data-testid={`${id}-stopwatch-discard`}
              className={`${iconBtn} border-[#333] text-ink-3 hover:text-white hover:border-[#555]`}>
              <X size={12} weight="bold" />
            </button>
          </div>
        </div>
        {status}
      </div>
    );
  }

  // Läuft
  if (start) {
    return (
      <div className="mt-2" data-testid={`${id}-stopwatch`}>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-anton text-xl tabular-nums" style={{ color }}>
            <Timer size={16} weight="bold" className="animate-pulse" /> {formatClock(sec)}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {tools}
            <button type="button" onClick={pause} aria-label={t("sw.pause")} title={t("sw.pause")} data-testid={`${id}-stopwatch-pause`}
              className={`${iconBtn} border-[#333] text-ink-2 hover:text-white hover:border-[#555]`}>
              <Pause size={12} weight="fill" />
            </button>
            <button type="button" onClick={stop} data-testid={`${id}-stopwatch-stop`} aria-label={t("sw.stop")} title={t("sw.stop")}
              className="inline-flex items-center justify-center gap-1.5 h-8 w-8 sm:w-auto sm:px-3 whitespace-nowrap bg-[#CCFF00] text-black font-bold uppercase tracking-widest text-[10px] hover:bg-[#D4FF33] transition-colors">
              <Stop size={12} weight="fill" /> <span className="hidden sm:inline">{t("sw.stop")}</span>
            </button>
            <button type="button" onClick={discard} aria-label={t("sw.cancel")} title={t("sw.cancel")} data-testid={`${id}-stopwatch-discard`}
              className={`${iconBtn} border-[#333] text-ink-3 hover:text-white hover:border-[#555]`}>
              <X size={12} weight="bold" />
            </button>
          </div>
        </div>
        {status}
      </div>
    );
  }

  // Bereit
  return (
    <div className="mt-2">
      <div className="flex items-center gap-3">
        <button type="button" onClick={go} data-testid={`${id}-stopwatch-start`}
          className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-ink-2 hover:text-white transition-colors">
          <Timer size={14} weight="bold" style={{ color }} /> {t("sw.start")}
          <Play size={10} weight="fill" className="opacity-60" />
        </button>
        <span className="ml-auto">{tools}</span>
      </div>
      {status}
    </div>
  );
}
