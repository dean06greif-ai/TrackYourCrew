import { useState } from "react";
import { TrendUp, TrendDown, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n } from "../i18n";
import { exerciseLabel } from "../lib/exercises";

import { formatAmount } from "../lib/amount";
// Smarter Ziel-Vorschlag (Plan 12f): dezenter Hinweis unter dem Eintragen-Knopf.
// "Nein danke" merkt sich der Browser für 4 Wochen je Übung und Richtung.
const KEY = "tyc_goal_hint";
const SNOOZE_WEEKS = 4;

function readSnoozed() {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeSnoozed(v) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* egal */
  }
}

export default function GoalHint({ me, onChanged }) {
  const { t, locale } = useI18n();
  const [snoozed, setSnoozed] = useState(readSnoozed);
  const [busy, setBusy] = useState(false);
  const week = me?.week_number || 0;
  const list = (me?.goal_suggestions || []).filter((s) => !(snoozed[`${s.key}:${s.kind}`] > week));
  const sg = list[0];
  if (!sg) return null;
  const ex = (me.exercises || []).find((e) => e.key === sg.key);
  if (!ex) return null;
  const up = sg.kind === "up";
  const Icon = up ? TrendUp : TrendDown;

  const snooze = () => {
    const next = { ...snoozed, [`${sg.key}:${sg.kind}`]: week + SNOOZE_WEEKS };
    writeSnoozed(next);
    setSnoozed(next);
  };
  const accept = async () => {
    setBusy(true);
    try {
      await api.post(`/goals/me/exercises/${encodeURIComponent(sg.key)}/goal`, { value: sg.suggested });
      toast.success(t("hint.saved", { name: exerciseLabel(ex), goal: formatAmount(sg.suggested, ex.unit, locale) }), { duration: 2200 });
      await onChanged?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.error"), { duration: 2500 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border border-[#222] bg-[#121212] p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="goal-hint" data-kind={sg.kind}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <Icon size={20} weight="bold" className="shrink-0 mt-0.5" style={{ color: ex.color }} />
        <p className="text-sm text-ink-2 leading-relaxed">
          <span className="text-white">{exerciseLabel(ex)}: </span>
          {t(up ? "hint.upText" : "hint.downText", { n: sg.weeks, pct: sg.pct })}{" "}
          <span className="text-white">
            {t(up ? "hint.upAsk" : "hint.downAsk", { from: formatAmount(sg.goal, ex.unit, locale), to: formatAmount(sg.suggested, ex.unit, locale) })}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
        <button
          type="button"
          onClick={snooze}
          disabled={busy}
          data-testid="goal-hint-no"
          className="h-9 px-3 text-[10px] uppercase tracking-widest text-ink-3 hover:text-white transition-colors flex items-center gap-1"
        >
          <X size={12} weight="bold" /> {t("hint.no")}
        </button>
        <button
          type="button"
          onClick={accept}
          disabled={busy}
          data-testid="goal-hint-yes"
          className="h-9 px-4 border border-[#CCFF00]/60 text-[#CCFF00] hover:bg-[#CCFF00] hover:text-black uppercase tracking-widest text-[10px] transition-colors disabled:opacity-50"
        >
          {t(up ? "hint.upYes" : "hint.downYes")}
        </button>
      </div>
    </div>
  );
}
