// Übungs-Erkennung: aus dem frei getippten Namen die Übungsart und das passende
// Icon ableiten. Reine Funktionen (kein React, kein Browser-Speicher), getestet in
// `exercises.test.js`.
//
// Erkennung in drei Stufen:
//  1. Teilwörter im Namen ohne Trennzeichen ("Sit-Ups" -> "situps"), Groß/Klein und
//     Umlaute egal ("Liegestütze" -> "liegestutze", "Liegestuetze" geht auch).
//  2. Wortanfänge einzelner Wörter (für kurze, sonst mehrdeutige Wörter wie "row").
//  3. Tippfehler-tolerant: ganze Wörter mit höchstens 1 (ab 9 Buchstaben 2)
//     vertauschten/fehlenden/falschen Buchstaben ("Liegestüzte", "Klimmzüe").
// Reihenfolge in CATALOG = Priorität: Spezielles zuerst ("Handstand-Liegestütze"
// vor "Handstand", "Ausfallschritte" vor "Schritte", "Push Press" vor "Push-ups").

// Normalform ohne Trennzeichen: "Sit-Ups" -> "situps", "Liegestütze" -> "liegestutze".
export function normalizeName(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

// Einzelne Wörter: "Push-Press (Kurzhantel)" -> ["push", "press", "kurzhantel"].
function tokensOf(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Eintrag: kind (Übungsart, auch Gruppe im Ranking), icon (Schlüssel in
// ExerciseIcon), words (Teilwörter in der Normalform), starts (Wortanfänge),
// exact (ganze Wörter), fuzzy (ganze Wörter für die Tippfehler-Stufe, ab 6 Buchstaben),
// test (Sonderregel).
// Ob eine Art einen Rang hat, steht allein in RANK_THRESHOLDS (ranks.js).
export const CATALOG = [
  {
    kind: "hspu", icon: "handstand",
    words: ["hspu", "handstandpush", "handstandliegest", "pompespoirier", "pompepoirier", "flexionesenparadademanos", "flexionesparadademanos"],
    fuzzy: [],
    test: (n) => /handstand|paradademanos|poirier/.test(n) && /push|liegest|flexion|pompe|press|drueck|druck/.test(n),
  },
  {
    kind: "handstand", icon: "handstand",
    words: ["handstand", "paradademanos", "poirier", "equilibresurlesmains"],
    starts: ["pino"],
    fuzzy: ["handstand"],
  },
  {
    kind: "mountainclimber", icon: "mountainclimber",
    words: ["mountainclimb", "bergsteiger", "escalador", "grimpeur"],
    fuzzy: ["bergsteiger"],
  },
  { kind: "hollow", icon: "hollow", words: ["hollow"], fuzzy: [] },
  {
    kind: "plank", icon: "plank",
    words: ["plank", "planke", "unterarmstutz", "unterarmstuetz", "seitstutz", "seitstuetz", "plancha", "gainage"],
    fuzzy: ["plank", "planke", "plancha", "gainage"],
  },
  {
    kind: "wallsit", icon: "wallsit",
    words: ["wallsit", "wandsitz", "sentadillaenpared", "sentadillapared", "sillaenlapared", "sillapared", "chaise"],
    fuzzy: ["wandsitzen", "wallsit"],
  },
  {
    kind: "deadlift", icon: "deadlift",
    words: ["kreuzheb", "deadlift", "pesomuerto", "soulevedeterre", "souleveterre"],
    fuzzy: ["kreuzheben", "deadlift", "deadlifts"],
  },
  {
    kind: "deadhang", icon: "deadhang",
    words: ["deadhang", "totehang", "toterhang", "totenhang", "colgarse", "colgado", "suspension"],
    exact: ["hangen", "haengen", "hang"],
    fuzzy: ["deadhang", "hangen"],
  },
  { kind: "dips", icon: "dip", words: ["dip", "fondos"], fuzzy: [] },
  {
    kind: "ohp", icon: "ohp",
    words: ["schulterdruck", "schulterdrueck", "shoulderpress", "overheadpress", "militarypress", "pushpress", "pressmilitar", "presshombro", "pressdehombro", "presshombros", "developpemilitaire", "developpeepaules", "uberkopfdruck", "ueberkopfdrueck"],
    fuzzy: ["schulterdrucken"],
  },
  {
    kind: "bench", icon: "bench",
    words: ["bankdruck", "bankdrueck", "benchpress", "bench", "pressdebanca", "pressbanca", "pressdepecho", "developpecouche"],
    fuzzy: ["bankdrucken"],
  },
  { kind: "burpees", icon: "burpee", words: ["burpee", "burpie", "burpi"], fuzzy: ["burpees", "burpee"] },
  {
    kind: "situps", icon: "situp",
    words: ["situp", "crunch", "abdominal", "abdos", "bauchpresse", "bauchmuskel", "bauchtraining"],
    fuzzy: ["situps", "crunches", "crunch"],
  },
  {
    kind: "lunge", icon: "lunge",
    words: ["ausfallschr", "ausfallschritt", "lunge", "zancada", "fente"],
    fuzzy: ["ausfallschritte", "lunges", "zancadas", "fentes"],
  },
  {
    kind: "squat", icon: "squat",
    words: ["kniebeug", "squat", "sentadilla", "flexionsdejambes", "flexiondejambes", "flexionsjambes", "accroupi"],
    fuzzy: ["kniebeugen", "kniebeuge", "squats", "sentadillas"],
  },
  {
    kind: "rope", icon: "jumprope",
    words: ["seilspring", "seilhupf", "seilchen", "ropejump", "ropeskip", "jumprope", "skipping", "springseil", "comba", "saltarcuerda", "saltaralacuerda", "cordeasauter", "cordesauter"],
    fuzzy: ["seilspringen", "springseil"],
  },
  { kind: "highjump", icon: "jump", words: ["highjump", "hochsprung", "hochspring", "saltoalto", "sautenhauteur"], fuzzy: ["hochsprung"] },
  { kind: "weitsprung", icon: "jump", words: ["weitsprung", "weitspring", "longjump", "broadjump", "saltodelongitud", "saltolargo", "sautenlongueur"], fuzzy: ["weitsprung"] },
  { kind: "pogo", icon: "jump", words: ["pogo"], fuzzy: [] },
  // Sprünge allgemein (Box Jumps, Hampelmann, Strecksprünge): Icon, kein Rang.
  {
    kind: "jumps", icon: "jump",
    words: ["jump", "sprung", "sprunge", "spruenge", "hampelmann", "salto", "saut"],
    fuzzy: ["hampelmann", "sprunge"],
  },
  {
    kind: "row", icon: "row",
    words: ["rudern", "ruderger", "ruderma", "rowing", "rameur", "aviron"],
    starts: ["row", "remo", "ruder"],
    fuzzy: ["rudern", "rowing"],
  },
  {
    kind: "climb", icon: "climb",
    words: ["kletter", "bouldern", "boulder", "climbing", "climb", "escalada", "escalade"],
    fuzzy: ["klettern", "bouldern", "climbing"],
  },
  {
    kind: "box", icon: "box",
    words: ["boxen", "boxing", "boxeo", "kickbox", "sandsack", "schattenbox", "shadowbox"],
    starts: ["boxe"],
    fuzzy: ["boxen", "boxing", "boxeo"],
  },
  {
    kind: "yoga", icon: "yoga",
    words: ["yoga", "dehnen", "dehnung", "stretch", "mobility", "mobilit", "estiramiento", "etirement", "pilates"],
    fuzzy: ["dehnen", "stretching", "yoga", "pilates"],
  },
  {
    kind: "stairs", icon: "stairs",
    words: ["treppe", "stair", "stepper", "escalera", "escalier", "hohenmeter", "hoehenmeter"],
    fuzzy: ["treppensteigen", "treppen", "stairs"],
  },
  {
    kind: "wandern", icon: "hike",
    words: ["wander", "hiking", "hike", "senderismo", "randonnee", "trekking"],
    fuzzy: ["wandern", "hiking", "senderismo", "randonnee"],
  },
  {
    kind: "rad", icon: "bike",
    words: ["radfahr", "fahrrad", "rennrad", "radtour", "mountainbike", "biking", "cycling", "velo", "bicicleta", "ciclismo", "cyclisme", "spinning", "indoorcycling"],
    starts: ["bike", "rad", "mtb", "bici"],
    fuzzy: ["radfahren", "fahrrad", "cycling", "ciclismo", "cyclisme"],
  },
  {
    kind: "schwimm", icon: "swim",
    words: ["schwimm", "swim", "nadar", "natacion", "natation", "kraulen"],
    fuzzy: ["schwimmen", "swimming", "natacion", "natation"],
  },
  {
    kind: "gehen", icon: "walk",
    words: ["spazier", "walking", "schritt", "steps", "caminar", "caminata", "pasos", "nordicwalk"],
    starts: ["walk", "gehen", "marche", "marcher"],
    fuzzy: ["spazieren", "walking", "schritte", "caminar"],
  },
  // Die drei Standard-Übungen zuletzt: ihre Wörter ("push", "pull", "lauf") stecken
  // auch in spezielleren Namen ("Push Press", "Treppenlauf").
  {
    kind: "lauf", icon: "run",
    words: ["lauf", "running", "jogg", "jogging", "carrera", "sprint"],
    starts: ["run", "jog", "correr", "course", "courir"],
    fuzzy: ["laufen", "running", "joggen", "jogging", "correr"],
  },
  {
    kind: "klimm", icon: "pullup",
    words: ["klimmz", "pullup", "chinup", "pull", "dominada", "traction"],
    starts: ["klimm"],
    fuzzy: ["klimmzuge", "klimmzug", "klimmzuege", "pullups", "chinups", "dominadas", "tractions"],
  },
  {
    kind: "liege", icon: "pushup",
    words: ["liegest", "pushup", "push", "flexion", "pompe"],
    starts: ["liege"],
    fuzzy: ["liegestutze", "liegestutz", "liegestuetze", "pushups", "flexiones", "pompes"],
  },
  // Aktivitäten (Dean 2026-11-26): ohne Rang-Tabelle, für Icon + Spracheingabe („heute war ich im Gym“)
  {
    kind: "gym", icon: "gym",
    words: ["gym", "fitnessstudio", "fitnesscenter", "krafttraining", "gimnasio", "salledesport", "musculation"],
    fuzzy: ["fitnessstudio", "gimnasio"],
  },
  { kind: "sauna", icon: "sauna", words: ["sauna", "dampfbad"], fuzzy: [] },
];

const BY_KIND = Object.fromEntries(CATALOG.map((e) => [e.kind, e]));

// Optimal-String-Alignment-Distanz (Levenshtein + Vertauschen zweier Nachbarn).
export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

function fuzzyHit(token, word) {
  if (token.length < 6 || word.length < 6) return false;
  const allowed = word.length >= 9 ? 2 : 1;
  return editDistance(token, word) <= allowed;
}

// Übungsart aus einem Namen (oder null, wenn nichts passt).
export function detectExerciseKind(name) {
  const n = normalizeName(name);
  if (!n) return null;
  const toks = tokensOf(name);
  for (const e of CATALOG) {
    if (e.test && e.test(n)) return e.kind;
    if (e.words.some((w) => n.includes(w))) return e.kind;
    if (e.starts && toks.some((t) => e.starts.some((s) => t.startsWith(s)))) return e.kind;
    if (e.exact && toks.some((t) => e.exact.includes(t))) return e.kind;
  }
  // Tippfehler-Stufe: auch Wortpaare zusammen prüfen ("Liege stüzte").
  const joined = toks.slice(0, -1).map((t, i) => t + toks[i + 1]);
  const cands = [...toks, ...joined, n];
  for (const e of CATALOG) {
    if (e.fuzzy && cands.some((t) => e.fuzzy.some((w) => fuzzyHit(t, w)))) return e.kind;
  }
  return null;
}

// Passendes Icon für einen Namen (oder null, wenn nichts erkannt wird).
export function iconForExercise(name) {
  const kind = detectExerciseKind(name);
  return kind ? BY_KIND[kind].icon : null;
}

export function iconForKind(kind) {
  return BY_KIND[kind]?.icon || null;
}

// Anzeigename mit Variante: "Liegestütze · +10 kg".
export function exerciseLabel(ex) {
  const name = ex?.name || "";
  const v = (ex?.variant || "").trim();
  return v ? `${name} · ${v}` : name;
}

// ── Variante aus dem Namen lösen ────────────────────────────────────────────
// "Liegestütze +20 kg" -> { name: "Liegestütze", variant: "+20 kg" }. Erkannt werden
// Zusatzgewichte (kg/lbs, optional mit "mit/with/con/avec" und Ausrüstung wie
// "Weste") und Erschwerungen ohne Gewicht ("einbeinig", "one-arm", "Weste" …).
// km, Minuten oder reine Zahlen bleiben im Namen. Der Name wird nie ganz geleert.
const GEAR = "gewichtsweste|weste|weighted vest|vest|chaleco|gilet lest[eé]|gilet|rucksack|backpack|mochila|sac [aà] dos";
const WEIGHT_RE = new RegExp(
  "\\s*[(\\[·,\\-–]?\\s*(?:\\b(?:mit|with|con|avec)\\s+)?\\+?\\s*(\\d+(?:[.,]\\d+)?)\\s*" +
    "(kg|kilos?|kilogramm?|lbs?|pounds?)(?![a-z])" +
    `(?:\\s+(${GEAR}))?\\s*[)\\]]?`,
  "i",
);
const NO_WEIGHT_RE = new RegExp(
  "\\s*[(\\[·,\\-–]?\\s*(" +
    "einbeinig|einarmig|one[- ]legged|single[- ]leg(?:ged)?|one[- ]arm(?:ed)?|single[- ]arm|" +
    "a una pierna|a un brazo|sur une jambe|[aà] un bras|" +
    `(?:mit|with|con|avec)\\s+(?:${GEAR})|${GEAR}` +
    ")(?![a-zäöüß])\\s*[)\\]]?",
  "i",
);

function tidyName(s) {
  return s.replace(/\s{2,}/g, " ").replace(/[\s·,\-–+([]+$/, "").replace(/^[\s·,\-–+)\]]+/, "").trim();
}

export function splitVariant(rawName) {
  const name = String(rawName || "");
  let m = name.match(WEIGHT_RE);
  if (m) {
    const rest = tidyName(name.slice(0, m.index) + " " + name.slice(m.index + m[0].length));
    if (rest) {
      const num = m[1].replace(".", ",").replace(/,0+$/, "");
      const unit = /^(lb|pound)/i.test(m[2]) ? "lbs" : "kg";
      const gear = m[3] ? ` ${m[3]}` : "";
      return { name: rest, variant: `+${num} ${unit}${gear}` };
    }
  }
  m = name.match(NO_WEIGHT_RE);
  if (m) {
    const rest = tidyName(name.slice(0, m.index) + " " + name.slice(m.index + m[0].length));
    if (rest) return { name: rest, variant: m[1].trim() };
  }
  return { name: name.trim(), variant: "" };
}
