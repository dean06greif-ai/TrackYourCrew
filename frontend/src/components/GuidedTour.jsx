import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, ArrowLeft, Check, Lightning, TrendUp, UsersThree, Microphone } from "@phosphor-icons/react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../i18n";
import { TOUR_EVENT, TOUR_STEPS } from "../lib/tour";

// Rahmen (4 px) liegt mittig auf der Kante des Ziels und überdeckt so dessen eigenen
// (gelben) Rand – keine doppelten Rahmen. Gilt nur, solange das Tutorial läuft.
const PAD = 2;
const GAP = 12;
const NEON = "#CCFF00";
const MISSING_MS = 1500; // so lange darf ein Ziel fehlen, bevor es zum Rückfall-Schritt geht

// Tutorial auf der echten Seite (Plan 4a, überarbeitet): hebt ein Element hervor, der
// Rest ist abgedunkelt. Ein fetter weißer Rahmen leuchtet und
// pulsiert – bei Aufgaben etwas kräftiger, bei Erklärungen ruhiger. Weiter/zurück mit Pfeilen
// (auch per Tastatur ←/→, Esc beendet). Klicks gehen ganz normal an die Seite durch.
export default function GuidedTour({ step, onStep, onEnd, onNeed }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const cfg = TOUR_STEPS[step];
  const welcome = cfg?.id === "welcome";
  const [rect, setRect] = useState(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const cardRef = useRef(null);
  const [cardH, setCardH] = useState(0);
  const total = TOUR_STEPS.length;
  const last = step === total - 1;
  const action = !!cfg?.advance;

  const next = useCallback(() => {
    if (last) return onEnd();
    userNav.current = true;
    return onStep(step + 1);
  }, [last, onEnd, onStep, step]);
  const back = useCallback(() => {
    if (step <= 0) return;
    userNav.current = true;
    onStep(step - 1);
  }, [onStep, step]);
  // onStep kommt bei jedem Neuzeichnen neu: über eine Ref, damit die Vermessung nicht neu startet.
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const onNeedRef = useRef(onNeed);
  onNeedRef.current = onNeed;
  // Schritt mit Ziel, das man erst öffnen muss (per Pfeil statt Knopf hergekommen):
  // die Seite öffnet es, statt dass das Tutorial zurückspringt.
  const userNav = useRef(false);

  // Ziel suchen, ins Bild holen, laufend vermessen; fehlt es zu lange -> Rückfall-Schritt.
  useEffect(() => {
    if (!cfg) return undefined;
    let scrolled = false;
    let timer = 0;
    let lastKey = "";
    let missingSince = 0;
    if (cfg.needs && userNav.current) onNeedRef.current?.(cfg.needs);
    userNav.current = false;
    const measure = () => {
      if (!cfg.target) { setRect(null); return; }
      const els = [...document.querySelectorAll(`[data-tour="${cfg.target}"]`)];
      const el = els.find((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0);
      if (el) {
        missingSince = 0;
        if (!scrolled) {
          scrolled = true;
          const h = el.getBoundingClientRect().height;
          if (h > window.innerHeight * 0.6) {
            // Hohes Ziel: Anfang zeigen (unter der festen Kopfzeile), nicht die Mitte.
            window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
          } else {
            el.scrollIntoView({ block: "center", behavior: "smooth" });
          }
        }
        const r = el.getBoundingClientRect();
        const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
        if (key !== lastKey) {
          lastKey = key;
          setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
        }
      } else {
        if (lastKey !== "none") {
          lastKey = "none";
          setRect(null);
        }
        if (Number.isInteger(cfg.fallback)) {
          if (!missingSince) missingSince = Date.now();
          else if (Date.now() - missingSince > MISSING_MS) {
            onStepRef.current(cfg.fallback);
            return;
          }
        }
      }
      timer = window.setTimeout(measure, 150);
    };
    measure();
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [cfg]);

  // Echte Aktion des Nutzers -> nächster Schritt.
  useEffect(() => {
    if (!cfg?.advance) return undefined;
    const onEvt = (e) => {
      if (e.detail === cfg.advance) next();
    };
    window.addEventListener(TOUR_EVENT, onEvt);
    return () => window.removeEventListener(TOUR_EVENT, onEvt);
  }, [cfg, next]);

  // Tastatur: → weiter, ← zurück, Esc beenden (nicht während man tippt).
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "");
      if (e.key === "Escape") onEnd();
      else if (!typing && e.key === "ArrowRight") next();
      else if (!typing && e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, onEnd]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.getBoundingClientRect().height);
  }, [step, rect, vp]);

  if (!cfg) return null;

  // Erklärkarte unter dem Ziel, sonst darüber; hohe Ziele (Formular): Karte oben.
  const cardW = Math.min(welcome ? 400 : 340, vp.w - 32);
  let top;
  let left = (vp.w - cardW) / 2;
  if (rect) {
    left = Math.max(16, Math.min(rect.left + rect.width / 2 - cardW / 2, vp.w - cardW - 16));
    const below = rect.top + rect.height + PAD + GAP;
    const above = rect.top - PAD - GAP - cardH;
    if (cfg.card === "bottom") top = vp.h - cardH - 16;
    else if (rect.height > vp.h * 0.5) top = 16;
    else if (below + cardH <= vp.h - 16) top = below;
    else if (above >= 16) top = above;
    else top = vp.h - cardH - 16;
  } else if (!cfg.target) {
    top = (vp.h - cardH) / 2;
  } else {
    top = vp.h - cardH - 24;
  }

  // Immer ein fetter weißer, leuchtender Rahmen um das, was man ansehen bzw. antippen soll.
  const spotStyle = {
    borderColor: "#FFFFFF",
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.68), 0 0 22px 4px rgba(255,255,255,0.75), inset 0 0 14px rgba(255,255,255,0.3)",
  };

  return createPortal(
    // Ganz oben, auch über den Hinweis-Meldungen (sonner), damit nichts die Erklärung verdeckt.
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 2147483000 }} data-testid="guided-tour">
      <AnimatePresence>
        {rect ? (
          <motion.div
            key="spot"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="absolute border-4"
            style={spotStyle}
            data-testid="tour-spotlight"
            data-action={action ? "1" : "0"}
          >
            {/* Weißes Pulsieren, damit das Auge sofort hinfindet (bei Aufgaben etwas kräftiger) */}
            <motion.span
              aria-hidden
              className="absolute -inset-[4px] border-4 border-white"
              initial={{ opacity: action ? 0.95 : 0.7, scale: 1 }}
              animate={{ opacity: 0, scale: action ? 1.1 : 1.06 }}
              transition={{ duration: action ? 1.2 : 1.6, repeat: Infinity, ease: "easeOut" }}
            />
          </motion.div>
        ) : (
          <motion.div key="dim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" />
        )}
      </AnimatePresence>

      <motion.div
        ref={cardRef}
        key={step}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="absolute pointer-events-auto bg-[#0E0E0E] border border-[#CCFF00] shadow-[0_10px_40px_rgba(0,0,0,0.7)] p-4"
        style={{ width: cardW, left, top: Math.max(16, top), visibility: cardH ? "visible" : "hidden" }}
        role="dialog"
        aria-live="polite"
        aria-label={t(`tour.${cfg.id}.title`)}
        data-testid="tour-card"
      >
        {/* Fortschritt: ein Balken je Schritt */}
        <div className="flex gap-1 mb-3" aria-hidden>
          {TOUR_STEPS.map((s, i) => (
            <span key={s.id} className="h-[3px] flex-1" style={{ background: i <= step ? NEON : "#2A2A2A" }} />
          ))}
        </div>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] uppercase tracking-[0.3em] leading-4" style={{ color: NEON }}>
            {t("tour.step", { n: step + 1, total })}
          </p>
          <button type="button" onClick={onEnd} aria-label={t("tour.end")} title={t("tour.end")} className="-mt-1 -mr-1 w-6 h-6 flex items-center justify-center text-ink-3 hover:text-white" data-testid="tour-close">
            <X size={14} weight="bold" />
          </button>
        </div>
        {welcome && <Lightning size={30} weight="fill" className="mt-2" style={{ color: NEON }} />}
        <p className={`font-anton uppercase tracking-tight text-white mt-1 ${welcome ? "text-3xl" : "text-xl"}`}>{t(`tour.${cfg.id}.title`, { name: (user?.name || "").split(" ")[0] })}</p>
        <p className="text-sm text-ink-2 leading-relaxed mt-1">{t(`tour.${cfg.id}.text`)}</p>
        {welcome && (
          <ul className="mt-3 space-y-2" data-testid="tour-welcome-points">
            {[[TrendUp, "p1"], [UsersThree, "p2"], [Microphone, "p3"]].map(([Icon, k]) => (
              <li key={k} className="flex items-start gap-2.5 text-sm text-white leading-snug">
                <Icon size={18} weight="bold" className="shrink-0 mt-0.5" style={{ color: NEON }} />
                <span>{t(`tour.welcome.${k}`)}</span>
              </li>
            ))}
          </ul>
        )}
        {welcome && <p className="text-xs text-ink-3 mt-3">{t("tour.welcome.hint")}</p>}
        {action && (
          <p className="flex items-center gap-2 mt-2 text-[10px] uppercase tracking-widest text-white">
            <span className="w-2 h-2 border-2 border-white shadow-[0_0_6px_rgba(255,255,255,0.9)]" aria-hidden />
            {t("tour.doIt")}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 mt-4">
          <button type="button" onClick={onEnd} className="text-[10px] uppercase tracking-widest text-ink-3 hover:text-white" data-testid="tour-end">
            {t("tour.end")}
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                aria-label={t("tour.back")}
                title={t("tour.back")}
                className="w-10 h-10 flex items-center justify-center border border-[#333] text-ink-2 hover:text-white hover:border-[#555] transition-colors"
                data-testid="tour-back"
              >
                <ArrowLeft size={18} weight="bold" />
              </button>
            )}
            <button
              type="button"
              onClick={next}
              aria-label={last ? t("tour.done") : t("tour.next")}
              title={last ? t("tour.done") : t("tour.next")}
              className="h-10 min-w-10 px-3 flex items-center justify-center gap-2 bg-[#CCFF00] text-black font-bold uppercase tracking-widest text-xs hover:bg-[#D4FF33] transition-colors"
              data-testid="tour-next"
            >
              {last ? (<><Check size={18} weight="bold" />{t("tour.done")}</>) : <ArrowRight size={18} weight="bold" />}
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
