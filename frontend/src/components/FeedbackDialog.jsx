import { useEffect, useState } from "react";
import { Bug, Lightbulb, ChatCircleText, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n } from "../i18n";

const CATEGORIES = [
  { key: "bug", icon: Bug },
  { key: "idea", icon: Lightbulb },
  { key: "other", icon: ChatCircleText },
];

/**
 * Feedback an den Betreiber: wird gespeichert und per Telegram weitergeleitet.
 * Seite, Sprache und Gerät werden automatisch mitgeschickt (hilft bei Bugs).
 */
export default function FeedbackDialog({ open, onClose }) {
  const { t, lang } = useI18n();
  const [category, setCategory] = useState("bug");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const send = async () => {
    if (message.trim().length < 3) {
      toast.error(t("feedback.tooShort"), { duration: 2500 });
      return;
    }
    setSending(true);
    try {
      await api.post("/feedback", {
        category,
        message: message.trim(),
        page: window.location.pathname,
        user_agent: navigator.userAgent,
        language: lang,
      });
      toast.success(t("feedback.thanks"), { duration: 3000 });
      setMessage("");
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.error"), { duration: 3000 });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center px-4" onClick={onClose} data-testid="feedback-overlay">
      <div className="bg-[#0E0E0E] border border-[#CCFF00]/40 max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("feedback.title")} data-testid="feedback-dialog">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-anton text-2xl tracking-tight">{t("feedback.title")}</h3>
          <button onClick={onClose} className="text-ink-3 hover:text-white" aria-label={t("common.close")}><X size={18} /></button>
        </div>
        <p className="text-sm text-ink-2 leading-relaxed mb-5">{t("feedback.text")}</p>

        <div className="grid grid-cols-3 gap-2 mb-4" role="radiogroup" aria-label={t("feedback.category")}>
          {CATEGORIES.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={category === key}
              onClick={() => setCategory(key)}
              className={`flex flex-col items-center gap-1.5 py-3 border text-[10px] uppercase tracking-widest transition-colors ${category === key ? "border-[#CCFF00] bg-[#CCFF00]/[0.08] text-[#CCFF00]" : "border-[#222] text-ink-2 hover:border-[#444]"}`}
              data-testid={`feedback-cat-${key}`}
            >
              <Icon size={20} weight={category === key ? "fill" : "regular"} />
              {t(`feedback.cat.${key}`)}
            </button>
          ))}
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          rows={5}
          placeholder={t(`feedback.placeholder.${category}`)}
          className="w-full bg-[#0A0A0A] border border-[#222] focus:border-[#CCFF00] outline-none text-sm text-white p-3 resize-none placeholder:text-ink-3"
          data-testid="feedback-message"
          autoFocus
        />
        <div className="flex items-center justify-between text-[10px] text-ink-3 mt-1 mb-5">
          <span>{t("feedback.meta")}</span>
          <span>{message.length}/2000</span>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-[#222] hover:border-[#444] py-3 px-4 text-xs uppercase tracking-widest transition-colors">
            {t("common.cancel")}
          </button>
          <button
            onClick={send}
            disabled={sending}
            className="flex-1 bg-[#CCFF00] hover:bg-[#D4FF33] text-black font-bold py-3 px-4 text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            data-testid="feedback-send"
          >
            <PaperPlaneTilt size={14} weight="fill" /> {sending ? t("feedback.sending") : t("feedback.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
