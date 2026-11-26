import { useEffect, useState } from "react";
import { BellRinging, PaperPlaneTilt } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n, weekdayNames } from "../i18n";
import { pushSupport, urlBase64ToUint8Array, bufferToBase64Url, deviceTimeZone } from "../lib/push";

// Erinnerung am Handy (Plan 5): „Dir fehlen diese Woche noch: Liegestütze 40 · Lauf 2,1 km“
// zur gewählten Zeit (Standard: Sonntag 18 Uhr), nur wenn noch etwas fehlt. Am PC unsichtbar.
export default function ReminderCard({ platform, onInstall }) {
  const { t, locale } = useI18n();
  const support = pushSupport({
    platform,
    hasServiceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    hasPushManager: typeof window !== "undefined" && "PushManager" in window,
    hasNotification: typeof window !== "undefined" && "Notification" in window,
  });
  const [cfg, setCfg] = useState(null);
  const [rem, setRem] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (support === "desktop") return;
    api.get("/push/config").then(({ data }) => setCfg(data)).catch(() => setCfg({ enabled: false }));
    api.get("/me/reminder").then(({ data }) => setRem(data)).catch(() => {});
  }, [support]);

  if (support === "desktop" || !cfg || !rem) return null;
  if (!cfg.enabled) return null; // Server ohne Push-Schlüssel: Karte gar nicht zeigen

  const days = weekdayNames(locale, "long"); // Mo..So
  const save = async (patch) => {
    const next = { enabled: rem.enabled, weekday: rem.weekday, hour: rem.hour, tz: deviceTimeZone(), ...patch };
    const { data } = await api.put("/me/reminder", next);
    setRem(data);
  };

  const subscribe = async () => {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("denied");
    const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.public_key) });
    }
    await api.post("/me/push", {
      endpoint: sub.endpoint,
      p256dh: bufferToBase64Url(sub.getKey("p256dh")),
      auth: bufferToBase64Url(sub.getKey("auth")),
    });
  };

  const toggle = async () => {
    setBusy(true);
    try {
      if (!rem.enabled) {
        await subscribe();
        await save({ enabled: true });
        toast.success(t("remind.on"), { duration: 2200 });
      } else {
        await save({ enabled: false });
      }
    } catch (e) {
      toast.error(e.message === "denied" ? t("remind.denied") : e.response?.data?.detail || t("common.error"), { duration: 3500 });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/me/push/test");
      if (!data.sent) toast.error(t("remind.testFailed"), { duration: 3000 });
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.error"), { duration: 2500 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-[#222] bg-[#121212] p-5" data-testid="reminder-row">
      <div className="flex items-center gap-5">
        {support === "ok" && (
          <button
            type="button"
            role="switch"
            aria-checked={!!rem.enabled}
            onClick={toggle}
            disabled={busy}
            data-testid="reminder-toggle"
            className={`relative w-14 h-7 border transition-colors flex-shrink-0 ${rem.enabled ? "bg-[#CCFF00] border-[#CCFF00]" : "bg-[#0A0A0A] border-[#333] hover:border-[#555]"} disabled:opacity-60`}
          >
            <span className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 transition-all ${rem.enabled ? "left-[30px] bg-black" : "left-0.5 bg-[#555]"}`} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-anton text-xl tracking-tight flex items-center gap-2">
            {/* Mit Schalter wie die anderen Karten ohne Symbol (sonst bricht der Titel unschön um) */}
            {support !== "ok" && <BellRinging size={16} weight="fill" className="text-[#CCFF00] shrink-0" />} {t("remind.title")}
          </p>
          <p className="text-xs text-ink-2 mt-1 leading-relaxed">{t("remind.text")}</p>
        </div>
      </div>

      {support === "install-first" && (
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-xs text-ink-3 flex-1">{t("remind.installFirst")}</p>
          {onInstall && (
            <button type="button" onClick={onInstall} className="shrink-0 border border-[#CCFF00]/60 text-[#CCFF00] hover:bg-[#CCFF00] hover:text-black uppercase tracking-widest text-xs px-4 py-2.5 transition-colors" data-testid="reminder-install">
              {t("settings.installButton")}
            </button>
          )}
        </div>
      )}
      {support === "unsupported" && <p className="text-xs text-ink-3 mt-3">{t("remind.unsupported")}</p>}

      {support === "ok" && rem.enabled && (
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2 items-end">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-ink-3">{t("remind.day")}</span>
              <select value={rem.weekday} onChange={(e) => save({ weekday: Number(e.target.value) })} className="mt-1 w-full bg-[#0A0A0A] border border-[#333] text-white text-sm px-2 py-2" data-testid="reminder-day">
                {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-ink-3">{t("remind.time")}</span>
              <select value={rem.hour} onChange={(e) => save({ hour: Number(e.target.value) })} className="mt-1 w-full bg-[#0A0A0A] border border-[#333] text-white text-sm px-2 py-2" data-testid="reminder-hour">
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
            </label>
          </div>
          <button type="button" onClick={test} disabled={busy} title={t("remind.test")} aria-label={t("remind.test")} className="h-[38px] px-3 border border-[#333] text-ink-2 hover:text-white hover:border-[#555] inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest" data-testid="reminder-test">
            <PaperPlaneTilt size={13} /> {t("remind.testShort")}
          </button>
        </div>
      )}
    </div>
  );
}
