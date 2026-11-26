import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "../i18n";
import { canPromptInstall, onPromptAvailable, promptInstall } from "../lib/install";

const NEON = "#CCFF00";

// Teilen-Symbol wie in Safari (Quadrat mit Pfeil nach oben).
const ShareGlyph = ({ size = 38, color = NEON }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" />
    <path d="M12 15V3" />
    <path d="M8.5 6.5 12 3l3.5 3.5" />
  </svg>
);
const AddGlyph = ({ size = 38 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={NEON} strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M12 8.5v7M8.5 12h7" />
  </svg>
);
const MenuGlyph = ({ size = 38 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={NEON} aria-hidden="true">
    <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
  </svg>
);
const Bolt = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill={NEON} aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
);

function Step({ n, title, hint, glyph }) {
  return (
    <div className="flex items-center gap-3 mt-3 border border-[#222] bg-[#121212] p-3">
      <span className="font-anton text-[26px] leading-none w-[18px] text-center" style={{ color: NEON }}>{n}</span>
      <p className="text-[13px] text-[#DDD] leading-snug min-w-0">
        {title}
        {hint && <span className="block text-xs text-ink-3 mt-0.5">{hint}</span>}
      </p>
      <span className="ml-auto shrink-0">{glyph}</span>
    </div>
  );
}

function Benefits({ t }) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {["install.benefit1", "install.benefit2", "install.benefit3"].map((k) => (
        <span key={k} className="text-[10px] uppercase tracking-[0.15em] text-ink-2 border border-[#222] px-2 py-1">
          <b className="mr-1" style={{ color: NEON }}>✓</b>{t(k)}
        </span>
      ))}
    </div>
  );
}

// Blatt von unten (Plan 10). platform: "ios" | "android" | "inapp".
// Kommt von selbst nur einmal (Dean 2026-11-26) -> nur noch ein „Schließen“, kein „Später/Nicht mehr zeigen“
export default function InstallSheet({ open, platform, onClose }) {
  const { t } = useI18n();
  const [canPrompt, setCanPrompt] = useState(canPromptInstall());
  useEffect(() => onPromptAvailable(setCanPrompt), []);

  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") onClose?.("installed");
  };

  const footer = (
    <div className="flex gap-2.5 mt-4">
      <button type="button" onClick={() => onClose?.("closed")} className="flex-1 border border-[#222] text-ink-2 uppercase tracking-[0.18em] text-[11px] font-bold py-3 hover:border-[#444]" data-testid="install-close">
        {t("common.close")}
      </button>
    </div>
  );

  let body = null;
  if (platform === "ios") {
    body = (
      <>
        <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: NEON }}>{t("install.kicker")}</p>
        <h2 className="font-anton text-[28px] leading-none uppercase mt-1.5">{t("install.iosTitle")}</h2>
        <Benefits t={t} />
        <Step n="1" title={<>{t("install.iosStep1")}</>} hint={t("install.iosStep1Hint")} glyph={<ShareGlyph />} />
        <Step n="2" title={<b>{t("install.iosStep2")}</b>} hint={t("install.iosStep2Hint")} glyph={<AddGlyph />} />
        {footer}
      </>
    );
  } else if (platform === "android") {
    body = (
      <>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 shrink-0 bg-black border flex items-center justify-center" style={{ borderColor: NEON }}><Bolt /></div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: NEON }}>{t("install.kicker")}</p>
            <h2 className="font-anton text-2xl leading-none uppercase mt-1">{canPrompt ? t("install.androidTitle") : t("install.androidManualTitle")}</h2>
          </div>
        </div>
        <Benefits t={t} />
        {canPrompt ? (
          <button type="button" onClick={install} className="w-full mt-4 bg-[#CCFF00] text-black uppercase tracking-[0.18em] text-[11px] font-bold py-3 hover:bg-[#D4FF33]" data-testid="install-android-button">
            {t("install.androidButton")}
          </button>
        ) : (
          <>
            <Step n="1" title={t("install.androidStep1")} glyph={<MenuGlyph />} />
            <Step n="2" title={<b>{t("install.androidStep2")}</b>} glyph={<AddGlyph />} />
          </>
        )}
        {footer}
      </>
    );
  } else if (platform === "inapp") {
    body = (
      <>
        <p className="text-[10px] uppercase tracking-[0.3em] text-[#FF8800]">{t("install.inappKicker")}</p>
        <h2 className="font-anton text-2xl leading-none uppercase mt-1.5">{t("install.inappTitle")}</h2>
        <p className="text-[13px] text-[#DDD] leading-relaxed mt-2">{t("install.inappText")}</p>
        {footer}
      </>
    );
  }

  return createPortal(
    <AnimatePresence>
      {open && body && (
        <motion.div className="fixed inset-0 z-[70]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="install-sheet">
          <div className="absolute inset-0 bg-black/60" onClick={() => onClose?.("closed")} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("install.kicker")}
            className="absolute left-0 right-0 bottom-0 mx-auto max-w-md bg-[#0E0E0E] border-t border-x md:border-b px-5 pt-5 shadow-[0_-12px_40px_rgba(0,0,0,0.7)]"
            style={{ borderColor: platform === "inapp" ? "#FF8800" : NEON, paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {body}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
