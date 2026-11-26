// Crew-Gesamtwertung (Plan 5, Formel von Dean freigegeben, 2026-11-24):
// 10 Punkte je geschaffter Woche + 2 Punkte je Woche der laufenden Streak.
// Pausierte Wochen sind neutral (zählen weder als geschafft noch als verfehlt,
// das erledigt schon der Server bei `streak.completed_weeks`).
export const POINTS_PER_WEEK = 10;
export const POINTS_PER_STREAK_WEEK = 2;

export function crewScore(entry) {
  const weeks = (entry?.streak?.completed_weeks || []).length;
  const streak = Number(entry?.streak?.current) || 0;
  return { weeks, streak, points: weeks * POINTS_PER_WEEK + streak * POINTS_PER_STREAK_WEEK };
}

// Sortiert nach Punkten, bei Gleichstand nach Streak, dann Name.
export function crewTable(users) {
  return (users || [])
    .map((u) => ({ user: u, ...crewScore(u) }))
    .sort((a, b) => b.points - a.points || b.streak - a.streak || String(a.user.name).localeCompare(String(b.user.name)));
}
