// Aktivität eintragen (Dean 2026-11-26): Tag antippen = erledigt, nochmal = zurück. Zukunft gesperrt.
import ExerciseIcon from "./ExerciseIcon";
import { exerciseLabel } from "../lib/exercises";
import { doneDays } from "../lib/activities";

export function ActivityLogRow({ activity, days, todayIdx, dayNames, onToggle }) {
  const n = doneDays(days, activity.key).length;
  const goal = Math.max(1, Math.round(Number(activity.goal) || 1));
  const done = n >= goal;
  const color = activity.color || "#CCFF00";
  return (
    <div className="border border-[#222] bg-[#0E0E0E] p-3" data-testid={`activity-log-${activity.key}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 border flex items-center justify-center shrink-0" style={{ color, borderColor: color }}><ExerciseIcon icon={activity.icon} size={16} /></span>
          <span className="font-anton text-lg truncate">{exerciseLabel(activity)}</span>
        </div>
        <span className={`font-anton text-lg ${done ? "text-[#00FF66]" : "text-white"}`} data-testid={`activity-log-count-${activity.key}`}>
          {n} <span className="text-ink-3 text-sm">/ {goal}</span>{done ? " ✓" : ""}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 mt-2.5">
        {dayNames.map((d, i) => (
          <ActivityDayButton key={i} on={Number(days?.[i]?.[activity.key]) > 0} future={i > todayIdx} today={i === todayIdx}
            color={color} label={d} onClick={() => onToggle(activity.key, i)} testid={`activity-day-${activity.key}-${i}`} />
        ))}
      </div>
    </div>
  );
}

export function ActivityDayButton({ on, future, today, color, label, onClick, testid, compact = false }) {
  return (
    <button
      type="button"
      onClick={future ? undefined : onClick}
      disabled={future}
      aria-pressed={on}
      data-testid={testid}
      className={`border text-[10px] tracking-widest uppercase transition-colors ${compact ? "w-full h-8" : "py-2"} ${future ? "opacity-30 cursor-default border-[#2A2A2A] text-ink-3" : on ? "text-black font-bold" : "border-[#2A2A2A] text-ink-3 hover:border-[#555] hover:text-white"} ${today ? "outline outline-1 outline-dashed outline-[#666] outline-offset-2" : ""}`}
      style={on && !future ? { background: color, borderColor: color } : undefined}
    >
      {compact ? (on ? "✓" : "") : label}
    </button>
  );
}
