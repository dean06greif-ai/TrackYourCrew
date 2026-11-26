// Formverlust nach Pausen (Dean, 2026-11-25) – gleiche Kurve wie PAUSE_LOSS in backend/server.py.
// Bis 2 Wochen Pause bleibt das Ziel, danach sinkt es leicht. Für Info-Text und Tabelle.
export const PAUSE_LOSS_TABLE = [
  { from: 1, to: 2, pct: 100 },
  { from: 3, to: 3, pct: 95 },
  { from: 4, to: 4, pct: 90 },
  { from: 5, to: 6, pct: 85 },
  { from: 7, to: null, pct: 80 },
];

export function pauseLossPct(weeks) {
  const w = Math.max(0, Math.floor(Number(weeks) || 0));
  if (w === 0) return 100;
  const row = PAUSE_LOSS_TABLE.find((r) => w >= r.from && (r.to == null || w <= r.to));
  return row ? row.pct : 100;
}

// Wie viele Pausenwochen zählen, wenn man JETZT fortsetzt? Die laufende Woche zählt dann wieder
// als aktiv (wie im Backend: Fortsetzen setzt to_week = diese Woche) – also die Wochen davor.
export function currentPauseWeeks(progression = [], currentWeek = 0) {
  let n = 0;
  for (let w = currentWeek - 1; w >= 1; w--) {
    const cell = progression.find((p) => p.week === w);
    if (!cell || cell.status !== "paused") break;
    n++;
  }
  return n;
}

// Ziel, mit dem es nach der Pause weitergeht (km auf 0,1, sonst ganze Zahlen)
export function goalAfterPause(lastGoal, weeks, unit) {
  const v = (Number(lastGoal) || 0) * pauseLossPct(weeks) / 100;
  return /km|mi|^m$/i.test(unit || "") ? Math.round(v * 10) / 10 : Math.round(v);
}
