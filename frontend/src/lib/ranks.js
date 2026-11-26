import { detectExerciseKind } from "./exercises";

// Rang-System (F bis S+): reine Funktionen, ohne React und ohne Browser-Speicher.
// Grundlage ist ausschließlich der Serverwert `best_goals` (höchster je in einer
// Woche erreichter Wert, gedeckelt aufs Wochenziel). Dadurch zeigen alle Geräte
// und alle Betrachter denselben Rang.
// ─────────────────────────────────────────────────────────────────────────
// 🏆 RANK SYSTEM
// Schwellenwerte (Wochenwerte) für die Standard-Übungen Lauf / Klimmzüge /
// Liegestütze. Jeder Rang hat eine eigene Akzentfarbe.
// Die Funktion `getRankForExercise` erkennt anhand des Namens/Keys, welche
// Übung es ist, und liefert {letter, color, glow} zurück.
// ─────────────────────────────────────────────────────────────────────────
export const RANK_COLORS = {
  F:    { color: "#9CA3AF", glow: "rgba(156,163,175,0.55)" }, // grau
  E:    { color: "#4ADE80", glow: "rgba(74,222,128,0.65)"  }, // grün (wie im Referenzbild)
  D:    { color: "#38BDF8", glow: "rgba(56,189,248,0.65)"  }, // hellblau
  C:    { color: "#22D3EE", glow: "rgba(34,211,238,0.65)"  }, // cyan
  B:    { color: "#FACC15", glow: "rgba(250,204,21,0.7)"   }, // gelb
  A:    { color: "#FB923C", glow: "rgba(251,146,60,0.75)"  }, // orange
  S:    { color: "#EF4444", glow: "rgba(239,68,68,0.85)"   }, // rot
  "S+": { color: "#E879F9", glow: "rgba(232,121,249,0.95)" }, // magenta / elite
};

// Schwellenwerte: jeweils Untergrenze (Wert >= min => dieser Rang), niedrigster
// Rang zuerst. Werte = bester Wochenwert. Quelle: docs/RANG-TABELLE.md (von Dean
// freigegeben, 2026-11-24): E mit den Start-Vorschlägen (5 km / 150 / 20, +5 %)
// in Woche 3, danach jede Stufe ≈ 1,6–1,8× die vorige, S+ = Elite.
const LETTERS = ["F", "E", "D", "C", "B", "A", "S", "S+"];
const tiers = (...mins) => LETTERS.map((letter, i) => ({ letter, min: i === 0 ? 0 : mins[i - 1] }));
// Zeit-Übungen: Tabelle in Minuten, gespeichert in der Basis-Einheit Sekunden.
const minuteTiers = (...mins) => tiers(...mins.map((m) => m * 60));

const GEHEN_TIERS = tiers(15, 25, 40, 55, 75, 100, 140);

export const RANK_THRESHOLDS = {
  // Kern-Übungen
  lauf:      tiers(5.5, 10, 18, 30, 50, 85, 150),
  liege:     tiers(165, 300, 500, 850, 1400, 2400, 4000),
  klimm:     tiers(22, 40, 75, 130, 220, 380, 650),
  rad:       tiers(25, 50, 90, 150, 250, 400, 650),
  schwimm:   tiers(1, 2, 3.5, 6, 10, 18, 35),
  gehen:     GEHEN_TIERS,
  squat:     tiers(200, 400, 700, 1100, 1800, 2800, 4500),
  // Weitere Übungen
  situps:    tiers(150, 300, 500, 800, 1300, 2100, 3500),
  burpees:   tiers(50, 100, 180, 320, 550, 900, 1500),
  dips:      tiers(40, 80, 140, 240, 400, 650, 1100),
  hspu:      tiers(10, 25, 45, 80, 140, 240, 400),
  lunge:     tiers(100, 200, 350, 600, 1000, 1600, 2600),
  rope:      tiers(1000, 2500, 5000, 9000, 15000, 25000, 40000),
  plank:     minuteTiers(5, 10, 20, 35, 60, 90, 150),
  handstand: minuteTiers(1, 3, 7, 13, 25, 45, 75),
  deadhang:  minuteTiers(2, 5, 10, 17, 27, 42, 65),
  wallsit:   minuteTiers(3, 7, 14, 25, 40, 65, 100),
  // Wandern zählt wie Gehen (km/Woche), steht im Ranking aber getrennt.
  wandern:   GEHEN_TIERS,
  // Nicht in der Rang-Tabelle, aus der alten Kalibrierung übernommen.
  hollow:    tiers(300, 600, 1200, 2400, 4500, 7500, 12000),
  highjump:  tiers(30, 80, 150, 250, 400, 600, 900),
  weitsprung: tiers(30, 80, 150, 250, 400, 600, 900),
  pogo:      tiers(500, 1200, 2500, 4500, 7000, 10000, 15000),
};

// ─────────────────────────────────────────────────────────────────────────
// 🧮 EINHEITEN-INTELLIGENZ
// Damit die Rang-Schwellwerte oben (RANK_THRESHOLDS) auch dann passen, wenn der
// Nutzer in den Settings eine andere Einheit als die Default-Einheit der
// Übung wählt (z. B. Lauf in Meilen statt km, Plank in Minuten statt
// Sekunden, Gehen in Schritten statt km), werden die Schwellwerte hier zur
// Laufzeit aus der Basis-Einheit in die Nutzer-Einheit umgerechnet.
//
// • Erkennung ist robust gegen Abkürzungen / ausgeschriebene Wörter / Punkt
//   am Ende / Großschreibung / Diakritika (km / KM / Kilometer / km. / Meile
//   / miles / s / sec / Sek. / Sekunden / min / Minute / h / Std / Stunden …).
// • Pro Übungstyp ist eine Basis-Einheits-Familie hinterlegt (distance_km,
//   time_sec, count). Wählt der Nutzer eine fremde Familie (z. B. Minuten
//   für Laufen), bleiben die Basis-Schwellwerte erhalten.
// ─────────────────────────────────────────────────────────────────────────

// Basis-Einheits-Familie pro Übung (Familie der RANK_THRESHOLDS-Werte oben).
export const RANK_BASE_UNITS = {
  // Distanz, Basis = km
  lauf: "distance_km",
  rad: "distance_km",
  schwimm: "distance_km",
  gehen: "distance_km",
  wandern: "distance_km",
  // Wiederholungen (zählbar)
  liege: "count", klimm: "count", situps: "count", burpees: "count",
  dips: "count", hspu: "count", highjump: "count", weitsprung: "count",
  pogo: "count", rope: "count", squat: "count", lunge: "count",
  // Zeit, Basis = Sekunden
  handstand: "time_sec", deadhang: "time_sec", plank: "time_sec",
  hollow: "time_sec", wallsit: "time_sec",
};

// Normalisiert einen Einheits-String: lowercase, Diakritika weg, Trenn-
// zeichen (Leerzeichen, Punkt, Slash, Bindestrich, _) weg, ein evtl.
// angehängtes Plural-/Punkt-Suffix weg.
// "Sek." → "sek", "Schritte/Tag" → "schrittetag" (greift in includes-Check).
function normalizeUnitStr(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s._\-/\\]+/g, "")
    .trim();
}

// Parst eine Einheit in {kind, toBase}.
//  • toBase = Faktor, mit dem ein Wert in dieser Einheit auf die Basis-
//    Einheit (km bzw. Sekunden) gebracht wird.
//    User-Wert × toBase = Basis-Wert.   (User-Wert = Basis-Wert / toBase.)
//  • kind ∈ "distance" | "steps" | "time" | "count" — oder null bei
//    unbekannter Einheit.
export function parseUnit(unitStr) {
  const u = normalizeUnitStr(unitStr);
  if (!u) return { kind: "count", toBase: 1 };

  // ── Distanz (Basis km) ──────────────────────────────────────────────
  if (u === "km" || u === "kilometer" || u === "kilometers" || u === "kilometre" || u === "kilometres") {
    return { kind: "distance", toBase: 1 };
  }
  if (u === "m" || u === "meter" || u === "meters" || u === "metre" || u === "metres") {
    return { kind: "distance", toBase: 0.001 };
  }
  if (u === "cm" || u === "zentimeter" || u === "centimeter" || u === "centimeters" || u === "zentimeters") {
    return { kind: "distance", toBase: 0.00001 };
  }
  if (u === "mm" || u === "millimeter" || u === "millimeters") {
    return { kind: "distance", toBase: 0.000001 };
  }
  if (u === "mi" || u === "mile" || u === "miles" || u === "meile" || u === "meilen") {
    return { kind: "distance", toBase: 1.609344 };
  }
  if (u === "ft" || u === "fuss" || u === "fuse" || u === "foot" || u === "feet") {
    return { kind: "distance", toBase: 0.0003048 };
  }
  if (u === "yd" || u === "yard" || u === "yards" || u === "yds") {
    return { kind: "distance", toBase: 0.0009144 };
  }
  if (u === "nmi" || u === "nm" || u === "seemeile" || u === "seemeilen" || u === "nauticalmile" || u === "nauticalmiles") {
    return { kind: "distance", toBase: 1.852 };
  }

  // ── Schritte (Sonderfall: 1300 Schritte ≈ 1 km) ─────────────────────
  if (u === "schritt" || u === "schritte" || u === "step" || u === "steps" || u.includes("schritt")) {
    return { kind: "steps", toBase: 1 / 1300 };
  }

  // ── Zeit (Basis Sekunden) ───────────────────────────────────────────
  if (u === "s" || u === "sec" || u === "secs" || u === "second" || u === "seconds" ||
      u === "sek" || u === "sekunde" || u === "sekunden" || u === "sekunde" ||
      u === "sk" || u === "secd") {
    return { kind: "time", toBase: 1 };
  }
  if (u === "min" || u === "mins" || u === "minute" || u === "minutes" || u === "minuten") {
    return { kind: "time", toBase: 60 };
  }
  if (u === "h" || u === "hr" || u === "hrs" || u === "hour" || u === "hours" ||
      u === "std" || u === "stunde" || u === "stunden" || u === "stund") {
    return { kind: "time", toBase: 3600 };
  }
  if (u === "ms" || u === "millisekunde" || u === "millisekunden" || u === "millisecond" || u === "milliseconds") {
    return { kind: "time", toBase: 0.001 };
  }
  if (u === "tag" || u === "tage" || u === "day" || u === "days" || u === "d") {
    return { kind: "time", toBase: 86400 };
  }

  // ── Anzahl / Wiederholungen ─────────────────────────────────────────
  if (u === "x" || u === "mal" || u === "stk" || u === "stueck" || u === "stuck" ||
      u === "rep" || u === "reps" || u === "wdh" || u === "wdhg" || u === "wdhgn" ||
      u === "anzahl" || u === "count" || u === "n" || u === "stueckzahl") {
    return { kind: "count", toBase: 1 };
  }

  return null;
}

// Hübsche Rundung für angezeigte Schwellwerte — bleibt funktional korrekt
// für Vergleiche (>=), erzeugt aber lesbare Zahlen im UI.
export function prettyRound(v) {
  if (!Number.isFinite(v) || v === 0) return 0;
  const abs = Math.abs(v);
  if (abs >= 1000) return Math.round(v / 10) * 10;       // 12345 → 12350
  if (abs >= 100)  return Math.round(v);                  //   621 →   621
  if (abs >= 10)   return Math.round(v * 10) / 10;        //  62.1 →  62.1
  if (abs >= 1)    return Math.round(v * 10) / 10;        //   6.2 →   6.2
  return Math.round(v * 100) / 100;                       //  0.62 →  0.62
}

// Konvertiert eine Tier-Liste von ihrer Basis-Einheit in die Nutzer-Einheit.
// thresholdInUserUnit = thresholdInBaseUnit / toBase.
function convertThresholds(baseTiers, toBase) {
  if (!toBase || toBase === 1) return baseTiers;
  return baseTiers.map((t) => ({
    letter: t.letter,
    min: t.min === 0 ? 0 : prettyRound(t.min / toBase),
  }));
}

// ── Varianten (Plan 1d) ─────────────────────────────────────────────────
// Mit Zusatzgewicht ist eine Übung schwerer, also werden alle Schwellen (auch S+)
// mit einem Faktor kleiner (docs/RANG-TABELLE.md, von Dean freigegeben):
// +5 kg 80 %, +10 kg 60 %, +20 kg 40 %, ab +30 kg 30 %, dazwischen linear.
// Varianten ohne Gewichtsangabe ("einbeinig", "Weste") pauschal 60 %.
const WEIGHT_FACTORS = [[0, 1], [5, 0.8], [10, 0.6], [20, 0.4], [30, 0.3]];
export const VARIANT_DEFAULT_FACTOR = 0.6;

export function variantRankFactor(variant) {
  const v = String(variant || "").toLowerCase().replace(/,/g, ".").trim();
  if (!v) return 1;
  const m = v.match(/(\d+(?:\.\d+)?)\s*(kg|kilo|lbs?|pounds?)/);
  if (!m) return VARIANT_DEFAULT_FACTOR;
  let kg = parseFloat(m[1]);
  if (/^(lb|pound)/.test(m[2])) kg *= 0.4536;
  if (!(kg > 0)) return VARIANT_DEFAULT_FACTOR;
  for (let i = 1; i < WEIGHT_FACTORS.length; i++) {
    const [x1, f1] = WEIGHT_FACTORS[i];
    if (kg <= x1) {
      const [x0, f0] = WEIGHT_FACTORS[i - 1];
      return f0 + ((kg - x0) / (x1 - x0)) * (f1 - f0);
    }
  }
  return WEIGHT_FACTORS[WEIGHT_FACTORS.length - 1][1];
}

function scaleThresholds(tiers, factor) {
  if (!tiers || !factor || factor === 1) return tiers;
  return tiers.map((t) => ({ letter: t.letter, min: t.min === 0 ? 0 : prettyRound(t.min * factor) }));
}

// Liefert die passenden Rang-Tiers für (Übungs-Typ × Nutzer-Einheit × Variante).
export function getRankThresholds(kind, unitStr, variant = "") {
  return scaleThresholds(getUnitThresholds(kind, unitStr), variantRankFactor(variant));
}

// Rang-Tiers für (Übungs-Typ × Nutzer-Einheit), ohne Variante.
// Wenn die Nutzer-Einheit zur Basis-Familie passt, werden die Schwellwerte
// proportional umgerechnet. Bei „Gehen" gibt es zusätzlich Schritte-Tiers.
function getUnitThresholds(kind, unitStr) {
  if (!kind) return null;
  const baseTiers = RANK_THRESHOLDS[kind];
  if (!baseTiers || baseTiers.length === 0) return null;

  const family = RANK_BASE_UNITS[kind];
  const parsed = parseUnit(unitStr);

  // Unbekannte Einheit → keine Umrechnung.
  if (!parsed) return baseTiers;

  // Distanz-Familie (km Basis). „Schritte" zählt mit (1300 ≈ 1 km).
  if (family === "distance_km" && (parsed.kind === "distance" || parsed.kind === "steps")) {
    return convertThresholds(baseTiers, parsed.toBase);
  }
  // Zeit-Familie (Sekunden Basis).
  if (family === "time_sec" && parsed.kind === "time") {
    return convertThresholds(baseTiers, parsed.toBase);
  }
  // Count-Familie: keine sinnvolle Umrechnung; Tiers bleiben wie sie sind.
  if (family === "count") {
    return baseTiers;
  }
  // Familie und Einheit passen nicht zueinander (z. B. Lauf in Minuten):
  // Basis-Tiers behalten, damit der Rang nicht völlig verzerrt wird.
  return baseTiers;
}

// Erkennt anhand des Namens, ob es eine rang-fähige Übung ist (Erkennung in
// lib/exercises.js). Der Schlüssel zählt nur noch als Rückfall für alte Daten,
// neue Übungen haben zufällige Schlüssel wie "x1a2b3c4d".
// Liefert den Tier-Schlüssel oder null (Übungsart ohne Rang-Tabelle).
export function detectRankExercise(ex) {
  const kind = detectExerciseKind(ex?.name) || detectExerciseKind(ex?.key);
  return kind && RANK_THRESHOLDS[kind] ? kind : null;
}

// Reihenfolge der Ränge (für Vergleiche).
export const RANK_LETTER_ORDER = LETTERS;

export function letterFromThresholds(tiers, bestGoal) {
  let current = tiers[0];
  for (const t of tiers) {
    if (bestGoal >= t.min) current = t;
  }
  return current.letter;
}

// Liefert das aktuelle Rank-Objekt für (Übung, bestGoal). Null falls die
// Übung kein Standard-Übungstyp ist.
// `bestGoal` ist der HÖCHSTE je tatsächlich erreichte Zielwert.
// `bestWeekly` ist der höchste je erreichte Wochenwert (nur für S+ relevant).
export function getRankForExercise(ex, bestGoal, bestWeekly = 0) {
  const kind = detectRankExercise(ex);
  if (!kind) return null;
  const tiers = getRankThresholds(kind, ex?.unit, ex?.variant);
  if (!tiers || tiers.length === 0) return null;
  let current = tiers[0];
  for (const t of tiers) {
    if (bestGoal >= t.min) current = t;
  }
  // Nächste Schwelle (für Tooltip / Hinweistext)
  const nextIdx = tiers.findIndex((t) => t.letter === current.letter) + 1;
  const next = nextIdx < tiers.length ? tiers[nextIdx] : null;
  const palette = RANK_COLORS[current.letter] || RANK_COLORS.F;
  return {
    kind,
    letter: current.letter,
    min: current.min,
    bestGoal,
    bestWeekly,
    nextLetter: next?.letter || null,
    nextMin: next?.min ?? null,
    color: palette.color,
    glow: palette.glow,
  };
}

// ── Rang-Up-Erkennung (nur für die Anzeige des Toasts) ──────────────────────
// Merkt sich pro Browser den zuletzt gesehenen Buchstaben je (Athlet, Übung).
// Beeinflusst NICHT den Rang selbst, nur ob ein "Rang-Up"-Toast erscheint.
// v4: neue Rang-Tabelle (2026-11-24). Neuer Schlüssel = beim ersten Laden nur
// merken, damit nicht alle Rang-Ups der Umstellung auf einmal feuern.
const RANK_SEEN_KEY = "rankSeen_v4";

function readSeen() {
  try {
    const raw = window.localStorage.getItem(RANK_SEEN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Liefert true, wenn `letter` höher ist als der zuletzt gesehene Rang.
// Beim allerersten Sehen wird nur gespeichert (kein Toast-Feuerwerk).
export function consumeRankUp(userId, exerciseKey, letter) {
  if (!userId || !exerciseKey || !letter) return false;
  const seen = readSeen();
  const prev = seen?.[userId]?.[exerciseKey];
  if (prev === letter) return false;
  const isUp = !!prev && RANK_LETTER_ORDER.indexOf(letter) > RANK_LETTER_ORDER.indexOf(prev);
  seen[userId] = { ...(seen[userId] || {}), [exerciseKey]: letter };
  try {
    window.localStorage.setItem(RANK_SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* Speicher voll oder gesperrt: dann eben kein Toast */
  }
  return isUp;
}
