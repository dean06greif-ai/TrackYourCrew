import { useEffect, useRef, useState } from "react";
import { ShareNetwork, Copy, Check, X, LinkSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n } from "../i18n";
import { tourEvent } from "../lib/tour";

// Einladungslink: https://<seite>/join/<CODE>. Wer ihn öffnet, ist sofort gegenseitig verbunden.
// Der Code kommt vom Server und gilt eine Woche (Dean 2026-11-27), danach gibt es einen neuen.
export function inviteLink(code) {
  return `${window.location.origin}/join/${encodeURIComponent(code || "")}`;
}

export function useInviteCode() {
  const [inv, setInv] = useState(null);
  useEffect(() => {
    let alive = true;
    api.get("/me/invite").then(({ data }) => { if (alive) setInv(data); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return inv; // { code, expires_at } oder null (lädt)
}

// Teilen am Handy (Web Share API), sonst Link kopieren.
// Nur Titel + Link teilen: mit zusätzlichem Text zeigen iMessage/WhatsApp keine Vorschau mit Bild.
export async function shareInvite(code, t, { linkOnly = false } = {}) {
  const url = inviteLink(code);
  const text = t("crew.shareText");
  try {
    if (!linkOnly && navigator.share) {
      await navigator.share({ title: t("crew.shareTitle"), url });
      return "shared";
    }
  } catch (e) {
    if (e?.name === "AbortError") return "aborted";
  }
  const payload = linkOnly ? url : `${text}\n${url}`;
  try {
    await navigator.clipboard.writeText(payload);
    toast.success(t("crew.copied"), { duration: 1800 });
    return "copied";
  } catch {
    // Zweite Stufe: klassisches Kopieren über ein unsichtbares Textfeld.
    try {
      const ta = document.createElement("textarea");
      ta.value = payload;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) {
        toast.success(t("crew.copied"), { duration: 1800 });
        return "copied";
      }
    } catch { /* weiter unten */ }
    toast.error(t("common.copyFailed"), { duration: 2000 });
    return "failed";
  }
}

// Kasten mit Einladungslink + Teilen-Knopf (Crew-Panel, Einstellungen, Tour).
export function InviteBox({ compact = false, tour = false, embedded = false }) {
  const { t, locale } = useI18n();
  const [done, setDone] = useState(false);
  const linkRef = useRef(null);
  const inv = useInviteCode();
  const handle = inv?.code || "…";
  const url = inviteLink(inv?.code);
  const until = inv?.expires_at ? new Date(inv.expires_at).toLocaleDateString(locale, { day: "numeric", month: "numeric" }) : "";
  const onShare = async () => {
    if (!inv?.code) return;
    const r = await shareInvite(inv.code, t);
    if (r === "aborted") return;
    tourEvent("invite-shared");
    if (r === "copied" || r === "shared") {
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } else if (linkRef.current) {
      // Zwischenablage gesperrt: Link markieren, damit man ihn selbst kopieren kann.
      try {
        const range = document.createRange();
        range.selectNodeContents(linkRef.current);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch { /* egal */ }
    }
  };
  const linkText = (
    <>
      {/* Am Handy nur "/join/CODE", damit der Code nicht abgeschnitten wird. */}
      <span className="hidden sm:inline text-ink-3">{window.location.host}</span>/join/{handle}
    </>
  );
  const shareIcon = done ? <Check size={14} weight="bold" /> : navigator.share ? <ShareNetwork size={14} weight="bold" /> : <Copy size={14} weight="bold" />;
  if (embedded) {
    return (
      <div className="border-t border-[#222] pt-4 mt-4 flex items-center gap-3" data-testid="invite-box" data-tour={tour ? "invite" : undefined}>
        <LinkSimple size={16} weight="bold" className="text-[#CCFF00] shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-ink-3">{t("crew.invite")}{until && <span className="normal-case tracking-normal ml-2 text-ink-3/80" data-testid="invite-until">· {t("crew.inviteUntil", { date: until })}</span>}</p>
          {/* Einstellungen: ganzer Link (ohne „https://“, kopiert wird der volle), am Handy etwas kleiner -> eine Zeile (Dean 2026-11-27) */}
          <code ref={linkRef} className="block break-words select-all text-[11px] sm:text-xs tracking-tight sm:tracking-normal text-ink-2 font-mono mt-0.5 leading-5" title={url} data-testid="invite-link">
            {url.replace(/^https?:\/\//, "").split("/").map((part, i, arr) => (
              <span key={i}>{part}{i < arr.length - 1 && <>/<wbr /></>}</span>
            ))}
          </code>
        </div>
        <button
          type="button"
          onClick={onShare}
          data-testid="invite-share"
          aria-label={t("crew.share")}
          title={t("crew.share")}
          className="shrink-0 h-9 min-w-9 border border-[#333] text-ink-2 hover:border-[#CCFF00] hover:text-[#CCFF00] uppercase tracking-widest text-[10px] font-bold px-2.5 sm:px-3 flex items-center justify-center gap-2 transition-colors"
        >
          {shareIcon}
          {/* Handy: nur Symbol, damit der Link in eine Zeile passt */}
          <span className="hidden sm:inline">{t("crew.share")}</span>
        </button>
      </div>
    );
  }
  return (
    <div
      className={`border border-[#222] bg-[#121212] ${compact ? "p-3" : "p-4"}`}
      data-testid="invite-box"
      data-tour={tour ? "invite" : undefined}
    >
      <p className="text-[10px] uppercase tracking-[0.3em] text-[#CCFF00]">{t("crew.invite")}</p>
      <div className="flex items-stretch gap-2 mt-3">
        <code ref={linkRef} className="min-w-0 flex-1 truncate select-all bg-[#0A0A0A] border border-[#222] px-3 py-2 text-xs text-[#CFCFCF] font-mono leading-5" title={url} data-testid="invite-link">
          {linkText}
        </code>
        <button
          type="button"
          onClick={onShare}
          data-testid="invite-share"
          className="shrink-0 bg-[#CCFF00] text-black font-bold uppercase tracking-widest text-xs px-4 flex items-center gap-2 hover:bg-[#D4FF33] transition-colors"
        >
          {shareIcon}
          {t("crew.share")}
        </button>
      </div>
    </div>
  );
}

// Offene Anfragen: eingehende mit drei Knöpfen, eigene als "wartet auf Antwort".
export default function CrewRequests({ requests, onChanged }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(null);
  const incoming = requests?.incoming || [];
  const outgoing = requests?.outgoing || [];
  if (!incoming.length && !outgoing.length) return null;

  const answer = async (r, kind) => {
    setBusy(r.user_id);
    try {
      if (kind === "decline") await api.post(`/friends/requests/${encodeURIComponent(r.user_id)}/decline`);
      else await api.post(`/friends/requests/${encodeURIComponent(r.user_id)}/accept`, { add_back: kind === "back" });
      await onChanged?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.error"), { duration: 2500 });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3" data-testid="crew-requests">
      {incoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#CCFF00]">{t("crew.requestsTitle")} · {incoming.length}</p>
          {incoming.map((r) => (
            <div key={r.user_id} className="border border-[#CCFF00]/40 bg-[#CCFF00]/[0.04] p-3" data-testid={`request-${r.user_id}`}>
              <p className="text-sm text-white">
                <span className="font-anton text-base">{r.name}</span>
                <span className="text-[#CCFF00] font-anton ml-1">#{r.handle}</span>
                <span className="text-ink-2 ml-2">{t("crew.requestAction")}</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 mt-3">
                <button
                  type="button"
                  disabled={busy === r.user_id}
                  onClick={() => answer(r, "back")}
                  data-testid={`request-accept-back-${r.user_id}`}
                  className="bg-[#CCFF00] text-black font-bold uppercase tracking-widest text-xs px-3 py-2.5 hover:bg-[#D4FF33] transition-colors disabled:opacity-50"
                >
                  {t("crew.acceptBack")}
                </button>
                <button
                  type="button"
                  disabled={busy === r.user_id}
                  onClick={() => answer(r, "accept")}
                  data-testid={`request-accept-${r.user_id}`}
                  className="border border-[#CCFF00]/60 text-[#CCFF00] uppercase tracking-widest text-xs px-3 py-2.5 hover:bg-[#CCFF00]/10 transition-colors disabled:opacity-50"
                >
                  {t("crew.acceptOnly")}
                </button>
                <button
                  type="button"
                  disabled={busy === r.user_id}
                  onClick={() => answer(r, "decline")}
                  data-testid={`request-decline-${r.user_id}`}
                  className="border border-[#333] text-ink-2 uppercase tracking-widest text-xs px-3 py-2.5 hover:border-[#FF3B30] hover:text-[#FF3B30] transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <X size={12} weight="bold" /> {t("crew.decline")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {outgoing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="crew-outgoing">
          <span className="text-[10px] uppercase tracking-widest text-ink-3">{t("crew.pendingTitle")}</span>
          {outgoing.map((r) => (
            <span key={r.user_id} className="border border-dashed border-[#333] px-2 py-1 text-xs text-ink-2">
              {r.name} <span className="text-[#CCFF00]">#{r.handle}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
