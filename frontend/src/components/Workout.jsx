// Workout-Modus (Intervall-Timer, Dean 2026-11-26): Vollbild neben „Fortschritt eintragen“.
// Einstellen (Übung, Arbeit/Pause/Runden, Vorlagen) -> 3-2-1 -> Runden mit Ansagen + Pieptönen,
// Wiederholungen je Runde per Tippen oder Sprache, Summe live -> am Ende „Eintragen“.
// Während des Trainings sieht die Crew auf der Karte „LIVE · Runde 3/8 · 34“ (PUT /me/live).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Play, Pause, Stop, Minus, Plus, Microphone, Check, Timer, PencilSimple, SpeakerHigh, SpeakerSlash, Gear } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { useI18n } from "../i18n";
import { speechLang, isTimeUnit, secondsToUnit, formatClock, matchVoiceCommand } from "../lib/stopwatch";
import { exerciseLabel } from "../lib/exercises";
import { formatAmount } from "../lib/amount";
import { useMicEnabled } from "../lib/mic";
import { useVoiceChannel, cleanSpeech, kickVoice } from "../lib/voiceHub";
import { getAudioCtx, unlockAudio, loadPackIndex, loadCoachClips, playCoachClip } from "../lib/coachAudio";
import { clipId, cueText } from "../lib/coachClips";
import { translate, LANGUAGES } from "../i18n";
import { speak, PACK_KEY, CLANG_KEY } from "./Stopwatch";
import { claimMediaSession, restoreMediaSession, pause as pauseMusic, play as playMusic } from "../lib/musicPlayer";
import { PRESETS, buildPhases, phaseAt, parseRepsSpeech, clampInt, sum, totalSeconds, COUNTDOWN_S } from "../lib/workout";
import ExerciseIcon from "./ExerciseIcon";

const KEY = "tyc_workout";
const PREFS_KEY = "tyc_workout_prefs"; // { coach: bool, live: bool, steps: [n,n,n] }
const DEFAULT_STEPS = [5, 10, 15];
const readPrefs = () => { try { return { coach: true, live: false, lock: true, steps: [], ...JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}") }; } catch { return { coach: true, live: false, lock: true, steps: [] }; } };
const writePrefs = (v) => { try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(v)); } catch { /* egal */ } };
// Coach-Stimme wie bei der Stoppuhr (gleiche Auswahl): KI-Aufnahme, sonst Gerätestimme
const readLS = (k) => { try { return window.localStorage.getItem(k) || ""; } catch { return ""; } };
const writeLS = (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* egal */ } };
const readLast = () => { try { return JSON.parse(window.localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
const writeLast = (v) => { try { window.localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* egal */ } };

function beep(freq, dur = 0.15, vol = 0.25) {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  } catch { /* egal */ }
}


function Stepper({ label, value, onChange, min, max, step = 5, suffix = "s", testid }) {
  // Handy: Zahl oben, − und + darunter (nebeneinander wäre bei 3 Stellen zu eng); ab sm alles in einer Zeile
  const btn = "h-8 sm:w-10 sm:h-10 flex-1 sm:flex-none border border-[#333] text-ink-2 flex items-center justify-center";
  return (
    <div className="border border-[#222] bg-[#121212] p-2 sm:p-3">
      <p className="text-[10px] uppercase tracking-widest text-ink-3">{label}</p>
      <div className="grid grid-cols-2 gap-1.5 mt-1 sm:flex sm:items-center sm:justify-between">
        <span className="col-span-2 text-center font-anton text-3xl tabular-nums whitespace-nowrap sm:order-2" data-testid={testid}>{value}<span className="text-sm text-ink-3 ml-0.5">{suffix}</span></span>
        <button type="button" onClick={() => onChange(clampInt(value - step, min, max))} className={`${btn} sm:order-1`} aria-label="-" data-testid={`${testid}-minus`}><Minus size={14} weight="bold" /></button>
        <button type="button" onClick={() => onChange(clampInt(value + step, min, max))} className={`${btn} sm:order-3`} aria-label="+" data-testid={`${testid}-plus`}><Plus size={14} weight="bold" /></button>
      </div>
    </div>
  );
}

export default function Workout({ open, onClose, exercises = [], onLog }) {
  const { t, lang, locale } = useI18n();
  const [prefs, setPrefsState] = useState(() => readPrefs());
  const setPrefs = (patch) => setPrefsState((p) => { const n = { ...p, ...patch }; writePrefs(n); return n; });
  const steps = DEFAULT_STEPS.map((d, i) => Number(prefs.steps?.[i]) > 0 ? Number(prefs.steps[i]) : d);
  const [editSteps, setEditSteps] = useState(false);
  const [showSettings, setShowSettings] = useState(false); // Zahnrad: Live-Werte (wie im Eintrage-Formular)
  // Vorlagen: eigene Liste (Standard-Vorlagen lassen sich auch löschen); null = noch nie geändert -> Standard
  const presets = Array.isArray(prefs.presets) ? prefs.presets : PRESETS;
  const [editPresets, setEditPresets] = useState(false);
  const [presetName, setPresetName] = useState("");
  const presetLabel = (p) => p.name || (PRESETS.some((d) => d.id === p.id) ? t(`wo.preset.${p.id}`) : `${p.work}/${p.rest}`);
  const isCurrent = (p) => p.work === work && p.rest === rest && p.rounds === rounds;
  const savePreset = () => {
    const p = { id: `own_${Date.now().toString(36)}`, name: presetName.trim().slice(0, 24) || undefined, work, rest, rounds };
    setPrefs({ presets: [...presets, p] });
    setPresetName("");
  };
  const deletePreset = (id) => setPrefs({ presets: presets.filter((p) => p.id !== id) });
  const savedRef = useRef(0); // Live eintragen: schon gespeicherte Menge
  // Coach: Stimme + Sprache wie bei der Stoppuhr (gleiche Einstellung, hier und dort wählbar).
  // KI-Stimme spricht alles (auch Runden/Pausen), Gerätestimme nur, wenn es keine Aufnahme gibt.
  const [cLangPref, setCLangPref] = useState(() => readLS(CLANG_KEY));
  const cLang = LANGUAGES.some((l) => l.code === cLangPref) ? cLangPref : lang;
  const ct = useCallback((key, vars) => translate(cLang, key, vars), [cLang]);
  const [voiceChoice, setVoiceChoice] = useState(() => readLS(PACK_KEY));
  const [packIndex, setPackIndex] = useState([]);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setVoiceChoice(readLS(PACK_KEY));
    setCLangPref(readLS(CLANG_KEY));
    loadPackIndex().then((l) => { if (alive) setPackIndex(l); });
    return () => { alive = false; };
  }, [open]);
  const packList = packIndex.filter((p) => (p.langs || []).includes(cLang));
  const chosenPack = voiceChoice.startsWith("pack:") ? voiceChoice.slice(5) : "";
  const activePack = voiceChoice === "device" ? "" : (packList.find((p) => p.id === chosenPack) || packList[0])?.id || "";
  const coachPack = useRef("");
  coachPack.current = activePack;
  useEffect(() => { if (open && activePack) loadCoachClips(activePack, cLang); }, [open, activePack, cLang]);
  const cue = (c, force = false) => {
    if (!prefs.coach && !force) return;
    if (coachPack.current && playCoachClip(coachPack.current, cLang, clipId(c), true)) return;
    speak(cueText(c, ct, false), speechLang(cLang), true);
  };
  const hello = (pack, l) => {
    const c = { type: "on" };
    if (pack) loadCoachClips(pack, l).then(() => { if (!playCoachClip(pack, l, clipId(c), true)) speak(cueText(c, (k, v) => translate(l, k, v)), speechLang(l), true); });
    else window.setTimeout(() => speak(cueText(c, (k, v) => translate(l, k, v)), speechLang(l), true), 30);
  };
  const pickVoice = (val) => {
    unlockAudio();
    setVoiceChoice(val);
    writeLS(PACK_KEY, val);
    hello(val.startsWith("pack:") ? val.slice(5) : "", cLang);
  };
  const pickLang = (code) => {
    unlockAudio();
    const v = code === lang ? "" : code;
    setCLangPref(v);
    writeLS(CLANG_KEY, v);
    const pk = packIndex.filter((p) => (p.langs || []).includes(code));
    const p = voiceChoice === "device" ? "" : (pk.find((x) => x.id === chosenPack) || pk[0])?.id || "";
    hello(p, code);
  };
  const micAllowed = useMicEnabled();
  const list = useMemo(() => exercises.filter((e) => e.type !== "activity" && !e.paused), [exercises]);
  const last = useMemo(() => (open ? readLast() : {}), [open]);
  const [stage, setStage] = useState("setup"); // setup | run | summary
  const [exKey, setExKey] = useState("");
  const [work, setWork] = useState(40);
  const [rest, setRest] = useState(20);
  const [rounds, setRounds] = useState(8);
  const [reps, setReps] = useState([]); // Menge je Runde (Index = Runde-1)
  const [startAt, setStartAt] = useState(0); // Zeitpunkt, an dem elapsed = 0 wäre
  const [pausedAt, setPausedAt] = useState(0); // >0 = pausiert seit
  const [now, setNow] = useState(Date.now());
  const [mic, setMic] = useState(false);
  const [heard, setHeard] = useState("");
  const lastAnnounce = useRef("");
  const wakeLock = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStage("setup");
    setExKey(list.some((e) => e.key === last.exKey) ? last.exKey : list[0]?.key || "");
    setWork(last.work ?? 40);
    setRest(last.rest ?? 20);
    setRounds(last.rounds ?? 8);
    setMic(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const b = document.body.style.overflow;
    const h = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    return () => { document.body.style.overflow = b; document.documentElement.style.overscrollBehavior = h; };
  }, [open]);

  const ex = list.find((e) => e.key === exKey);
  const timeEx = ex && isTimeUnit(ex.unit); // z. B. Plank: Arbeitszeit zählt von selbst
  const phases = useMemo(() => buildPhases(work, rest, rounds), [work, rest, rounds]);
  const elapsed = stage === "run" && startAt ? ((pausedAt || now) - startAt) / 1000 : 0;
  const pos = phaseAt(phases, elapsed);
  const curRound = pos.phase.round;
  const total = sum(reps);

  // Takt
  useEffect(() => {
    if (stage !== "run" || pausedAt) return undefined;
    const iv = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(iv);
  }, [stage, pausedAt]);

  // Bildschirm anlassen, solange trainiert wird
  useEffect(() => {
    if (stage !== "run") return undefined;
    let cancelled = false;
    navigator.wakeLock?.request?.("screen").then((l) => { if (cancelled) l.release(); else wakeLock.current = l; }).catch(() => {});
    return () => { cancelled = true; wakeLock.current?.release?.().catch?.(() => {}); wakeLock.current = null; };
  }, [stage]);

  // Ansagen + Pieptöne an Phasenwechseln und in den letzten 3 Sekunden
  useEffect(() => {
    if (stage !== "run" || pausedAt) return;
    if (pos.done) {
      if (lastAnnounce.current !== "done") {
        lastAnnounce.current = "done";
        beep(990, 0.4);
        cue({ type: "woDone" });
        setStage("summary");
      }
      return;
    }
    const sec = Math.ceil(pos.left);
    const k = `${pos.index}:${sec}`;
    if (lastAnnounce.current === k) return;
    const fresh = !lastAnnounce.current.startsWith(`${pos.index}:`);
    lastAnnounce.current = k;
    if (fresh) {
      if (pos.phase.type === "work") {
        beep(1200, 0.25);
        // Ohne Pause (z. B. EMOM) sagt der Coach die Runde direkt an, sonst kam sie schon in der Pause
        const r = pos.phase.round;
        if (r === 1 || rest > 0) cue({ type: "go" });
        else cue(r === rounds ? { type: "woLast" } : { type: "woRound", n: r });
        if (timeEx) setReps((r) => { const n = [...r]; n[pos.phase.round - 1] = n[pos.phase.round - 1] ?? 0; return n; });
      } else if (pos.phase.type === "rest") {
        beep(500, 0.3);
        const nextRound = pos.phase.round + 1;
        cue(nextRound === rounds ? { type: "woRestLast" } : { type: "woNext", n: nextRound });
      }
    }
    // 3-2-1: im Countdown und am Ende jeder Phase (Coach zählt mit, dazu Piep)
    if (sec <= 3 && sec >= 1 && (!fresh || pos.phase.type === "countdown") && pos.phase.dur > 3) {
      beep(pos.phase.type === "countdown" ? 880 : 700, 0.1);
      cue({ type: "count", n: sec });
    } else if (sec <= 3 && sec >= 1 && pos.phase.type === "countdown") {
      beep(880, 0.1);
      cue({ type: "count", n: sec });
    }
    // Zeit-Übung: geleistete Arbeitszeit der Runde automatisch eintragen
    if (timeEx && pos.phase.type === "work") {
      const done = pos.phase.dur - pos.left;
      setReps((r) => { const n = [...r]; n[pos.phase.round - 1] = secondsToUnit(Math.round(done), ex.unit); return n; });
    }
    // cue/sayCoach/ct ändern sich je Render; doppelte Ansagen verhindert lastAnnounce
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.index, pos.left, pos.done, pos.phase, stage, pausedAt, rounds, rest, lang, t, timeEx, ex]);

  // Option „Live eintragen“: bei jedem Rundenwechsel (und am Ende) das Neue sofort speichern
  const flushLive = useCallback(() => {
    if (!prefs.live || !ex) return;
    const delta = Math.round((total - savedRef.current) * 100) / 100;
    if (delta <= 0) return;
    savedRef.current += delta;
    onLog?.([{ key: ex.key, amount: delta, day: (new Date().getDay() + 6) % 7, mode: "add" }], { silent: true });
  }, [prefs.live, ex, total, onLog]);
  const lastRound = useRef(0);
  useEffect(() => {
    if (stage === "run" && curRound !== lastRound.current) {
      if (lastRound.current) flushLive();
      lastRound.current = curRound;
    }
    if (stage === "summary") flushLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curRound, stage]);

  // Sperrbildschirm / Benachrichtigung (iPhone + Android, Media Session): Runde, Phase, Balken der Phase,
  // Play/Pause = Training pausieren, Vor = nächste Phase, Zurück = Phase neu. Ohne laufende Musik hält eine
  // unhörbare Tonspur die Anzeige wach (Betriebssysteme zeigen sie nur bei laufendem Ton). Schalter im Zahnrad.
  const silentRef = useRef(null);
  const musicByUs = useRef(false);
  const ctl = useRef({});
  const jumpTo = (sec) => {
    const tNow = Date.now();
    const ref = pausedRef.current || tNow;
    setStartAt(ref - sec * 1000);
    setNow(tNow);
    lastAnnounce.current = "";
  };
  ctl.current = {
    pause: () => {
      pauseToggle(true);
      silentRef.current?.pause();
      if (window.__tycMusicPlaying) { musicByUs.current = true; pauseMusic(); }
    },
    play: () => {
      pauseToggle(false);
      silentRef.current?.play().catch(() => {});
      if (musicByUs.current) { musicByUs.current = false; playMusic(); }
    },
    next: () => {
      const end = phases.slice(0, pos.index + 1).reduce((a, p) => a + p.dur, 0);
      if (pos.index >= phases.length - 1) finish(); else jumpTo(end);
    },
    prev: () => {
      const startOf = phases.slice(0, pos.index).reduce((a, p) => a + p.dur, 0);
      const into = pos.phase.dur - pos.left;
      jumpTo(into > 2 || pos.index === 0 ? startOf : startOf - phases[pos.index - 1].dur);
    },
  };
  const startLockAudio = () => {
    if (!prefs.lock || window.__tycMusicPlaying || silentRef.current) return;
    const a = new Audio("/sounds/silence.mp3");
    a.loop = true;
    a.setAttribute("playsinline", "");
    silentRef.current = a;
    window.__tycLockAudio = true;
    a.play().catch(() => {});
  };
  const stopLockAudio = () => {
    window.__tycLockAudio = false;
    if (silentRef.current) { silentRef.current.pause(); silentRef.current.src = ""; silentRef.current = null; }
  };
  const lockOn = stage === "run" && prefs.lock && "mediaSession" in navigator;
  useEffect(() => {
    if (!lockOn) return undefined;
    const ms = navigator.mediaSession;
    claimMediaSession();
    const h = { play: () => ctl.current.play(), pause: () => ctl.current.pause(), nexttrack: () => ctl.current.next(), previoustrack: () => ctl.current.prev() };
    for (const [k, fn] of Object.entries(h)) { try { ms.setActionHandler(k, fn); } catch { /* egal */ } }
    try { ms.setActionHandler("seekto", null); } catch { /* egal */ }
    return () => { stopLockAudio(); restoreMediaSession(); };
  }, [lockOn]);
  useEffect(() => () => { stopLockAudio(); }, []);
  // Anzeige: bei Phase, Runde, Pause, Menge neu (der Balken läuft vom System aus weiter)
  const phaseTitle = pausedAt ? t("wo.paused") : t(`wo.phase.${pos.phase.type}`);
  useEffect(() => {
    if (!lockOn || !ex) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new window.MediaMetadata({
        title: `${phaseTitle} · ${t("wo.round", { n: curRound, of: rounds })}`,
        artist: `${exerciseLabel(ex)} · ${formatAmount(total, ex.unit, locale)}`,
        album: "TrackYourCrew Workout",
        artwork: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
      });
      ms.playbackState = pausedAt ? "paused" : "playing";
      const dur = pos.phase.dur;
      ms.setPositionState?.({ duration: dur, position: Math.max(0, Math.min(dur, dur - pos.left)), playbackRate: 1 });
    } catch { /* egal */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockOn, ex, pos.index, curRound, rounds, pausedAt, total, phaseTitle, locale]);

  // Live-Status an die Crew (gebündelt), am Ende entfernen
  const liveTimer = useRef(0);
  useEffect(() => {
    if (stage !== "run" || !ex) return undefined;
    window.clearTimeout(liveTimer.current);
    liveTimer.current = window.setTimeout(() => {
      api.put("/me/live", { exercise_key: ex.key, round: curRound, rounds, phase: pos.phase.type === "countdown" ? "countdown" : pos.phase.type, reps: total }).catch(() => {});
    }, 700);
    return () => window.clearTimeout(liveTimer.current);
  }, [stage, ex, curRound, rounds, pos.phase.type, total]);
  // Lebenszeichen auch ohne Änderung (lange Arbeitsphasen), sonst verschwindet „LIVE“ nach 2 Min.
  const liveState = useRef(null);
  liveState.current = ex ? { exercise_key: ex.key, round: curRound, rounds, phase: pos.phase.type, reps: total } : null;
  useEffect(() => {
    if (stage !== "run") return undefined;
    const iv = window.setInterval(() => { if (liveState.current) api.put("/me/live", liveState.current).catch(() => {}); }, 45000);
    return () => window.clearInterval(iv);
  }, [stage]);
  useEffect(() => { if (stage !== "run") api.delete("/me/live").catch(() => {}); }, [stage]);
  useEffect(() => () => { api.delete("/me/live").catch(() => {}); }, []);

  const setRoundAmount = useCallback((round, fn) => {
    setReps((r) => { const n = [...r]; n[round - 1] = Math.max(0, Math.round(fn(Number(n[round - 1]) || 0) * 100) / 100); return n; });
  }, []);

  // Sprache: Zahl = Wiederholungen dieser Runde; „Pause“/„weiter“/„stopp“ steuern
  const voiceRef = useRef({});
  voiceRef.current = { curRound, pausedAt };
  useVoiceChannel(stage === "run" && mic, lang, (texts, isFinal) => {
    const text = cleanSpeech(texts[0]);
    if (text) setHeard(text);
    if (!isFinal || !text) return;
    const cmd = matchVoiceCommand(text);
    if (cmd === "pause") { pauseToggle(true); return; }
    if (cmd === "resume" || (cmd === "start" && voiceRef.current.pausedAt)) { pauseToggle(false); return; }
    if (cmd === "stop" || cmd === "save") { finish(); return; }
    const r = parseRepsSpeech(text);
    if (r) setRoundAmount(voiceRef.current.curRound, (v) => (r.mode === "add" ? v + r.n : r.n));
  }, () => setMic(false));

  const start = () => {
    unlockAudio();
    writeLast({ exKey, work, rest, rounds });
    setReps(Array.from({ length: rounds }, () => 0));
    savedRef.current = 0;
    lastRound.current = 0;
    lastAnnounce.current = "";
    const s = Date.now();
    setStartAt(s);
    setNow(s);
    setPausedAt(0);
    setStage("run");
    startLockAudio(); // im Tipp starten (Browser-Regel)
    if (mic) kickVoice(lang);
  };
  const pausedRef = useRef(0);
  pausedRef.current = pausedAt;
  function pauseToggle(force) {
    const p = pausedRef.current;
    const wantPause = force ?? !p;
    if (wantPause && !p) {
      window.speechSynthesis?.cancel?.();
      setPausedAt(Date.now());
    } else if (!wantPause && p) {
      const shift = Date.now() - p; // Pausenzeit zählt nicht
      setStartAt((st) => st + shift);
      setNow(Date.now());
      setPausedAt(0);
    }
  }
  function finish() {
    setStage("summary");
    setPausedAt(0);
  }
  const log = () => {
    const rest = Math.round((total - savedRef.current) * 100) / 100;
    if (ex && rest > 0) onLog?.([{ key: ex.key, amount: rest, day: (new Date().getDay() + 6) % 7, mode: "add" }]);
    savedRef.current = total;
    onClose?.();
  };

  if (!open) return null;
  const fmt = (v) => (ex ? formatAmount(v, ex.unit, locale) : String(v));
  const phaseColor = pos.phase.type === "rest" ? "#3BA0FF" : pos.phase.type === "countdown" ? "#FFD700" : "#CCFF00";
  const phaseLabel = pausedAt ? t("wo.paused") : t(`wo.phase.${pos.phase.type}`);
  const pct = pos.phase.dur ? Math.max(0, Math.min(100, (pos.left / pos.phase.dur) * 100)) : 0;
  const trainSeconds = totalSeconds(phases) - COUNTDOWN_S; // 3-2-1 zählt nicht zur Dauer
  const remainingAll = Math.max(0, trainSeconds - Math.max(0, elapsed - COUNTDOWN_S));

  return (
    <div className="fixed inset-0 z-[55] bg-[#0A0A0A] overflow-y-auto overscroll-contain" data-testid="workout">
      <div className="max-w-xl mx-auto px-4 pt-4 pb-10" style={{ paddingBottom: "calc(40px + env(safe-area-inset-bottom))" }}>
        <div className="flex items-center gap-2 mb-4">
          <Timer size={22} weight="bold" className="text-[#CCFF00]" />
          <p className="font-anton text-2xl tracking-tight mr-1">{t("wo.title")}</p>
          {/* Symbole wie im Eintrage-Formular */}
          <button type="button" onClick={(e) => { setShowSettings((v) => !v); e.currentTarget.blur(); }} aria-pressed={showSettings} aria-label={t("common.settings")} title={t("common.settings")}
            className={`w-7 h-7 flex items-center justify-center transition-colors focus:outline-none ${showSettings ? "text-black bg-[#FFD700]" : "text-[#FFD700] [@media(hover:hover)]:hover:bg-[#FFD700]/15 active:bg-[#FFD700]/15"}`} data-testid="wo-gear">
            <Gear size={18} weight={showSettings ? "fill" : "bold"} />
          </button>
          <button type="button" onClick={(e) => { unlockAudio(); setPrefs({ coach: !prefs.coach }); e.currentTarget.blur(); }} aria-pressed={prefs.coach} aria-label={t("wo.coach")} title={t("wo.coach")}
            className={`w-7 h-7 flex items-center justify-center transition-colors focus:outline-none ${prefs.coach ? "text-[#CCFF00]" : "text-ink-3"} [@media(hover:hover)]:hover:bg-[#CCFF00]/15 active:bg-[#CCFF00]/15`} data-testid="wo-coach">
            {prefs.coach ? <SpeakerHigh size={18} weight="fill" /> : <SpeakerSlash size={18} weight="bold" />}
          </button>
          {micAllowed && (
            <button type="button" onClick={(e) => { if (!mic && stage === "run") kickVoice(lang); setMic((m) => !m); e.currentTarget.blur(); }} aria-pressed={mic} aria-label={t("wo.voice")} title={t("wo.voice")}
              className={`w-7 h-7 flex items-center justify-center transition-colors focus:outline-none ${mic ? "text-black bg-[#FF3B30]" : "text-[#CCFF00] [@media(hover:hover)]:hover:bg-[#CCFF00]/15 active:bg-[#CCFF00]/15"}`} data-testid="wo-mic">
              <Microphone size={18} weight={mic ? "fill" : "bold"} className={mic && stage === "run" ? "animate-pulse" : ""} />
            </button>
          )}
          <span className="flex-1" />
          {prefs.live && (
            <span className="relative flex w-2.5 h-2.5 mr-1" data-testid="wo-live-indicator" aria-hidden="true">
              <span className="absolute inset-0 rounded-full bg-[#00FF66] opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-[#00FF66] shadow-[0_0_8px_rgba(0,255,102,0.6)]" />
            </span>
          )}
          <button type="button" onClick={() => (stage === "run" ? finish() : onClose?.())} className="w-10 h-10 border border-[#333] text-ink-2 hover:text-white flex items-center justify-center" aria-label={t("common.close")} data-testid="wo-close"><X size={18} weight="bold" /></button>
        </div>
        {showSettings && (
          <div className="flex flex-wrap gap-x-6 gap-y-3 mb-4">
          <label className="flex items-center gap-3 cursor-pointer select-none w-fit" data-testid="wo-live-row">
            <button type="button" role="switch" aria-checked={prefs.live} onClick={() => setPrefs({ live: !prefs.live })} data-testid="wo-live"
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${prefs.live ? "bg-[#CCFF00]" : "bg-[#2A2A2A] border border-[#333]"}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${prefs.live ? "left-[22px] bg-black" : "left-0.5 bg-[#888]"}`} />
            </button>
            <span className="text-[10px] uppercase tracking-widest text-ink-2">
              {t("log.live")} <span className={prefs.live ? "text-[#CCFF00]" : "text-ink-3"}>{prefs.live ? t("common.on") : t("common.off")}</span>
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer select-none w-fit" data-testid="wo-lock-row">
            <button type="button" role="switch" aria-checked={prefs.lock} onClick={() => setPrefs({ lock: !prefs.lock })} data-testid="wo-lock"
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${prefs.lock ? "bg-[#CCFF00]" : "bg-[#2A2A2A] border border-[#333]"}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${prefs.lock ? "left-[22px] bg-black" : "left-0.5 bg-[#888]"}`} />
            </button>
            <span className="text-[10px] uppercase tracking-widest text-ink-2">
              {t("wo.lockscreen")} <span className={prefs.lock ? "text-[#CCFF00]" : "text-ink-3"}>{prefs.lock ? t("common.on") : t("common.off")}</span>
            </span>
          </label>
          {/* Coach-Stimme + Sprache (gleiche Einstellung wie in der Stoppuhr) */}
          <div className="flex items-center gap-1.5 w-full" data-testid="wo-voice-row">
            <SpeakerHigh size={14} weight="fill" className="text-[#CCFF00] shrink-0" aria-hidden="true" />
            <select value={activePack ? `pack:${activePack}` : "device"} onChange={(e) => pickVoice(e.target.value)}
              aria-label={t("wo.coachVoice")} title={t("wo.coachVoice")}
              className="flex-1 min-w-0 max-w-[14rem] h-7 bg-[#0A0A0A] border border-[#333] text-[11px] text-ink-2 px-1.5" data-testid="wo-voice">
              {packList.map((p) => <option key={p.id} value={`pack:${p.id}`}>{p.label}</option>)}
              <option value="device">{t("sw.deviceVoice")}</option>
            </select>
            <select value={cLang} onChange={(e) => pickLang(e.target.value)} aria-label={t("sw.coachLang")} title={t("sw.coachLang")}
              className="h-7 bg-[#0A0A0A] border border-[#333] text-[11px] text-ink-2 px-1.5 uppercase" data-testid="wo-coachlang">
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.code.toUpperCase()}</option>)}
            </select>
          </div>
          </div>
        )}

        {stage === "setup" && (
          <div className="space-y-4">
            {list.length === 0 ? <p className="text-sm text-ink-2">{t("wo.noExercises")}</p> : (
              <>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-ink-3 mb-2">{t("chal.exercise")}</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((e) => (
                      <button key={e.key} type="button" onClick={() => setExKey(e.key)} data-testid={`wo-ex-${e.key}`}
                        className={`flex items-center gap-2 px-3 py-2 border text-sm ${exKey === e.key ? "border-[#CCFF00] text-white bg-[#CCFF00]/10" : "border-[#333] text-ink-2"}`}>
                        <span style={{ color: e.color }} className="flex"><ExerciseIcon icon={e.icon} size={16} /></span>{exerciseLabel(e)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[10px] uppercase tracking-widest text-ink-3">{t("wo.presets")}</p>
                    <button type="button" onClick={() => setEditPresets((v) => !v)} aria-pressed={editPresets} aria-label={t("wo.editPresets")} title={t("wo.editPresets")}
                      className={`w-6 h-6 flex items-center justify-center ${editPresets ? "text-black bg-[#FFD700]" : "text-[#FFD700]"}`} data-testid="wo-edit-presets">
                      {editPresets ? <Check size={12} weight="bold" /> : <PencilSimple size={12} weight="bold" />}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {presets.map((p) => (
                      <div key={p.id} className="relative">
                        <button type="button" onClick={() => { setWork(p.work); setRest(p.rest); setRounds(p.rounds); }} data-testid={`wo-preset-${p.id}`}
                          className={`w-full text-left px-3 py-2 border ${isCurrent(p) ? "border-[#CCFF00] bg-[#CCFF00]/10" : "border-[#222] bg-[#121212]"}`}>
                          <p className="font-anton text-lg leading-tight truncate pr-5">{presetLabel(p)}</p>
                          <p className="text-[11px] text-ink-3">{p.work}s / {p.rest}s × {p.rounds}</p>
                        </button>
                        {editPresets && (
                          <button type="button" onClick={() => deletePreset(p.id)} aria-label={t("common.remove")}
                            className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center text-ink-3 hover:text-[#FF3B30]" data-testid={`wo-del-${p.id}`}>
                            <X size={12} weight="bold" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {editPresets && (
                    <div className="mt-2 space-y-2">
                      <div className="flex gap-2">
                        <input value={presetName} onChange={(e) => setPresetName(e.target.value)} maxLength={24} placeholder={`${work}/${rest} × ${rounds}`}
                          className="flex-1 min-w-0 bg-[#0A0A0A] border border-[#333] px-3 py-2 text-sm text-white placeholder:text-ink-3 outline-none focus:border-[#CCFF00]/60" data-testid="wo-preset-name" />
                        <button type="button" onClick={savePreset} disabled={presets.some(isCurrent)}
                          className="shrink-0 border border-[#CCFF00]/60 text-[#CCFF00] px-3 text-[11px] uppercase tracking-widest font-bold flex items-center gap-1.5 disabled:opacity-40" data-testid="wo-preset-save">
                          <Plus size={12} weight="bold" /> {t("wo.savePreset")}
                        </button>
                      </div>
                      {Array.isArray(prefs.presets) && (
                        <button type="button" onClick={() => setPrefs({ presets: null })} className="text-[10px] uppercase tracking-widest text-ink-3 hover:text-white" data-testid="wo-preset-reset">
                          {t("wo.resetPresets")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stepper label={t("wo.work")} value={work} onChange={setWork} min={5} max={600} testid="wo-work" />
                  <Stepper label={t("wo.rest")} value={rest} onChange={setRest} min={0} max={600} testid="wo-rest" />
                  <Stepper label={t("wo.rounds")} value={rounds} onChange={setRounds} min={1} max={50} step={1} suffix="×" testid="wo-rounds" />
                </div>
                <p className="text-xs text-ink-3">{t("wo.totalTime", { time: formatClock(totalSeconds(phases) - COUNTDOWN_S) })}</p>
                <button type="button" onClick={start} disabled={!ex} data-testid="wo-start"
                  className="w-full bg-[#CCFF00] text-black font-bold uppercase tracking-[0.2em] py-4 flex items-center justify-center gap-2 glow-lime disabled:opacity-50">
                  <Play size={18} weight="fill" /> {t("wo.start")}
                </button>
              </>
            )}
          </div>
        )}

        {stage === "run" && ex && (
          <div className="space-y-4">
            <div className="border p-5 text-center" style={{ borderColor: phaseColor }}>
              <p className="text-xs uppercase tracking-[0.3em]" style={{ color: phaseColor }} data-testid="wo-phase">{phaseLabel}</p>
              <p className="font-anton text-8xl leading-none tabular-nums mt-2" style={{ color: phaseColor }} data-testid="wo-clock">
                {pos.phase.type === "countdown" ? Math.ceil(pos.left) : formatClock(Math.ceil(pos.left))}
              </p>
              <p className="text-sm text-ink-2 mt-2" data-testid="wo-round">{t("wo.round", { n: curRound, of: rounds })} · {t("wo.left", { time: formatClock(Math.ceil(remainingAll)) })}</p>
              <div className="h-1.5 bg-[#1A1A1A] mt-4"><div className="h-full transition-[width] duration-100 ease-linear" style={{ width: `${pct}%`, background: phaseColor }} /></div>
            </div>

            <div className="border border-[#222] bg-[#121212] p-4">
              <div className="flex items-center gap-2">
                <span style={{ color: ex.color }} className="flex"><ExerciseIcon icon={ex.icon} size={18} /></span>
                <p className="text-sm text-ink-2 flex-1">{exerciseLabel(ex)} · {t("wo.round", { n: curRound, of: rounds })}</p>
                <p className="text-[10px] uppercase tracking-widest text-ink-3">{t("wo.total")}</p>
                <p className="font-anton text-2xl text-[#CCFF00] tabular-nums" data-testid="wo-total">{fmt(total)}</p>
              </div>
              <div className="flex items-center justify-center gap-3 mt-3">
                {!timeEx && <button type="button" onClick={() => setRoundAmount(curRound, (v) => v - 1)} className="w-14 h-14 border border-[#333] text-ink-2 flex items-center justify-center" data-testid="wo-minus"><Minus size={22} weight="bold" /></button>}
                <span className="font-anton text-6xl tabular-nums min-w-[6rem] text-center" data-testid="wo-reps">{fmt(reps[curRound - 1] || 0)}</span>
                {!timeEx && <button type="button" onClick={() => setRoundAmount(curRound, (v) => v + 1)} className="w-14 h-14 bg-[#CCFF00] text-black flex items-center justify-center" data-testid="wo-plus"><Plus size={22} weight="bold" /></button>}
              </div>
              {!timeEx && (
                <div className="flex justify-center items-center gap-2 mt-3">
                  {editSteps ? DEFAULT_STEPS.map((d, i) => (
                    <input key={i} type="number" inputMode="decimal" min="0" placeholder={String(d)}
                      value={prefs.steps?.[i] ?? ""}
                      onChange={(e) => { const n = [...(prefs.steps || [])]; n[i] = e.target.value === "" ? undefined : Number(e.target.value); setPrefs({ steps: n }); }}
                      className="w-14 px-2 py-1.5 bg-[#0A0A0A] border border-[#CCFF00]/50 text-center text-xs text-white placeholder:text-ink-3 outline-none" data-testid={`wo-step-${i}`} aria-label={`+${d}`} />
                  )) : steps.map((n, i) => (
                    <button key={i} type="button" onClick={() => setRoundAmount(curRound, (v) => v + n)} className="px-3 py-1.5 border border-[#333] text-xs text-ink-2" data-testid={`wo-add-${i}`}>+{n}</button>
                  ))}
                  <button type="button" onClick={() => setEditSteps((e) => !e)} aria-pressed={editSteps} aria-label={t("log.stepsTitle")} title={t("log.stepsTitle")}
                    className={`w-8 h-8 flex items-center justify-center ${editSteps ? "text-black bg-[#FFD700]" : "text-[#FFD700]"}`} data-testid="wo-edit-steps">
                    {editSteps ? <Check size={14} weight="bold" /> : <PencilSimple size={14} weight="bold" />}
                  </button>
                </div>
              )}
              {mic && <p className="text-[11px] text-ink-3 text-center mt-3" data-testid="wo-heard">{heard ? `„${heard.slice(0, 60)}“` : t("wo.voiceHint")}</p>}
              <div className="flex flex-wrap gap-1.5 mt-4" data-testid="wo-rounds-list">
                {Array.from({ length: rounds }, (_, i) => (
                  <span key={i} className={`text-[11px] px-2 py-1 border tabular-nums ${i + 1 === curRound ? "border-[#CCFF00] text-white" : i + 1 < curRound ? "border-[#333] text-ink-2" : "border-[#1A1A1A] text-ink-3"}`}>
                    R{i + 1} {i + 1 <= curRound ? fmt(reps[i] || 0) : "–"}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => pauseToggle()} className="flex-1 border border-[#333] text-white uppercase tracking-widest text-sm py-4 flex items-center justify-center gap-2" data-testid="wo-pause">
                {pausedAt ? <><Play size={18} weight="fill" /> {t("sw.resume")}</> : <><Pause size={18} weight="fill" /> {t("sw.pause")}</>}
              </button>
              <button type="button" onClick={finish} className="flex-1 border border-[#FF3B30]/50 text-[#FF3B30] uppercase tracking-widest text-sm py-4 flex items-center justify-center gap-2" data-testid="wo-finish">
                <Stop size={18} weight="fill" /> {t("wo.finish")}
              </button>
            </div>
          </div>
        )}

        {stage === "summary" && ex && (
          <div className="space-y-4 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-[#CCFF00] mt-4">{t("wo.summary")}</p>
            <p className="font-anton text-6xl text-[#CCFF00] tabular-nums" data-testid="wo-sum">{fmt(total)}</p>
            {prefs.live && <p className="text-xs text-[#00FF66]" data-testid="wo-live-saved">{t("wo.liveSaved")}</p>}
            <p className="text-sm text-ink-2 flex items-center justify-center gap-2"><span style={{ color: ex.color }} className="flex"><ExerciseIcon icon={ex.icon} size={16} /></span>{exerciseLabel(ex)}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {reps.map((v, i) => <span key={i} className="text-[11px] px-2 py-1 border border-[#333] text-ink-2 tabular-nums">R{i + 1} {fmt(v || 0)}</span>)}
            </div>
            <div className="flex gap-3 pt-2">
              {!prefs.live && <button type="button" onClick={onClose} className="border border-[#333] text-ink-2 uppercase tracking-widest text-xs px-5 py-4" data-testid="wo-discard">{t("voice.discard")}</button>}
              <button type="button" onClick={log} disabled={!prefs.live && total <= 0} className="flex-1 bg-[#CCFF00] text-black font-bold uppercase tracking-[0.2em] py-4 flex items-center justify-center gap-2 glow-lime disabled:opacity-50" data-testid="wo-log">
                <Check size={18} weight="bold" /> {prefs.live ? t("wo.done") : t("voice.apply")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
