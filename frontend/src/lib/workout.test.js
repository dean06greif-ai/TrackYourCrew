import { describe, test, expect } from "vitest";
import { buildPhases, phaseAt, totalSeconds, parseRepsSpeech, sum } from "./workout";

describe("Intervall-Ablauf", () => {
  test("Tabata: 3-2-1, 8× 20/10, nach der letzten Runde keine Pause", () => {
    const p = buildPhases(20, 10, 8);
    expect(p[0]).toEqual({ type: "countdown", round: 1, dur: 3 });
    expect(p.filter((x) => x.type === "work")).toHaveLength(8);
    expect(p.filter((x) => x.type === "rest")).toHaveLength(7);
    expect(p[p.length - 1]).toEqual({ type: "work", round: 8, dur: 20 });
    expect(totalSeconds(p)).toBe(3 + 8 * 20 + 7 * 10);
  });
  test("EMOM ohne Pause", () => {
    expect(buildPhases(60, 0, 3).map((x) => x.type)).toEqual(["countdown", "work", "work", "work"]);
  });
  test("Grenzen", () => {
    expect(buildPhases(1, -5, 0).map((x) => x.dur)).toEqual([3, 5]);
  });
  test("phaseAt", () => {
    const p = buildPhases(20, 10, 2);
    expect(phaseAt(p, 0)).toMatchObject({ index: 0, left: 3, done: false });
    expect(phaseAt(p, 3)).toMatchObject({ phase: { type: "work", round: 1 }, left: 20 });
    expect(phaseAt(p, 25)).toMatchObject({ phase: { type: "rest", round: 1 }, left: 8 });
    expect(phaseAt(p, 33)).toMatchObject({ phase: { type: "work", round: 2 } });
    expect(phaseAt(p, 999).done).toBe(true);
  });
});

describe("Wiederholungen per Sprache (alle Sprachen)", () => {
  test.each([
    ["zwölf", { mode: "set", n: 12 }], ["15", { mode: "set", n: 15 }], ["twenty", { mode: "set", n: 20 }],
    ["plus fünf", { mode: "add", n: 5 }], ["noch drei", { mode: "add", n: 3 }], ["another ten", { mode: "add", n: 10 }],
    ["minus zwei", { mode: "add", n: -2 }], ["quince", { mode: "set", n: 15 }], ["douze", { mode: "set", n: 12 }],
    ["hallo", null],
  ])("%s", (text, out) => {
    expect(parseRepsSpeech(text)).toEqual(out);
  });
});

test("sum", () => {
  expect(sum([12, 11, "10", undefined, 0.5])).toBe(33.5);
});
