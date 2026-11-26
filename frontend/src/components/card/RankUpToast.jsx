// Teil der Nutzerkarte, ausgelagert aus UserCard.jsx (BACKLOG W1, 2026-11-25).
import { useEffect } from "react";
import { motion } from "framer-motion";
import { useI18n } from "../../i18n";
import { RANK_COLORS } from "../../lib/ranks";

// ─────────────────────────────────────────────────────────────────────────
// 🏆 RankUpToast: schickes Aufstiegs-Banner mit Glow-Burst + Sweep-Linie
// + Auto-Dismiss-Balken. Erscheint zentriert über der Card-Rückseite,
// wenn die Person einen neuen Rang erreicht hat. Solo-Leveling-inspiriert
// (dunkler Background, Akzent in Rangfarbe, schwerer Anton-Font für den
// Buchstaben, dünner farbiger Rahmen). Kein Hardcoded Blau/Cyan – die
// Akzentfarbe kommt aus RANK_COLORS[letter].
// ─────────────────────────────────────────────────────────────────────────
// Rang-Feiern (docs/MEILENSTEINE.md): ab A ein eigener Satz, S+ länger und größer.
export const CELEBRATE_KEY = { A: "A", S: "S", "S+": "SP" };

export function RankUpToast({ exerciseName, letter, onDismiss, isMe = true, userName = "" }) {
  const { t } = useI18n();
  const palette = RANK_COLORS[letter] || RANK_COLORS.F;

  const celebrateKey = CELEBRATE_KEY[letter];
  const elite = letter === "S+";
  const duration = elite ? 7.0 : celebrateKey ? 5.5 : 4.0;
  useEffect(() => {
    const h = setTimeout(onDismiss, duration * 1000 + 200);
    return () => clearTimeout(h);
  }, [onDismiss, duration]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -28, scale: 0.86 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -18, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 320, damping: 24, mass: 0.6 }}
      onClick={onDismiss}
      className="pointer-events-auto relative overflow-hidden rounded-md backdrop-blur-md cursor-pointer"
      style={{
        background:
          "linear-gradient(135deg, rgba(8,8,8,0.94) 0%, rgba(22,22,22,0.88) 100%)",
        border: `1px solid ${palette.color}`,
        boxShadow: elite
          ? `0 0 48px ${palette.glow}, 0 0 90px ${palette.glow}, inset 0 1px 0 rgba(255,255,255,0.08)`
          : `0 0 26px ${palette.glow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
        minWidth: 240,
        maxWidth: elite ? 340 : 320,
      }}
      data-testid={`rank-up-toast-${letter}`}
      aria-label={t("rank.newFor", { letter, name: exerciseName })}
    >
      {/* Initialer Glow-Burst */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0.9, scale: 0.5 }}
        animate={{ opacity: 0, scale: 2.4 }}
        transition={{ duration: 1.25, ease: "easeOut" }}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 18% 50%, ${palette.glow} 0%, transparent 65%)`,
        }}
      />
      {/* Sweep-Linie über die Karte */}
      <motion.div
        aria-hidden
        initial={{ x: "-110%" }}
        animate={{ x: "210%" }}
        transition={{ duration: 1.15, ease: "easeOut", delay: 0.18 }}
        className="absolute top-0 bottom-0 w-1/3 pointer-events-none"
        style={{
          background: `linear-gradient(90deg, transparent, ${palette.color}55, transparent)`,
        }}
      />

      <div className="relative flex items-center gap-3 px-3 py-2.5">
        {/* Rang-Letter mit Scale-Pop */}
        <motion.div
          initial={{ scale: 0.4, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.05 }}
          className="shrink-0 w-12 h-12 flex items-center justify-center font-anton"
          style={{
            color: palette.color,
            fontSize: letter === "S+" ? 22 : 28,
            lineHeight: 1,
            textShadow: `0 0 14px ${palette.glow}, 0 0 4px ${palette.color}`,
            border: `1.5px solid ${palette.color}`,
            background: "rgba(0,0,0,0.45)",
          }}
        >
          {letter}
        </motion.div>

        <div className="flex-1 min-w-0">
          <p
            className="font-anton text-[10px] tracking-[0.35em] uppercase leading-none"
            style={{ color: palette.color }}
          >
            {t("rank.reached")}
          </p>
          <p
            className="font-anton text-base text-white uppercase tracking-[0.08em] truncate mt-1 leading-none"
            style={{ textShadow: "0 0 8px rgba(255,255,255,0.15)" }}
          >
            {exerciseName}
          </p>
          <p className="text-[10px] tracking-[0.3em] uppercase text-ink-2 mt-1">
            {t("rank.new")} · {letter}
          </p>
          {celebrateKey && (
            <p className="text-xs leading-snug mt-1.5" style={{ color: palette.color }} data-testid="rank-celebrate">
              {isMe ? t(`rank.celebrate.${celebrateKey}`) : `${userName} ${t(`rank.celebrateFriend.${celebrateKey}`)}`}
            </p>
          )}
        </div>
      </div>

      {/* Fortschritts-/Dismiss-Timer */}
      <motion.div
        aria-hidden
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration, ease: "linear" }}
        className="absolute bottom-0 left-0 right-0 h-[2px] origin-left"
        style={{ background: palette.color, opacity: 0.7 }}
      />
    </motion.div>
  );
}

