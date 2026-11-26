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

// An wie vielen Tagen der Woche erledigt? (days = {"0": {key: 1}, …})
export function doneDays(days, key) {
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => Number(days?.[d]?.[key]) > 0);
}
