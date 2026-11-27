// Eine gemeinsame Spracherkennung für die ganze App (Dean 2026-11-26).
// Vorher hatten Stoppuhr und Eintragen je eine eigene – die haben sich gegenseitig das Mikro weggenommen.
// Jetzt: genau EINE Erkennung, die läuft, solange mindestens ein Abnehmer angemeldet ist
// (Dashboard-Mikro, Eintrage-Formular, Stoppuhr). Jeder bekommt alles Gehörte und entscheidet selbst;
// Zeitlimits (Stille) regelt jeder Abnehmer für sich.
// Dazu: der globale Schalter (Mikro neben „Fortschritt eintragen“) und „Erst bestätigen“.
import { useEffect, useRef, useState } from "react";
import { speechLang, matchVoiceCommand } from "./stopwatch";

const Rec = () => (typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null);

// ── Füllwörter ──────────────────────────────────────────────────────────
// Werden für Anzeige und Auswertung entfernt („Hallo, starte die Stoppuhr jetzt“ -> „starte die Stoppuhr“).
const FILLERS = new Set([
  "hallo", "hi", "hey", "he", "äh", "ähm", "ähh", "öhm", "hm", "hmm", "also", "ok", "okay", "okey", "mal", "jetzt",
  "bitte", "ja", "so", "na", "nun", "eben", "doch", "einfach",
  "hello", "um", "uh", "uhm", "erm", "please", "now", "yeah", "well", "like",
  "hola", "eh", "pues", "bueno", "vale", "ahora", "porfa",
  "bonjour", "salut", "euh", "bah", "ben", "alors", "maintenant",
]);
// mehrteilige Füllwörter
const FILLER_PHRASES = [/\bpor favor\b/gi, /\bs'?il (te|vous) pla[iî]t\b/gi, /\bvoil[aà]\b/gi];

export function cleanSpeech(text) {
  let s = String(text || "");
  FILLER_PHRASES.forEach((re) => { s = s.replace(re, " "); });
  return s
    .split(/\s+/)
    .filter((w) => w && !FILLERS.has(w.toLowerCase().replace(/[.,!?;:„“"']/g, "")))
    .join(" ")
    .replace(/^[\s.,!?;:]+/, "")
    .trim();
}

// ── Erkennung ───────────────────────────────────────────────────────────
const subs = new Map(); // id -> { onResult(texts, isFinal), onError(code) }
let nextId = 1;
let lang = "de";
let rec = null;
let running = false;
let restartTimer = 0;
let netFails = 0;
let local = false;
let gotResult = false;   // in diesem Lauf schon etwas gehört?
let sawFinal = false;    // liefert der Browser Endergebnisse? (Safari oft nicht)
let committed = "";      // Safari: schon als „fertig“ gemeldeter Anfang des wachsenden Texts
let pending = null;      // letztes Zwischenergebnis ohne Endergebnis
let quietTimer = 0;
let kickTimer = 0;

// Apple (Safari am Mac, alle Browser am iPhone): Erkennung muss direkt im Antippen starten,
// Endergebnisse kommen oft gar nicht -> Sprechpause zählt als Satzende (Dean 2026-11-26)
const APPLE = typeof navigator !== "undefined" && /Apple/.test(navigator.vendor || "");
const SAFARI_QUIET_MS = 1200;

const emit = (fn) => subs.forEach((s) => { try { fn(s); } catch { /* ein Abnehmer darf die anderen nicht stören */ } });
const fail = (code) => {
  stopRec();
  // Mikro-Frage gerade abgelehnt/weggeklickt: der Browser fragt beim nächsten Tippen meist nochmal
  // -> „nochmal tippen“ statt gleich aufs Schloss-Symbol zu verweisen (Dean 2026-11-27).
  // Nur wenn die Freigabe dauerhaft gesperrt ist („denied“), bleibt der Schloss-Hinweis.
  if (code === "not-allowed" && navigator.permissions?.query) {
    navigator.permissions.query({ name: "microphone" })
      .then((p) => emit((s) => s.onError?.(p.state === "denied" ? "not-allowed" : "not-allowed-retry")))
      .catch(() => emit((s) => s.onError?.(code)));
    return;
  }
  emit((s) => s.onError?.(code));
};

// Zwischenergebnis ohne den schon gemeldeten Anfang (Safari wiederholt den ganzen Text)
const fresh = (t) => {
  const full = String(t || "");
  if (committed && full.startsWith(committed)) return full.slice(committed.length).trim();
  return full.trim();
};
// noch offenes Zwischenergebnis als fertigen Satz melden (Safari, oder Browser endet ohne Endergebnis)
function flushPending(newSession) {
  window.clearTimeout(quietTimer);
  if (pending && pending.texts[0]) {
    const texts = pending.texts;
    committed = newSession ? "" : pending.full;
    pending = null;
    emit((s) => s.onResult?.(texts, true));
  } else if (newSession) committed = "";
}

function makeRec(SR) {
  const r = new SR();
  r.lang = speechLang(lang);
  if (local && "processLocally" in r) r.processLocally = true;
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 3;
  r.onresult = (e) => {
    netFails = 0;
    gotResult = true;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const raw = Array.from({ length: res.length || 1 }, (_, k) => res[k]?.transcript || "");
      if (res.isFinal) {
        sawFinal = true;
        window.clearTimeout(quietTimer);
        const texts = raw.map(fresh);
        pending = null;
        committed = "";
        if (texts[0]) emit((s) => s.onResult?.(texts, true));
        continue;
      }
      if (committed && !raw[0].startsWith(committed)) committed = ""; // neuer Text (Safari hat neu begonnen)
      const texts = raw.map(fresh);
      pending = { texts, full: raw[0] };
      if (texts[0]) emit((s) => s.onResult?.(texts, false));
      if (APPLE && !sawFinal) {
        window.clearTimeout(quietTimer);
        quietTimer = window.setTimeout(() => flushPending(false), SAFARI_QUIET_MS);
      }
    }
  };
  r.onerror = async (e) => {
    if (e.error === "network") {
      // leise neu versuchen, wenn möglich direkt am Gerät statt online
      netFails += 1;
      if (!local && "processLocally" in r && SR.available) {
        try {
          const tag = speechLang(lang);
          let st = await SR.available({ langs: [tag], processLocally: true });
          if (st === "downloadable" && SR.install) { await SR.install({ langs: [tag], processLocally: true }); st = "available"; }
          if (st === "available") local = true;
        } catch { /* egal */ }
      }
      if (netFails >= 3) fail("network");
      return;
    }
    if (e.error === "aborted" || e.error === "no-speech") return;
    // Safari verweigert einen Neustart ohne Antippen: einfach still beenden (kein „kein Zugriff“)
    if (e.error === "not-allowed" && gotResult) { flushPending(true); fail("stopped"); return; }
    if (["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"].includes(e.error)) fail(e.error);
  };
  r.onend = () => {
    if (!running || rec !== r) return;
    flushPending(true); // Gesagtes nicht verlieren, wenn der Browser die Sitzung beendet
    // Browser beendet nach Pausen von selbst – weiter zuhören
    restartTimer = window.setTimeout(() => {
      if (!running || rec !== r) return;
      if ((local && !r.processLocally) || r.lang !== speechLang(lang)) { rec = makeRec(SR); try { rec.start(); } catch { /* egal */ } return; }
      try { r.start(); } catch { /* läuft schon */ }
    }, netFails ? 800 : 250);
  };
  return r;
}

async function startRec() {
  if (running) return;
  const SR = Rec();
  if (!SR) return fail("unsupported");
  if (!window.isSecureContext) return fail("insecure");
  running = true;
  gotResult = false;
  committed = "";
  pending = null;
  if (!APPLE) {
    // Chrome & Co.: vorher nach dem Mikrofon fragen (zeigt den Erlauben-Dialog zuverlässig, Spur gleich zu).
    // Apple NICHT: dort muss start() direkt im Antippen passieren, die Erkennung fragt selbst.
    if (!navigator.mediaDevices?.getUserMedia) return fail("insecure");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((tr) => tr.stop());
    } catch (e) {
      return fail(e?.name === "NotFoundError" ? "audio-capture" : "not-allowed");
    }
    if (!running) return;
  }
  rec = makeRec(SR);
  try { rec.start(); } catch { /* egal */ }
}

function stopRec() {
  running = false;
  window.clearTimeout(restartTimer);
  window.clearTimeout(quietTimer);
  pending = null;
  committed = "";
  const r = rec;
  rec = null;
  try { r?.abort(); } catch { /* egal */ }
}

// Im Klick auf einen Mikro-Knopf aufrufen: startet die Erkennung sofort (Safari verlangt das).
// Meldet sich danach kein Abnehmer an (Knopf ausgeschaltet), wird sie wieder beendet.
export function kickVoice(appLang) {
  if (appLang) lang = appLang;
  startRec();
  window.clearTimeout(kickTimer);
  kickTimer = window.setTimeout(() => { if (!subs.size) stopRec(); }, 2500);
}

// Anmelden: gibt die Abmelde-Funktion zurück. Sprache gilt für alle (die App hat nur eine).
let idleTimer = 0;
export function joinVoice(handlers, appLang) {
  const id = nextId++;
  subs.set(id, handlers);
  window.clearTimeout(idleTimer);
  if (appLang && appLang !== lang) {
    lang = appLang;
    if (rec) { try { rec.stop(); } catch { /* onend startet mit neuer Sprache */ } }
  }
  startRec();
  return () => {
    subs.delete(id);
    // kurz warten: wechselt nur der Abnehmer (z. B. Stoppuhr -> Dashboard), läuft die Erkennung weiter
    // (Safari erlaubt einen Neustart ohne Antippen oft nicht)
    window.clearTimeout(idleTimer);
    if (!subs.size) idleTimer = window.setTimeout(() => { if (!subs.size) stopRec(); }, 400);
  };
}

// React: solange `on` true ist, angemeldet. Rückrufe dürfen sich ändern, ohne neu anzumelden.
export function useVoiceChannel(on, appLang, onResult, onError) {
  const cb = useRef({ onResult, onError });
  cb.current = { onResult, onError };
  useEffect(() => {
    if (!on) return undefined;
    return joinVoice({
      onResult: (texts, fin) => cb.current.onResult?.(texts, fin),
      onError: (code) => cb.current.onError?.(code),
    }, appLang);
  }, [on, appLang]);
}

// Stille-Zeitlimit: ruft onTimeout nach `ms` ohne neues Gehörtes. bump() bei jedem Gehörten.
export function useSilenceTimeout(on, ms, onTimeout) {
  const timer = useRef(0);
  const cb = useRef(onTimeout);
  cb.current = onTimeout;
  const bump = useRef(() => {});
  bump.current = () => {
    window.clearTimeout(timer.current);
    if (on && ms > 0) timer.current = window.setTimeout(() => cb.current?.(), ms);
  };
  useEffect(() => {
    bump.current();
    return () => window.clearTimeout(timer.current);
  }, [on, ms]);
  return () => bump.current();
}

// ── Schalter: globales Mikro (Dashboard) + „Erst bestätigen“ ─────────────
const GLOBAL_EVENT = "tyc:voice-global";
let globalOn = false;
export const isGlobalVoice = () => globalOn;
export function setGlobalVoice(on) {
  globalOn = !!on;
  try { window.dispatchEvent(new Event(GLOBAL_EVENT)); } catch { /* egal */ }
}
export function useGlobalVoice() {
  const [on, setOn] = useState(globalOn);
  useEffect(() => {
    const h = () => setOn(globalOn);
    window.addEventListener(GLOBAL_EVENT, h);
    h();
    return () => window.removeEventListener(GLOBAL_EVENT, h);
  }, []);
  return on;
}

const CONFIRM_KEY = "tyc_voice_confirm";
const CONFIRM_EVENT = "tyc:voice-confirm";
export function voiceConfirm() {
  try { return window.localStorage.getItem(CONFIRM_KEY) === "1"; } catch { return false; }
}
export function setVoiceConfirm(on) {
  try { window.localStorage.setItem(CONFIRM_KEY, on ? "1" : "0"); } catch { /* egal */ }
  try { window.dispatchEvent(new Event(CONFIRM_EVENT)); } catch { /* egal */ }
}
export function useVoiceConfirm() {
  const [on, setOn] = useState(() => voiceConfirm());
  useEffect(() => {
    const h = () => setOn(voiceConfirm());
    window.addEventListener(CONFIRM_EVENT, h);
    return () => window.removeEventListener(CONFIRM_EVENT, h);
  }, []);
  return on;
}

// ── Stoppuhr per Sprache vom Dashboard aus ───────────────────────────────
// „starte die Stoppuhr (für Plank)“: Stoppuhr-Wort ODER Name einer Stoppuhr-Übung + Befehl.
export const SW_EVENT = "tyc:sw";
const SW_WORD = /\b(stoppuhr|stopuhr|uhr|timer|stopwatch|clock|cron[oó]metro|temporizador|reloj|chrono|chronom[eè]tre|minuteur|minuterie)\b/i;
export const mentionsStopwatch = (text) => SW_WORD.test(String(text || ""));

// Entscheidet für das Dashboard-Mikro: null (kein Stoppuhr-Befehl) | {cmd, key} | {cmd, ask: true} | {cmd, active: true}
// swExercises = Übungen mit Stoppuhr (Zeit-Einheit), findEx(text, list) findet eine davon im Satz.
export function routeStopwatch(text, swExercises, findEx) {
  const cmd = matchVoiceCommand(text);
  if (!cmd || !swExercises.length) return null;
  const ex = findEx(text, swExercises);
  if (ex) return { cmd, key: ex.key };
  if (!mentionsStopwatch(text)) {
    // kurzes „stopp“/„speichern“ ohne Stoppuhr-Wort: gilt für eine laufende Stoppuhr
    return cmd === "start" ? null : { cmd, active: true };
  }
  if (swExercises.length === 1) return { cmd, key: swExercises[0].key };
  return cmd === "start" || cmd === "restart" ? { cmd, ask: true } : { cmd, active: true };
}
