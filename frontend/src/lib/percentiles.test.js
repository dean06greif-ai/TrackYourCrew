import { statKindItems, newPercentileLevels } from "./percentiles";

describe("statKindItems", () => {
  test("erkennt Art und Umrechnung", () => {
    const items = statKindItems([
      { key: "a", name: "Liegestütze", unit: "" },
      { key: "b", name: "Lauf", unit: "km" },
      { key: "c", name: "Laufen", unit: "m" },
      { key: "d", name: "Plank", unit: "min" },
    ]);
    expect(items).toEqual([
      { key: "a", kind: "liege", factor: 1 },
      { key: "b", kind: "lauf", factor: 1 },
      { key: "c", kind: "lauf", factor: 0.001 },
      { key: "d", kind: "plank", factor: 60 },
    ]);
  });
  test("ohne Rang-Tabelle, Varianten oder unpassende Einheit -> weg", () => {
    expect(statKindItems([
      { key: "a", name: "Liegestütze", unit: "", variant: "+10 kg" },
      { key: "b", name: "Lauf", unit: "min" },
      { key: "c", name: "Gitarre üben", unit: "" },
    ])).toEqual([]);
  });
});

describe("newPercentileLevels", () => {
  test("nur neue oder bessere Stufen", () => {
    const kinds = { liege: { level: 10, n: 60 }, lauf: { level: 25, n: 55 }, klimm: { level: null, n: 70 } };
    expect(newPercentileLevels(kinds, { liege: 10, lauf: 50 })).toEqual([{ kind: "lauf", level: 25, n: 55 }]);
    expect(newPercentileLevels(kinds, {})).toHaveLength(2);
  });
});
