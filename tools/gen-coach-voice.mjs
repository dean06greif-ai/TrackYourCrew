#!/usr/bin/env node
// Erzeugt die Ansagen des Sprachcoachs einmalig als MP3 mit KI-Stimmen (OpenAI TTS).
// Jede Coach-Stimme ist ein „Paket“ <stimme>-<stil> (z. B. nova-power):
//   frontend/public/coach/<paket>/<sprache>/<id>.mp3 + manifest.json, Übersicht frontend/public/coach/packs.json.
// Die Stoppuhr bietet die Pakete zur Auswahl an und spielt sie ohne Verzögerung ab; fehlen sie,
// nimmt sie die Stimme des Geräts.
//
// Aufruf (im Projektordner):
//   node tools/gen-coach-voice.mjs                 Deans 10 Coach-Stimmen auf Deutsch + Englisch (nur Fehlendes/Geändertes)
//   node tools/gen-coach-voice.mjs --lang de,en,es,fr   auch Spanisch/Französisch
//   node tools/gen-coach-voice.mjs --packs nova-power,onyx-coach
//   node tools/gen-coach-voice.mjs --probe         Probe-Satz (de) je Stimme zum Anhören
//   node tools/gen-coach-voice.mjs --probe --hard    harter Coach auf Englisch (Stile hart + beast)
//   node tools/gen-coach-voice.mjs --probe --styles  Lieblingsstimmen in Stilen (energisch, power, hype, coach, hart)
//   --force erzeugt alles neu, --jobs 4 = so viele Anfragen gleichzeitig
// Schlüssel: Umgebungsvariable OPENAI_API_KEY, Zeile OPENAI_API_KEY=… in backend/.env, sonst fragt
// das Skript verdeckt danach (Einfügen + Enter; wird nicht gespeichert, nie ausgegeben).
// Kosten: wenige Cent für alles.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONT = path.join(ROOT, "frontend");
const OUT = path.join(FRONT, "public", "coach");

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);

const MODEL = arg("model", "gpt-4o-mini-tts");
// Deans Favoriten aus der Stil-Probe (2026-11-25), Reihenfolge = Reihenfolge in der Auswahl
// ash-beast zuerst = voreingestellt (Dean: „Ash als Standard, normal oder hart umschaltbar“)
const DEFAULT_PACKS = "ash-beast,nova-power,marin-power,ballad-power,fable-power,cedar-power,onyx-coach,ash-coach,cedar-coach,onyx-hart";
const HARD_STYLES = ["hart", "beast"]; // diese Pakete bekommen zusätzlich die harten Ansagen (<sprache>-hart)
const PACKS = arg("packs", DEFAULT_PACKS).split(",").map((s) => s.trim()).filter(Boolean);
const LANGS = arg("lang", "de,en").split(",").map((s) => s.trim()).filter(Boolean);
const JOBS = Math.max(1, Number(arg("jobs", "4")) || 4);
const STYLE_LABEL = { motiviert: "Motiviert", energisch: "Energisch", power: "Power", hype: "Hype", coach: "Coach", hart: "Hart", beast: "Beast" };
const LANG_NAME = { de: "German", en: "English", es: "Spanish", fr: "French" };
// Sprechstile (Dean 2026-11-25: vor allem motivierend, „richtig sportlich“). Auswahl mit --style.
const COUNTDOWN_HINT = " Numbers alone are a countdown: say them short and punchy.";
const STYLES = {
  // Stand der ersten guten Probe (nova, marin, ballad, cedar, alloy, fable)
  motiviert: "You are a fitness coach cheering on your athlete mid-workout: upbeat, energetic and genuinely motivating, " +
    "warm and encouraging, with a confident smile in your voice. Push them on, but never shout, never exaggerate, " +
    "no sarcasm. Short and crisp. Praise at the goal sounds proud and excited.",
  energisch: "You are a high-energy personal trainer in the middle of an intense session: fast tempo, lots of drive and " +
    "elan, every phrase pushes forward, breathy athletic energy, like you are moving along with the athlete. " +
    "Enthusiastic and sporty, not shouting. Celebrate the goal with real excitement.",
  power: "You are a powerful gym coach at a competition: intense, punchy, driving, chest voice, strong emphasis on key " +
    "words, short commanding bursts that fire the athlete up. Loud energy but still clear and controlled. " +
    "The goal is a big triumphant moment.",
  hype: "You are a hype man and sports commentator at the finish line: euphoric, thrilled, building tension towards the " +
    "end, celebrating every milestone like a big win. Fast, bright, contagious excitement.",
  coach: "You are a seasoned male sports coach with a deep, gritty, masculine voice and strong chest resonance: firm, " +
    "authoritative and calm-intense, like a football coach in the locker room before the final. Short, clipped, " +
    "commanding sentences. Respectful and believing in the athlete. Proud, rough praise at the goal.",
  hart: "You are a tough-love drill instructor: raw, gritty, intense and provoking. You taunt and challenge the athlete " +
    "to make them push harder – harsh, impatient, almost mocking, but deep down you believe in them. " +
    "Never use slurs. The final praise is short, gruff and respectful.",
  // noch härter (Dean 2026-11-25): eigener Charakter, keine echte Person nachgeahmt
  beast: "You are a battle-hardened endurance athlete and former soldier coaching someone through pain: a deep, " +
    "gravelly, raw voice, heavy and slow with sudden explosive bursts, audible intensity and breath between phrases. " +
    "Zero patience for excuses, brutally honest, in-your-face, calling out weakness and self-pity, almost growling – " +
    "but every word is meant to forge a tougher mind. No slurs. At the goal: a short, grim, earned respect.",
};
const STYLE = arg("style", "motiviert");
const instructions = (lang, style = STYLE) =>
  `Speak ${LANG_NAME[lang] || lang} like a native speaker. ${STYLES[style] || STYLES.motiviert}${COUNTDOWN_HINT}`;

// Eigener Probe-Text für den harten Coach (eigene Sätze statt der normalen Ansagen)
const HART_PROBE_DE = "Coach ist an. Keine Ausreden heute. 3. 2. 1. Beweg dich! Halbzeit – und du denkst schon ans " +
  "Aufhören? Weichei! Weiter! Noch 30 Sekunden. Das tut weh? Gut so. Ziel geschafft. Siehst du – du bist härter, als du denkst.";
const HARD_PROBE_EN = "Coach is on. You don't get to be comfortable today. Three. Two. One. Go! ... " +
  "Halfway – and your mind is already begging you to quit? That's weak. Shut it down and keep moving! " +
  "Thirty seconds. It hurts? Good. Pain is where the soft version of you dies. Ten seconds – don't you dare slow down! " +
  "... Goal. Done. Nobody handed you that. You took it. Now do it again tomorrow.";

function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  try {
    const env = fs.readFileSync(path.join(ROOT, "backend", ".env"), "utf8");
    const line = env.split(/\r?\n/).find((l) => /^\s*OPENAI_API_KEY\s*=/.test(l));
    if (line) return line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  } catch { /* keine .env */ }
  return "";
}

// Verdeckte Eingabe im Terminal (nichts wird angezeigt oder gespeichert)
// Zeichen direkt lesen (Raw-Modus): leere Enter (z. B. das vom Starten unter Windows) werden
// ignoriert, für jedes Zeichen erscheint ein *, Rücktaste löscht, Strg+C bricht ab.
function askKey() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) return Promise.resolve("");
  return new Promise((resolve) => {
    let buf = "";
    const done = (val) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(val);
    };
    const onData = (chunk) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\u0003") { process.stdout.write("\nAbgebrochen.\n"); process.exit(1); }
        if (ch === "\r" || ch === "\n") {
          if (buf.trim()) return done(buf.trim());
          continue; // leeres Enter ignorieren
        }
        if (ch === "\b" || ch === "\u007f") {
          if (buf) { buf = buf.slice(0, -1); process.stdout.write("\b \b"); }
          continue;
        }
        if (ch >= " ") { buf += ch; process.stdout.write("*"); }
      }
    };
    process.stdout.write("\nOpenAI-Schlüssel einfügen (Rechtsklick) und Enter drücken – wird nicht gespeichert:\n> ");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

// ES-Module aus dem Frontend direkt laden (ohne Build): i18n-Dateien + Ansagen-Liste
async function importSrc(rel) {
  const src = fs.readFileSync(path.join(FRONT, "src", rel), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(src).toString("base64")}`);
}

async function tts(key, text, lang, voice, style = STYLE) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, voice, input: text, instructions: instructions(lang, style), response_format: "mp3" }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    // zu viele Anfragen / kurzer Server-Fehler: kurz warten und nochmal
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

// einfache Warteschlange: höchstens n Aufgaben gleichzeitig
async function runPool(tasks, n) {
  let i = 0;
  const worker = async () => { while (i < tasks.length) { const k = i; i += 1; await tasks[k](); } };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
}

async function main() {
  const key = apiKey() || (await askKey());
  if (!key) {
    console.error("Kein Schlüssel (OPENAI_API_KEY als Umgebungsvariable, in backend/.env oder per Eingabe).");
    process.exit(1);
  }
  const { coachClips } = await importSrc("lib/coachClips.js");

  // Probe harter Coach auf Englisch: zwei Stile (hart, beast) mit tiefen Männerstimmen
  // -> .cache/coach-probe/hart-en/<stimme>-<stil>.mp3
  if (flag("probe") && flag("hard")) {
    const dir = path.join(ROOT, ".cache", "coach-probe", "hart-en");
    fs.mkdirSync(dir, { recursive: true });
    const voices = arg("voices", "onyx,ash,cedar,ballad,echo,verse").split(",");
    for (const v of voices) {
      for (const s of ["hart", "beast"]) {
        const file = path.join(dir, `${v}-${s}.mp3`);
        try {
          fs.writeFileSync(file, await tts(key, HARD_PROBE_EN, "en", v, s));
          console.log(`Probe: ${file}`);
        } catch (e) {
          console.log(`Übersprungen: ${v}-${s} (${String(e.message || e).slice(0, 120)})`);
        }
      }
    }
    return;
  }

  // Stil-Probe: Lieblingsstimmen in mehreren Stilen + männlicher Coach + harter Coach
  // -> .cache/coach-probe/stile/<stimme>-<stil>.mp3
  if (flag("probe") && flag("styles")) {
    const { default: de } = await importSrc("i18n/de.js");
    const dir = path.join(ROOT, ".cache", "coach-probe", "stile");
    fs.mkdirSync(dir, { recursive: true });
    const normal = `${de["coach.on"]} 3. 2. 1. ${de["coach.go"]} ${de["coach.half"]} ${de["coach.left"].replace("{n}", "30")} ${de["coach.goal"]}`;
    const favs = arg("voices", "nova,marin,ballad,cedar,alloy,fable").split(",");
    const jobs = [];
    for (const v of favs) for (const s of ["energisch", "power", "hype"]) jobs.push([v, s, normal]);
    for (const v of ["onyx", "ash", "cedar", "ballad"]) jobs.push([v, "coach", normal]);
    for (const v of ["onyx", "ash", "cedar", "ballad"]) jobs.push([v, "hart", HART_PROBE_DE]);
    for (const [v, s, text] of jobs) {
      const file = path.join(dir, `${v}-${s}.mp3`);
      try {
        fs.writeFileSync(file, await tts(key, text, "de", v, s));
        console.log(`Probe: ${file}`);
      } catch (e) {
        console.log(`Übersprungen: ${v}-${s} (${String(e.message || e).slice(0, 120)})`);
      }
    }
    console.log("Anhören, dann z. B. mit --voice ballad --style energisch alles erzeugen.");
    return;
  }

  if (flag("probe")) {
    const { default: de } = await importSrc("i18n/de.js");
    const dir = path.join(ROOT, ".cache", "coach-probe");
    fs.mkdirSync(dir, { recursive: true });
    // alle Stimmen (Frauen: coral, nova, shimmer, sage, marin; Männer: ballad, ash, cedar, verse, onyx, echo, fable, alloy)
    const voices = arg("voices", "ballad,coral,nova,shimmer,sage,marin,cedar,alloy,fable,ash,verse").split(",");
    const text = `${de["coach.on"]} 3. 2. 1. ${de["coach.go"]} ${de["coach.half"]} ${de["coach.left"].replace("{n}", "30")} ${de["coach.goal"]}`;
    for (const v of voices) {
      try {
        fs.writeFileSync(path.join(dir, `${v}.mp3`), await tts(key, text, "de", v));
        console.log(`Probe: ${path.join(dir, `${v}.mp3`)}`);
      } catch (e) {
        console.log(`Übersprungen: ${v} (${String(e.message || e).slice(0, 120)})`);
      }
    }
    console.log("Anhören, dann mit --voice <name> alles erzeugen.");
    return;
  }

  const index = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(OUT, "packs.json"), "utf8")); } catch { return { packs: [] }; }
  })();
  const dicts = {};
  for (const lang of LANGS) dicts[lang] = (await importSrc(`i18n/${lang}.js`)).default;

  for (const pack of PACKS) {
    const [voice, style = "motiviert"] = pack.split("-");
    if (!STYLES[style]) { console.log(`Unbekannter Stil in ${pack} – übersprungen`); continue; }
    const sets = HARD_STYLES.includes(style) ? [false, true] : [false];
    for (const lang of LANGS) for (const hard of sets) {
      const dict = dicts[lang];
      const folder = hard ? `${lang}-hart` : lang;
      const t = (k, p = {}) => String(dict[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => p[n] ?? "");
      const dir = path.join(OUT, pack, folder);
      fs.mkdirSync(dir, { recursive: true });
      const manPath = path.join(dir, "manifest.json");
      let old = {};
      try { old = JSON.parse(fs.readFileSync(manPath, "utf8")); } catch { /* neu */ }
      const same = old.voice === voice && old.model === MODEL && old.style === style;
      const clips = {};
      let made = 0;
      let failed = 0;
      const tasks = coachClips(t, hard).map(({ id, text }) => async () => {
        const file = `${id}.mp3`;
        const prev = old.clips?.[id];
        if (!flag("force") && same && prev?.text === text && fs.existsSync(path.join(dir, file))) {
          clips[id] = prev;
          return;
        }
        try {
          fs.writeFileSync(path.join(dir, file), await tts(key, text, lang, voice, style));
          clips[id] = { file, text };
          made += 1;
        } catch (e) {
          failed += 1;
          if (failed === 1) console.log(`\n${pack}/${folder}: ${String(e.message || e).slice(0, 200)}`);
        }
        process.stdout.write(`\r${pack}/${folder}: ${made} neu …   `);
      });
      await runPool(tasks, JOBS);
      fs.writeFileSync(manPath, `${JSON.stringify({ model: MODEL, voice, style, clips }, null, 1)}\n`);
      console.log(`\r${pack}/${folder}: ${made} neu, ${Object.keys(clips).length} gesamt${failed ? `, ${failed} fehlgeschlagen (nochmal starten)` : ""}`);
      // Übersicht für die Auswahl in der Stoppuhr
      let entry = index.packs.find((p) => p.id === pack);
      if (!entry) {
        entry = { id: pack, voice, style, label: `${voice[0].toUpperCase()}${voice.slice(1)} · ${STYLE_LABEL[style] || style}`, langs: [] };
        index.packs.push(entry);
      }
      if (Object.keys(clips).length && !entry.langs.includes(folder)) entry.langs.push(folder);
    }
  }
  // Reihenfolge wie in --packs, ältere Pakete dahinter
  index.packs.sort((a, b) => {
    const ia = PACKS.indexOf(a.id); const ib = PACKS.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  fs.writeFileSync(path.join(OUT, "packs.json"), `${JSON.stringify(index, null, 1)}\n`);
  console.log(`Fertig: ${index.packs.length} Coach-Stimmen in ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
