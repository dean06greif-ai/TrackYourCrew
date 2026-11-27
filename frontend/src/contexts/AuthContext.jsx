import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api, tokenStore } from "../lib/api";
import { saveSnapshot, loadSnapshot, isNetworkError, clearOffline } from "../lib/offline";
import { useI18n, getLang } from "../i18n";
import { Lightning } from "@phosphor-icons/react";

const AuthContext = createContext(null);

// ========== FIX FÜR BUG 2: BACKEND WAKE-UP SCREEN AUCH BEI DIREKTEM DASHBOARD-ZUGRIFF ==========
// ========== UPDATE: REIHENFOLGE ERZWUNGEN -> WAKE ZUERST, DANN AUTHENTICATING ==========
//
// Gewünschtes Verhalten:
//   1) Backend schläft  ->  WAKE-Screen  ->  AUTHENTICATING (children)  ->  Website
//   2) Backend wach     ->                   AUTHENTICATING (children)  ->  Website
//   In KEINEM Fall darf zuerst AUTHENTICATING und DANN der Wake-Screen erscheinen.
//
// Vorher wurde /auth/me sofort gefeuert. Solange es lief, hat <AuthProvider> seine
// children gerendert -> der eingebettete "AUTHENTICATING..."-Screen war schon zu
// sehen. Schlief das Backend, schaltete der Provider erst nach 4.5 s auf den
// Wake-Screen um -> Screen-Flip.
//
// Jetzt machen wir vor /auth/me eine sehr kurze /api/health-Probe. Solange das
// Ergebnis dieser Probe noch nicht da ist, rendert der Provider NICHTS (kein
// AUTHENTICATING flash). Dann entscheidet er:
//   - Probe OK     -> direkt children rendern (AUTHENTICATING) bis /auth/me da ist
//   - Probe failt  -> Wake-Screen anzeigen, auf Backend warten, DANN /auth/me
//     (Wake-Screen wird ausgeblendet, AUTHENTICATING erscheint) -> Website

// Wake-Screen Konstanten (gleiche wie in Login.jsx)
const WAKE_TIMEOUT_MS = 90_000;      // max. 90 s warten
const POLL_INTERVAL_MS = 1500;       // alle 1.5 s erneut versuchen

// Wie lange wir der initialen /api/health-Probe geben, BEVOR wir den
// Wake-Screen einblenden. Bei einem warmen Backend antwortet /api/health
// in ~100-500 ms, bei Render Cold Start liefert es entweder gar nicht
// oder erst nach 20-60 s. 2000 ms fängt also sicher beide Fälle ab,
// ohne dass ein warmes Backend unnötig blockiert wird.
const HEALTH_PROBE_MS = 2000;

function timeStamp() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

async function pingHealth(signal) {
  const reqCtrl = new AbortController();
  const reqTimer = setTimeout(() => reqCtrl.abort(), 5000);
  const onAbort = () => reqCtrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const r = await fetch(`${import.meta.env.REACT_APP_BACKEND_URL}/api/health`, {
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
    // Kurze Pause vor nächstem Versuch (abbrechbar)
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

// Beim Mount: Token aus URL-Fragment (#token=...) einlesen und in localStorage
// speichern. Wird vom Google-OAuth-Callback angehängt, damit Auth auch dann
// funktioniert, wenn Cross-Site Cookies blockiert sind (Google-In-App-Browser,
// Safari Cross-Site-Tracking verhindern, etc.).
function consumeTokenFromUrl() {
  try {
    const hash = window.location.hash || "";
    if (!hash.startsWith("#")) return false;
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get("token");
    if (!token) return false;
    tokenStore.set(token);
    // Token aus URL entfernen, ohne Reload — kein sichtbarer Token in der
    // Adresszeile, keine Referer-Leaks.
    const cleanUrl = window.location.pathname + window.location.search;
    window.history.replaceState({}, "", cleanUrl);
    return true;
  } catch {
    return false;
  }
}

// Heuristik: hat der Browser ein nicht-HttpOnly "session_hint" Cookie?
// Backend setzt das parallel zum echten httponly session_token. Wenn der
// Browser cross-site Cookies blockiert, ist auch dieses Hint-Cookie weg —
// dann macht ein /auth/me Call auch keinen Sinn (Cookie käme eh nicht mit).
function hasSessionHintCookie() {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith("session_hint="));
}

export function AuthProvider({ children }) {
  const { t, setLang } = useI18n();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ========== WAKE-SCREEN STATE ==========
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
  // Backend tatsaechlich antwortet (siehe `setProgress(100)` weiter unten).
  // Bei Render-Cold-Start dauert das Aufwachen ueblicherweise 30-60 s.
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

  // ========== PRE-CHECK STATE ==========
  // Während dieser kurzen Phase (max. HEALTH_PROBE_MS) entscheiden wir, ob
  // das Backend wach ist. In der Zeit rendern wir keine children -> der
  // AUTHENTICATING-Screen kann NICHT vor dem Wake-Screen aufploppen.
  const [precheck, setPrecheck] = useState(true);

  const pushLine = (text) => {
    setStatusLines((prev) => (prev.length && prev[prev.length - 1].text === text ? prev : [...prev, { t: timeStamp(), text }]));
  };

  const checkAuth = useCallback(async () => {
    const justGotToken = consumeTokenFromUrl();
    const hasToken = !!tokenStore.get();
    const hint = hasSessionHintCookie();

    // Kurzschluss: Erstbesucher und ausgeloggte User. Kein /auth/me Roundtrip,
    // kein Wake-Screen — User landet sofort auf der Login-Seite. (Login.jsx
    // hat seinen eigenen Wake-Screen für den Login-Click.)
    if (!hasToken && !hint && !justGotToken) {
      setUser(null);
      setPrecheck(false);
      setLoading(false);
      return;
    }

    // Offline (Dean 2026-11-26): ohne Netz mit dem zuletzt bekannten Konto starten, statt den
    // Wake-Screen zu zeigen. Sobald wieder Netz da ist, wird das Konto im Hintergrund neu geprüft.
    const cached = loadSnapshot("me")?.data || null;
    if (cached && typeof navigator !== "undefined" && navigator.onLine === false) {
      setUser(cached);
      setPrecheck(false);
      setLoading(false);
      return;
    }

    // ────────────────────────────────────────────────────────────────
    // PHASE 1: HEALTH-PROBE
    // Sehr kurze Probe gegen /api/health, BEVOR irgendwas anderes passiert.
    // - Probe OK in <HEALTH_PROBE_MS>  -> Backend ist wach, Wake-Screen
    //   wird gar nicht erst gezeigt. children werden gerendert,
    //   AUTHENTICATING erscheint, /auth/me läuft, fertig.
    // - Probe failt oder Timeout      -> Backend schläft. Wir blenden
    //   den Wake-Screen ein, warten via waitForBackend bis das Backend
    //   antwortet, blenden den Wake-Screen aus und gehen erst dann in
    //   Phase 2 (children + AUTHENTICATING + /auth/me).
    // ────────────────────────────────────────────────────────────────
    const probeCtrl = new AbortController();
    const probe = await Promise.race([
      pingHealth(probeCtrl.signal).then((ok) => ({ ok, timedOut: false })),
      new Promise((resolve) =>
        setTimeout(() => resolve({ ok: false, timedOut: true }), HEALTH_PROBE_MS)
      ),
    ]);
    // Probe-Request canceln, falls er noch läuft (Timeout-Fall).
    if (!probe.ok) probeCtrl.abort();

    if (!probe.ok) {
      // -------- Backend schläft -> Wake-Screen zuerst --------
      setWakeFailed(false);
      setStatusLines([]);
      pushLine("handshake");
      setWaking(true);
      setPrecheck(false); // ab jetzt darf der Wake-Screen sichtbar werden

      const drama = [
        "idle",
        "alloc",
        "db",
        "progression",
        "crew",
        "almost",
      ];
      let i = 0;
      const dramaInterval = setInterval(() => {
        if (i < drama.length) {
          pushLine(drama[i]);
          i += 1;
        }
      }, 2200);

      const ctrl = new AbortController();
      wakeAbortRef.current = ctrl;
      const ok = await waitForBackend(ctrl.signal);
      clearInterval(dramaInterval);

      if (!ok && cached) {
        // Server/Netz nicht erreichbar, aber Konto bekannt: offline weiter
        setWaking(false);
        setUser(cached);
        setLoading(false);
        return;
      }
      if (!ok) {
        pushLine("timeout");
        setWakeFailed(true);
        setLoading(false);
        return;
      }

      pushLine("online");
      setProgress(100);
      // Kurz wirken lassen, dann auf AUTHENTICATING (children) übergeben.
      await new Promise((r) => setTimeout(r, 500));
      setWaking(false);
      // -> Fällt direkt durch in Phase 2 unten.
    } else {
      // -------- Backend ist wach -> direkt zu AUTHENTICATING --------
      setPrecheck(false); // children werden ab jetzt gerendert
    }

    // ────────────────────────────────────────────────────────────────
    // PHASE 2: /auth/me
    // Backend ist garantiert wach. children sind sichtbar -> AUTHENTICATING.
    // ────────────────────────────────────────────────────────────────
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      saveSnapshot("me", data);
      // Sprache: Konto-Sprache gilt auf allen Geräten. Hat das Konto noch keine,
      // wird die aktuelle (gewählte oder erkannte) Sprache gespeichert.
      if (data?.language) {
        if (data.language !== getLang()) setLang(data.language);
      } else {
        api.put("/me/language", { language: getLang() }).catch(() => {});
      }
    } catch (e) {
      // Nur bei echter Ablehnung abmelden – ein Netzfehler darf niemanden ausloggen
      if (isNetworkError(e) && cached) setUser(cached);
      else {
        setUser(null);
        tokenStore.clear();
      }
    }
    setLoading(false);
  }, [setLang]);

  // Wieder online: Konto still neu prüfen (abgelaufene Anmeldung -> abmelden)
  useEffect(() => {
    const h = () => {
      if (!tokenStore.get()) return;
      api.get("/auth/me")
        .then(({ data }) => { setUser(data); saveSnapshot("me", data); })
        .catch((e) => { if (e.response?.status === 401) { setUser(null); tokenStore.clear(); } });
    };
    window.addEventListener("online", h);
    return () => window.removeEventListener("online", h);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) { /* ignore */ }
    tokenStore.clear();
    clearOffline();
    setUser(null);
  };

  const cancelWake = () => {
    wakeAbortRef.current?.abort();
    setWaking(false);
    setWakeFailed(false);
    setPrecheck(false);
    setLoading(false);
  };

  const retryWake = () => {
    setWakeFailed(false);
    setPrecheck(true);
    checkAuth();
  };

  // ========== PRE-CHECK: nichts rendern ==========
  // Sehr kurze Phase (max. HEALTH_PROBE_MS). Verhindert, dass children
  // (und damit der AUTHENTICATING-Screen) sichtbar werden, bevor wir
  // wissen, ob das Backend überhaupt antwortet.
  if (precheck) {
    return <div className="fixed inset-0 bg-[#0A0A0A]" data-testid="auth-precheck" />;
  }

  // ========== WAKE-SCREEN UI ==========
  if (waking) {
    return (
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
          </div>

          {/* Headline */}
          <p className="text-xs tracking-[0.3em] uppercase text-[#CCFF00] mb-3">
            / {wakeFailed ? t("wake.kickerFailed") : t("wake.kicker")}
          </p>
          <h1 className="font-anton text-4xl md:text-5xl leading-none tracking-tight mb-3">
            {wakeFailed ? t("wake.titleFailed") : t("wake.title")}
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
              <div key={i} className="text-ink-2 flex gap-2">
                <span className="text-ink-3 shrink-0">{l.t}</span>
                <span className="min-w-0"><span className="text-white">{t(`wake.l.${l.text}`)}</span><span className="text-ink-3">{" ..."}</span></span>
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
                <span>{progress >= 100 ? t("wake.l.online") : t("wake.booting")}</span>
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
                  onClick={retryWake}
                  data-testid="wake-retry-button"
                  className="bg-[#CCFF00] hover:bg-[#D4FF33] text-black font-bold uppercase tracking-widest py-3 px-6 flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 glow-lime"
                >
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
            {t("wake.footer")}
          </p>
        </div>

        </div>
      </div>
    );
  }

  // Normal loading state (nachdem Backend wach ist)
  return (
    <AuthContext.Provider value={{ user, setUser, loading, logout, refresh: checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);