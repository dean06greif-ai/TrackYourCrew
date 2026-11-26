import { RANK_THRESHOLDS, getRankForExercise, getRankThresholds, detectRankExercise, variantRankFactor } from "./ranks";

// Bestwert eines neuen Nutzers in Woche w mit Startwert + 5 %/Woche, gerundet wie
// der Server (_compute_progression: km auf 0,1, sonst ganze Zahlen).
function goalInWeek(start, w, km) {
  const raw = start * Math.pow(1.05, w - 1);
  return km ? Math.round(raw * 10) / 10 : Math.round(raw);
}

describe("Rang-Tabelle (docs/RANG-TABELLE.md)", () => {
  test.each([
    ["Lauf", "km", 5, true],
    ["Liegestütze", "", 150, false],
    ["Klimmzüge", "", 20, false],
  ])("%s: neuer Nutzer erreicht E in Woche 3, nicht früher", (name, unit, start, km) => {
    const ex = { name, unit };
    expect(getRankForExercise(ex, goalInWeek(start, 2, km)).letter).toBe("F");
    expect(getRankForExercise(ex, goalInWeek(start, 3, km)).letter).toBe("E");
  });

  test("Schwellen steigen streng, S+ ist die höchste Stufe", () => {
    for (const [kind, tiers] of Object.entries(RANK_THRESHOLDS)) {
      expect(tiers.map((t) => t.letter)).toEqual(["F", "E", "D", "C", "B", "A", "S", "S+"]);
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].min).toBeGreaterThan(tiers[i - 1].min);
      }
      expect(kind).toBeTruthy();
    }
  });

  test("Elite-Werte aus der Tabelle", () => {
    expect(getRankForExercise({ name: "Laufen", unit: "km" }, 150).letter).toBe("S+");
    expect(getRankForExercise({ name: "Laufen", unit: "km" }, 149).letter).toBe("S");
    expect(getRankForExercise({ name: "Liegestütze" }, 4000).letter).toBe("S+");
    expect(getRankForExercise({ name: "Kniebeugen" }, 700).letter).toBe("C");
  });

  test("Zeit-Übungen: Tabelle in Minuten, Umrechnung bei Sekunden/Minuten", () => {
    expect(getRankForExercise({ name: "Plank", unit: "min" }, 5).letter).toBe("E");
    expect(getRankForExercise({ name: "Plank", unit: "s" }, 300).letter).toBe("E");
    expect(getRankForExercise({ name: "Plank", unit: "s" }, 299).letter).toBe("F");
  });

  test("Gehen in Schritten: 1.300 Schritte ≈ 1 km", () => {
    const tiers = getRankThresholds("gehen", "Schritte");
    expect(tiers[1].min).toBe(19500);
  });

  test("Übungsarten ohne Rang-Tabelle haben keinen Rang", () => {
    expect(detectRankExercise({ name: "Rudern" })).toBeNull();
    expect(getRankForExercise({ name: "Yoga" }, 100)).toBeNull();
  });

  test("Name zählt vor dem Schlüssel (alte Standard-Schlüssel)", () => {
    expect(detectRankExercise({ name: "Kniebeugen", key: "ex2" })).toBe("squat");
    expect(detectRankExercise({ name: "", key: "liege" })).toBe("liege");
  });
});

describe("Varianten (Faktor auf alle Schwellen, auch S+)", () => {
  test.each([
    ["", 1], ["+5 kg", 0.8], ["+10 kg", 0.6], ["10kg Weste", 0.6], ["+20 kg", 0.4],
    ["+30 kg", 0.3], ["+45 kg", 0.3], ["+7,5 kg", 0.7], ["einbeinig", 0.6], ["Weste", 0.6],
  ])("%s -> %s", (variant, factor) => {
    expect(variantRankFactor(variant)).toBeCloseTo(factor, 5);
  });

  test("Liegestütze +10 kg: E 99, S+ 2.400 (Rang-Tabelle)", () => {
    const tiers = getRankThresholds("liege", "", "+10 kg");
    expect(tiers[1].min).toBe(99);
    expect(tiers[7].min).toBe(2400);
    expect(getRankForExercise({ name: "Liegestütze", variant: "+10 kg" }, 99).letter).toBe("E");
    expect(getRankForExercise({ name: "Liegestütze" }, 99).letter).toBe("F");
  });
});
