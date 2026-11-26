// Kluge Vorschläge beim Anlegen einer Übung (Dean, 2026-11-25): aus dem Namen Einheit und
// Startwert (Wochenziel) ableiten, z. B. „Plank“ -> Sekunden, 270. Erscheinen grau im Feld.
import { detectExerciseKind } from "./exercises";
import { RANK_BASE_UNITS, RANK_THRESHOLDS, variantRankFactor } from "./ranks";

// Leicht unter Rang E – wie die Start-Vorschläge im Onboarding (5 km / 150 / 20 bei E 5,5 / 165 / 22).
const START_FACTOR = 0.9;

function nice(v, family) {
  if (family === "distance_km") return Math.max(0.5, Math.round(v * 2) / 2);
  if (family === "time_sec") return v >= 120 ? Math.round(v / 30) * 30 : Math.max(10, Math.round(v / 10) * 10);
  return v >= 50 ? Math.round(v / 10) * 10 : Math.max(5, Math.round(v / 5) * 5);
}

// -> { kind, unit, start } oder null (unbekannte Übung). `secUnit` = Sekunden-Kürzel der Sprache.
export function suggestForName(name, secUnit = "Sek.") {
  const kind = detectExerciseKind(name);
  const family = kind && RANK_BASE_UNITS[kind];
  const tiers = kind && RANK_THRESHOLDS[kind];
  if (!family || !tiers) return null;
  const e = tiers.find((tr) => tr.letter === "E")?.min || 0;
  if (!e) return null;
  const unit = family === "distance_km" ? "km" : family === "time_sec" ? secUnit : "";
  return { kind, unit, start: nice(e * START_FACTOR, family) };
}

// Startwert-Vorschlag beim Varianten-Wechsel in BEIDE Richtungen: altes Ziel × Faktor(neu) / Faktor(alt).
// Beispiele: Grundübung -> +10 kg: × 0,6 · +10 kg -> Grundübung: ÷ 0,6 · +20 kg -> +10 kg: × 0,6/0,4.
export function variantStartSuggestion(goal, oldVariant, newVariant, unit = "") {
  const g = Number(goal) || 0;
  const f = (v) => variantRankFactor(v);
  const raw = g * (f(newVariant) / f(oldVariant));
  return /km|mi|^m$/i.test(unit || "") ? Math.round(raw * 10) / 10 : Math.round(raw);
}
