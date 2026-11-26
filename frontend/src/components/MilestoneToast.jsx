import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flag, UsersThree } from "@phosphor-icons/react";
import ExerciseIcon from "./ExerciseIcon";
import { useI18n, formatNumber } from "../i18n";
import { parseMilestoneId, totalsByKind, WEIGHT_PER_REP } from "../lib/milestones";
import { iconForKind } from "../lib/exercises";

const NEON = "#CCFF00";

// Text-Bausteine eines Meilensteins (auch für die Liste auf der Kartenrückseite).
export function milestoneTexts(t, locale, id, entry) {
  const p = parseMilestoneId(id);
  if (!p) return null;
  const group = entry ? totalsByKind(entry)[p.kind] : null;
  const exercise = group?.name || t(`icon.${iconForKind(p.kind) || "pushup"}`);
  const params = { count: formatNumber(p.count || 0, locale), exercise };
  let total = null;
  if (group) {
    if (group.family === "distance") total = `${formatNumber(Math.round(group.total * 10) / 10, locale)} km`;
    else if (group.family === "time") total = `${formatNumber(Math.round(group.total / 60), locale)} min`;
    else if (p.family === "weight") total = `${exercise}: ${formatNumber(Math.round((group.total * (WEIGHT_PER_REP[p.kind] || 0)) / 1000), locale)} t`;
    else total = `${formatNumber(Math.round(group.total), locale)} ${exercise}`;
  }
  return {
    icon: p.family === "crew" ? null : iconForKind(p.kind),
    crew: p.family === "crew",
    weight: p.family === "weight",
    title: t(`ms.title.${p.mid}`, params),
    text: t(`ms.text.${p.mid}`, params),
    total,
  };
}

function MilestoneToast({ item, onDismiss }) {
  const { t, locale } = useI18n();
  const info = milestoneTexts(t, locale, item.id, item.entry);
  useEffect(() => {
    const h = setTimeout(onDismiss, 6000);
    return () => clearTimeout(h);
  }, [onDismiss]);
  if (!info) return null;
  const header = item.crew
    ? t("ms.crewLabel")
    : item.isMe ? t("ms.label") : `${item.entry?.name || ""} · ${t("ms.label")}`;
  const sub = item.crew || item.isMe ? info.text : info.total ? t("ms.total", { value: info.total }) : info.text;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -24, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 320, damping: 24, mass: 0.6 }}
      onClick={onDismiss}
      role="status"
      className="pointer-events-auto relative overflow-hidden cursor-pointer w-[min(340px,calc(100vw-32px))] bg-[#0B0B0B]/95 backdrop-blur-md border"
      style={{ borderColor: NEON, boxShadow: "0 0 26px rgba(204,255,0,0.35)" }}
      data-testid={`milestone-toast-${item.id}`}
    >
      <motion.div
        aria-hidden
        initial={{ x: "-110%" }}
        animate={{ x: "210%" }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 0.15 }}
        className="absolute top-0 bottom-0 w-1/3 pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent, rgba(204,255,0,0.25), transparent)" }}
      />
      <div className="relative flex items-center gap-3 px-3 py-3">
        <motion.div
          initial={{ scale: 0.4, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.05 }}
          className="shrink-0 w-11 h-11 flex items-center justify-center border"
          style={{ borderColor: NEON, color: NEON }}
        >
          {info.crew ? <UsersThree size={22} weight="bold" /> : info.icon ? <ExerciseIcon icon={info.icon} size={22} className="flex" /> : <Flag size={22} weight="bold" />}
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.3em] leading-none truncate" style={{ color: NEON }}>{header}</p>
          <p className="font-anton text-lg text-white uppercase leading-tight mt-1 truncate">{info.title}</p>
          <p className="text-xs text-ink-2 leading-snug mt-0.5">{sub}</p>
        </div>
      </div>
      <motion.div
        aria-hidden
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: 5.8, ease: "linear" }}
        className="absolute bottom-0 left-0 right-0 h-[2px] origin-left"
        style={{ background: NEON, opacity: 0.7 }}
      />
    </motion.div>
  );
}

export default function MilestoneToasts({ toasts, onDismiss }) {
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 pointer-events-none" aria-live="polite">
      <AnimatePresence>
        {toasts.map((item) => (
          <MilestoneToast key={item.key} item={item} onDismiss={() => onDismiss(item.key)} />
        ))}
      </AnimatePresence>
    </div>
  );
}
