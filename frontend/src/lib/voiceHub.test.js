import { describe, it, expect } from "vitest";
import { cleanSpeech, routeStopwatch, mentionsStopwatch } from "./voiceHub";
import { findSpokenExercise } from "./voiceLog";

describe("cleanSpeech", () => {
  it("entfernt Füllwörter", () => {
    expect(cleanSpeech("Hallo starte die Stoppuhr jetzt")).toBe("starte die Stoppuhr");
    expect(cleanSpeech("äh also heute 10 km gelaufen bitte")).toBe("heute 10 km gelaufen");
    expect(cleanSpeech("hey, okay, start the timer please")).toBe("start the timer");
    expect(cleanSpeech("hola, por favor empieza el cronómetro")).toBe("empieza el cronómetro");
    expect(cleanSpeech("bonjour, euh, lance le chrono s'il te plaît")).toBe("lance le chrono");
  });
  it("lässt Befehle wie „halt“ stehen", () => {
    expect(cleanSpeech("halt")).toBe("halt");
  });
});

describe("routeStopwatch", () => {
  const plank = { key: "p", name: "Plank", unit: "min" };
  const wall = { key: "w", name: "Wandsitzen", unit: "s" };
  const run = (text, list) => routeStopwatch(text, list, findSpokenExercise);
  it("braucht Stoppuhr-Wort oder Übungsnamen", () => {
    expect(run("starte", [plank, wall])).toBeNull();
    expect(run("heute 10 km gelaufen", [plank])).toBeNull();
    expect(mentionsStopwatch("starte die Stoppuhr")).toBe(true);
  });
  it("eine Stoppuhr-Übung: direkt", () => {
    expect(run("starte die Stoppuhr", [plank])).toEqual({ cmd: "start", key: "p" });
  });
  it("mehrere: Name im Satz oder Rückfrage", () => {
    expect(run("starte die Stoppuhr für Wandsitzen", [plank, wall])).toEqual({ cmd: "start", key: "w" });
    expect(run("starte Plank", [plank, wall])).toEqual({ cmd: "start", key: "p" });
    expect(run("starte die Stoppuhr", [plank, wall])).toEqual({ cmd: "start", ask: true });
  });
  it("stopp ohne Namen gilt der laufenden Stoppuhr", () => {
    expect(run("stopp", [plank, wall])).toEqual({ cmd: "stop", active: true });
    expect(run("Stoppuhr speichern", [plank, wall])).toEqual({ cmd: "save", active: true });
  });
  it("ohne Stoppuhr-Übungen nichts", () => {
    expect(run("starte die Stoppuhr", [])).toBeNull();
  });
});
