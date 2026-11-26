// Workout-Modus (Intervall-Timer, Dean 2026-11-26): Vollbild neben „Fortschritt eintragen“.
// Einstellen (Übung, Arbeit/Pause/Runden, Vorlagen) -> 3-2-1 -> Runden mit Ansagen + Pieptönen,
// Wiederholungen je Runde per Tippen oder Sprache, Summe live -> am Ende „Eintragen“.
// Während des Trainings sieht die Crew auf der Karte „LIVE · Runde 3/8 · 34“ (PUT /me/live).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Play, Pause, Stop, Minus, Plus, Microphone, MicrophoneSlash, Check, Timer } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { useI18n } from "../i18n";
import { speechLang, isTimeUnit, secondsToUnit, formatClock, matchVoiceCommand } from "../lib/stopwatch";
import { exerciseLabel } from "../lib/exercises";
import { formatAmount } from "../lib/amount";
import { useMicEnabled } from "../lib/mic";
import { useVoiceChannel, cleanSpeech, kickVoice } from "../lib/voiceHub";
import { getAudioCtx, unlockAudio } from "../lib/coachAudio";
import { duckDuring } from "../lib/audioSession";
import { PRESETS, buildPhases, phaseAt, parseRepsSpeech, clampInt, sum, totalSeconds } from "../lib/workout";
import ExerciseIcon from "./ExerciseIcon";

const KEY = "tyc_workout";
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

function say(text, lang) {
  try {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang(lang);
    u.rate = 1.1;
    duckDuring(u); // iPhone: eigene Musik leiser statt gestoppt
    window.speechSynthesis.speak(u);
  } catch { /* egal */ }
}

function Stepper({ label, value, onChange, min, max, step = 5, suffix = "s", testid }) {
  return (
    <div className="border border-[#222] bg-[#121212] p-3">
      <p className="text-[10px] uppercase tracking-widest text-ink-3">{label}</p>
      <div className="flex items-center justify-between mt-1">
        <button type="button" onClick={() => onChange(clampInt(value - step, min, max))} className="w-10 h-10 border border-[#333] text-ink-2 flex items-center justify-center" aria-label="-" data-testid={`${testid}-minus`}><Minus size={16} weight="bold" /></button>
        <span className="font-anton text-3xl tabular-nums" data-testid={testid}>{value}<span className="text-sm text-ink-3 ml-0.5">{suffix}</span></span>
        <button type="button" onClick={() => onChange(clampInt(value + step, min, max))} className="w-10 h-10 border border-[#333] text-ink-2 flex items-center justify-center" aria-label="+" data-testid={`${testid}-plus`}><Plus size={16} weight="bold" /></button>
      </div>
    </div>
  );
}

export default function Workout({ open, onClose, exercises = [], onLog }) {
  const { t, lang, locale } = useI18n();
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
        say(t("wo.say.done"), lang);
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
        say(pos.phase.round === rounds ? t("wo.say.last") : t("wo.say.go"), lang);
        if (timeEx) setReps((r) => { const n = [...r]; n[pos.phase.round - 1] = n[pos.phase.round - 1] ?? 0; return n; });
      } else if (pos.phase.type === "rest") {
        beep(500, 0.3);
        say(t("wo.say.rest"), lang);
      }
    }
    if (sec <= 3 && sec >= 1 && (!fresh || pos.phase.type === "countdown")) beep(pos.phase.type === "countdown" ? 880 : 700, 0.1);
    // Zeit-Übung: geleistete Arbeitszeit der Runde automatisch eintragen
    if (timeEx && pos.phase.type === "work") {
      const done = pos.phase.dur - pos.left;
      setReps((r) => { const n = [...r]; n[pos.phase.round - 1] = secondsToUnit(Math.round(done), ex.unit); return n; });
    }
  }, [pos.index, pos.left, pos.done, pos.phase, stage, pausedAt, rounds, lang, t, timeEx, ex]);

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
    lastAnnounce.current = "";
    const s = Date.now();
    setStartAt(s);
    setNow(s);
    setPausedAt(0);
    setStage("run");
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
    if (ex && total > 0) onLog?.([{ key: ex.key, amount: total, day: (new Date().getDay() + 6) % 7, mode: "add" }]);
    onClose?.();
  };

  if (!open) return null;
  const fmt = (v) => (ex ? formatAmount(v, ex.unit, locale) : String(v));
  const phaseColor = pos.phase.type === "rest" ? "#3BA0FF" : pos.phase.type === "countdown" ? "#FFD700" : "#CCFF00";
  const phaseLabel = pausedAt ? t("wo.paused") : t(`wo.phase.${pos.phase.type}`);
  const pct = pos.phase.dur ? Math.max(0, Math.min(100, (pos.left / pos.phase.dur) * 100)) : 0;
  const remainingAll = Math.max(0, totalSeconds(phases) - elapsed);

  return (
    <div className="fixed inset-0 z-[55] bg-[#0A0A0A] overflow-y-auto" data-testid="workout">
      <div className="max-w-xl mx-auto px-4 pt-4 pb-10" style={{ paddingBottom: "calc(40px + env(safe-area-inset-bottom))" }}>
        <div className="flex items-center gap-3 mb-4">
          <Timer size={22} weight="bold" className="text-[#CCFF00]" />
          <p className="font-anton text-2xl tracking-tight flex-1">{t("wo.title")}</p>
          <button type="button" onClick={() => (stage === "run" ? finish() : onClose?.())} className="w-10 h-10 border border-[#333] text-ink-2 hover:text-white flex items-center justify-center" aria-label={t("common.close")} data-testid="wo-close"><X size={18} weight="bold" /></button>
        </div>

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
                  <p className="text-[10px] uppercase tracking-widest text-ink-3 mb-2">{t("wo.presets")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {PRESETS.map((p) => {
                      const on = p.work === work && p.rest === rest && p.rounds === rounds;
                      return (
                        <button key={p.id} type="button" onClick={() => { setWork(p.work); setRest(p.rest); setRounds(p.rounds); }} data-testid={`wo-preset-${p.id}`}
                          className={`text-left px-3 py-2 border ${on ? "border-[#CCFF00] bg-[#CCFF00]/10" : "border-[#222] bg-[#121212]"}`}>
                          <p className="font-anton text-lg leading-tight">{t(`wo.preset.${p.id}`)}</p>
                          <p className="text-[11px] text-ink-3">{p.work}s / {p.rest}s × {p.rounds}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stepper label={t("wo.work")} value={work} onChange={setWork} min={5} max={600} testid="wo-work" />
                  <Stepper label={t("wo.rest")} value={rest} onChange={setRest} min={0} max={600} testid="wo-rest" />
                  <Stepper label={t("wo.rounds")} value={rounds} onChange={setRounds} min={1} max={50} step={1} suffix="×" testid="wo-rounds" />
                </div>
                <p className="text-xs text-ink-3">{t("wo.totalTime", { time: formatClock(totalSeconds(phases)) })}</p>
                {micAllowed && (
                  <button type="button" onClick={() => setMic((m) => !m)} aria-pressed={mic} data-testid="wo-mic"
                    className={`w-full flex items-center gap-3 border p-3 text-left ${mic ? "border-[#FF3B30] text-white" : "border-[#222] text-ink-2"}`}>
                    {mic ? <Microphone size={18} weight="fill" className="text-[#FF3B30]" /> : <MicrophoneSlash size={18} weight="bold" />}
                    <span className="text-sm flex-1">{t("wo.voice")}</span>
                    <span className="text-[10px] uppercase tracking-widest">{mic ? t("common.on") : t("common.off")}</span>
                  </button>
                )}
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
                <div className="flex justify-center gap-2 mt-3">
                  {[5, 10, 15].map((n) => <button key={n} type="button" onClick={() => setRoundAmount(curRound, (v) => v + n)} className="px-3 py-1.5 border border-[#333] text-xs text-ink-2" data-testid={`wo-add-${n}`}>+{n}</button>)}
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
              {micAllowed && (
                <button type="button" onClick={() => { if (!mic) kickVoice(lang); setMic((m) => !m); }} aria-pressed={mic} className={`w-14 border flex items-center justify-center ${mic ? "border-[#FF3B30] text-[#FF3B30]" : "border-[#333] text-ink-2"}`} aria-label={t("wo.voice")} data-testid="wo-mic-run">
                  {mic ? <Microphone size={18} weight="fill" className="animate-pulse" /> : <MicrophoneSlash size={18} weight="bold" />}
                </button>
              )}
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
            <p className="text-sm text-ink-2 flex items-center justify-center gap-2"><span style={{ color: ex.color }} className="flex"><ExerciseIcon icon={ex.icon} size={16} /></span>{exerciseLabel(ex)}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {reps.map((v, i) => <span key={i} className="text-[11px] px-2 py-1 border border-[#333] text-ink-2 tabular-nums">R{i + 1} {fmt(v || 0)}</span>)}
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="border border-[#333] text-ink-2 uppercase tracking-widest text-xs px-5 py-4" data-testid="wo-discard">{t("voice.discard")}</button>
              <button type="button" onClick={log} disabled={total <= 0} className="flex-1 bg-[#CCFF00] text-black font-bold uppercase tracking-[0.2em] py-4 flex items-center justify-center gap-2 glow-lime disabled:opacity-50" data-testid="wo-log">
                <Check size={18} weight="bold" /> {t("voice.apply")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
