import { reachedMilestones, reachedCrewMilestones, totalsByKind, moonPercent, parseMilestoneId, distanceKm } from "./milestones";

const entry = (exercises, allTime, archived = []) => ({ exercises, archived_exercises: archived, all_time: allTime });

describe("Meilensteine (docs/MEILENSTEINE.md)", () => {
  test("Laufen: Marathon ab 42,2 km, nicht davor", () => {
    const e = (km) => entry([{ key: "ex1", name: "Lauf", unit: "km" }], { ex1: km });
    expect(reachedMilestones(e(42.1)).map((m) => m.id)).toEqual(["lauf:run10", "lauf:half"]);
    expect(reachedMilestones(e(42.2)).map((m) => m.id)).toContain("lauf:marathon");
  });

  test("Einheiten werden umgerechnet (Meilen, Meter, Schritte)", () => {
    const e = entry([{ key: "a", name: "Running", unit: "mi" }], { a: 26.3 });
    expect(reachedMilestones(e).map((m) => m.id)).toContain("lauf:marathon");
    const s = entry([{ key: "b", name: "Schwimmen", unit: "m" }], { b: 2500 });
    expect(reachedMilestones(s).map((m) => m.id)).toEqual(["schwimm:lanes100"]);
  });

  test("Summe über Varianten und abgeschlossene Übungen", () => {
    const e = entry(
      [{ key: "x1", name: "Liegestütze", variant: "+10 kg", unit: "" }],
      { x1: 400, ex2: 700 },
      [{ key: "ex2", name: "Liegestütze", unit: "" }],
    );
    expect(totalsByKind(e).liege.total).toBe(1100);
    expect(reachedMilestones(e).map((m) => m.id)).toEqual(["liege:n1000", "liege:welephant"]);
  });

  test("Bewegtes Gewicht nur bei Liegestützen und Klimmzügen", () => {
    const klimm = entry([{ key: "k", name: "Klimmzüge", unit: "" }], { k: 80 });
    expect(reachedMilestones(klimm).map((m) => m.id)).toEqual(["klimm:welephant"]);
    const squat = entry([{ key: "q", name: "Kniebeugen", unit: "" }], { q: 999 });
    expect(reachedMilestones(squat)).toEqual([]);
  });

  test("Zeit-Übungen: 90 min = Fußballspiel, ohne Einheit Sekunden", () => {
    expect(reachedMilestones(entry([{ key: "p", name: "Plank", unit: "min" }], { p: 90 })).map((m) => m.id)).toEqual(["plank:football"]);
    expect(reachedMilestones(entry([{ key: "p", name: "Plank", unit: "" }], { p: 5400 })).map((m) => m.id)).toEqual(["plank:football"]);
  });

  test("Regional nur in der passenden Sprache", () => {
    const e = entry([{ key: "r", name: "Radfahren", unit: "km" }], { r: 900 });
    expect(reachedMilestones(e, "de").map((m) => m.id)).toContain("rad:germany");
    expect(reachedMilestones(e, "fr").map((m) => m.id)).not.toContain("rad:germany");
    expect(reachedMilestones(e, "es").map((m) => m.id)).toContain("rad:camino");
  });

  test("Unpassende Einheit oder unbekannte Übung: nichts", () => {
    expect(reachedMilestones(entry([{ key: "l", name: "Lauf", unit: "min" }], { l: 999 }))).toEqual([]);
    expect(reachedMilestones(entry([{ key: "y", name: "Lesen", unit: "" }], { y: 99999 }))).toEqual([]);
  });

  test("Crew-Ziele aus der Summe aller Distanzen", () => {
    const a = entry([{ key: "a", name: "Lauf", unit: "km" }], { a: 300 });
    const b = entry([{ key: "b", name: "Radfahren", unit: "km" }], { b: 200 });
    expect(reachedCrewMilestones([a, b]).map((m) => m.id)).toEqual(["crew:crewiss"]);
    expect(distanceKm(a)).toBe(300);
    expect(moonPercent(3844)).toBeCloseTo(1, 5);
  });

  test("IDs sind gültig für den Server (keine Punkte)", () => {
    const e = entry([{ key: "a", name: "Lauf", unit: "km" }, { key: "b", name: "Liegestütze" }], { a: 50000, b: 300000 });
    for (const m of reachedMilestones(e, "de")) expect(m.id).toMatch(/^[a-z0-9_:-]{1,48}$/);
  });

  test("parseMilestoneId", () => {
    expect(parseMilestoneId("liege:n10000")).toEqual({ kind: "liege", mid: "count", count: 10000, family: "count" });
    expect(parseMilestoneId("klimm:wbluewhale")).toEqual({ kind: "klimm", mid: "bluewhale", family: "weight" });
    expect(parseMilestoneId("crew:crewmoon").family).toBe("crew");
    expect(parseMilestoneId("kaputt")).toBeNull();
  });
});
