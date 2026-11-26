// Prozent-Vergleiche (Plan 1e, nur echte Daten): reine Hilfsfunktionen, getestet.
import { detectExerciseKind } from "./exercises";
import { RANK_BASE_UNITS, parseUnit } from "./ranks";

// Was die Website dem Server je eigener Übung meldet: Übungsart + Umrechnung in die Basis-Einheit.
// Nur Übungsarten mit Rang-Tabelle, keine Varianten („+10 kg“), Einheit muss zur Art passen.
export function statKindItems(exercises = []) {
  const out = [];
  for (const ex of exercises) {
    if ((ex.variant || "").trim() || ex.type === "activity") continue;
    const kind = detectExerciseKind(ex.name);
    const family = kind && RANK_BASE_UNITS[kind];
    if (!family) continue;
    let factor = 1;
    const u = parseUnit(ex.unit) || {};
    if (family === "distance_km") {
      if (u.kind !== "distance" && u.kind !== "steps") continue;
      factor = u.toBase;
    } else if (family === "time_sec") {
      if (u.kind !== "time") continue;
      factor = u.toBase;
    } else if (u.kind !== "count") {
      continue;
    }
    out.push({ key: ex.key, kind, factor });
  }
  return out;
}

// Neue Meldungen: Stufe vorhanden und besser als die schon gezeigte (kleiner = besser).
export function newPercentileLevels(kinds = {}, seen = {}) {
  return Object.entries(kinds)
    .filter(([k, r]) => r && r.level && (seen[k] == null || r.level < Number(seen[k])))
    .map(([kind, r]) => ({ kind, level: r.level, n: r.n }));
}
