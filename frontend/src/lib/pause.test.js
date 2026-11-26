import { pauseLossPct, currentPauseWeeks, goalAfterPause } from "./pause";

describe("Formverlust nach Pausen", () => {
  test("Kurve wie im Backend", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 12].map(pauseLossPct)).toEqual([100, 100, 100, 95, 90, 85, 85, 80, 80]);
  });
  test("laufende Pause zählen", () => {
    const prog = [1, 2, 3, 4, 5].map((week) => ({ week, status: week >= 3 ? "paused" : "completed" }));
    expect(currentPauseWeeks(prog, 5)).toBe(2); // Woche 5 zählt beim Fortsetzen wieder als aktiv
    expect(currentPauseWeeks(prog, 6)).toBe(3);
    expect(currentPauseWeeks(prog, 2)).toBe(0);
  });
  test("Ziel danach", () => {
    expect(goalAfterPause(150, 3, "")).toBe(143);
    expect(goalAfterPause(6.7, 4, "km")).toBe(6);
    expect(goalAfterPause(201, 2, "")).toBe(201);
  });
});
