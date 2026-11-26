import {
  isTimeUnit, secondsToUnit, formatClock, adjustSeconds, matchVoiceCommand, speechLang,
  coachCues, coachTargetSeconds, unitSeconds,
} from "./stopwatch";

describe("Stoppuhr", () => {
  test("Zeit-Einheiten erkennen", () => {
    expect(isTimeUnit("s")).toBe(true);
    expect(isTimeUnit("Sek.")).toBe(true);
    expect(isTimeUnit("min")).toBe(true);
    expect(isTimeUnit("h")).toBe(true);
    expect(isTimeUnit("km")).toBe(false);
    expect(isTimeUnit("")).toBe(false);
    expect(isTimeUnit("Tage")).toBe(false);
    expect(isTimeUnit("ms")).toBe(false);
    expect(unitSeconds("min")).toBe(60);
  });
  test("Sekunden in die Einheit umrechnen", () => {
    expect(secondsToUnit(75.4, "s")).toBe(75);
    expect(secondsToUnit(75, "min")).toBe(1.3);
    expect(secondsToUnit(5400, "h")).toBe(1.5);
    expect(secondsToUnit(-3, "s")).toBe(0);
  });
  test("Anzeige + Nachjustieren", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(adjustSeconds(0, -1)).toBe(0);
  });
});

describe("Sprachbefehle", () => {
  test("ganze Sätze auf Deutsch", () => {
    expect(matchVoiceCommand("Starte die Stoppuhr")).toBe("start");
    expect(matchVoiceCommand("start")).toBe("start");
    expect(matchVoiceCommand("und los")).toBe("start");
    expect(matchVoiceCommand("Stopp")).toBe("stop");
    expect(matchVoiceCommand("stoppe dich Stoppuhr")).toBe("stop");
    expect(matchVoiceCommand("Zeit stopp")).toBe("stop");
    expect(matchVoiceCommand("beginne von vorn")).toBe("restart");
    expect(matchVoiceCommand("nochmal neu")).toBe("restart");
    expect(matchVoiceCommand("starte die Stoppuhr neu")).toBe("restart");
    expect(matchVoiceCommand("brich ab")).toBe("cancel");
    expect(matchVoiceCommand("breche ab")).toBe("cancel");
    expect(matchVoiceCommand("abbrechen")).toBe("cancel");
    expect(matchVoiceCommand("eintragen")).toBe("save");
  });
  test("andere Sprachen", () => {
    expect(matchVoiceCommand("go")).toBe("start");
    expect(matchVoiceCommand("STOP")).toBe("stop");
    expect(matchVoiceCommand("para")).toBe("stop");
    expect(matchVoiceCommand("arrête")).toBe("stop");
    expect(matchVoiceCommand("restart")).toBe("restart");
    expect(matchVoiceCommand("guardar")).toBe("save");
  });
  test("Wortteile zählen nicht", () => {
    expect(matchVoiceCommand("Stoppuhr")).toBeNull();
    expect(matchVoiceCommand("starter")).toBeNull();
    expect(matchVoiceCommand("hallo wie geht's")).toBeNull();
    expect(matchVoiceCommand("")).toBeNull();
  });
  test("Erkennungs-Sprache", () => {
    expect(speechLang("de")).toBe("de-DE");
    expect(speechLang("xx")).toBe("en-US");
  });
});

describe("Sprachcoach", () => {
  const cues = (a, b, t) => coachCues(a, b, t).map((c) => c.type + (c.n ?? c.s ?? ""));
  test("mit Ziel: Halbzeit, noch 30/10, 3-2-1, geschafft", () => {
    expect(cues(59, 60, 120)).toEqual(["half"]);
    expect(cues(89, 90, 120)).toEqual(["left30"]);
    expect(cues(109, 110, 120)).toEqual(["left10"]);
    expect(cues(116.8, 117.2, 120)).toEqual(["count3"]);
    expect(cues(118.8, 119.2, 120)).toEqual(["count1"]);
    expect(cues(119.5, 120.1, 120)).toEqual(["goal"]);
    expect(cues(179, 180, 120)).toEqual(["elapsed180"]);
    expect(cues(10, 11, 120)).toEqual([]);
  });
  test("ohne Ziel: Zwischenzeiten", () => {
    expect(cues(29, 30, 0)).toEqual(["elapsed30"]);
    expect(cues(59, 61, 0)).toEqual(["elapsed60"]);
    expect(cues(239, 240, 0)).toEqual(["elapsed240"]);
    expect(cues(40, 50, 0)).toEqual([]);
  });
  test("Ziel aus dem Wochenrest", () => {
    expect(coachTargetSeconds(300, 120, "Sek.")).toBe(180);
    expect(coachTargetSeconds(5, 3.5, "min")).toBe(90);
    expect(coachTargetSeconds(100, 120, "s")).toBe(0);
  });
});

describe("unbekannte Einheit", () => {
  test("keine Zeit, kein Absturz", () => {
    expect(isTimeUnit("Runden")).toBe(false);
    expect(unitSeconds("Runden")).toBe(1);
    expect(secondsToUnit(12.4, "Runden")).toBe(12);
  });
});
