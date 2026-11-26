import { useEffect, useRef, useState } from "react";
import LegalLinks from "../components/LegalLinks";
import { Lightning, GoogleLogo, WarningCircle, TrendUp, UsersThree, Fire, Barbell } from "@phosphor-icons/react";
import { API } from "../lib/api";
import { useI18n, LANGUAGES, getLang, hasStoredLanguage } from "../i18n";

// Auf der Login-Seite selbst gewählte Sprache an den Google-Login weitergeben,
// damit ein neues Konto gleich in dieser Sprache startet.
const googleLoginUrl = () =>
  `${API}/auth/google/login?redirect=/dashboard${hasStoredLanguage() ? `&lang=${getLang()}` : ""}`;

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

// ---------------------------------------------------------------------------
// Custom-Wake-Screen Logik
// ---------------------------------------------------------------------------
// Render Free Plan legt das Backend nach 15 Min Idle schlafen. Beim naechsten
// Request zeigt Render seine eigene Default-Loading-Page (lila Tetris). Wir
// verhindern das, indem wir
//   1) bei Mount des Login-Screens den Backend bereits "prewarmen"
//      (Fire-and-Forget Ping auf /api/health), und
//   2) beim Klick auf "Mit Google fortfahren" so lange auf ein 2xx von
//      /api/health warten, bis es kommt. Erst DANN navigieren wir zum
//      OAuth-Endpoint. So sieht der Nutzer ausschliesslich unseren eigenen
//      Wake-Screen im TRACKER-Stil.
// ---------------------------------------------------------------------------

const WAKE_TIMEOUT_MS = 90_000;      // max. 90 s warten — Render-Cold-Start ~30-60 s
const POLL_INTERVAL_MS = 1500;       // alle 1.5 s erneut versuchen

function timeStamp() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

async function pingHealth(signal) {
  // Einzelner Health-Check-Versuch. Kurzer per-Request-Timeout, damit ein
  // haengender Aufruf nicht den gesamten Wake-Flow blockiert.
  const reqCtrl = new AbortController();
  const reqTimer = setTimeout(() => reqCtrl.abort(), 5000);
  const onAbort = () => reqCtrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const r = await fetch(`${API}/health`, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal: reqCtrl.signal,
    });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(reqTimer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function waitForBackend(signal, onTick) {
  const started = Date.now();
  let attempt = 0;
  while (Date.now() - started < WAKE_TIMEOUT_MS) {
    if (signal?.aborted) return false;
    attempt += 1;
    onTick?.(attempt);
    const ok = await pingHealth(signal);
    if (ok) return true;
    // Kurze Pause vor naechstem Versuch (abbrechbar)
    const waited = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), POLL_INTERVAL_MS);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          resolve(true);
        },
        { once: true }
      );
    });
    if (waited) return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Login() {
  const { t, lang, setLang } = useI18n();
  // Liest ?auth_error=... aus der URL (Backend redirected hierher bei Fehlern)
  const [authError, setAuthError] = useState("");

  // Wake-Screen State
  const [waking, setWaking] = useState(false);
  const [wakeFailed, setWakeFailed] = useState(false);
  const [statusLines, setStatusLines] = useState([]);
  const [progress, setProgress] = useState(0);
  const wakeAbortRef = useRef(null);
  const wakeLogRef = useRef(null);

  // Auto-scroll Terminal-Log nach unten, wenn neue Zeile dazukommt.
  useEffect(() => {
    const el = wakeLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [statusLines]);

  // Progress-Simulation: solange `waking` aktiv ist, naehert sich der Wert
  // asymptotisch 95 %. Der finale Sprung auf 100 % erfolgt erst, wenn das
  // Backend tatsaechlich antwortet.
  useEffect(() => {
    if (!waking) {
      setProgress(0);
      return;
    }
    const startTime = Date.now();
    const ESTIMATED_MS = 45_000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(
        95,
        Math.round((1 - Math.exp((-elapsed / ESTIMATED_MS) * 2.2)) * 100)
      );
      setProgress((prev) => (prev >= 100 ? prev : pct));
    }, 150);
    return () => clearInterval(interval);
  }, [waking]);

  // Prewarm-State: Backend wird bereits beim Login-Mount im Hintergrund
  // angepingt, damit Render schon waehrend der Nutzer guckt aufwacht.
  const prewarmReadyRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("auth_error");
    if (err) {
      setAuthError(err);
      // URL aufraeumen, damit der Fehler beim Reload weg ist
      const cleaned = window.location.pathname;
      window.history.replaceState({}, "", cleaned);
    }
  }, []);

  // Prewarm beim Mount: feuert Health-Check im Hintergrund. Klickt der Nutzer
  // erst nach 30 s auf Login, ist das Backend i.d.R. schon laengst wach und
  // der Custom-Wake-Screen wird gar nicht erst gezeigt — direkter Redirect.
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const ok = await waitForBackend(ctrl.signal);
      if (!ctrl.signal.aborted && ok) {
        prewarmReadyRef.current = true;
      }
    })();
    return () => ctrl.abort();
  }, []);

  const pushLine = (text) => {
    setStatusLines((prev) => [...prev, { t: timeStamp(), text }]);
  };

  const handleLogin = async () => {
    // Backend bereits durch Prewarm wach -> direkt weiter, kein Overlay.
    if (prewarmReadyRef.current) {
      window.location.href = googleLoginUrl();
      return;
    }

    // Sonst: Custom-Wake-Screen einblenden und auf Health warten.
    setWakeFailed(false);
    setStatusLines([]);
    setWaking(true);
    pushLine("INITIATING HANDSHAKE");

    const ctrl = new AbortController();
    wakeAbortRef.current = ctrl;

    // Dramaturgie-Logs parallel zur eigentlichen Health-Polling-Logik,
    // damit der Screen sich "lebendig" anfuehlt.
    const dramaLog = [
      "WAKING SERVER FROM IDLE",
      "ALLOCATING COMPUTE RESOURCES",
      "WARMING DATABASE CONNECTION",
      "CALIBRATING WEEKLY PROGRESSION",
      "CHECKING CREW STATUS",
      "STEADY HANDS. ALMOST THERE",
    ];
    let dramaIdx = 0;
    const dramaInterval = setInterval(() => {
      if (dramaIdx < dramaLog.length) {
        pushLine(dramaLog[dramaIdx]);
        dramaIdx += 1;
      }
    }, 2200);

    const ok = await waitForBackend(ctrl.signal);
    clearInterval(dramaInterval);

    if (ctrl.signal.aborted) {
      // User hat abgebrochen
      setWaking(false);
      return;
    }

    if (ok) {
      pushLine("SERVER READY");
      setProgress(100);
      await new Promise((r) => setTimeout(r, 500));
      pushLine("REDIRECTING TO GOOGLE");
      await new Promise((r) => setTimeout(r, 400));
      window.location.href = googleLoginUrl();
    } else {
      pushLine("CONNECTION TIMED OUT");
      setWakeFailed(true);
    }
  };

  const cancelWake = () => {
    wakeAbortRef.current?.abort();
    setWaking(false);
    setWakeFailed(false);
  };

  const heroBg = "/login-hero.webp";

  return (
    <div
      className="min-h-screen w-full relative overflow-hidden bg-[#0A0A0A] flex"
      data-testid="login-page"
    >
      {/* Left side image */}
      <div className="hidden md:flex md:w-1/2 lg:w-3/5 relative bg-[#101010]" data-testid="login-hero">
        <img
          src={heroBg}
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/30 to-[#0A0A0A]" />
        <div className="absolute top-8 left-8 flex items-center gap-3">
          <Lightning size={28} weight="fill" className="text-[#CCFF00]" />
          <span className="font-anton text-2xl tracking-widest">TRACKER</span>
        </div>
        <div className="absolute bottom-12 left-8 right-8 max-w-md">
          <p className="text-xs tracking-[0.3em] uppercase text-[#CCFF00] mb-4">
            WEEKLY PROGRESSION SYSTEM
          </p>
          <h2 className="font-anton text-5xl lg:text-6xl leading-none tracking-tight mb-4">
            PUSH HARDER.<br />EVERY. SINGLE. WEEK.
          </h2>
          <p className="text-ink-2 text-base leading-relaxed">
            {t("login.heroText")}
          </p>
        </div>
      </div>

      {/* Right side login */}
      <div className="w-full md:w-1/2 lg:w-2/5 flex items-center justify-center px-8 py-12 relative tactical-grid">
        {/* Sprachwahl oben rechts in der Ecke (Standard: Browser-Sprache, sonst Englisch) */}
        <div className="absolute top-6 right-6 md:top-8 md:right-8 flex items-center gap-1 z-10" role="group" aria-label="Language" data-testid="login-language">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              aria-pressed={lang === l.code}
              title={l.label}
              className={`px-2 py-1 text-[10px] tracking-widest uppercase transition-colors ${lang === l.code ? "text-[#CCFF00]" : "text-ink-3 hover:text-white"}`}
            >
              {l.code}
            </button>
          ))}
        </div>
        <div className="w-full max-w-sm">
          <div className="md:hidden flex items-center gap-3 mb-12">
            <Lightning size={28} weight="fill" className="text-[#CCFF00]" />
            <span className="font-anton text-2xl tracking-widest">TRACKER</span>
          </div>

          <p className="text-xs tracking-[0.3em] uppercase text-ink-2 mb-3">
            / ACCESS TERMINAL
          </p>
          <h1 className="font-anton text-5xl lg:text-6xl leading-none mb-3">
            SIGN IN
          </h1>
          <p className="text-ink-2 mb-12 text-sm leading-relaxed">
            {t("login.intro")}
          </p>

          <button
            onClick={handleLogin}
            data-testid="google-login-button"
            className="w-full bg-[#CCFF00] hover:bg-[#D4FF33] text-black font-bold uppercase tracking-widest py-4 px-6 flex items-center justify-center gap-3 transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#CCFF00] focus:ring-offset-2 focus:ring-offset-[#0A0A0A] glow-lime"
          >
            <GoogleLogo size={20} weight="bold" />
            <span>{t("login.google")}</span>
          </button>

          {authError && (
            <p
              className="mt-4 text-xs tracking-widest uppercase text-[#FF3B30]"
              data-testid="login-error"
            >
              {t("login.failed")}: {authError}
            </p>
          )}

          <div className="mt-12 pt-8 border-t border-[#222]">
            {/* Worum es geht – kurz, macht Lust (Dean 2026-11-26) */}
            <ul className="space-y-3" data-testid="login-features">
              {[[Barbell, "f4"], [UsersThree, "f2"], [Fire, "f3"], [TrendUp, "f1"]].map(([Icon, k]) => (
                <li key={k} className="flex items-start gap-3">
                  <Icon size={18} weight="bold" className="text-[#CCFF00] shrink-0 mt-0.5" />
                  <span className="text-sm text-ink-2 leading-snug"><span className="text-white font-semibold">{t(`login.${k}`)}</span> {t(`login.${k}Text`)}</span>
                </li>
              ))}
            </ul>
          </div>
          <LegalLinks className="mt-10 text-[10px] uppercase tracking-[0.3em] text-ink-3" />
        </div>
      </div>

      {/* -------------------- Custom Wake Screen Overlay -------------------- */}
      {waking && (
        <div
          className="fixed inset-0 z-50 bg-[#0A0A0A] overflow-y-auto"
          data-testid="wake-screen"
        >
          <div className="min-h-full flex items-start justify-center px-6 pt-6 pb-8 md:pt-16 md:pb-12">
          <div className="w-full max-w-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6 md:mb-10">
              <Lightning
                size={26}
                weight="fill"
                className="text-[#CCFF00] animate-pulse"
              />
              <span className="font-anton text-2xl tracking-widest">
                TRACKER
              </span>
              <span className="text-[10px] tracking-[0.3em] uppercase text-ink-3 ml-auto">
                / BOOT SEQUENCE
              </span>
            </div>

            {/* Headline */}
            <p className="text-xs tracking-[0.3em] uppercase text-[#CCFF00] mb-3">
              {wakeFailed ? "/ CONNECTION FAILED" : "/ WAKING BACKEND"}
            </p>
            <h1 className="font-anton text-4xl md:text-5xl leading-none tracking-tight mb-3">
              {wakeFailed ? "SERVER UNREACHABLE." : "STEADY HANDS."}
            </h1>
            <p className="text-ink-2 text-sm leading-relaxed mb-6 md:mb-10 max-w-lg">
              {wakeFailed
                ? t("wake.failedText")
                : t("wake.text")}
            </p>

            {/* Terminal Log */}
            <div
              ref={wakeLogRef}
              className="border border-[#1A1A1A] bg-[#0E0E0E] p-4 md:p-5 mb-6 md:mb-8 font-mono text-[12px] md:text-[13px] leading-relaxed h-[210px] md:h-[240px] overflow-y-auto"
              data-testid="wake-log"
            >
              {statusLines.map((l, i) => (
                <div key={i} className="text-ink-2">
                  <span className="text-ink-3">{l.t}</span>{" "}
                  <span className="text-white">{l.text}</span>
                  <span className="text-ink-3"> ...</span>
                </div>
              ))}
              {!wakeFailed && (
                <div className="text-[#CCFF00] mt-1">
                  <span className="inline-block w-2 h-3 bg-[#CCFF00] align-middle animate-pulse" />
                </div>
              )}
            </div>

            {/* Progress Bar (determinate, mit Prozent-Anzeige) */}
            {!wakeFailed && (
              <div className="mb-6 md:mb-8" data-testid="wake-progress">
                <div className="flex items-center justify-between text-[10px] font-mono tracking-[0.25em] uppercase text-ink-3 mb-2">
                  <span>{progress >= 100 ? "BACKEND ONLINE" : "BOOTING"}</span>
                  <span
                    className="text-[#CCFF00] tabular-nums"
                    data-testid="wake-progress-percent"
                  >
                    {progress}%
                  </span>
                </div>
                <div
                  className="relative w-full h-2 bg-[#1A1A1A] overflow-hidden"
                  aria-hidden="true"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-[#CCFF00] glow-lime transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                    data-testid="wake-progress-bar"
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              {wakeFailed ? (
                <>
                  <button
                    onClick={() => {
                      setWakeFailed(false);
                      handleLogin();
                    }}
                    data-testid="wake-retry-button"
                    className="bg-[#CCFF00] hover:bg-[#D4FF33] text-black font-bold uppercase tracking-widest py-3 px-6 flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 glow-lime"
                  >
                    <WarningCircle size={18} weight="bold" />
                    <span>{t("common.retry")}</span>
                  </button>
                  <button
                    onClick={cancelWake}
                    data-testid="wake-cancel-button"
                    className="border border-[#222] hover:border-[#CCFF00] hover:text-[#CCFF00] text-ink-2 uppercase tracking-widest py-3 px-6 text-xs transition-colors"
                  >
                    {t("common.cancel")}
                  </button>
                </>
              ) : (
                <button
                  onClick={cancelWake}
                  data-testid="wake-cancel-button"
                  className="border border-[#222] hover:border-[#CCFF00] hover:text-[#CCFF00] text-ink-2 uppercase tracking-widest py-3 px-6 text-xs transition-colors"
                >
                  {t("common.cancel")}
                </button>
              )}
            </div>

            <p className="text-[10px] tracking-[0.25em] uppercase text-ink-3 mt-6 md:mt-10">
              FREE TIER COLD START · NORMALERWEISE 20-60 SEKUNDEN
            </p>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
