import { useCallback, useEffect, useMemo, useState } from "react";
import { Sword, UsersThree, Trophy, X, Check, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n, formatNumber } from "../i18n";
import { formatAmount, amountParts } from "../lib/amount";
import { exerciseLabel, detectExerciseKind } from "../lib/exercises";
import ExerciseIcon from "./ExerciseIcon";
import { track } from "../lib/usage";

// Crew-Challenges (Plan 12e, Gruppen seit 2026-11-25). Herausforderung für die laufende Kalenderwoche:
// Duell („wer schafft am meisten?“) oder gemeinsames Ziel, mit einer oder mehreren Personen aus der Crew.
// Jeder Eingeladene nimmt an oder lehnt ab. Fertige Challenges bleiben als Historie (Auswertung).
export const CHALLENGES_EVENT = "tyc:challenges";
const MAX_INVITES = 5;

export function useChallenges(enabled = true) {
  const [list, setList] = useState(null);
  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/challenges");
      setList(data.challenges || []);
    } catch {
      setList((l) => l || []);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const on = () => load();
    window.addEventListener(CHALLENGES_EVENT, on);
    return () => window.removeEventListener(CHALLENGES_EVENT, on);
  }, [enabled, load]);
  return [list, load];
}

function fmtDate(iso, locale) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// Eine Challenge als Kachel
export function ChallengeRow({ c, meId, onChanged, compact = false, board }) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const ex = c.ex;
  const others = c.participants.filter((p) => p.user_id !== meId);
  const active = others.filter((p) => p.status !== "declined");
  const otherNames = (active.length ? active : others).map((p) => p.name).join(", ");
  const Icon = c.kind === "team" ? UsersThree : Sword;
  const highlight = c.winners || c.leaders || [];
  const invited = c.participants.filter((p) => p.status === "invited").map((p) => p.name);
  const declined = c.participants.filter((p) => p.status === "declined").map((p) => p.name);

  // Annehmen: passende eigene Übung vorschlagen (gleiche Art, sonst gleiche Einheit)
  const myExercises = useMemo(() => ((board?.users || []).find((u) => u.user_id === meId)?.exercises || []).filter((e) => e.type !== "activity"), [board, meId]);
  const fromKind = ex ? detectExerciseKind(ex.name) : null;
  const unitOk = (e) => (e.unit || "").trim().toLowerCase().replace(/\.$/, "") === (ex?.unit || "").trim().toLowerCase().replace(/\.$/, "");
  const candidates = myExercises.filter(unitOk);
  const preferred = candidates.find((e) => fromKind && detectExerciseKind(e.name) === fromKind) || candidates[0];
  const [pick, setPick] = useState(preferred?.key || "");
  useEffect(() => { if (!pick && preferred) setPick(preferred.key); }, [preferred, pick]);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg, { duration: 2000 });
      await onChanged?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.error"), { duration: 2500 });
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id) => c.participants.find((p) => p.user_id === id)?.name || "";
  const won = c.status === "finished" && (highlight.includes(meId) || highlight.includes("team"));
  const resultLabel = () => {
    if (c.kind === "team") {
      if (highlight.includes("team")) return t("chal.teamWon");
      return (c.team_total || 0) >= (c.target || 0) * 0.8 ? t("chal.teamLost") : t("chal.teamMissed");
    }
    if (!highlight.length) return t("chal.tie");
    if (highlight.length > 1) return highlight.includes(meId) ? t("chal.tie") : t("chal.otherWon", { name: highlight.map(nameOf).join(" & ") });
    return highlight[0] === meId ? t("chal.youWon") : t("chal.otherWon", { name: nameOf(highlight[0]) });
  };
  const showValues = c.status === "active" || c.status === "finished";
  const ranked = c.participants.filter((p) => p.status === "accepted").sort((x, y) => (y.value || 0) - (x.value || 0));

  return (
    <div className={`border bg-[#121212] ${compact ? "p-3" : "p-4"} ${c.my_status === "invited" && (c.status === "pending" || c.status === "active") ? "border-[#CCFF00]/50" : "border-[#222]"}`} data-testid={`challenge-${c.id}`} data-status={c.status}>
      <div className="flex items-start gap-3">
        <Icon size={18} weight="bold" className="shrink-0 mt-0.5" style={{ color: ex?.color || "#CCFF00" }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white leading-snug">
            {c.kind === "team"
              ? t("chal.teamTitle", { name: otherNames, target: formatAmount(c.target || 0, ex?.unit, locale) })
              : others.length > 1 ? t("chal.groupTitle", { name: otherNames }) : t("chal.duelTitle", { name: otherNames })}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-ink-3 mt-1 flex items-center gap-1.5 flex-wrap">
            {ex && <><ExerciseIcon icon={ex.icon} size={11} /> {exerciseLabel(ex)} · </>}
            {t("chal.weekOf", { date: fmtDate(c.monday, locale) })}
          </p>
        </div>
        {c.status === "finished" && (
          <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-1 border ${won ? "border-[#CCFF00] text-[#CCFF00]" : "border-[#333] text-ink-2"}`} data-testid={`challenge-result-${c.id}`}>
            {won && <Trophy size={11} weight="fill" />} {resultLabel()}
          </span>
        )}
        {c.status === "declined" && <span className="shrink-0 text-[10px] uppercase tracking-widest text-ink-3">{t("chal.declined")}</span>}
        {c.status === "expired" && <span className="shrink-0 text-[10px] uppercase tracking-widest text-ink-3">{t("chal.expired")}</span>}
      </div>

      {showValues && c.kind === "team" && (
        <div className="mt-3">
          <div className="h-2 bg-[#1A1A1A] border border-[#222] overflow-hidden flex">
            {ranked.map((p, i) => (
              <div key={p.user_id} style={{ width: `${Math.min(100, ((p.value || 0) / (c.target || 1)) * 100)}%`, background: ex?.color || "#CCFF00", opacity: p.user_id === meId ? 1 : Math.max(0.3, 0.6 - i * 0.1) }} />
            ))}
          </div>
          <p className="text-[11px] text-ink-2 mt-1.5">
            {ranked.map((p) => `${p.user_id === meId ? t("chal.you") : p.name} ${formatAmount(p.value || 0, ex?.unit, locale)}`).join(" + ")} = <span className="text-white">{formatAmount(c.team_total || 0, ex?.unit, locale)}</span> / {formatAmount(c.target || 0, ex?.unit, locale)}
          </p>
        </div>
      )}
      {showValues && c.kind === "duel" && (
        <div className={`mt-3 grid gap-2 ${ranked.length > 2 ? "grid-cols-3" : "grid-cols-2"}`}>
          {ranked.map((p) => {
            const lead = highlight.includes(p.user_id);
            return (
              <div key={p.user_id} className={`border px-3 py-2 min-w-0 ${lead ? "border-[#CCFF00]/60" : "border-[#222]"}`}>
                <p className="text-[10px] uppercase tracking-widest text-ink-3 truncate">{p.user_id === meId ? t("chal.you") : p.name}</p>
                <p className={`font-anton text-2xl leading-none mt-1 ${lead ? "text-[#CCFF00]" : "text-white"}`}>{amountParts(p.value || 0, ex?.unit, locale).num}<span className="text-sm text-ink-3"> {amountParts(p.value || 0, ex?.unit, locale).unit}</span></p>
              </div>
            );
          })}
        </div>
      )}
      {/* Wer noch nicht geantwortet bzw. abgelehnt hat */}
      {c.status !== "declined" && (invited.length > 0 || declined.length > 0) && (
        <p className="text-[10px] text-ink-3 mt-2" data-testid={`challenge-waiting-${c.id}`}>
          {invited.length > 0 && t("chal.waitingFor", { name: invited.join(", ") })}
          {declined.length > 0 && ` ${t("chal.declinedBy", { name: declined.join(", ") })}`}
        </p>
      )}

      {(c.status === "pending" || c.status === "active") && c.my_status === "invited" && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          {candidates.length > 0 ? (
            <select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 min-w-0 bg-[#0A0A0A] border border-[#333] text-white text-sm px-3 py-2" data-testid={`challenge-pick-${c.id}`} aria-label={t("chal.yourExercise")}>
              {candidates.map((e) => <option key={e.key} value={e.key}>{exerciseLabel(e)}</option>)}
            </select>
          ) : (
            <p className="flex-1 text-xs text-ink-3">{t("chal.noMatch")}</p>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={busy || !pick} onClick={() => act(() => api.post(`/challenges/${c.id}/accept`, { to_key: pick }), t("chal.accepted"))} className="flex-1 sm:flex-none bg-[#CCFF00] text-black font-bold uppercase tracking-widest text-xs px-4 py-2.5 hover:bg-[#D4FF33] disabled:opacity-40 flex items-center justify-center gap-1.5" data-testid={`challenge-accept-${c.id}`}>
              <Check size={13} weight="bold" /> {t("chal.accept")}
            </button>
            <button type="button" disabled={busy} onClick={() => act(() => api.post(`/challenges/${c.id}/decline`))} className="border border-[#333] text-ink-2 hover:text-white uppercase tracking-widest text-xs px-3 py-2.5" data-testid={`challenge-decline-${c.id}`}>
              {t("chal.decline")}
            </button>
          </div>
        </div>
      )}
      {c.status === "pending" && c.creator_id === meId && (
        <div className="mt-2 flex justify-end">
          <button type="button" disabled={busy} onClick={() => act(() => api.delete(`/challenges/${c.id}`))} className="text-[10px] uppercase tracking-widest text-ink-3 hover:text-white" data-testid={`challenge-withdraw-${c.id}`}>
            {t("chal.withdraw")}
          </button>
        </div>
      )}
    </div>
  );
}

// Dialog: eine oder mehrere Personen herausfordern („+“ fügt weitere hinzu)
function ChallengeDialog({ open, onClose, board, meId, onDone, presetTo, onlineIds }) {
  const { t, locale } = useI18n();
  // Ready-Check: nur wer gerade online ist, kann in 60 s annehmen -> grüner Punkt
  const isOn = (id) => !!onlineIds?.has?.(id);
  const friends = (board?.users || []).filter((u) => u.user_id !== meId && !u.all_paused);
  const myExercises = ((board?.users || []).find((u) => u.user_id === meId)?.exercises || []).filter((e) => e.type !== "activity");
  const [to, setTo] = useState([]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("duel");
  const [key, setKey] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const first = presetTo && friends.some((f) => f.user_id === presetTo) ? presetTo : friends[0]?.user_id;
    setTo(first ? [first] : []);
    setAdding(false);
    setKey(myExercises[0]?.key || "");
    setKind("duel");
    setTarget("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const ex = myExercises.find((e) => e.key === key);
  const chosen = to.map((id) => friends.find((f) => f.user_id === id)).filter(Boolean);
  // Übungswahl (Dean 2026-11-27): annehmen kann nur, wer eine Übung mit derselben Einheit hat ->
  // passend = alle Eingeladenen haben sie (gleiche Art zählt doppelt, z. B. Liegestütze ↔ Push-ups)
  const normU = (u) => (u || "").trim().toLowerCase().replace(/\.$/, "");
  const fitOf = (e) => {
    const k = detectExerciseKind(e.name);
    let unitOk = 0;
    let kindOk = 0;
    for (const f of chosen) {
      const same = (f.exercises || []).filter((x) => x.type !== "activity" && normU(x.unit) === normU(e.unit));
      if (same.length) unitOk += 1;
      if (k && same.some((x) => detectExerciseKind(x.name) === k)) kindOk += 1;
    }
    return { all: chosen.length > 0 && unitOk === chosen.length, kind: chosen.length > 0 && kindOk === chosen.length };
  };
  const ranked = myExercises.map((e) => ({ e, fit: fitOf(e) }))
    .sort((a, b) => (b.fit.kind - a.fit.kind) || (b.fit.all - a.fit.all));
  const toKey = to.join(",");
  useEffect(() => {
    if (!open) return;
    const cur = ranked.find((r) => r.e.key === key);
    if (!cur || !cur.fit.all) {
      const best = ranked.find((r) => r.fit.all);
      if (best && best.e.key !== key) setKey(best.e.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, toKey]);
  const rest = friends.filter((f) => !to.includes(f.user_id));
  // Vorschlag gemeinsames Ziel: eigenes Wochenziel + passende Ziele der anderen
  const suggested = useMemo(() => {
    if (!ex) return 0;
    const fk = detectExerciseKind(ex.name);
    const sum = chosen.reduce((acc, f) => {
      const fe = (f.exercises || []).find((e) => (e.unit || "") === (ex.unit || "") && (!fk || detectExerciseKind(e.name) === fk));
      return acc + (fe?.goal || ex.goal || 0);
    }, ex.goal || 0);
    return Math.round(sum * 10) / 10;
  }, [ex, chosen]);

  if (!open) return null;
  const send = async () => {
    setBusy(true);
    try {
      await api.post("/challenges", { to_user_ids: to, kind, from_key: key, target: kind === "team" ? Number(target || suggested) : undefined });
      track("challenge_sent");
      toast.success(t("chal.sent", { name: chosen.map((f) => f.name).join(", ") }), { duration: 2000 });
      onClose();
      await onDone?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.error"), { duration: 2500 });
    } finally {
      setBusy(false);
    }
  };
  const unit = ex?.unit ? ` ${ex.unit}` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose} data-testid="challenge-dialog">
      <div className="w-full max-w-md bg-[#0E0E0E] border border-[#CCFF00] p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="chal-title">
        <div className="flex items-center justify-between mb-4">
          <h3 id="chal-title" className="font-anton text-2xl tracking-tight">{t("chal.newTitle")}</h3>
          <button type="button" onClick={onClose} className="text-ink-2 hover:text-white" aria-label={t("common.close")}><X size={18} /></button>
        </div>
        {friends.length === 0 ? (
          <p className="text-sm text-ink-2">{t("chal.noFriends")}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-ink-3">{t("chal.who")}</span>
              <div className="mt-1 flex flex-wrap items-center gap-2" data-testid="challenge-people">
                {chosen.map((f) => (
                  <span key={f.user_id} className="inline-flex items-center gap-1.5 h-8 border border-[#CCFF00]/60 bg-[#CCFF00]/10 text-white text-sm pl-3 pr-2" data-testid={`challenge-chip-${f.user_id}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isOn(f.user_id) ? "bg-[#00FF66]" : "bg-[#444]"}`} title={isOn(f.user_id) ? t("chal.online") : t("chal.offline")} />
                    {f.name}
                    {chosen.length > 1 && (
                      <button type="button" onClick={() => setTo((l) => l.filter((x) => x !== f.user_id))} aria-label={t("chal.removePerson", { name: f.name })} className="text-ink-3 hover:text-white">
                        <X size={12} weight="bold" />
                      </button>
                    )}
                  </span>
                ))}
                {rest.length > 0 && to.length < MAX_INVITES && (
                  adding ? (
                    <select autoFocus value="" onChange={(e) => { if (e.target.value) setTo((l) => [...l, e.target.value]); setAdding(false); }} onBlur={() => setAdding(false)}
                      className="h-8 bg-[#0A0A0A] border border-[#333] text-white text-sm px-2" data-testid="challenge-add-select">
                      <option value="">{t("chal.pickPerson")}</option>
                      {rest.map((f) => <option key={f.user_id} value={f.user_id}>{isOn(f.user_id) ? "● " : ""}{f.name}</option>)}
                    </select>
                  ) : (
                    <button type="button" onClick={() => setAdding(true)} aria-label={t("chal.addPerson")} title={t("chal.addPerson")}
                      className="h-8 w-8 flex items-center justify-center border border-dashed border-[#444] text-ink-2 hover:text-[#CCFF00] hover:border-[#CCFF00]/60" data-testid="challenge-add">
                      <Plus size={14} weight="bold" />
                    </button>
                  )
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {[["duel", Sword], ["team", UsersThree]].map(([k, I]) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} data-testid={`challenge-kind-${k}`}
                  className={`border p-3 text-left transition-colors ${kind === k ? "border-[#CCFF00] bg-[#CCFF00]/10" : "border-[#222] hover:border-[#444]"}`}>
                  <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-white"><I size={15} weight="bold" className="text-[#CCFF00]" /> {t(`chal.kind.${k}`)}</span>
                  <span className="block text-[11px] text-ink-3 mt-1 leading-snug">{t(chosen.length > 1 && k === "duel" ? "chal.kind.duelGroupText" : `chal.kind.${k}Text`)}</span>
                </button>
              ))}
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest text-ink-3">{t("chal.exercise")}</span>
              <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" data-testid="challenge-ex">
                {ranked.map(({ e, fit }) => {
                  const on = e.key === key;
                  return (
                    <button key={e.key} type="button" role="radio" aria-checked={on} disabled={!fit.all}
                      onClick={() => setKey(e.key)} data-testid={`challenge-ex-${e.key}`}
                      className={`text-left px-3 py-2 border transition-colors min-w-0 disabled:opacity-35 disabled:cursor-not-allowed ${on ? "border-[#CCFF00] bg-[#CCFF00]/10" : "border-[#222] bg-[#121212] hover:border-[#444]"}`}>
                      <span className="flex items-center gap-1.5 min-w-0" style={{ color: e.color }}>
                        <ExerciseIcon icon={e.icon} size={14} className="shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wider truncate">{exerciseLabel(e)}</span>
                      </span>
                      <span className="block text-[10px] text-ink-3 mt-0.5 truncate">
                        {fit.all
                          ? (fit.kind ? (chosen.length === 1 ? t("chal.fitSameOne", { name: chosen[0].name }) : t("chal.fitSame")) : t("chal.fitUnit"))
                          : (chosen.length === 1 ? t("chal.fitNoneOne", { name: chosen[0].name }) : t("chal.fitNone"))}
                      </span>
                    </button>
                  );
                })}
              </div>
              {!ranked.some((r) => r.fit.all) && <p className="text-[11px] text-[#FF8800] mt-1.5">{t("chal.noMatch")}</p>}
            </div>
            {kind === "team" && (
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest text-ink-3">{t("chal.target")}{unit && ` (${ex.unit})`}</span>
                <input type="number" min="0" inputMode="decimal" value={target} placeholder={formatNumber(suggested, locale)} onChange={(e) => setTarget(e.target.value)}
                  className="mt-1 w-full bg-[#0A0A0A] border border-[#333] text-white px-3 py-2.5 font-anton text-xl placeholder:text-ink-3" data-testid="challenge-target" />
              </label>
            )}
            <p className="text-[11px] text-ink-3">{t("chal.rule")}</p>
            <button type="button" onClick={send} disabled={busy || !to.length || !key} className="w-full bg-[#CCFF00] text-black font-bold uppercase tracking-widest text-sm py-3 hover:bg-[#D4FF33] disabled:opacity-40" data-testid="challenge-send">
              {t("chal.send")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Herausfordern geht über den Knopf auf der Karte der Person (openFor = deren user_id).
// Der Bereich selbst erscheint nur, wenn es offene, laufende oder gerade beendete Challenges gibt.
export default function ChallengesSection({ board, meId, openFor = null, onCloseFor, onlineIds }) {
  const { t } = useI18n();
  const [list, reload] = useChallenges(true);
  const hasFriends = (board?.users || []).some((u) => u.user_id !== meId);
  const dialog = (
    <ChallengeDialog open={!!openFor} presetTo={openFor} onClose={() => onCloseFor?.()} board={board} meId={meId} onDone={reload} onlineIds={onlineIds} />
  );
  if (!list || !hasFriends) return dialog;
  const now = list.filter((c) => c.status === "pending" || c.status === "active");
  // Ergebnis der letzten Woche noch zeigen, damit man es sieht
  const latestMonday = list.reduce((m, c) => (c.monday > m ? c.monday : m), "");
  const recent = list.filter((c) => c.status === "finished" && c.monday === latestMonday).slice(0, 3);
  const shown = [...now, ...recent];
  if (!shown.length) return dialog;

  return (
    <section className="max-w-7xl mx-auto px-6 pt-8" data-testid="challenges-section">
      <p className="text-xs uppercase tracking-[0.3em] text-[#CCFF00] flex items-center gap-2 mb-3"><Sword size={14} weight="bold" /> {t("chal.title")}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {shown.map((c) => <ChallengeRow key={c.id} c={c} meId={meId} board={board} onChanged={reload} />)}
      </div>
      {dialog}
    </section>
  );
}

// Historie für die Auswertung
export function ChallengeHistory({ meId }) {
  const { t } = useI18n();
  const [list] = useChallenges(true);
  const done = (list || []).filter((c) => c.status === "finished");
  if (!done.length) return null;
  const wins = done.filter((c) => (c.winners || []).includes(meId) || (c.winners || []).includes("team")).length;
  return (
    <div className="border border-[#1A1A1A] bg-[#121212] p-4" data-testid="challenge-history">
      <div className="flex items-center justify-between mb-3">
        <p className="font-anton text-xl tracking-tight flex items-center gap-2"><Trophy size={16} weight="fill" className="text-[#CCFF00]" /> {t("chal.history")}</p>
        <p className="text-[10px] uppercase tracking-widest text-ink-3">{t("chal.stats", { wins, total: done.length })}</p>
      </div>
      <div className="space-y-2">
        {done.map((c) => <ChallengeRow key={c.id} c={c} meId={meId} compact />)}
      </div>
    </div>
  );
}
