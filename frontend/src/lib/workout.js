// Workout-Modus / Intervall-Timer (Dean 2026-11-26): reine Funktionen, getestet in workout.test.js.
import { wordsToDigits } from "./voiceLog";

export const COUNTDOWN_S = 3;

// Vorlagen: Arbeit / Pause in Sekunden, Runden
// Reihenfolge (Dean 2026-11-26): oben HIIT | EMOM, unten Ausdauer | Tabata
export const PRESETS = [
  { id: "hiit", work: 40, rest: 20, rounds: 8 },
  { id: "emom", work: 60, rest: 0, rounds: 10 },
  { id: "long", work: 45, rest: 15, rounds: 10 },
  { id: "tabata", work: 20, rest: 10, rounds: 8 },
];

export const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

// Ablauf: 3-2-1, dann Arbeit/Pause je Runde (nach der letzten Runde keine Pause)
export function buildPhases(work, rest, rounds) {
  const w = clampInt(work, 5, 3600);
  const r = clampInt(rest, 0, 3600);
  const n = clampInt(rounds, 1, 100);
  const out = [{ type: "countdown", round: 1, dur: COUNTDOWN_S }];
  for (let i = 1; i <= n; i++) {
    out.push({ type: "work", round: i, dur: w });
    if (r > 0 && i < n) out.push({ type: "rest", round: i, dur: r });
  }
  return out;
}

export const totalSeconds = (phases) => phases.reduce((a, p) => a + p.dur, 0);

// Wo stehen wir nach `elapsed` Sekunden? -> { index, phase, left, done }
export function phaseAt(phases, elapsed) {
  let t = Math.max(0, elapsed);
  for (let i = 0; i < phases.length; i++) {
    if (t < phases[i].dur) return { index: i, phase: phases[i], left: phases[i].dur - t, done: false };
    t -= phases[i].dur;
  }
  const last = phases[phases.length - 1];
  return { index: phases.length - 1, phase: last, left: 0, done: true };
}

// Gesprochene Wiederholungen: „zwölf“ -> setzen, „plus fünf“/„noch 5“ -> dazu, „minus 2“ -> weniger
export function parseRepsSpeech(text) {
  const s = wordsToDigits(String(text || ""));
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n >= 0) || n > 100000) return null;
  if (/\b(minus|weniger|less|menos|moins)\b/.test(s)) return { mode: "add", n: -n };
  if (/\b(plus|noch|dazu|mehr|more|another|mas|encore)\b/.test(s)) return { mode: "add", n };
  return { mode: "set", n };
}

export const sum = (arr) => Math.round(arr.reduce((a, v) => a + (Number(v) || 0), 0) * 100) / 100;
