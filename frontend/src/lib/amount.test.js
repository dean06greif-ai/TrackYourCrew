import { formatAmount, amountParts } from "./amount";

describe("formatAmount", () => {
  test("Zeit-Übungen als Uhrzeit", () => {
    expect(formatAmount(270, "Sek.", "de-DE")).toBe("4:30 min");
    expect(formatAmount(45, "s", "de-DE")).toBe("0:45 min");
    expect(formatAmount(4.5, "Min.", "de-DE")).toBe("4:30 min");
    expect(formatAmount(1.5, "Std.", "de-DE")).toBe("1:30:00 h");
    expect(amountParts(5400, "sec", "en-GB")).toEqual({ num: "1:30:00", unit: "h" });
  });
  test("andere Einheiten unverändert", () => {
    expect(formatAmount(6.7, "km", "de-DE")).toBe("6,7 km");
    expect(formatAmount(1357, "", "de-DE")).toBe("1.357");
  });
});

describe("unbekannte Einheiten stürzen nicht ab", () => {
  test.each(["Runden", "Sätze", "×", "Mal"])("%s", (u) => {
    expect(formatAmount(3, u, "de-DE")).toBe(`3 ${u}`);
  });
});
