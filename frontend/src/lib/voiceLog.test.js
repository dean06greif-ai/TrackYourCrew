import { parseVoiceLog, wordsToDigits, isDone } from "./voiceLog";

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
