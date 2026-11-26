import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightning, ArrowRight, ArrowLeft, Copy, Check, CalendarBlank, Fire, UsersThree, Translate } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n, LANGUAGES, weekdayNames } from "../i18n";
import ExerciseIcon from "./ExerciseIcon";

// Standardnamen je Sprache (wie im Backend), damit die Vorschau beim Sprachwechsel mitzieht.
const DEFAULT_NAMES = {
  en: { ex1: "Running", ex2: "Push-ups", ex3: "Pull-ups" },
  de: { ex1: "Lauf", ex2: "Liegestütze", ex3: "Klimmzüge" },
  es: { ex1: "Correr", ex2: "Flexiones", ex3: "Dominadas" },
  fr: { ex1: "Course", ex2: "Pompes", ex3: "Tractions" },
};
const isDefaultName = (key, name) => Object.values(DEFAULT_NAMES).some((n) => n[key] === name);

function nextMonday(locale) {
  const d = new Date();
  const add = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + add);
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

/**
 * Einführung für neue Nutzer:
 * 1) Sprache + worum geht's  2) Startwerte  3) Wann starten (nicht montags)  4) Crew einladen
 */
export default function Onboarding({ user, exercises = [], onDone }) {
  const { t, lang, setLang, locale } = useI18n();
  const [step, setStep] = useState(0);
  const [goals, setGoals] = useState(() =>
    Object.fromEntries(exercises.map((e) => [e.key, ""])) // Vorschläge nur grau (Platzhalter)
  );
  const [pct, setPct] = useState(5);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const isMonday = todayIdx === 0;
  const daysLeft = 7 - todayIdx;
  const [start, setStart] = useState(isMonday ? "now" : todayIdx >= 4 ? "monday" : "now");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const tag = `${user?.name || ""}#${user?.handle || ""}`;

  const steps = useMemo(() => (isMonday ? ["intro", "goals", "crew"] : ["intro", "goals", "start", "crew"]), [isMonday]);
  const current = steps[step];
  const last = step === steps.length - 1;
  const exName = (ex) => (isDefaultName(ex.key, ex.name) ? DEFAULT_NAMES[lang]?.[ex.key] || ex.name : ex.name);

  const chooseLanguage = (code) => {
    setLang(code);
    api.put("/me/language", { language: code }).catch(() => {});
  };

  const finish = async () => {
    setSaving(true);
    try {
      const cleaned = Object.fromEntries(
        Object.entries(goals)
          .map(([k, v]) => {
            const raw = String(v ?? "").trim();
            const ex = exercises.find((e) => e.key === k);
            return [k, raw === "" ? Number(ex?.goal) : Number(raw.replace(",", "."))];
          })
          .filter(([, v]) => Number.isFinite(v) && v >= 0)
      );
      const { data } = await api.post("/me/onboarding", { start, goals: cleaned, progression_pct: pct, language: lang });
      onDone?.(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.error"), { duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const copyTag = async () => {
    try {
      await navigator.clipboard.writeText(tag);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("common.copyFailed"), { duration: 2000 });
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center px-4" data-testid="onboarding">
      <div className="relative w-full max-w-lg bg-[#0E0E0E] border border-[#CCFF00]/40 shadow-[0_0_60px_rgba(204,255,0,0.08)]" role="dialog" aria-modal="true" aria-label={t("onb.aria")}>
        <div className="flex gap-1.5 p-5 pb-0">
          {steps.map((s, i) => (
            <div key={s} className={`h-1 flex-1 transition-colors ${i <= step ? "bg-[#CCFF00]" : "bg-[#222]"}`} />
          ))}
        </div>

        <div className="p-6 md:p-8 min-h-[460px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
            >
              {current === "intro" && (
                <div data-testid="onboarding-intro">
                  <div className="flex flex-wrap items-center gap-1.5 mb-6" role="group" aria-label={t("settings.language")} data-testid="onboarding-language">
                    <Translate size={16} className="text-ink-3 mr-1" />
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => chooseLanguage(l.code)}
                        aria-pressed={lang === l.code}
                        className={`px-2.5 py-1.5 text-xs border transition-colors ${lang === l.code ? "border-[#CCFF00] bg-[#CCFF00] text-black font-bold" : "border-[#222] text-ink-2 hover:border-[#444]"}`}
                        data-testid={`onboarding-lang-${l.code}`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#CCFF00] mb-3 flex items-center gap-2">
                    <Lightning size={14} weight="fill" /> {t("onb.welcome")}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
                  </p>
                  <h2 className="font-anton text-4xl leading-none tracking-tight mb-5">{t("onb.howTitle")}</h2>
                  <ul className="space-y-4 text-sm text-ink-2 leading-relaxed">
                    {[1, 2, 3].map((n) => (
                      <li key={n} className="flex gap-3">
                        <span className="font-anton text-[#CCFF00] text-lg leading-none mt-0.5">{n}</span>
                        <span><span className="text-white font-bold">{t(`onb.how${n}Title`)}</span> {t(`onb.how${n}Text`)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-ink-3 mt-6">{t("onb.changeLater")}</p>
                </div>
              )}

              {current === "goals" && (
                <div data-testid="onboarding-goals">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#CCFF00] mb-3">{t("onb.step", { n: 2 })}</p>
                  <h2 className="font-anton text-4xl leading-none tracking-tight mb-2">{t("onb.goalsTitle")}</h2>
                  <p className="text-sm text-ink-2 mb-5">{t("onb.goalsText")}</p>
                  <div className="space-y-2">
                    {exercises.map((ex) => (
                      <label key={ex.key} className="flex items-center gap-3 border border-[#222] bg-[#121212] px-4 py-3">
                        <ExerciseIcon icon={ex.icon} size={18} />
                        <span className="flex-1 font-anton text-xl" style={{ color: ex.color }}>{exName(ex)}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          value={goals[ex.key] ?? ""}
                          placeholder={String(ex.goal ?? "")}
                          onChange={(e) => setGoals((g) => ({ ...g, [ex.key]: e.target.value }))}
                          className="w-24 h-10 bg-[#0A0A0A] border border-[#333] focus:border-[#CCFF00] outline-none font-anton text-xl text-center text-white placeholder:text-ink-3"
                          data-testid={`onboarding-goal-${ex.key}`}
                        />
                        <span className="w-8 text-xs text-ink-3 uppercase">{ex.unit || "×"}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-5">
                    <p className="text-[10px] uppercase tracking-widest text-ink-3 mb-2">{t("onb.increase")}</p>
                    <div className="flex gap-2">
                      {[0, 3, 5, 10].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPct(v)}
                          className={`flex-1 py-2 border font-anton text-lg transition-colors ${pct === v ? "border-[#CCFF00] bg-[#CCFF00] text-black" : "border-[#222] text-ink-2 hover:border-[#444]"}`}
                          data-testid={`onboarding-pct-${v}`}
                        >
                          {v === 0 ? t("onb.none") : `+${v} %`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {current === "start" && (
                <div data-testid="onboarding-start">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#CCFF00] mb-3">{t("onb.step", { n: 3 })}</p>
                  <h2 className="font-anton text-4xl leading-none tracking-tight mb-2">{t("onb.startTitle")}</h2>
                  <p className="text-sm text-ink-2 mb-5">{t("onb.startText", { day: weekdayNames(locale)[todayIdx] })}</p>
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setStart("now")}
                      className={`w-full text-left border p-4 transition-colors ${start === "now" ? "border-[#CCFF00] bg-[#CCFF00]/[0.06]" : "border-[#222] hover:border-[#444]"}`}
                      data-testid="onboarding-start-now"
                    >
                      <p className="font-anton text-xl flex items-center gap-2"><Fire size={18} weight="fill" className="text-[#FF8800]" /> {t("onb.nowTitle")}</p>
                      <p className="text-xs text-ink-2 mt-1">{t(daysLeft === 1 ? "onb.nowTextOne" : "onb.nowText", { n: daysLeft })}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStart("monday")}
                      className={`w-full text-left border p-4 transition-colors ${start === "monday" ? "border-[#CCFF00] bg-[#CCFF00]/[0.06]" : "border-[#222] hover:border-[#444]"}`}
                      data-testid="onboarding-start-monday"
                    >
                      <p className="font-anton text-xl flex items-center gap-2"><CalendarBlank size={18} className="text-[#CCFF00]" /> {t("onb.mondayTitle", { date: nextMonday(locale) })}</p>
                      <p className="text-xs text-ink-2 mt-1">{t("onb.mondayText")}</p>
                    </button>
                  </div>
                </div>
              )}

              {current === "crew" && (
                <div data-testid="onboarding-crew">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#CCFF00] mb-3 flex items-center gap-2"><UsersThree size={14} weight="fill" /> {t("onb.lastStep")}</p>
                  <h2 className="font-anton text-4xl leading-none tracking-tight mb-2">{t("onb.crewTitle")}</h2>
                  <p className="text-sm text-ink-2 mb-5">{t("onb.crewText")}</p>
                  <button
                    type="button"
                    onClick={copyTag}
                    className="w-full flex items-center justify-between gap-3 border border-[#CCFF00]/50 bg-[#121212] px-4 py-4 hover:bg-[#161616] transition-colors"
                    data-testid="onboarding-copy-tag"
                  >
                    <span className="font-anton text-2xl tracking-wide truncate">{tag}</span>
                    <span className="text-[#CCFF00] shrink-0">{copied ? <Check size={20} weight="bold" /> : <Copy size={20} weight="bold" />}</span>
                  </button>
                  <p className="text-xs text-ink-3 mt-4 leading-relaxed">{t("onb.crewHint")}</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-3 p-5 border-t border-[#1A1A1A]">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className={`text-xs uppercase tracking-widest flex items-center gap-2 text-ink-2 hover:text-white transition-colors ${step === 0 ? "invisible" : ""}`}
          >
            <ArrowLeft size={14} /> {t("common.back")}
          </button>
          <button
            type="button"
            onClick={() => (last ? finish() : setStep((s) => s + 1))}
            disabled={saving}
            className="bg-[#CCFF00] hover:bg-[#D4FF33] text-black font-bold uppercase tracking-widest py-3 px-6 flex items-center gap-2 glow-lime disabled:opacity-60"
            data-testid="onboarding-next"
          >
            {last ? (saving ? t("common.saving") : t("onb.go")) : t("common.next")} <ArrowRight size={14} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}
