// Aktivitäten (Dean 2026-11-26): z. B. „Gym 2× pro Woche“. Ziel = Mal pro Woche, erledigte Tage zählen
// (Tageswert 1). Keine Steigerung, kein Boost, kein Rang – zählen aber für die Streak.
// Reine Funktionen + Ideen-Liste für die Einstellungen.

export const ACTIVITY_UNIT = "×";
export const isActivity = (ex) => (ex?.type || "exercise") === "activity";
export const typeOf = (ex) => (isActivity(ex) ? "activity" : "exercise");

// Ideen zum Durchblättern (Name/Text in i18n: idea.<key>.name / idea.<key>.text)
export const ACTIVITY_IDEAS = [
  { key: "gym", icon: "gym", per: 2 },
  { key: "push", icon: "bench", per: 2 },
  { key: "pull", icon: "pullup", per: 1 },
  { key: "legs", icon: "squat", per: 1 },
  { key: "yoga", icon: "yoga", per: 2 },
  { key: "swim", icon: "swim", per: 1 },
  { key: "bike", icon: "bike", per: 2 },
  { key: "stretch", icon: "yoga", per: 3 },
  { key: "sauna", icon: "sauna", per: 1 },
];

// Ideen für Übungen (Dean 2026-11-26): Wochenwert + Einheit, Steigerung wie neue Übungen (5 %).
// Namen/Texte in i18n unter idea.ex_<key>.name/.text
export const EXERCISE_IDEAS = [
  { key: "ex_pushups", icon: "pushup", unit: "", base: 100 },
  { key: "ex_pullups", icon: "pullup", unit: "", base: 20 },
  { key: "ex_squats", icon: "squat", unit: "", base: 150 },
  { key: "ex_run", icon: "run", unit: "km", base: 10 },
  { key: "ex_plank", icon: "plank", unit: "min", base: 5 },
  { key: "ex_burpees", icon: "burpee", unit: "", base: 50 },
  { key: "ex_situps", icon: "situp", unit: "", base: 100 },
  { key: "ex_dips", icon: "dip", unit: "", base: 50 },
  { key: "ex_lunges", icon: "lunge", unit: "", base: 100 },
  { key: "ex_walk", icon: "walk", unit: "km", base: 20 },
  { key: "ex_bike", icon: "bike", unit: "km", base: 30 },
  { key: "ex_jumprope", icon: "jumprope", unit: "min", base: 15 },
];

// An wie vielen Tagen der Woche erledigt? (days = {"0": {key: 1}, …})
export function doneDays(days, key) {
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => Number(days?.[d]?.[key]) > 0);
}
