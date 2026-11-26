import { paceToday, todayIdx } from "./pace";

describe("paceToday (Tagesziel auf Kurs)", () => {
  test("Montag: ein Siebtel des Ziels", () => {
    expect(paceToday(140, 0, 0)).toBe(20);
    expect(paceToday(140, 5, 0)).toBe(15);
  });
  test("vorn im Plan oder geschafft -> nichts", () => {
    expect(paceToday(201, 80, 1)).toBe(0); // Di: Plan 57,4
    expect(paceToday(100, 100, 3)).toBe(0);
    expect(paceToday(100, 130, 6)).toBe(0);
  });
  test("Sonntag: Rest der Woche", () => {
    expect(paceToday(150, 120, 6)).toBe(30);
  });
  test("km auf 0,1 aufgerundet, sonst ganze Zahlen", () => {
    expect(paceToday(6.7, 0, 0, "km")).toBe(1); // 0,957 -> 1,0
    expect(paceToday(10, 2.7, 2, "km")).toBe(1.6); // 4,2857 - 2,7 = 1,586 -> 1,6
    expect(paceToday(201, 0, 0)).toBe(29); // 28,7 -> 29
  });
  test("kein Ziel / kaputte Werte -> 0", () => {
    expect(paceToday(0, 0, 0)).toBe(0);
    expect(paceToday(undefined, undefined, undefined)).toBe(0);
  });
  test("todayIdx: Montag = 0, Sonntag = 6", () => {
    expect(todayIdx(new Date(2026, 10, 23))).toBe(0);
    expect(todayIdx(new Date(2026, 10, 29))).toBe(6);
  });
});
