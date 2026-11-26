// Tagesziel „auf Kurs“ (Plan 12b): wie viel heute noch fehlt, um im Wochenplan zu liegen.
// Plan = gleichmäßig über die Woche verteilt: bis Ende heute sollten (Tag+1)/7 des Ziels da sein.
// Liegt man vorn oder ist die Woche geschafft -> 0 (dann zeigt die Karte nichts an).
// todayIdx: 0 = Montag … 6 = Sonntag. km werden auf 0,1 aufgerundet, sonst ganze Zahlen.
export function paceToday(goal, value, todayIdx, unit) {
  const g = Number(goal) || 0;
  const v = Number(value) || 0;
  if (g <= 0 || v >= g) return 0;
  const day = Math.min(6, Math.max(0, Math.floor(Number(todayIdx) || 0)));
  const missing = (g * (day + 1)) / 7 - v;
  if (missing <= 1e-9) return 0;
  const step = unit === "km" ? 10 : 1;
  // kleine Rundungsreste (z. B. 2.0000001) nicht hochrunden
  return Math.ceil(missing * step - 1e-6) / step;
}

export function todayIdx(date = new Date()) {
  return (date.getDay() + 6) % 7;
}
