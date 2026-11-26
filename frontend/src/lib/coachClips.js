// Alle Ansagen des Sprachcoachs mit fester ID (Dean 2026-11-25: KI-Stimme als Aufnahmen).
// Aufnahmen liegen in public/coach/<paket>/<sprache>/<id>.mp3 (harte Ansagen: <sprache>-hart),
// erzeugt von tools/gen-coach-voice.mjs.
// WICHTIG: keine Imports in dieser Datei – das Erzeugungs-Skript lädt sie direkt in Node.

export const ELAPSED_MAX_MIN = 20; // länger: Gerätestimme (hält die Aufnahmen klein)

// Schlüssel normal oder hart (coach.hard.*)
const k = (name, hard) => (hard ? `coach.hard.${name}` : `coach.${name}`);

// Text für „so viel Zeit ist vergangen“
export function elapsedText(s, t, hard = false) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return t(k("sec", hard), { s });
  if (r) return m === 1 ? t(k("minuteSec", hard), { s: r }) : t(k("minSec", hard), { m, s: r });
  return t(k(m === 1 ? "minute" : "minutes", hard), { m });
}

// Ansage -> ID der Aufnahme (gleich für normal und hart, die liegen in getrennten Ordnern)
export function clipId(cue) {
  switch (cue.type) {
    case "count": return `n${cue.n}`;
    case "left": return `left${cue.n}`;
    case "elapsed": return `el${cue.s}`;
    default: return cue.type; // go, half, goal, on
  }
}

// Ansage -> gesprochener Text
export function cueText(cue, t, hard = false) {
  switch (cue.type) {
    // als Wort mit Ausrufezeichen: eine nackte „3“ sprach die KI manchmal gar nicht (stumme Aufnahme)
    case "count": return t(`coach.n${cue.n}`);
    case "left": return t(k("left", hard), { n: cue.n });
    case "elapsed": return elapsedText(cue.s, t, hard);
    default: return t(k(cue.type, hard));
  }
}

// Vollständige Liste (für das Skript): alles, was coachCues + Countdown je sagen können
export function coachCueList() {
  const list = [
    { type: "on" }, { type: "go" }, { type: "half" }, { type: "goal" },
    { type: "count", n: 3 }, { type: "count", n: 2 }, { type: "count", n: 1 },
    { type: "left", n: 30 }, { type: "left", n: 10 },
    { type: "elapsed", s: 30 }, { type: "elapsed", s: 90 },
  ];
  for (let m = 1; m <= ELAPSED_MAX_MIN; m += 1) list.push({ type: "elapsed", s: m * 60 });
  return list;
}

export function coachClips(t, hard = false) {
  return coachCueList().map((c) => ({ id: clipId(c), text: cueText(c, t, hard) }));
}
