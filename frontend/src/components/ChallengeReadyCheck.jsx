// Ready-Check für Herausforderungen (Dean 2026-11-26): Wer herausgefordert wird, bekommt ein Fenster
// mit einem Balken, der in 60 Sekunden abläuft. Annehmen = verbindlich (kein Zurück), sonst verpasst.
// Eigene Sounds (utils/soundEffects): Signal beim Erscheinen, Bestätigung beim Annehmen.
import { useEffect, useMemo, useRef, useState } from "react";
import { Sword, UsersThree, Check } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n } from "../i18n";
import { formatAmount } from "../lib/amount";
import { exerciseLabel, detectExerciseKind } from "../lib/exercises";
import ExerciseIcon from "./ExerciseIcon";
import { useChallenges, CHALLENGES_EVENT } from "./Challenges";
import { startChallengeLoop, playChallengeAccept, playChallengeDecline, preloadChallengeSounds } from "../utils/soundEffects";

const sameUnit = (a, b) => (a || "").trim().toLowerCase().replace(/\.$/, "") === (b || "").trim().toLowerCase().replace(/\.$/, "");

export default function ChallengeReadyCheck({ board, meId }) {
  const { t, locale } = useI18n();
  const [list] = useChallenges(!!meId);
  const handled = useRef(new Set()); // schon gezeigt und erledigt (angenommen/abgelehnt/verpasst)
  const [cur, setCur] = useState(null); // { c, deadline }
  const [now, setNow] = useState(Date.now());
  const [phase, setPhase] = useState("ask"); // ask | busy | accepted
  const [pick, setPick] = useState("");

  // Nächste offene Einladung mit Restzeit -> Fenster öffnen
  useEffect(() => {
    if (cur || !list) return;
    const c = list.find((x) => x.my_status === "invited" && x.expires_in > 0 && !handled.current.has(x.id));
    if (!c) return;
    setCur({ c, deadline: Date.now() + c.expires_in * 1000 });
    setPhase("ask");
    setPick("");
  }, [list, cur]);

  // Sounds gleich beim Öffnen des Dashboards laden (dann startet der Sound beim Herausfordern sofort)
  useEffect(() => { preloadChallengeSounds(); }, []);

  // Sound läuft die ganze Annahme-Phase, in den letzten 10 s drängender; endet sofort danach
  const loop = useRef(null);
  const curId = cur?.c.id;
  useEffect(() => {
    if (!curId) return undefined;
    loop.current = startChallengeLoop();
    return () => { loop.current?.stop(); loop.current = null; };
  }, [curId]);

  // Balken: 10× pro Sekunde, bei 0 -> verpasst
  useEffect(() => {
    if (!cur || phase === "accepted") return undefined;
    const iv = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(iv);
  }, [cur, phase]);
  const left = cur ? Math.max(0, cur.deadline - now) : 0;
  useEffect(() => { loop.current?.setUrgent(left > 0 && left < 10000); }, [left]);
  useEffect(() => {
    if (!cur || phase !== "ask" || left > 0) return;
    handled.current.add(cur.c.id);
    playChallengeDecline();
    const from = cur.c.participants.find((p) => p.user_id === cur.c.creator_id)?.name || "";
    toast(t("chal.rc.missed", { name: from }), { id: `rc-missed-${cur.c.id}`, duration: 4000 });
    setCur(null);
    window.dispatchEvent(new Event(CHALLENGES_EVENT));
  }, [left, cur, phase, t]);

  // Passende eigene Übung (gleiche Einheit, am liebsten gleiche Art)
  const c = cur?.c;
  const myExercises = useMemo(() => ((board?.users || []).find((u) => u.user_id === meId)?.exercises || []).filter((e) => e.type !== "activity" && !e.paused), [board, meId]);
  const candidates = useMemo(() => (c?.ex ? myExercises.filter((e) => sameUnit(e.unit, c.ex.unit)) : []), [myExercises, c]);
  const kind = c?.ex ? detectExerciseKind(c.ex.name) : null;
  const preferred = candidates.find((e) => kind && detectExerciseKind(e.name) === kind) || candidates[0];
  const chosen = pick || preferred?.key || "";

  if (!c) return null;
  const from = c.participants.find((p) => p.user_id === c.creator_id)?.name || "";
  const total = (c.accept_seconds || 60) * 1000;
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  const urgent = left < 10000;
  const Icon = c.kind === "team" ? UsersThree : Sword;

  const close = () => {
    handled.current.add(c.id);
    setCur(null);
    window.dispatchEvent(new Event(CHALLENGES_EVENT));
  };
  const accept = async () => {
    if (!chosen || phase !== "ask") return;
    setPhase("busy");
    loop.current?.stop();
    try {
      await api.post(`/challenges/${c.id}/accept`, { to_key: chosen });
      playChallengeAccept();
      setPhase("accepted");
      window.setTimeout(close, 1400);
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.error"), { duration: 3000 });
      close();
    }
  };
  const decline = async () => {
    loop.current?.stop();
    playChallengeDecline();
    setPhase("busy");
    try { await api.post(`/challenges/${c.id}/decline`); } catch { /* egal: verfällt sonst */ }
    close();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" data-testid="ready-check">
      <div className="w-full max-w-md border border-[#CCFF00]/60 bg-[#0B0B0B] shadow-[0_0_60px_rgba(204,255,0,0.15)]" role="dialog" aria-modal="true">
        <div className="p-5 text-center">
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#CCFF00]">{t("chal.rc.kicker")}</p>
          <div className="mx-auto mt-4 w-16 h-16 border-2 border-[#CCFF00] flex items-center justify-center text-[#CCFF00]">
            {phase === "accepted" ? <Check size={30} weight="bold" /> : <Icon size={30} weight="fill" />}
          </div>
          <h2 className="font-anton text-3xl leading-tight tracking-tight mt-4">
            {phase === "accepted" ? t("chal.rc.accepted") : t("chal.live.created", { name: from })}
          </h2>
          {c.ex && (
            <>
              <p className="mt-3 font-anton text-lg tracking-tight flex items-center justify-center gap-2" style={{ color: c.ex.color }}>
                <ExerciseIcon icon={c.ex.icon} size={18} /> {exerciseLabel(c.ex)}
              </p>
              <p className="mt-0.5 text-sm text-ink-2">
                {c.kind === "team" ? `${t("chal.target")}: ${formatAmount(c.target, c.ex.unit, locale)}` : t("chal.kind.duelText")}
              </p>
            </>
          )}
          {phase !== "accepted" && candidates.length > 1 && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-widest text-ink-3 mb-2">{t("chal.rc.pick")}</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {candidates.map((e) => (
                  <button key={e.key} type="button" onClick={() => setPick(e.key)}
                    className={`px-2.5 py-1.5 text-xs border ${chosen === e.key ? "border-[#CCFF00] text-[#CCFF00]" : "border-[#333] text-ink-2"}`}
                    data-testid={`rc-pick-${e.key}`}>
                    {exerciseLabel(e)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {phase !== "accepted" && !candidates.length && <p className="mt-4 text-xs text-[#FF8800]">{t("chal.noMatch")}</p>}
        </div>

        {phase !== "accepted" && (
          <>
            {/* ablaufender Balken */}
            <div className="h-2 bg-[#1A1A1A] overflow-hidden" data-testid="rc-bar">
              <div className="h-full transition-[width] duration-100 ease-linear" style={{ width: `${pct}%`, background: urgent ? "#FF3B30" : "#CCFF00", boxShadow: urgent ? "0 0 12px #FF3B30" : "0 0 12px rgba(204,255,0,.6)" }} />
            </div>
            <div className="p-4 flex items-center gap-3">
              <button type="button" onClick={decline} disabled={phase !== "ask"}
                className="border border-[#333] text-ink-2 hover:text-white hover:border-[#555] uppercase tracking-widest text-[11px] px-4 py-3" data-testid="rc-decline">
                {t("chal.decline")}
              </button>
              <button type="button" onClick={accept} disabled={phase !== "ask" || !chosen}
                className="flex-1 bg-[#CCFF00] text-black font-bold uppercase tracking-[0.2em] text-sm py-3 hover:bg-[#D4FF33] glow-lime disabled:opacity-50 tabular-nums" data-testid="rc-accept">
                {t("chal.accept")} · {Math.ceil(left / 1000)}
              </button>
            </div>
            <p className="px-4 pb-4 -mt-1 text-[10px] text-ink-3 text-center">{t("chal.rc.binding")}</p>
          </>
        )}
      </div>
    </div>
  );
}
