import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "../i18n";

// Emojis schicken + Herausfordern direkt auf der Karte eines Crew-Mitglieds (Dean, 2026-11-25).
export const EMOJIS = ["😂", "😢", "🔥", "😎", "💪", "👏"];

// Sprechblase wie das bisherige Symbol (mit Textstrichen), nur der Zipfel unten zeigt leicht nach links
export function BubbleIcon({ size = 18, filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="16"
      strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d="M40,48H216a8,8,0,0,1,8,8V184a8,8,0,0,1-8,8H142L94,226l8-34H40a8,8,0,0,1-8-8V56A8,8,0,0,1,40,48Z"
        fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : 0} />
      <path d="M96,104h64M96,136h64" />
    </svg>
  );
}

// Herausfordern-Symbol: „VS“ im Kasten, im Schrift-Stil der Seite (Dean 2026-11-25, Vorschlag 3)
export function VsIcon({ size = 18 }) {
  return (
    <span
      aria-hidden
      className="font-anton inline-flex items-center justify-center leading-none tracking-[0.02em] border-[1.5px] border-current"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.52) }}
    >
      VS
    </span>
  );
}

const SMALL_BTN = "h-8 w-8 flex items-center justify-center transition-colors";

// Eckige Sprechblase: antippen -> Auswahl der 6 Emojis; ein Emoji antippen schickt es und schließt die Auswahl.
export function EmojiSender({ name, onSend, disabled }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        aria-label={t("emoji.send", { name })}
        title={t("emoji.send", { name })}
        data-testid="emoji-open"
        className={`${SMALL_BTN} ${open ? "text-[#CCFF00]" : "text-ink-3 hover:text-white"}`}
      >
        <BubbleIcon size={18} filled={open} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-2 z-40 flex gap-1 border border-[#333] bg-[#0A0A0A] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.7)]"
            role="menu"
            data-testid="emoji-picker"
          >
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                role="menuitem"
                aria-label={t("emoji.aria", { emoji: e })}
                onClick={() => { setOpen(false); onSend(e); }}
                data-testid={`emoji-pick-${e}`}
                className="w-10 h-10 flex items-center justify-center text-2xl leading-none hover:bg-[#1A1A1A] active:scale-90 transition-transform"
              >
                <span aria-hidden>{e}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ChallengeButton({ onClick, name }) {
  const { t } = useI18n();
  const label = t("chal.challengeName", { name });
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid="card-challenge"
      className={`${SMALL_BTN} text-ink-3 hover:text-[#CCFF00]`}
    >
      <VsIcon size={18} />
    </button>
  );
}

// Emoji-Animation oben rechts auf der Karte: springt auf, schwebt hoch, verblasst.
// `item` = {id, emoji, from?}; `onDone` wenn fertig (dann kommt das nächste in der Warteschlange).
export function EmojiBurst({ item, onDone }) {
  return (
    <div className="pointer-events-none absolute -top-9 right-10 z-40" aria-live="polite" data-testid="emoji-burst-wrap">
      <AnimatePresence onExitComplete={() => {}}>
        {item && (
          <motion.div
            key={item.id}
            className="flex flex-col items-center"
            initial={{ opacity: 0, scale: 0.2, y: 14, rotate: -12 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.2, 1.45, 1.1, 1.0], y: [14, 0, -10, -36], rotate: [-12, 8, -4, 0] }}
            transition={{ duration: 2.2, times: [0, 0.18, 0.6, 1], ease: "easeOut" }}
            onAnimationComplete={() => onDone?.(item.id)}
            data-testid="emoji-burst"
          >
            <span className="text-5xl leading-none drop-shadow-[0_0_14px_rgba(204,255,0,0.45)]">{item.emoji}</span>
            {item.from && (
              <span className="mt-1 text-[10px] uppercase tracking-widest text-white bg-[#0A0A0A] border border-[#333] px-1.5 py-0.5 whitespace-nowrap">
                {item.from}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
