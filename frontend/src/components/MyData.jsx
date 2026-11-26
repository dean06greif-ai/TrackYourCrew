import { useState } from "react";
import { DownloadSimple, Trash, Warning, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, tokenStore } from "../lib/api";
import { useI18n } from "../i18n";

// Eigene Daten (DSGVO, App-Stores): alles als Datei herunterladen oder das Konto endgültig löschen.
// Löschen braucht den eigenen Code als Bestätigung.
export default function MyData({ handle, onDeleted }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const matches = confirm.trim().replace(/^#/, "").toUpperCase() === (handle || "").toUpperCase();

  const download = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/me/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trackyourcrew-${(handle || "daten").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.error"), { duration: 2500 });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.post("/me/delete", { confirm });
      tokenStore.clear();
      onDeleted?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.error"), { duration: 2500 });
      setBusy(false);
    }
  };

  return (
    <div className="border border-[#222] bg-[#121212] p-5" data-testid="my-data-row">
      <p className="font-anton text-xl tracking-tight">{t("data.title")}</p>
      <p className="text-xs text-ink-2 mt-1 leading-relaxed">{t("data.text")}</p>
      <div className="flex flex-col sm:flex-row gap-2 mt-4">
        <button
          type="button"
          onClick={download}
          disabled={busy}
          data-testid="data-export"
          className="inline-flex items-center justify-center gap-2 border border-[#CCFF00]/60 text-[#CCFF00] hover:bg-[#CCFF00] hover:text-black uppercase tracking-widest text-xs px-4 py-2.5 transition-colors disabled:opacity-50"
        >
          <DownloadSimple size={14} weight="bold" /> {t("data.export")}
        </button>
        <button
          type="button"
          onClick={() => { setConfirm(""); setOpen(true); }}
          data-testid="data-delete-open"
          className="inline-flex items-center justify-center gap-2 border border-[#333] text-ink-2 hover:border-[#FF3B30] hover:text-[#FF3B30] uppercase tracking-widest text-xs px-4 py-2.5 transition-colors sm:ml-auto"
        >
          <Trash size={14} /> {t("data.delete")}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={() => !busy && setOpen(false)} data-testid="data-delete-dialog">
          <div className="w-full max-w-md bg-[#0E0E0E] border border-[#FF3B30] p-6" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-labelledby="del-title">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 id="del-title" className="font-anton text-2xl tracking-tight flex items-center gap-2 text-white">
                <Warning size={22} weight="fill" className="text-[#FF3B30]" /> {t("data.deleteTitle")}
              </h3>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-ink-2 hover:text-white" aria-label={t("common.close")}><X size={18} /></button>
            </div>
            <p className="text-sm text-ink-2 leading-relaxed">{t("data.deleteText")}</p>
            <label className="block mt-4">
              <span className="text-[10px] uppercase tracking-widest text-ink-3">{t("data.deleteConfirm", { code: handle })}</span>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                placeholder={handle}
                className="mt-1 w-full bg-[#0A0A0A] border border-[#333] focus:border-[#FF3B30] outline-none text-white font-anton text-xl px-3 py-2.5 uppercase"
                data-testid="data-delete-input"
              />
            </label>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="flex-1 border border-[#333] text-ink-2 hover:text-white uppercase tracking-widest text-xs py-3">
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={!matches || busy}
                data-testid="data-delete-confirm"
                className="flex-1 bg-[#FF3B30] text-white font-bold uppercase tracking-widest text-xs py-3 hover:bg-[#FF5A50] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {busy ? "…" : t("data.deleteFinal")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
