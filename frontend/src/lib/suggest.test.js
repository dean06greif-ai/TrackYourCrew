import { suggestForName, variantStartSuggestion } from "./suggest";

describe("suggestForName", () => {
  test("wie im Onboarding", () => {
    expect(suggestForName("Lauf")).toEqual({ kind: "lauf", unit: "km", start: 5 });
    expect(suggestForName("Liegestütze")).toEqual({ kind: "liege", unit: "", start: 150 });
    expect(suggestForName("Klimmzüge")).toEqual({ kind: "klimm", unit: "", start: 20 });
  });
  test("Zeit-Übungen in Sekunden", () => {
    expect(suggestForName("Plank")).toEqual({ kind: "plank", unit: "Sek.", start: 270 });
    expect(suggestForName("Plank", "sec").unit).toBe("sec");
    expect(suggestForName("Handstand").start).toBe(50);
  });
  test("andere Arten", () => {
    expect(suggestForName("Radfahren").unit).toBe("km");
    expect(suggestForName("Kniebeugen").start).toBe(180);
  });
  test("unbekannt -> null", () => {
    expect(suggestForName("Gitarre üben")).toBeNull();
    expect(suggestForName("")).toBeNull();
  });
});

describe("variantStartSuggestion", () => {
  test("schwerer und leichter", () => {
    expect(variantStartSuggestion(200, "", "+10 kg")).toBe(120);
    expect(variantStartSuggestion(120, "+10 kg", "")).toBe(200);
    expect(variantStartSuggestion(40, "+20 kg", "+10 kg")).toBe(60);
    expect(variantStartSuggestion(5, "", "Weste", "km")).toBe(3);
  });
});
