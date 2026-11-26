import { detectExerciseKind, iconForExercise, editDistance, exerciseLabel, splitVariant, CATALOG } from "./exercises";
import { ICON_KEYS } from "../components/ExerciseIcon";

// Testliste: Name -> erwartete Übungsart (Groß/Klein, Umlaute, Bindestriche,
// Plural, EN/DE/ES/FR, Tippfehler).
const CASES = [
  // Kern-Übungen
  ["Lauf", "lauf"], ["Laufen", "lauf"], ["Running", "lauf"], ["Joggen", "lauf"], ["Dauerlauf", "lauf"],
  ["Correr", "lauf"], ["Course à pied", "lauf"], ["run", "lauf"],
  ["Liegestütze", "liege"], ["Liegestuetze", "liege"], ["LIEGESTÜTZ", "liege"], ["Push-Ups", "liege"],
  ["push ups", "liege"], ["Flexiones", "liege"], ["Pompes", "liege"], ["Liegestüzte", "liege"],
  ["Klimmzüge", "klimm"], ["Klimmzuege", "klimm"], ["Pull-ups", "klimm"], ["Chin-Ups", "klimm"],
  ["Dominadas", "klimm"], ["Tractions", "klimm"],
  ["Radfahren", "rad"], ["Fahrrad", "rad"], ["Cycling", "rad"], ["Bike", "rad"], ["Rennrad", "rad"],
  ["Ciclismo", "rad"], ["Vélo", "rad"], ["Rad", "rad"],
  ["Schwimmen", "schwimm"], ["Swimming", "schwimm"], ["Natación", "schwimm"], ["Natation", "schwimm"],
  ["Gehen", "gehen"], ["Spazieren", "gehen"], ["Schritte", "gehen"], ["Walking", "gehen"],
  ["Steps", "gehen"], ["Caminar", "gehen"], ["Marche", "gehen"],
  ["Kniebeugen", "squat"], ["Squats", "squat"], ["Sentadillas", "squat"], ["Flexions de jambes", "squat"],
  // Weitere
  ["Sit-Ups", "situps"], ["situps", "situps"], ["Crunches", "situps"], ["Abdominales", "situps"], ["Abdos", "situps"],
  ["Burpees", "burpees"], ["Dips", "dips"], ["Bench Dips", "dips"], ["Fondos", "dips"],
  ["Handstand-Liegestütze", "hspu"], ["HSPU", "hspu"], ["Handstand Push-ups", "hspu"],
  ["Pompes en poirier", "hspu"],
  ["Handstand", "handstand"], ["Parada de manos", "handstand"], ["Poirier", "handstand"],
  ["Ausfallschritte", "lunge"], ["Lunges", "lunge"], ["Zancadas", "lunge"], ["Fentes", "lunge"],
  ["Seilspringen", "rope"], ["Jump Rope", "rope"], ["Saltar la comba", "rope"], ["Corde à sauter", "rope"],
  ["Plank", "plank"], ["Unterarmstütz", "plank"], ["Side Plank", "plank"], ["Plancha", "plank"], ["Gainage", "plank"],
  ["Dead Hang", "deadhang"], ["Toter Hang", "deadhang"], ["Hängen", "deadhang"],
  ["Wandsitzen", "wallsit"], ["Wall Sit", "wallsit"], ["La chaise", "wallsit"],
  // Neue Arten ohne Rang-Tabelle
  ["Mountain Climbers", "mountainclimber"], ["Bergsteiger", "mountainclimber"], ["Escaladores", "mountainclimber"],
  ["Kreuzheben", "deadlift"], ["Deadlift", "deadlift"], ["Peso muerto", "deadlift"], ["Soulevé de terre", "deadlift"],
  ["Bankdrücken", "bench"], ["Bench Press", "bench"], ["Press de banca", "bench"], ["Développé couché", "bench"],
  ["Schulterdrücken", "ohp"], ["Overhead Press", "ohp"], ["Push Press", "ohp"], ["Développé militaire", "ohp"],
  ["Rudern", "row"], ["Rowing", "row"], ["Remo", "row"], ["Aviron", "row"],
  ["Klettern", "climb"], ["Bouldern", "climb"], ["Climbing", "climb"], ["Escalada", "climb"], ["Escalade", "climb"],
  ["Boxen", "box"], ["Boxing", "box"], ["Boxeo", "box"], ["Boxe", "box"],
  ["Yoga", "yoga"], ["Dehnen", "yoga"], ["Stretching", "yoga"], ["Estiramientos", "yoga"], ["Étirements", "yoga"],
  ["Treppensteigen", "stairs"], ["Treppenlauf", "stairs"], ["Stairs", "stairs"], ["Escaleras", "stairs"], ["Escaliers", "stairs"],
  ["Wandern", "wandern"], ["Hiking", "wandern"], ["Senderismo", "wandern"], ["Randonnée", "wandern"],
  ["Box Jumps", "jumps"], ["Hampelmann", "jumps"],
  // Unbekanntes bleibt unbekannt
  ["Lesen", null], ["Meditation", null], ["", null], ["Boden", null],
];

describe("detectExerciseKind", () => {
  test.each(CASES)("%s -> %s", (name, kind) => {
    expect(detectExerciseKind(name)).toBe(kind);
  });
});

describe("iconForExercise", () => {
  test("liefert passende Icons", () => {
    expect(iconForExercise("Liegestütze")).toBe("pushup");
    expect(iconForExercise("Kniebeugen")).toBe("squat");
    expect(iconForExercise("Wandern")).toBe("hike");
    expect(iconForExercise("Spazieren")).toBe("walk");
    expect(iconForExercise("Lesen")).toBeNull();
  });

  test("jedes Icon im Katalog existiert in ExerciseIcon", () => {
    for (const e of CATALOG) expect(ICON_KEYS).toContain(e.icon);
  });
});

test("editDistance zählt Vertauschungen als 1", () => {
  expect(editDistance("liegestuzte", "liegestutze")).toBe(1);
  expect(editDistance("abc", "abc")).toBe(0);
});

test("exerciseLabel hängt die Variante an", () => {
  expect(exerciseLabel({ name: "Liegestütze", variant: " +10 kg " })).toBe("Liegestütze · +10 kg");
  expect(exerciseLabel({ name: "Liegestütze" })).toBe("Liegestütze");
});

test("Variante beeinflusst die Erkennung der Übungsart nicht", () => {
  expect(detectExerciseKind("Liegestütze")).toBe("liege");
});

describe("splitVariant: Variante aus dem Namen lösen", () => {
  test.each([
    ["Liegestütze +20 kg", "Liegestütze", "+20 kg"],
    ["Liegestütze + 20kg", "Liegestütze", "+20 kg"],
    ["Liegestütze 20 KG", "Liegestütze", "+20 kg"],
    ["Klimmzüge mit 10 kg Weste", "Klimmzüge", "+10 kg Weste"],
    ["Kniebeugen (7,5 kg)", "Kniebeugen", "+7,5 kg"],
    ["Squats 7.5kg", "Squats", "+7,5 kg"],
    ["Dips · +15 kg", "Dips", "+15 kg"],
    ["Pull-ups with 20 lbs", "Pull-ups", "+20 lbs"],
    ["Sentadillas con 10 kg", "Sentadillas", "+10 kg"],
    ["Pompes avec 5 kg", "Pompes", "+5 kg"],
    ["+10 kg Liegestütze", "Liegestütze", "+10 kg"],
    ["Kniebeugen einbeinig", "Kniebeugen", "einbeinig"],
    ["One-arm push-ups", "push-ups", "One-arm"],
    ["Klimmzüge mit Weste", "Klimmzüge", "mit Weste"],
    ["Flexiones a un brazo", "Flexiones", "a un brazo"],
    // bleibt unverändert
    ["Lauf 5 km", "Lauf 5 km", ""],
    ["Plank 3 min", "Plank 3 min", ""],
    ["Liegestütze", "Liegestütze", ""],
    ["20 kg", "20 kg", ""],
    ["Weste", "Weste", ""],
    ["Westernreiten", "Westernreiten", ""],
  ])("%s", (input, name, variant) => {
    expect(splitVariant(input)).toEqual({ name, variant });
  });
});
