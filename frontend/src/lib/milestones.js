// Meilensteine (Plan 1e, Liste von Dean freigegeben: docs/MEILENSTEINE.md).
// Reine Funktionen: aus den All-Time-Summen des Boards berechnen, welche
// Meilensteine erreicht sind. Der Server merkt sich nur, wann (POST /me/milestones).
//
// Summiert wird je Übungsart über alle Übungen eines Nutzers, auch abgeschlossene
// und Varianten: Wer auf "Liegestütze · +10 kg" umsteigt, behält seine Liegestütze.
import { detectExerciseKind } from "./exercises";
import { parseUnit } from "./ranks";

// Distanz in km. mid = Meilenstein-Name (Teil der ID, Text unter ms.title./ms.text.<mid>).
const RUN = [["run10", 10], ["half", 21.1], ["marathon", 42.2], ["ultra", 100], ["iss", 408],
  ["run1000", 1000], ["nile", 6650], ["wall", 21196], ["earth", 40075]];
const BIKE = [["bike100", 100], ["iss", 408], ["bike1000", 1000], ["tdf", 3400], ["nile", 6650],
  ["wall", 21196], ["earth", 40075]];
const SWIM = [["lanes100", 2.5], ["owater", 10], ["lanes1000", 25], ["swim100", 100], ["iss", 408]];
const WALK = [["walkmarathon", 42.2], ["walk100", 100], ["walk1000", 1000], ["nile", 6650]];
// Regional: nur in der jeweiligen Sprache (des Nutzers, der ihn erreicht).
const REGIONAL = { de: ["germany", 880], es: ["camino", 800], en: ["route66", 3940] };
const REGIONAL_KINDS = new Set(["lauf", "rad", "gehen", "wandern"]);

export const DISTANCE_MILESTONES = { lauf: RUN, rad: BIKE, schwimm: SWIM, gehen: WALK, wandern: WALK };

const COUNT_KINDS = new Set(["liege", "klimm", "squat", "situps", "burpees", "dips", "hspu", "lunge",
  "rope", "mountainclimber", "jumps", "highjump", "weitsprung", "pogo"]);
const COUNT_STEPS = [1000, 10000, 50000, 100000];

// Bewegtes Gewicht, grob mit 75 kg Körpergewicht (Liegestütz ≈ 65 %, Klimmzug ≈ 100 %).
const BODY_KG = 75;
export const WEIGHT_PER_REP = { liege: BODY_KG * 0.65, klimm: BODY_KG };
const WEIGHT = [["elephant", 6000], ["bluewhale", 150000], ["eiffel", 10000000]];

// Zeit in Sekunden.
const TIME_KINDS = new Set(["plank", "handstand", "deadhang", "wallsit", "hollow"]);
const TIME = [["football", 5400], ["marathontime", 10800], ["day", 86400]];

// Crew-Ziele (Summe aller Distanzen der Crew, km).
export const MOON_KM = 384400;
export const CREW_MILESTONES = [["crewiss", 408], ["crewearth", 40075], ["crewmoon", MOON_KM]];

// Wert einer Übung in der Basis-Einheit ihrer Familie, oder null wenn die Einheit
// nicht passt (z. B. "Lauf" in Minuten).
function toBase(family, unit, value) {
  const parsed = parseUnit(unit);
  if (family === "distance") {
    if (parsed && (parsed.kind === "distance" || parsed.kind === "steps")) return value * parsed.toBase;
    return null;
  }
  if (family === "time") {
    if (!String(unit || "").trim()) return value; // ohne Einheit: Sekunden (wie bei den Rängen)
    if (parsed && parsed.kind === "time") return value * parsed.toBase;
    return null;
  }
  if (family === "count") return !parsed || parsed.kind === "count" ? value : null;
  return null;
}

function familyOf(kind) {
  if (DISTANCE_MILESTONES[kind]) return "distance";
  if (TIME_KINDS.has(kind)) return "time";
  if (COUNT_KINDS.has(kind)) return "count";
  return null;
}

// Summen je Übungsart in Basis-Einheit: { lauf: 52.3, liege: 1840, ... } plus
// Name/Icon der zuletzt aktiven Übung dieser Art (für Texte).
export function totalsByKind(entry) {
  const all = [...(entry?.exercises || []), ...(entry?.archived_exercises || [])].filter((ex) => (ex?.type || "exercise") !== "activity");
  const out = {};
  for (const ex of all) {
    const kind = detectExerciseKind(ex.name) || detectExerciseKind(ex.key);
    const family = kind && familyOf(kind);
    if (!family) continue;
    const v = toBase(family, ex.unit, Number(entry?.all_time?.[ex.key]) || 0);
    if (v === null) continue;
    if (!out[kind]) out[kind] = { kind, family, total: 0, name: ex.name, icon: ex.icon };
    out[kind].total += v;
  }
  return out;
}

// Alle erreichten Meilensteine eines Board-Eintrags.
// Ergebnis: [{ id, kind, mid, family, threshold, total, name, icon, count? }]
export function reachedMilestones(entry, lang = "en") {
  const res = [];
  for (const g of Object.values(totalsByKind(entry))) {
    const base = { kind: g.kind, family: g.family, total: g.total, name: g.name, icon: g.icon };
    if (g.family === "distance") {
      const list = [...DISTANCE_MILESTONES[g.kind]];
      if (REGIONAL_KINDS.has(g.kind) && REGIONAL[lang]) list.push(REGIONAL[lang]);
      for (const [mid, km] of list) {
        if (g.total >= km) res.push({ ...base, id: `${g.kind}:${mid}`, mid, threshold: km });
      }
    } else if (g.family === "time") {
      for (const [mid, sec] of TIME) {
        if (g.total >= sec) res.push({ ...base, id: `${g.kind}:${mid}`, mid, threshold: sec });
      }
    } else if (g.family === "count") {
      for (const n of COUNT_STEPS) {
        if (g.total >= n) res.push({ ...base, id: `${g.kind}:n${n}`, mid: "count", threshold: n, count: n });
      }
      const per = WEIGHT_PER_REP[g.kind];
      if (per) {
        for (const [mid, kg] of WEIGHT) {
          if (g.total * per >= kg) res.push({ ...base, id: `${g.kind}:w${mid}`, mid, threshold: kg });
        }
      }
    }
  }
  return res;
}

// Summe aller Distanzen (km) eines Eintrags bzw. der ganzen Crew.
export function distanceKm(entry) {
  return Object.values(totalsByKind(entry))
    .filter((g) => g.family === "distance")
    .reduce((s, g) => s + g.total, 0);
}

export function crewDistanceKm(users) {
  return (users || []).reduce((s, u) => s + distanceKm(u), 0);
}

export function reachedCrewMilestones(users) {
  const km = crewDistanceKm(users);
  return CREW_MILESTONES.filter(([, t]) => km >= t).map(([mid, t]) => ({ id: `crew:${mid}`, mid, threshold: t, total: km }));
}

// Anteil am Weg zum Mond in Prozent (für die Kartenrückseite).
export function moonPercent(km) {
  return (km / MOON_KM) * 100;
}

// Meilenstein-ID -> Beschreibung, auch für IDs, die das Frontend gerade nicht
// mehr berechnen würde (z. B. Übung gelöscht). Gibt null bei unbekannter ID.
export function parseMilestoneId(id) {
  const [kind, mid] = String(id || "").split(":");
  if (!kind || !mid) return null;
  if (kind === "crew") return { kind, mid, family: "crew" };
  const n = mid.match(/^n(\d+)$/);
  if (n) return { kind, mid: "count", count: Number(n[1]), family: "count" };
  const w = mid.match(/^w(elephant|bluewhale|eiffel)$/);
  if (w) return { kind, mid: w[1], family: "weight" };
  return { kind, mid, family: familyOf(kind) || "distance" };
}
