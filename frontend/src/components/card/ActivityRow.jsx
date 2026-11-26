// Aktivität auf der Karte (Dean 2026-11-26): Kästchen statt Balken, „1/2“ bzw. ✓.
// large: wenn die Karte nur Aktivitäten hat – größer, damit sie die Karte füllt.
import ExerciseIcon from "../ExerciseIcon";
import { exerciseLabel } from "../../lib/exercises";

export function ActivityRow({ activity, value, large = false }) {
  const goal = Math.max(1, Math.round(Number(activity.goal) || 1));
  const n = Math.max(0, Math.round(Number(value) || 0));
  const done = n >= goal;
  const boxes = Math.max(goal, Math.min(n, 7));
  const color = activity.color || "#CCFF00";
  const box = large ? "w-5 h-5" : "w-3 h-3";
  return (
    <div className={large ? "space-y-2.5" : "flex items-center justify-between gap-3"} data-testid={`activity-row-${activity.key}`}>
      <div className={`flex items-center gap-2 min-w-0 tracking-widest uppercase text-ink-2 ${large ? "text-xs justify-between" : "text-xs"}`}>
        <span className="flex items-center gap-2 min-w-0">
          <span style={{ color }} className="shrink-0"><ExerciseIcon icon={activity.icon} size={large ? 18 : 16} /></span>
          <span className="truncate">{exerciseLabel(activity)}</span>
        </span>
        {large && <span className={`font-bold shrink-0 ${done ? "text-[#00FF66]" : "text-white"}`}>{Math.round((Math.min(n, goal) / goal) * 100)}%{done ? " ✓" : ""}</span>}
      </div>
      <div className={`flex items-center shrink-0 ${large ? "justify-between" : "gap-1.5"}`}>
        <div className={`flex items-center ${large ? "gap-2" : "gap-1.5"}`}>
          {Array.from({ length: boxes }, (_, i) => (
            <span
              key={i}
              className={`${box} border transition-all`}
              style={i < n ? { background: color, borderColor: color, boxShadow: `0 0 8px ${color}99` } : { borderColor: "#444" }}
            />
          ))}
        </div>
        {large ? (
          <span className="font-anton leading-none text-3xl" data-testid={`activity-count-${activity.key}`}>
            <span className={done ? "text-[#00FF66]" : "text-white"}>{n}</span>
            <span className="text-ink-2 text-sm tracking-wider"> / {goal}</span>
          </span>
        ) : (
          <span className={`font-anton text-lg leading-none ml-1.5 min-w-[2.25rem] text-right ${done ? "text-[#00FF66]" : "text-white"}`} data-testid={`activity-count-${activity.key}`}>
            {done ? "✓" : `${n}/${goal}`}
          </span>
        )}
      </div>
    </div>
  );
}
