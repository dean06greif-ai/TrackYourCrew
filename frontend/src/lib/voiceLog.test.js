import { parseVoiceLog, wordsToDigits, isDone, spokenDigits } from "./voiceLog";

const EX = [
  { key: "lauf", name: "Lauf", unit: "km" },
  { key: "push", name: "Liegestütze", unit: "" },
  { key: "pull", name: "Klimmzüge", unit: "" },
  { key: "plank", name: "Plank", unit: "Sek." },
];
const EX_EN = [
  { key: "run", name: "Running", unit: "km" },
  { key: "pu", name: "Push-ups", unit: "" },
];
const p = (text, ex = EX, today = 3) => parseVoiceLog(text, ex, today);

describe("Zahlwörter", () => {
  test.each([
    ["zehn km", "10 km"],
    ["fünfundzwanzig", "25"],
    ["hundertfünfzig", "150"],
    ["zweihundert", "200"],
    ["twenty five push ups", "25 push ups"],
    ["one hundred fifty", "150"],
    ["treinta y cinco", "35"],
    ["veinticinco", "25"],
    ["vingt-cinq", "25"],
    ["5,5 km", "5.5 km"],
    ["fünf komma fünf", "5.5"],
    ["zehneinhalb", "10.5"],
    ["ten and a half", "10.5"],
  ])("%s -> %s", (input, out) => {
    expect(wordsToDigits(input)).toBe(out);
  });
});

describe("Zahlen und Einheiten (alle 4 Sprachen)", () => {
  const E = [
    { key: "lauf", name: "Lauf", unit: "km" }, { key: "push", name: "Liegestütze", unit: "" },
    { key: "plank", name: "Plank", unit: "s" }, { key: "rad", name: "Radfahren", unit: "min" },
  ];
  test.each([
    ["eine Minute dreißig Plank", "plank", 90], ["2 Minuten und 15 Sekunden Plank", "plank", 135], ["Plank 1:30", "plank", 90],
    ["1 hour 20 minutes cycling", "rad", 80], ["half an hour cycling", "rad", 30], ["media hora en bici", "rad", 30], ["une demi-heure de vélo", "rad", 30],
    ["einhundertzwanzig Liegestütze", "push", 120], ["one hundred and twenty push-ups", "push", 120], ["twenty-five push-ups", "push", 25],
    ["doscientas flexiones", "push", 200], ["veintiún flexiones", "push", 21],
    ["deux cents pompes", "push", 200], ["quatre vingt dix pompes", "push", 90], ["soixante et onze pompes", "push", 71], ["dix sept pompes", "push", 17],
    ["ein halber Kilometer gelaufen", "lauf", 0.5], ["half a kilometer run", "lauf", 0.5], ["un demi kilomètre couru", "lauf", 0.5],
    ["5km gelaufen", "lauf", 5], ["ran a 5k", "lauf", 5], ["5 km und 300 Meter gelaufen", "lauf", 5.3], ["cinco punto dos kilómetros", "lauf", 5.2],
    ["tausend Meter gelaufen", "lauf", 1], ["Plank 45s", "plank", 45], ["Plank 30 Sek.", "plank", 30], ["a minute plank", "plank", 60],
  ])("%s", (text, key, amount) => {
    expect(parseVoiceLog(text, E, 3).items[0]).toMatchObject({ key, amount });
  });
});

describe("alle 4 Sprachen, egal welche App-Sprache", () => {
  const E = [...EX, { key: "gym", name: "Gym", unit: "×", type: "activity" }];
  test.each([
    ["today I did 20 push-ups and ran 5 km, that's it", ["push", "lauf"], "day", true],
    ["hoy hice 20 flexiones y corrí 5 km, listo", ["push", "lauf"], "day", true],
    ["aujourd'hui j'ai fait 20 pompes et couru 5 km, c'est tout", ["push", "lauf"], "day", true],
    ["I did another 10 push-ups", ["push"], "add", false],
    ["otras 10 flexiones", ["push"], "add", false],
    ["encore 10 pompes", ["push"], "add", false],
    ["en total 120 flexiones", ["push"], "set", false],
    ["au total 120 pompes", ["push"], "set", false],
    ["hoy fui al gimnasio", ["gym"], "add", false],
    ["aujourd'hui je suis allé à la salle", ["gym"], "add", false],
  ])("%s", (text, keys, mode, done) => {
    const r = parseVoiceLog(text, E, 3);
    expect(r.items.map((i) => i.key)).toEqual(keys);
    if (keys[0] !== "gym") expect(r.items[0].mode).toBe(mode);
    expect(r.done).toBe(done);
  });
});

describe("unscharfe Zuordnung (nur eigene Übungen)", () => {
  const MINE = [
    { key: "kb", name: "Kniebeugen", unit: "" },
    { key: "bur", name: "Burpees", unit: "" },
    { key: "pull", name: "Klimmzüge", unit: "" },
  ];
  test("verhörte Namen werden der eigenen Übung zugeordnet", () => {
    expect(p("heute 20 Knie Beuge gemacht", MINE).items[0]).toMatchObject({ key: "kb", amount: 20 });
    expect(p("15 Bör Pies", MINE).items[0]).toMatchObject({ key: "bur", amount: 15 });
    expect(p("8 Klim Züge", MINE).items[0]).toMatchObject({ key: "pull", amount: 8 });
    expect(p("12 Kniebeuge", MINE).items[0]).toMatchObject({ key: "kb" });
  });
  test("nur gegen die aktuellen Übungen: Fremdes bleibt unbekannt", () => {
    const r = p("20 Sit-ups", MINE);
    expect(r.items).toEqual([]);
    expect(r.unknown.length).toBe(1);
  });
  test("Ähnlichkeit", async () => {
    const { fuzzyScore } = await import("./voiceLog");
    expect(fuzzyScore("liegestutzen", "Liegestütze")).toBeGreaterThan(0.85);
    expect(fuzzyScore("gemacht", "Plank")).toBeLessThan(0.5);
  });
});

describe("Tagesstand oder dazu (genau sein)", () => {
  test("mit Tagesangabe = Stand des Tages", () => {
    expect(p("ich habe heute 10 Liegestütze gemacht").items[0]).toMatchObject({ key: "push", amount: 10, mode: "day", day: 3 });
    expect(p("gestern 5 km gelaufen").items[0]).toMatchObject({ mode: "day", day: 2 });
    expect(p("heute 10 km und 20 Liegestütze").items.map((i) => i.mode)).toEqual(["day", "day"]);
  });
  test("noch / weitere = dazu", () => {
    expect(p("heute noch 10 Liegestütze").items[0].mode).toBe("add");
    expect(p("I did another 10 push-ups today").items[0].mode).toBe("add");
  });
  test("ohne Tagesangabe = dazu, insgesamt = Wochensumme", () => {
    expect(p("10 Liegestütze gemacht").items[0].mode).toBe("add");
    expect(p("insgesamt 120 Liegestütze").items[0].mode).toBe("set");
  });
});

describe("Übung, Menge, Einheit", () => {
  test("Satz mit Verb und km", () => {
    expect(p("heute bin ich 10 km gelaufen").items).toEqual([{ key: "lauf", amount: 10, day: 3, mode: "day" }]);
  });
  test("mehrere Übungen in einem Satz", () => {
    const r = p("10 km gelaufen und 50 Liegestütze, dann noch zwanzig Klimmzüge");
    expect(r.items.map((i) => [i.key, i.amount])).toEqual([["lauf", 10], ["push", 50], ["pull", 20]]);
  });
  test("Zeit wird in die Einheit der Übung umgerechnet", () => {
    expect(p("zwei Minuten Plank").items[0]).toMatchObject({ key: "plank", amount: 120 });
    expect(p("Plank 1,5 Minuten").items[0]).toMatchObject({ key: "plank", amount: 90 });
  });
  test("Meter in km", () => {
    expect(p("800 Meter gelaufen").items[0]).toMatchObject({ key: "lauf", amount: 0.8 });
  });
  test("nur Einheit, einzige passende Übung", () => {
    expect(p("heute 7 km").items[0]).toMatchObject({ key: "lauf", amount: 7 });
  });
  test("englisch und Verben", () => {
    const r = parseVoiceLog("I ran 5 km and did 30 push ups", EX_EN, 1);
    expect(r.items.map((i) => [i.key, i.amount])).toEqual([["run", 5], ["pu", 30]]);
  });
  test("spanisch und französisch", () => {
    expect(parseVoiceLog("corrí 8 km", EX_EN, 1).items[0]).toMatchObject({ key: "run", amount: 8 });
    expect(parseVoiceLog("j'ai couru 6 km", EX_EN, 1).items[0]).toMatchObject({ key: "run", amount: 6 });
  });
  test("unbekannte Übung landet in unknown", () => {
    const r = p("30 Burpees");
    expect(r.items).toEqual([]);
    expect(r.unknown).toEqual(["30 burpees"]);
  });
});

describe("Tag und Modus", () => {
  test("gestern / Wochentag", () => {
    expect(p("gestern 5 km gelaufen").items[0].day).toBe(2);
    expect(p("am Montag 40 Liegestütze").items[0].day).toBe(0);
    expect(p("am Samstag 40 Liegestütze").items[0].day).toBe(3); // Zukunft -> heute
  });
  test("insgesamt setzt die Wochensumme", () => {
    expect(p("insgesamt 120 Liegestütze").items[0].mode).toBe("set");
  });
});

describe("Ende-Wörter", () => {
  test.each(["das war's", "Das wars", "fertig", "that's it", "eso es todo", "c'est tout"])("%s", (w) => {
    expect(isDone(`10 km gelaufen ${w}`)).toBe(true);
  });
  test("Ende-Wort stört die Erkennung nicht", () => {
    const r = p("50 Liegestütze das war's");
    expect(r.done).toBe(true);
    expect(r.items[0]).toMatchObject({ key: "push", amount: 50 });
  });
});

describe("Aktivitäten", () => {
  const WITH_ACT = [...EX, { key: "gym", name: "Gym", unit: "×", type: "activity" }, { key: "yoga", name: "Yoga", unit: "×", type: "activity" }];
  test("ohne Zahl abhaken, heute und gestern", () => {
    expect(parseVoiceLog("heute war ich im Gym", WITH_ACT, 3).items).toEqual([{ key: "gym", amount: 1, day: 3, mode: "add" }]);
    expect(parseVoiceLog("gestern Yoga gemacht", WITH_ACT, 3).items[0]).toMatchObject({ key: "yoga", day: 2 });
  });
  test("gemischt mit Übungen", () => {
    const r = parseVoiceLog("10 km gelaufen und war im Fitnessstudio", WITH_ACT, 3);
    expect(r.items.map((i) => i.key)).toEqual(["lauf", "gym"]);
  });
  test("Zahl bei Aktivität zählt nur als ein Tag", () => {
    expect(parseVoiceLog("2 Stunden Gym", WITH_ACT, 3).items).toEqual([{ key: "gym", amount: 1, day: 3, mode: "add" }]);
  });
});

describe("keine / löschen (Dean 2026-11-27)", () => {
  test("„Today I have done no push-ups“ = heute 0", () => {
    const r = parseVoiceLog("Today I have done no push-ups", EX_EN, 3);
    expect(r.items).toEqual([expect.objectContaining({ amount: 0, day: 3, mode: "day" })]);
  });
  test("„heute keine Liegestütze“ = heute 0, Zahl im Satz hat Vorrang", () => {
    expect(parseVoiceLog("heute keine Liegestütze", EX, 2).items[0]).toMatchObject({ amount: 0, day: 2, mode: "day" });
    expect(parseVoiceLog("no, 20 Liegestütze", EX, 2).items[0].amount).toBe(20);
  });
  test("„Delete all my progress today“ = alle Übungen heute 0 (mit clear)", () => {
    const r = parseVoiceLog("Delete all my progress today", EX_EN, 4);
    expect(r.clear).toBe(true);
    expect(r.items.length).toBe(EX_EN.length);
    r.items.forEach((it) => expect(it).toMatchObject({ amount: 0, day: 4, mode: "day", clear: true }));
  });
  test("„lösch meine Liegestütze von heute“ = nur diese Übung", () => {
    const r = parseVoiceLog("lösch meine Liegestütze von heute", EX, 1);
    expect(r.items.length).toBe(1);
  });
  test("ganze Woche löschen wird abgelehnt", () => {
    const r = parseVoiceLog("Delete all my progress for this week", EX_EN, 4);
    expect(r.refused).toBe("week");
    expect(r.items).toEqual([]);
  });
});

describe("Übung schlägt Aktivität mit ähnlicher Art (Dean 2026-11-27)", () => {
  const EXA = [
    { key: "pull", name: "Klimmzüge", unit: "" },
    { key: "act", name: "Pull", unit: "×", type: "activity" },
  ];
  test("„habe heute 10 Klimmzüge gemacht“ -> Klimmzüge, nicht Aktivität Pull", () => {
    const r = parseVoiceLog("habe heute 10 Klimmzüge gemacht", EXA, 2);
    expect(r.items).toEqual([{ key: "pull", amount: 10, day: 2, mode: "day" }]);
  });
  test("„heute war ich bei Pull“ -> Aktivität (Name genau genannt)", () => {
    const r = parseVoiceLog("heute war ich bei Pull", EXA, 2);
    expect(r.items).toEqual([{ key: "act", amount: 1, day: 2, mode: "add" }]);
  });
});

describe("Anzeige mit Ziffern (Dean 2026-11-27)", () => {
  test.each([
    ["Ich habe zehn Liegestütze gemacht", "Ich habe 10 Liegestütze gemacht"],
    ["heute fünfundzwanzig Klimmzüge", "heute 25 Klimmzüge"],
    ["I did twenty five push-ups", "I did 25 push-ups"],
    ["treinta y cinco flexiones", "35 flexiones"],
    ["eine Runde Laufen", "eine Runde Laufen"],
    ["Lauf zehn Kilometer.", "Lauf 10 Kilometer."],
  ])("%s", (a, b) => expect(spokenDigits(a)).toBe(b));
});

describe("Übung schlägt gleichartige Aktivität – alle üblichen Paare (Dean 2026-11-27)", () => {
  test.each([
    ["Liegestütze", "Push", "heute 20 Liegestütze gemacht", "heute war ich bei Push"],
    ["Push-ups", "Push day", "today I did 20 push-ups", "today I went to push day"],
    ["Klimmzüge", "Pull", "habe heute 10 Klimmzüge gemacht", "heute war ich bei Pull"],
    ["Lauf", "Laufen", "heute 5 km gelaufen", "heute war ich laufen"],
    ["Kniebeugen", "Leg Day", "heute 30 Kniebeugen", "heute war Leg Day"],
  ])("%s ↔ Aktivität %s", (exName, actName, exSay, actSay) => {
    const list = [
      { key: "ex", name: exName, unit: exName === "Lauf" ? "km" : "" },
      { key: "act", name: actName, unit: "×", type: "activity" },
    ];
    expect(parseVoiceLog(exSay, list, 2).items.map((i) => i.key)).toEqual(["ex"]);
    expect(parseVoiceLog(actSay, list, 2).items.map((i) => i.key)).toEqual(["act"]);
  });
});
