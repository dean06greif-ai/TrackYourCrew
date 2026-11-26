import { parseUnit } from "./ranks";

// Stoppuhr für Zeit-Übungen (Plan 13f): nur reine Funktionen.

// Ist die Einheit eine Zeit, die man stoppen kann (Sekunden, Minuten, Stunden)?
export function isTimeUnit(unit) {
  const p = parseUnit(unit) || {}; // unbekannte Einheit (z. B. „Runden“) -> keine Zeit
  return p.kind === "time" && p.toBase >= 1 && p.toBase <= 3600;
}

// Sekunden je Einheit (s = 1, min = 60, h = 3600); 1 wenn keine Zeit-Einheit.
export function unitSeconds(unit) {
  const p = parseUnit(unit) || {}; // unbekannte Einheit (z. B. „Runden“) -> keine Zeit
  return p.kind === "time" && p.toBase ? p.toBase : 1;
}

// Gestoppte Sekunden in die Einheit der Übung: s ganzzahlig, min auf 0,1, h auf 0,01.
export function secondsToUnit(sec, unit) {
  const p = parseUnit(unit) || {}; // unbekannte Einheit (z. B. „Runden“) -> keine Zeit
  const s = Math.max(0, Number(sec) || 0);
  if (p.kind !== "time" || !p.toBase) return Math.round(s);
  const v = s / p.toBase;
  const digits = p.toBase >= 3600 ? 100 : p.toBase >= 60 ? 10 : 1;
  return Math.round(v * digits) / digits;
}

// 75 -> "1:15", 3725 -> "1:02:05"
export function formatClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

// Nachjustieren nach dem Stoppen: ±1 s, nie unter 0.
export function adjustSeconds(sec, delta) {
  return Math.max(0, Math.round((Number(sec) || 0) + (Number(delta) || 0)));
}

// ── Sprachbefehle ───────────────────────────────────────────────────────
// Ganze Sätze gehen: „starte die Stoppuhr“, „stoppe dich“, „Zeit stopp“, „beginne von vorn“, „brich ab“.
// Alle 4 Sprachen gelten immer. Es zählt der Befehl, der im Satz zuletzt kommt
// („starte … neu“ = neu starten); bei Gleichstand gewinnt die obere Zeile.
const COMMANDS = [
  ["cancel", /\b(abbrechen|abbruch|brich ab|breche ab|brech ab|verwerfen|vergiss es|cancel|cancelar|annuler|annule)\b/g],
  ["restart", /\b(von vorn|von vorne|neu starten|neustart|nochmal|noch mal|neu|reset|zurucksetzen|restart|again|de nuevo|reiniciar|recommence|recommencer)\b/g],
  ["save", /\b(eintragen|speichern|ubernehmen|save|done|guardar|listo|enregistrer|valider)\b/g],
  ["stop", /\b(stopp|stoppe|stoppen|stop|halt|anhalten|ende|aus|para|parar|alto|arrete|arreter)\b/g],
  ["start", /\b(start|starte|starten|los|go|begin|beginne|beginnen|empieza|empezar|comienza|commence|partez|vas y)\b/g],
];

function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[.,!?;:'’"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Erkannter Text -> "start" | "stop" | "restart" | "save" | "cancel" | null
export function matchVoiceCommand(text) {
  const t = norm(text);
  if (!t) return null;
  let best = null;
  COMMANDS.forEach(([cmd, re], prio) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t))) {
      const end = m.index + m[0].length;
      if (!best || end > best.end || (end === best.end && prio < best.prio)) best = { cmd, end, prio };
    }
  });
  return best ? best.cmd : null;
}

// Sprache für Spracherkennung und Stimme
export function speechLang(lang) {
  return { de: "de-DE", en: "en-US", es: "es-ES", fr: "fr-FR" }[lang] || "en-US";
}

// ── Sprachcoach ─────────────────────────────────────────────────────────
// Welche Ansagen fallen zwischen zwei Messungen (prevSec -> sec) an?
// Mit Ziel (targetSec > 0): Halbzeit, „noch 30/10 Sekunden“, 3-2-1, „Ziel geschafft“, danach jede Minute.
// Ohne Ziel: 30 s, 1 min, 1:30, 2 min, danach jede Minute.
export function coachCues(prevSec, sec, targetSec = 0) {
  const crossed = (mark) => prevSec < mark && sec >= mark;
  const cues = [];
  const T = Math.round(Number(targetSec) || 0);
  if (T >= 20) {
    if (T >= 60 && crossed(T / 2)) cues.push({ type: "half" });
    if (T >= 90 && crossed(T - 30)) cues.push({ type: "left", n: 30 });
    if (T >= 30 && crossed(T - 10)) cues.push({ type: "left", n: 10 });
    for (const n of [3, 2, 1]) if (crossed(T - n)) cues.push({ type: "count", n });
    if (crossed(T)) cues.push({ type: "goal" });
    // danach weiter jede volle Minute über dem Ziel
    for (let m = Math.ceil((T + 1) / 60) * 60; m <= sec; m += 60) if (crossed(m)) cues.push({ type: "elapsed", s: m });
  } else {
    const marks = [30, 60, 90, 120];
    for (const m of marks) if (crossed(m)) cues.push({ type: "elapsed", s: m });
    for (let m = 180; m <= sec; m += 60) if (crossed(m)) cues.push({ type: "elapsed", s: m });
  }
  return cues;
}

// Ziel für den Coach in Sekunden: was diese Woche noch fehlt (Wochenziel − schon eingetragen).
export function coachTargetSeconds(goal, value, unit) {
  const rest = (Number(goal) || 0) - (Number(value) || 0);
  return rest > 0 ? Math.round(rest * unitSeconds(unit)) : 0;
}

// Zeit-Übungen wie eine Uhr anzeigen (Dean 2026-11-25): 270 Sek. -> „4:30“ + „min“,
// 1,5 Std. -> „1:30:00“ + „h“. null, wenn die Einheit keine Zeit ist.
export function clockParts(value, unit) {
  if (!isTimeUnit(unit)) return null;
  const sec = Math.round((Number(value) || 0) * unitSeconds(unit));
  return { text: formatClock(sec), suffix: sec >= 3600 ? "h" : "min" };
}
