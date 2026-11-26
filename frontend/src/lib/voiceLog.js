// Fortschritt per Sprache (Dean 2026-11-26): „heute bin ich 10 km gelaufen und 50 Liegestütze“
// -> [{key, amount, day, mode}]. Reine Funktionen (kein React/Browser), getestet in voiceLog.test.js.
//
// Erkennt je Satzteil (getrennt an „und/and/y/et“, Komma, „dann“):
//  - Zahl: Ziffern („10“, „5,5“), Zahlwörter (zehn, fünfundzwanzig, twenty five, veinticinco …),
//    „einhalb/and a half/y medio/et demi“
//  - Einheit: km, m, Minuten, Sekunden, Stunden (in die Einheit der Übung umgerechnet)
//  - Übung: Name der eigenen Übung, Übungsart (detectExerciseKind) oder Verb („gelaufen“, „ran“, „couru“);
//    ohne Übung, aber mit Einheit: die einzige passende Übung (z. B. einzige km-Übung)
//  - Tag: heute (Standard), gestern, vorgestern, Wochentag (nur bis heute)
//  - „insgesamt / in total / en total / au total“ = Wochensumme setzen statt dazuzählen
// Ende-Wörter („das war's“, „fertig“, „that's it“ …) beenden die Aufnahme.
import { detectExerciseKind, normalizeName, exerciseLabel } from "./exercises";
import { parseUnit } from "./ranks";

const strip = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");

// ── Ende-Wörter ─────────────────────────────────────────────────────────
const DONE = /\b(das wars?|das war es|das war's|fertig|ende|aus jetzt|thats it|that's it|that is it|done|finished|im done|i'm done|eso es todo|eso es|listo|terminado|ya esta|c'?est tout|c'?est fini|fini|termine)\b/;
export function isDone(text) {
  return DONE.test(strip(text).replace(/[’`]/g, "'"));
}
export function stripDone(text) {
  return strip(text).replace(/[’`]/g, "'").replace(DONE, " ").trim();
}

// ── Zahlwörter ──────────────────────────────────────────────────────────
const DE = { null: 0, ein: 1, eins: 1, eine: 1, einen: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwolf: 12, dreizehn: 13, vierzehn: 14, funfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19 };
const DE_TENS = { zwanzig: 20, dreissig: 30, vierzig: 40, funfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };
const EN = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000 };
const ES = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, veintiun: 21, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100,
  doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500,
  seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900, mil: 1000 };
const FR = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100, cents: 100, mille: 1000 };

// Deutsches Zahlwort (auch zusammengesetzt: fünfundzwanzig, hundertfünfzig, zweihundert)
function deWord(w) {
  if (w in DE) return DE[w];
  if (w in DE_TENS) return DE_TENS[w];
  let m = w.match(/^(.*?)tausend(.*)$/);
  if (m) {
    const t = m[1] ? deWord(m[1]) : 1;
    const r = m[2] ? deWord(m[2]) : 0;
    return t != null && r != null ? t * 1000 + r : null;
  }
  m = w.match(/^(.*?)hundert(.*)$/);
  if (m) {
    const h = m[1] ? deWord(m[1]) : 1;
    const r = m[2] ? deWord(m[2]) : 0;
    return h != null && r != null ? h * 100 + r : null;
  }
  m = w.match(/^(ein|zwei|drei|vier|funf|sechs|sieben|acht|neun)und(zwanzig|dreissig|vierzig|funfzig|sechzig|siebzig|achtzig|neunzig)$/);
  if (m) return DE[m[1]] + DE_TENS[m[2]];
  return null;
}

function wordValue(w) {
  if (w in EN && w !== "a" && w !== "an") return EN[w];
  if (w in ES) return ES[w];
  if (w in FR) return FR[w];
  const d = deWord(w);
  if (d != null) return d;
  // twenty-five / forty-two
  if (/^[a-z]+-[a-z]+$/.test(w)) {
    const [t, u] = w.split("-");
    if (EN[t] >= 20 && EN[t] % 10 === 0 && EN[u] >= 1 && EN[u] < 10) return EN[t] + EN[u];
  }
  // vingt-cinq / soixante-dix / quatre-vingt(s)
  if (w.includes("-")) {
    const parts = w.split("-").map((p) => (p === "vingts" ? "vingt" : p));
    if (parts.every((p) => p in FR || p === "et")) {
      let total = 0;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p === "et") continue;
        if (p === "vingt" && i > 0 && FR[parts[i - 1]] < 10) total = total - FR[parts[i - 1]] + FR[parts[i - 1]] * 20;
        else total += FR[p];
      }
      return total;
    }
  }
  return null;
}

// Wörter -> Ziffern: "zehn km" -> "10 km", "twenty five" -> "25", "treinta y cinco" -> "35",
// "fünf komma fünf" -> "5.5", "zehneinhalb"/"ten and a half" -> "10.5"
export function wordsToDigits(text) {
  let s = ` ${strip(text)} `;
  s = s.replace(/(\d)\s*,\s*(\d)/g, "$1.$2"); // 5,5 -> 5.5
  // Satzzeichen weg (außer Dezimalpunkt, Doppelpunkt in Zeiten, Bindestrich in vingt-cinq)
  s = s.replace(/[!?;„“"()]/g, " ").replace(/\.(?!\d)/g, " ").replace(/(\D),|,(\D)/g, "$1 $2");
  // Uhrzeit-Schreibweise: 1:30 -> 90 Sekunden, 1:02:30 -> 3750 Sekunden
  s = s.replace(/\b(\d+):(\d{2}):(\d{2})\b/g, (m, h, mi, se) => ` ${Number(h) * 3600 + Number(mi) * 60 + Number(se)} sekunden `);
  s = s.replace(/\b(\d+):(\d{2})\b/g, (m, mi, se) => ` ${Number(mi) * 60 + Number(se)} sekunden `);
  // zusammengeschrieben: 5km, 10min, 30s, 5k (Laufen: k = km)
  s = s.replace(/\b(\d+(?:\.\d+)?)(km|kms|k|m|mi|min|mins|s|sek|sec|h|std)\b/g, "$1 $2").replace(/\b(\d+(?:\.\d+)?) k\b/g, "$1 km");
  // halbe Angaben: „ein halber Kilometer“, „half an hour“, „media hora“, „une demi-heure“
  s = s.replace(/\b(eine?n?|1)?\s*halbe?[nrs]?\s+(stunde|kilometer|km|meile|minute)\b/g, (m, a, u) => ` 0.5 ${u} `);
  s = s.replace(/\bhalf (an?|one) (hour|kilometer|kilometre|km|mile|minute)\b/g, (m, a, u) => ` 0.5 ${u} `);
  s = s.replace(/\b(un |una )?(medio|media) (hora|kilometro|km|milla|minuto)\b/g, (m, a, b, u) => ` 0.5 ${u} `);
  s = s.replace(/\b(une? )?demi[- ]?(heure|kilometre|km|minute)\b/g, (m, a, u) => ` 0.5 ${u} `);
  s = s.replace(/\bviertelstunde\b|\b(a )?quarter (of an|an) hour\b/g, " 15 minuten ");
  // „a/an/one minute“, „a hundred“: a/an = 1 nur vor Einheit oder hundert/tausend
  s = s.replace(/\b(an?)\s+(hundred|thousand|hour|minute|second|kilometer|kilometre|mile|km)\b/g, (m, a, w) => ` 1 ${w} `);
  s = s.replace(/\b(\w+)einhalb\b/g, (m, w) => { const v = wordValue(w); return v != null ? ` ${v}.5 ` : m; });
  s = s.replace(/\banderthalb\b|\beineinhalb\b/g, " 1.5 ").replace(/\bhalbe? stunde\b/g, " 30 minuten ");
  const toks = s.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const v = wordValue(toks[i]);
    if (v == null) { out.push(toks[i]); continue; }
    let total = v;
    let j = i + 1;
    // twenty five / treinta y cinco / one hundred fifty / ciento cincuenta
    while (j < toks.length) {
      const nx = toks[j];
      if ((nx === "y" || nx === "and" || nx === "et") && j + 1 < toks.length && wordValue(toks[j + 1]) != null && wordValue(toks[j + 1]) < 10 && total >= 20 && total % 10 === 0) {
        total += wordValue(toks[j + 1]);
        j += 2;
        continue;
      }
      // one hundred and twenty / cent et un
      if ((nx === "and" || nx === "und" || nx === "et") && total >= 100 && total % 100 === 0 && j + 1 < toks.length && wordValue(toks[j + 1]) != null && wordValue(toks[j + 1]) < 100) {
        total += wordValue(toks[j + 1]);
        j += 2;
        continue;
      }
      // soixante et onze
      if (nx === "et" && (total === 60 || total === 80) && j + 1 < toks.length && wordValue(toks[j + 1]) >= 1 && wordValue(toks[j + 1]) < 20) {
        total += wordValue(toks[j + 1]);
        j += 2;
        continue;
      }
      const nv = wordValue(nx);
      if (nv == null) break;
      if (nv === 1000 && total < 1000) { total *= 1000; j += 1; continue; }
      if (total >= 1000 && total % 1000 === 0 && nv < 1000) { total += nv; j += 1; continue; }
      if (nv === 100 && total < 10) { total *= 100; j += 1; continue; }
      // französisch ohne Bindestrich: quatre vingt (dix), soixante dix, dix sept
      if (total === 4 && nv === 20) { total = 80; j += 1; continue; }
      if ((total === 60 || total === 80) && nv >= 10 && nv < 20) { total += nv; j += 1; continue; }
      if (total === 10 && nv >= 7 && nv <= 9 && /^(sept|huit|neuf)$/.test(nx)) { total += nv; j += 1; continue; }
      if (total >= 20 && total % 10 === 0 && nv < 10) { total += nv; j += 1; continue; }
      if (total >= 100 && total % 100 === 0 && nv < 100) { total += nv; j += 1; continue; }
      break;
    }
    out.push(String(total));
    i = j - 1;
  }
  s = out.join(" ");
  s = s.replace(/(\d+)\s+(komma|point|coma|punto|virgule)\s+(\d+)/g, "$1.$3");
  s = s.replace(/(\d+)\s+(and a half|y medio|y media|et demi|et demie)/g, (m, n) => `${Number(n) + 0.5}`);
  return combineAmounts(s).trim();
}

// ── Einheiten im gesprochenen Text ───────────────────────────────────────
const SPOKEN_UNITS = [
  { re: /^(km|kilometer|kilometern|kilometers|kilometres|kilometros|kilometre|kilometro|kms|k)$/, kind: "distance", toBase: 1 },
  { re: /^(m|meter|metern|meters|metres|metros|metre)$/, kind: "distance", toBase: 0.001 },
  { re: /^(mi|meilen|meile|miles|mile)$/, kind: "distance", toBase: 1.609344 },
  { re: /^(h|std|stunde|stunden|hour|hours|hr|hrs|hora|horas|heure|heures)$/, kind: "time", toBase: 3600 },
  { re: /^(min|mins|minute|minuten|minutes|minutos|minuto|mn)$/, kind: "time", toBase: 60 },
  { re: /^(s|sek|sec|secs|sekunde|sekunden|second|seconds|segundo|segundos|seconde|secondes)$/, kind: "time", toBase: 1 },
];
const H = "h|std|stunde|stunden|hour|hours|hr|hrs|hora|horas|heure|heures";
const MI = "min|mins|minute|minuten|minutes|minuto|minutos|mn";
const SE = "s|sek|sec|secs|sekunde|sekunden|second|seconds|segundo|segundos|seconde|secondes";
const AND = "(?:und|and|y|et)\\s+";
// „1 Stunde 20 (Minuten)“, „1 Minute (und) 30 (Sekunden)“, „5 km (und) 300 m“ -> eine Menge
export function combineAmounts(s) {
  const n = "(\\d+(?:\\.\\d+)?)";
  s = s.replace(new RegExp(`${n}\\s+(?:${H})\\s+(?:${AND})?(\\d+)(?:\\s+(?:${MI}))?\\b`, "g"), (m, h, mi) => ` ${Number(h) * 60 + Number(mi)} minuten `);
  s = s.replace(new RegExp(`${n}\\s+(?:${MI})\\s+(?:${AND})?(\\d+)(?:\\s+(?:${SE}))?(?=\\s|$)`, "g"), (m, mi, se) => ` ${Math.round(Number(mi) * 60 + Number(se))} sekunden `);
  s = s.replace(new RegExp(`${n}\\s+(?:km|kilometer|kilometern|kilometers|kilometres|kilometros)\\s+(?:${AND})?(\\d+)\\s+(?:m|meter|metern|meters|metres|metros)\\b`, "g"), (m, k, me) => ` ${Math.round((Number(k) + Number(me) / 1000) * 1000) / 1000} km `);
  return s.replace(/\s+/g, " ");
}

function spokenUnit(tok) {
  return SPOKEN_UNITS.find((u) => u.re.test(tok)) || null;
}

// Verben/Wörter, die die Übungserkennung (Namen) nicht kennt
const VERB_KIND = [
  { kind: "lauf", re: /^(ran|run|runs|running|jogged|jog|jogging|gerannt|gejoggt|joggen|gejogged|rennen|corri|corrido|corriendo|carrera|couru|courir|course|footing)$/ },
  { kind: "gehen", re: /^(walked|walk|walking|gegangen|spaziert|spazieren|camine|caminado|caminar|marche|marcher)$/ },
  { kind: "rad", re: /^(biked|bike|cycled|cycling|ride|rode|geradelt|radeln|radgefahren|fahrrad|bici|bicicleta|velo|pedale)$/ },
  { kind: "schwimm", re: /^(swam|swim|swimming|geschwommen|schwimmen|nade|nadado|nadar|nage|nager)$/ },
  { kind: "liege", re: /^(pushups?|push|pompes?|liegestutz)$/ },
  { kind: "klimm", re: /^(pullups?|chinups?|klimmzug|tractions?|dominadas?)$/ },
  { kind: "gym", re: /^(salle|gimnasio|gimnasios|gym|fitness|fitnessstudio|muckibude)$/ },
];

// ── Tage ────────────────────────────────────────────────────────────────
const DAYS = [
  /^(montag|monday|lunes|lundi)$/, /^(dienstag|tuesday|martes|mardi)$/, /^(mittwoch|wednesday|miercoles|mercredi)$/,
  /^(donnerstag|thursday|jueves|jeudi)$/, /^(freitag|friday|viernes|vendredi)$/, /^(samstag|sonnabend|saturday|sabado|samedi)$/,
  /^(sonntag|sunday|domingo|dimanche)$/,
];
function dayOf(toks, today) {
  if (toks.some((t) => /^(vorgestern|anteayer|avant-hier)$/.test(t)) || /day before yesterday/.test(toks.join(" "))) return Math.max(0, today - 2);
  if (toks.some((t) => /^(gestern|yesterday|ayer|hier)$/.test(t))) return Math.max(0, today - 1);
  if (toks.some((t) => /^(heute|heut|today|tonight|hoy|aujourd'?hui)$/.test(t))) return today;
  for (let d = 0; d < 7; d++) {
    if (toks.some((t) => DAYS[d].test(t)) && d <= today) return d;
  }
  return null;
}

const ADD = /\b(noch|nochmal|weitere|weiteren|zusatzlich|dazu|extra|mehr|another|more|additional|plus|otra|otras|otro|otros|mas|encore|de plus|supplementaires?)\b/;
const TOTAL = /\b(insgesamt|gesamt|in total|total|en total|au total|in summe)\b/;

// Eine Übung des Nutzers zu einer Art/einem Namen finden
function findExercise(segment, toks, exercises) {
  const ns = normalizeName(segment);
  // 1) eigener Name (z. B. „Kniebeugen“, „Plank“)
  const byName = exercises.filter((e) => {
    const n = normalizeName(e.name);
    return n.length >= 3 && ns.includes(n);
  });
  if (byName.length === 1) return byName[0];
  // 2) Übungsart aus dem Satz (Namen) oder einem Verb
  let kind = detectExerciseKind(segment);
  if (!kind) kind = VERB_KIND.find((v) => toks.some((t) => v.re.test(t)))?.kind || null;
  if (kind) {
    const byKind = exercises.filter((e) => detectExerciseKind(e.name) === kind);
    if (byKind.length >= 1) return byKind.find((e) => !e.variant) || byKind[0];
  }
  // 3) unscharf: klingt fast wie eine der EIGENEN Übungen („Liege Stützen“, „Klim Züge“)
  return fuzzyExercise(toks, exercises);
}

// ── Unscharfe Zuordnung (Dean 2026-11-26) ───────────────────────────────
// Nur gegen die aktuellen Übungen des Nutzers, nie gegen eine allgemeine Liste. Verglichen werden
// 1–3 aufeinanderfolgende Wörter (zusammengezogen) mit Name/Anzeigename per Editierabstand.
function lev(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
const NOT_NAME = /^(\d+(\.\d+)?|heute|gestern|vorgestern|today|yesterday|hoy|ayer|noch|insgesamt|gemacht|habe|hab|ich|bin|war|did|done|have|i|hice|he|fait|j'?ai|und|and|mal|times|veces|fois)$/;
export function fuzzyScore(spoken, name) {
  const a = normalizeName(spoken);
  const b = normalizeName(name);
  if (a.length < 3 || b.length < 4) return 0;
  return 1 - lev(a, b) / Math.max(a.length, b.length);
}
function fuzzyExercise(toks, exercises) {
  const words = toks.filter((t) => t && !NOT_NAME.test(t) && !spokenUnit(t));
  const windows = [];
  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= 3 && i + n <= words.length; n++) windows.push(words.slice(i, i + n).join(""));
  }
  if (!windows.length) return null;
  const scored = exercises.map((e) => {
    const names = [e.name, exerciseLabel(e)].filter(Boolean);
    let best = 0;
    for (const w of windows) for (const nm of names) best = Math.max(best, fuzzyScore(w, nm));
    return { e, best };
  }).sort((x, y) => y.best - x.best);
  const top = scored[0];
  if (!top || top.best < 0.7) return null;
  // eindeutig: die zweitbeste Übung muss klar schlechter passen
  if (scored[1] && top.best - scored[1].best < 0.1) return null;
  return top.e;
}

// Für das Dashboard-Mikro: welche der Übungen wird im Satz genannt? (oder null)
export function findSpokenExercise(text, exercises) {
  const seg = strip(text);
  return findExercise(seg, seg.split(/\s+/).filter(Boolean), exercises);
}

/**
 * @param {string} text            gesprochener Text
 * @param {Array}  exercises       eigene Übungen [{key, name, unit, variant}]
 * @param {number} today           Wochentag 0 (Mo) … 6 (So)
 * mode: "add" (dazu), "day" (Tagesstand), "set" (Wochensumme)
 * @returns {{items: Array<{key, amount, day, mode}>, unknown: string[], done: boolean}}
 */
export function parseVoiceLog(text, exercises, today = 0) {
  const done = isDone(text);
  const clean = wordsToDigits(stripDone(text));
  const globalToks = clean.split(/\s+/);
  const globalDay = dayOf(globalToks, today);
  const segments = clean
    .split(/\s*(?:,|;|\bund\b|\band\b|\bdann\b|\bthen\b|\by\b|\bet\b|\bplus\b|\bausserdem\b)\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  const items = [];
  const unknown = [];
  for (const seg of segments) {
    const toks = seg.split(/\s+/);
    const numIdx = toks.findIndex((t) => /^\d+(\.\d+)?$/.test(t));
    // Aktivität (z. B. „heute war ich im Gym“): keine Zahl nötig, der Tag gilt als erledigt
    const actEx = findExercise(seg, toks, exercises.filter((e) => e.type === "activity"));
    if (actEx) {
      const day = dayOf(toks, today) ?? globalDay ?? today;
      if (!items.some((it) => it.key === actEx.key && it.day === day)) items.push({ key: actEx.key, amount: 1, day, mode: "add" });
      continue;
    }
    if (numIdx < 0) continue;
    let amount = Number(toks[numIdx]);
    // Einheit direkt hinter der Zahl (oder irgendwo im Satzteil)
    const su = spokenUnit(toks[numIdx + 1] || "") || toks.map(spokenUnit).find(Boolean) || null;
    let ex = findExercise(seg, toks, exercises.filter((e) => e.type !== "activity"));
    if (!ex && su) {
      const fitting = exercises.filter((e) => e.type !== "activity" && (parseUnit(e.unit) || {}).kind === su.kind);
      if (fitting.length === 1) ex = fitting[0];
    }
    if (!ex) { unknown.push(seg); continue; }
    // in die Einheit der Übung umrechnen
    const eu = parseUnit(ex.unit) || {};
    if (su && eu.kind === su.kind && eu.toBase) amount = (amount * su.toBase) / eu.toBase;
    const isKm = eu.kind === "distance";
    amount = isKm ? Math.round(amount * 100) / 100 : Math.round(amount * 10) / 10;
    if (!(amount > 0)) continue;
    const segDay = dayOf(toks, today) ?? globalDay;
    const day = segDay ?? today;
    // „insgesamt 120“ = Wochensumme; „heute/gestern … 10 gemacht“ = Stand dieses Tages (Dean 2026-11-26:
    // genau sein, nicht addieren); „noch/weitere 10“ oder ohne Tagesangabe = dazuzählen
    const mode = TOTAL.test(seg) ? "set" : segDay != null && !ADD.test(seg) ? "day" : "add";
    const prev = items.find((it) => it.key === ex.key && it.day === day && it.mode === mode);
    if (prev) prev.amount += amount;
    else items.push({ key: ex.key, amount, day, mode });
  }
  return { items, unknown, done };
}
