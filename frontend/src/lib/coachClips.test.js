import { clipId, cueText, coachClips, coachCueList, ELAPSED_MAX_MIN } from "./coachClips";
import { coachCues } from "./stopwatch";
import de from "../i18n/de";
import en from "../i18n/en";
import es from "../i18n/es";
import fr from "../i18n/fr";

const t = (key, params = {}) => String(de[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "");

describe("coachClips", () => {
  test("IDs sind eindeutig und Texte gefüllt", () => {
    const clips = coachClips(t);
    expect(new Set(clips.map((c) => c.id)).size).toBe(clips.length);
    for (const c of clips) expect(c.text && !c.text.startsWith("coach.")).toBeTruthy();
  });

  test("Texte wie bisher in der Stoppuhr", () => {
    expect(cueText({ type: "elapsed", s: 30 }, t)).toBe("30 Sekunden.");
    expect(cueText({ type: "elapsed", s: 60 }, t)).toBe("Eine Minute.");
    expect(cueText({ type: "elapsed", s: 90 }, t)).toBe("Eine Minute 30.");
    expect(cueText({ type: "elapsed", s: 300 }, t)).toBe("5 Minuten.");
    expect(cueText({ type: "count", n: 3 }, t)).toBe("Drei!");
    expect(cueText({ type: "left", n: 10 }, t)).toBe("Noch 10 Sekunden.");
    expect(clipId({ type: "elapsed", s: 90 })).toBe("el90");
    expect(clipId({ type: "go" })).toBe("go");
  });

  test("jede Ansage der Stoppuhr hat eine Aufnahme (bis zur Obergrenze)", () => {
    const ids = new Set(coachCueList().map(clipId));
    const seen = new Set();
    for (const target of [0, 20, 45, 60, 90, 150, 600, 1800]) {
      for (let s = 0; s < ELAPSED_MAX_MIN * 60; s += 1) {
        for (const c of coachCues(s, s + 1, target)) seen.add(clipId(c));
      }
    }
    for (const id of seen) expect(ids.has(id)).toBe(true);
  });
});

describe("harte Ansagen", () => {
  const dicts = { de, en, es, fr };
  test("in allen Sprachen vollständig und anders als normal", () => {
    for (const [code, d] of Object.entries(dicts)) {
      const tt = (key, params = {}) => String(d[key] ?? key).replace(/\{(\w+)\}/g, (_, x) => params[x] ?? "");
      const hard = coachClips(tt, true);
      const normal = coachClips(tt, false);
      hard.forEach((c, i) => {
        expect(c.text.startsWith("coach.")).toBe(false);
        expect(c.text).not.toMatch(/\{\w+\}/);
        if (!/^n\d$/.test(c.id)) expect(c.text).not.toBe(normal[i].text);
      });
      expect(hard.map((c) => c.id)).toEqual(normal.map((c) => c.id));
      expect(code).toBeTruthy();
    }
  });
});
