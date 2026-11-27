import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Lightning, SignOut, Gear, Plus, Pulse, Flame, Trophy, ChartBar, UserPlus, Trash, X, Pause, Timer } from "@phosphor-icons/react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import UserCard from "../components/UserCard";
import ExerciseIcon from "../components/ExerciseIcon";
import FitLabel from "../components/FitLabel";
import Ranking from "../components/Ranking";
import Insights from "../components/Insights";
import Onboarding from "../components/Onboarding";
import { useI18n, weekdayNames } from "../i18n";
import FeedbackDialog from "../components/FeedbackDialog";
import { toast } from "sonner";
import { useBoardState } from "../hooks/useBoardState";
import { useWebSocket } from "../hooks/useWebSocket";
import { useCelebrationState } from "../hooks/useCelebrationState";
import { exerciseLabel } from "../lib/exercises";
import { useMilestones } from "../hooks/useMilestones";
import MilestoneToasts from "../components/MilestoneToast";
import CrewRequests from "../components/CrewRequests";
import { consumePendingJoin } from "./JoinPage";
import GuidedTour from "../components/GuidedTour";
import GoalHint from "../components/GoalHint";
import { usePercentiles } from "../hooks/usePercentiles";
import ChallengesSection, { CHALLENGES_EVENT } from "../components/Challenges";
import { tourEvent, tourNeed, TOUR_EVENT } from "../lib/tour";
import InstallSheet from "../components/InstallSheet";
import { countVisit, currentPlatform, markLogged, readInstallState, shouldAutoShow, writeInstallState } from "../lib/install";
import { amountParts } from "../lib/amount";
import { VoiceLogButton, VoiceLogPanel, VoiceSaved } from "../components/VoiceLog";
import { GlobalMicButton, useGlobalVoiceRouter } from "../components/GlobalVoice";
import LegalLinks from "../components/LegalLinks";
import ChallengeReadyCheck from "../components/ChallengeReadyCheck";
import Workout from "../components/Workout";
import MusicButton from "../components/MusicPlayer";
import { unlockAudio } from "../lib/coachAudio";
import { isNetworkError, queueEntry, readOutbox, writeOutbox, mergeDays, alreadyApplied, sumsFromDays, saveSnapshot, loadSnapshot, useOnline, useOutboxCount } from "../lib/offline";
import { useVoiceConfirm, setGlobalVoice } from "../lib/voiceHub";
import { ActivityLogRow, ActivityDayButton } from "../components/ActivityLog";
import { isActivity, doneDays } from "../lib/activities";
import { AutoFitNumberInput, NumInput } from "../components/NumInput";
import { track } from "../lib/usage";
import { spokenDigits } from "../lib/voiceLog";

// Globaler Toast-Tweak: Container click-through machen, damit Buttons hinter Nachrichten
// trotzdem klickbar sind. Zusätzlich werden Toasts nach unten verschoben, damit sie nicht
// optisch über die Header-Buttons (insbesondere Logout) ziehen und dadurch beim
// "Durchfahren" mit der Maus deren Hover-Styling (rot) auslösen.
// Wird einmal pro Mount injiziert (id verhindert Dopplungen).
function useToastStyleFix() {
  useEffect(() => {
    const id = "tracker-toast-style-fix";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      [data-sonner-toaster], [data-sonner-toaster] * {
        pointer-events: none !important;
      }
      /* Knöpfe in Hinweisen (z. B. "Neuen Stand laden") müssen klickbar bleiben */
      [data-sonner-toaster] [data-button] {
        pointer-events: auto !important;
      }
      /* Toaster nicht direkt unter den Header-Buttons platzieren – sonst
         löst das "Durchfahren" der Maus über einem Toast das Hover-Rot
         des Logout-Buttons aus. */
      [data-sonner-toaster][data-y-position="top"] {
        top: 96px !important;
      }
    `;
    document.head.appendChild(style);
  }, []);
}

export default function Dashboard() {
  const { user, setUser, logout, loading } = useAuth();
  const { t, locale, lang } = useI18n();
  const dayShort = weekdayNames(locale, "short");
  const [showFeedback, setShowFeedback] = useState(false);
  const navigate = useNavigate();

  // ✅ VERWENDE DIE NEUEN HOOKS
  const {
    board,
    onlineUserIds,
    flashing,
    fetchBoard,
    refreshUser,
    updateOnlineUsers,
    flashUser,
    setBoard,
  } = useBoardState(user);
  // Offline-Eintragen (Dean 2026-11-26): Stand + Postausgang, siehe lib/offline.js
  const online = useOnline();
  const pendingOffline = useOutboxCount(user?.user_id);
  // Meilensteine: eigene melden, neue der Crew einmal als Toast zeigen (Plan 1e).
  const { toasts: milestoneToasts, dismiss: dismissMilestone } = useMilestones({ board, user, lang });
  // Prozent-Vergleiche (nur echte Daten, erst ab genug Nutzern je Übungsart)
  usePercentiles({ board, user, t });

  // Emojis (Dean, 2026-11-25): je Karte eine Warteschlange von Animationen {id, emoji, from?}.
  const [emojiQueues, setEmojiQueues] = useState({});
  const pushBurst = useCallback((userId, item) => {
    setEmojiQueues((q) => ({ ...q, [userId]: [...(q[userId] || []), item].slice(-8) }));
  }, []);
  const burstDone = useCallback((userId, id) => {
    setEmojiQueues((q) => ({ ...q, [userId]: (q[userId] || []).filter((x) => x.id !== id) }));
  }, []);
  const sendEmoji = useCallback(async (toUserId, emoji) => {
    // sofort zeigen (fühlt sich direkt an), Fehler nur als Hinweis
    pushBurst(toUserId, { id: `out-${Date.now()}`, emoji });
    try {
      await api.post("/emoji", { to_user_id: toUserId, emoji });
      track("emoji_sent");
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.error"), { id: "emoji-err", duration: 2000 });
    }
  }, [pushBurst, t]);
  // Herausfordern direkt von der Karte: Dialog mit dieser Person öffnen
  const [challengeFor, setChallengeFor] = useState(null);

  // Verpasste Emojis beim Besuch nachholen (nacheinander auf der eigenen Karte), dann als gesehen merken.
  const unseenLoadedRef = useRef(false);
  useEffect(() => {
    if (!user?.user_id || !board || unseenLoadedRef.current) return;
    unseenLoadedRef.current = true;
    api.get("/me/emojis/unseen").then(({ data }) => {
      const items = data?.items || [];
      if (!items.length) return;
      items.forEach((it) => pushBurst(user.user_id, { id: it.id, emoji: it.emoji, from: it.from_name }));
      const names = [...new Set(items.map((i) => i.from_name))];
      toast(t(items.length === 1 ? "emoji.gotOne" : "emoji.gotMany", { name: names.join(", "), emoji: items[items.length - 1].emoji, n: items.length }), { id: "emoji-unseen", duration: 3500 });
      api.post("/me/emojis/seen", { ids: items.map((i) => i.id) }).catch(() => {});
    }).catch(() => { unseenLoadedRef.current = false; });
  }, [user?.user_id, board, pushBurst, t]);

  const {
    celebratingUsers,
    pendingCelebration,
    pendingFailing,
    handleCelebrationShown,
    handleFailingShown,
    checkCelebrations,
    triggerCelebration,
  } = useCelebrationState();

  const [logging, setLogging] = useState(false);
  const [logMode, setLogMode] = useState("total");
  const [logForm, setLogForm] = useState({});
  const [logDays, setLogDays] = useState({});
  // Snapshots der zuletzt gespeicherten Werte. Bei "Abbrechen" werden
  // logForm/logDays auf diese Snapshots zurückgesetzt, damit ungespeicherte
  // Änderungen verworfen werden. Aktualisiert nach erfolgreichem Save,
  // bei Live-Save und bei Board-Refresh.
  const [savedLogForm, setSavedLogForm] = useState({});
  const [savedLogDays, setSavedLogDays] = useState({});
  // Zwei-Geräte-Schutz: Stand (updated_at), auf dem die Eingabe beruht. Der Server lehnt ab (409),
  // wenn inzwischen ein anderes Gerät gespeichert hat – statt still zu überschreiben.
  const baseUpdatedAtRef = useRef(null);
  const saveBusyRef = useRef(false);
  const saveAgainRef = useRef(false);

  // Custom Step (Schrittweite) für + / - in Gesamt-Modus.
  // Wird pro User in der DB persistiert, damit die Werte
  // geräteübergreifend (PC ↔ Handy) identisch sind.
  // localStorage dient nur noch als kurzer Offline-Cache, damit beim
  // erneuten Öffnen nicht kurz die Defaults aufblitzen, bis das Backend
  // geantwortet hat – das Backend bleibt die Source of Truth.
  const [showStepSettings, setShowStepSettings] = useState(false);
  const [customSteps, setCustomSteps] = useState(() => {
    try {
      const stored = localStorage.getItem("customSteps");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  // Anzeige-Wert der Schritteingaben pro Session – beim erneuten Öffnen leer,
  // damit der gespeicherte Wert als ausgegrauter Placeholder erscheint.
  const [stepInputDisplay, setStepInputDisplay] = useState({});

  // Tracking-Refs, damit der Persist-Effect erst NACH dem initialen Backend-
  // Load schreibt (sonst würde der DB-Wert evtl. mit dem leeren Default-State
  // überschrieben werden, bevor er geladen ist).
  const customStepsLoadedRef = useRef(false);
  const customStepsPersistTimerRef = useRef(null);

  // 1) Beim Mount: aus dem Backend laden (Source of Truth).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/me/custom-steps");
        if (!cancelled) {
          const remote = (data && data.custom_steps) || {};
          setCustomSteps(remote);
          try { localStorage.setItem("customSteps", JSON.stringify(remote)); } catch {}
        }
      } catch (e) {
        // Falls Endpoint (noch) nicht erreichbar: lokaler Cache bleibt aktiv.
      } finally {
        customStepsLoadedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // 2) Bei jeder Änderung: in DB persistieren (debounced, damit schnelles
  //    Tippen nicht mehrere Requests auslöst) und lokalen Cache aktualisieren.
  //    Erst NACH dem initialen Load.
  useEffect(() => {
    try {
      localStorage.setItem("customSteps", JSON.stringify(customSteps));
    } catch {}
    if (!customStepsLoadedRef.current) return;
    if (customStepsPersistTimerRef.current) clearTimeout(customStepsPersistTimerRef.current);
    customStepsPersistTimerRef.current = setTimeout(() => {
      customStepsPersistTimerRef.current = null;
      api.put("/me/custom-steps", { custom_steps: customSteps }).catch(() => {});
    }, 350);
    return () => {
      if (customStepsPersistTimerRef.current) {
        clearTimeout(customStepsPersistTimerRef.current);
        customStepsPersistTimerRef.current = null;
      }
    };
  }, [customSteps]);

  // Live-Werte-Speichern Toggle. Wird in der DB persistiert, sodass der
  // Zustand zwischen Geräten und nach einem Reload erhalten bleibt.
  // Wenn aktiv, werden Änderungen in den Eingabefeldern sofort (mit kurzer
  // Debounce-Pause, damit nicht jeder Tastendruck einen Request auslöst)
  // automatisch ans Backend gesendet – ohne Toast-Mitteilung.
  const [liveSaveEnabled, setLiveSaveEnabled] = useState(false);
  const liveSavePersistTimerRef = useRef(null);
  const liveSaveLoadedRef = useRef(false);
  // Preference, ob die Boost-Aktivieren-Buttons auf der UserCard versteckt
  // werden sollen. Wird in Settings umgeschaltet und hier nur gelesen.
  // Initial-Wert kommt synchron aus dem localStorage, damit die Buttons
  // beim Zurücknavigieren aus den Settings NICHT kurz aufblitzen bevor
  // der Backend-Wert geladen ist. Settings.jsx schreibt den gleichen Key.
  const [hideBoostButtons, setHideBoostButtons] = useState(() => {
    try {
      const v = typeof window !== "undefined" && window.localStorage.getItem("pref:hide_boost_buttons");
      return v === "true";
    } catch (_) { return false; }
  });
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/me/hide-boost-buttons");
        if (!cancelled) {
          const v = !!data?.hide_boost_buttons;
          setHideBoostButtons(v);
          try { window.localStorage.setItem("pref:hide_boost_buttons", String(v)); } catch (_) {}
        }
      } catch (e) {
        // Default: AUS
      }
    })();
    return () => { cancelled = true; };
  }, [user]);
  // Beim Mount: gespeicherten Zustand aus der DB laden.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/me/live-save");
        if (!cancelled) {
          setLiveSaveEnabled(!!data?.live_save_enabled);
        }
      } catch (e) {
        // Falls Endpoint noch nicht erreichbar: Default bleibt AUS.
      } finally {
        liveSaveLoadedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [user]);
  // Bei Änderung: in DB persistieren (debounced, damit schnelles Toggeln
  // nicht mehrere Requests auslöst). Erst NACH dem initialen Load.
  useEffect(() => {
    if (!liveSaveLoadedRef.current) return;
    if (liveSavePersistTimerRef.current) clearTimeout(liveSavePersistTimerRef.current);
    liveSavePersistTimerRef.current = setTimeout(() => {
      liveSavePersistTimerRef.current = null;
      api.put("/me/live-save", { live_save_enabled: liveSaveEnabled }).catch(() => {});
    }, 250);
    return () => {
      if (liveSavePersistTimerRef.current) {
        clearTimeout(liveSavePersistTimerRef.current);
        liveSavePersistTimerRef.current = null;
      }
    };
  }, [liveSaveEnabled]);
  const liveSaveTimerRef = useRef(null);
  const handleLogProgressRef = useRef(null);
  // Spracheingabe (Dean 2026-11-26): erkannte Einträge zum Tag + zur Wochensumme addieren, dann normal speichern
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [workoutOpen, setWorkoutOpen] = useState(false);
  const [voiceInitial, setVoiceInitial] = useState(null); // erkannte Einträge zum Prüfen („Erst bestätigen“)
  const [voiceHeard, setVoiceHeard] = useState("");
  const [voiceAsk, setVoiceAsk] = useState("");
  const voiceConfirmOn = useVoiceConfirm();
  const voiceSaveRef = useRef(false);
  const voiceSummaryRef = useRef(null); // was per Sprache eingetragen wurde -> Rückmeldung im Speichern-Toast
  const scheduleLiveSave = useCallback(() => {
    if (!liveSaveEnabled) return;
    if (liveSaveTimerRef.current) clearTimeout(liveSaveTimerRef.current);
    // Kurzes Debounce (350ms) damit sich aufeinanderfolgende Tastendrücke
    // zu einem einzigen Request bündeln, das Speichern aber dennoch
    // praktisch sofort wirkt.
    liveSaveTimerRef.current = setTimeout(() => {
      liveSaveTimerRef.current = null;
      handleLogProgressRef.current?.({ silent: true });
    }, 350);
  }, [liveSaveEnabled]);
  // Beim Deaktivieren / Unmount Timer aufräumen
  useEffect(() => {
    if (!liveSaveEnabled && liveSaveTimerRef.current) {
      clearTimeout(liveSaveTimerRef.current);
      liveSaveTimerRef.current = null;
    }
    return () => {
      if (liveSaveTimerRef.current) {
        clearTimeout(liveSaveTimerRef.current);
        liveSaveTimerRef.current = null;
      }
    };
  }, [liveSaveEnabled]);

  const getDefaultStep = (ex) => (ex.unit === "km" ? 0.1 : ex.goal > 100 ? 5 : 1);
  const getStep = (ex) => {
    const c = customSteps[ex.key];
    if (c !== undefined && c !== null && c !== "" && !isNaN(Number(c)) && Number(c) > 0) {
      return Number(c);
    }
    return getDefaultStep(ex);
  };
  const closeStepSettings = () => {
    setStepInputDisplay({});
    setShowStepSettings(false);
  };
  const toggleStepSettings = () => {
    if (showStepSettings) {
      closeStepSettings();
    } else {
      setStepInputDisplay({}); // alte Werte als Placeholder anzeigen
      setShowStepSettings(true);
      tourEvent("log-settings-open");
    }
  };
  const updateCustomStep = (key, raw) => {
    setStepInputDisplay((d) => ({ ...d, [key]: raw }));
    if (raw === "" || raw === null || raw === undefined) {
      setCustomSteps((s) => {
        const ns = { ...s };
        delete ns[key];
        return ns;
      });
      return;
    }
    const n = Number(raw);
    if (!isNaN(n) && n > 0) {
      setCustomSteps((s) => ({ ...s, [key]: n }));
    }
  };
  const [showRanking, setShowRanking] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(null); // exercise key being canceled
  const [removeFriendDialog, setRemoveFriendDialog] = useState(null); // friend object pending removal

  // --- Friends panel ---
  const [showFriendPanel, setShowFriendPanel] = useState(false);
  const [friends, setFriends] = useState([]); // [{user_id, name, handle, picture}]
  const [friendName, setFriendName] = useState("");
  const [friendHandle, setFriendHandle] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);
  const friendNameRef = useRef(null);
  const friendHandleRef = useRef(null);

  // Schließen des Friend-Panels: räumt Name + Hashtag-Eingaben auf
  const closeFriendPanel = () => {
    setShowFriendPanel(false);
    setFriendName("");
    setFriendHandle("");
  };

  // Paste-Handler: erkennt "Name#HASH" und verteilt automatisch auf beide Inputs.
  // Wird sowohl im Name- als auch im Handle-Input verwendet, damit der Nutzer
  // egal wo eingefügt das richtige Verhalten bekommt.
  const handleCombinedPaste = (e) => {
    const text = e.clipboardData?.getData("text");
    if (!text) return;
    if (text.includes("#")) {
      e.preventDefault();
      const idx = text.indexOf("#");
      const namePart = text.slice(0, idx).trim().slice(0, 80);
      const hashPart = text
        .slice(idx + 1)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 5);
      setFriendName(namePart);
      setFriendHandle(hashPart);
      // Fokus auf Handle, falls Hash unvollständig, sonst auf Name
      setTimeout(() => {
        if (hashPart.length < 5) friendHandleRef.current?.focus();
        else friendNameRef.current?.focus();
      }, 0);
    }
  };

  // FIX 2: Android "Vorschlagen" Paste - onChange Handler für Name-Input
  const handleNameChange = (e) => {
    const val = e.target.value;
    setFriendName(val);

    // Prüfe ob # im Namen vorhanden ist (Android paste via suggestions)
    if (val.includes("#")) {
      const idx = val.indexOf("#");
      const namePart = val.slice(0, idx).trim().slice(0, 80);
      const hashPart = val
        .slice(idx + 1)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 5);

      // Verteile auf beide Felder
      setFriendName(namePart);
      setFriendHandle(hashPart);

      // Fokus auf Handle falls unvollständig
      setTimeout(() => {
        if (hashPart.length < 5) friendHandleRef.current?.focus();
        else friendNameRef.current?.focus();
      }, 0);
    }
  };

  // Und für Hashtag-Input:
  const handleHashtagChange = (e) => {
    const val = e.target.value;

    // Wenn vollständiger String mit # eingefügt wurde
    if (val.includes("#")) {
      const idx = val.indexOf("#");
      const beforeHash = val.slice(0, idx).trim();
      const afterHash = val.slice(idx + 1).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);

      // Wenn Text vor dem # existiert, ist es wahrscheinlich "Name#Hash" Format
      if (beforeHash.length > 0) {
        setFriendName(beforeHash.slice(0, 80));
        setFriendHandle(afterHash);
        setTimeout(() => {
          if (afterHash.length < 5) friendHandleRef.current?.focus();
          else friendNameRef.current?.focus();
        }, 0);
        return;
      }
    }

    // Normales Hashtag-Input ohne #
    const cleaned = val.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    setFriendHandle(cleaned);
  };

  // ===== Unified Drag & Drop (Pointer Events) =====
  // Funktioniert auf Desktop (Maus) + Mobile (Touch) mit einer einzigen Codebasis.
  // Live-Reorder: Sobald der Finger/Cursor über ein anderes Tile fährt, wird
  // sofort umsortiert (kein Warten bis zum Loslassen). Beim Loslassen wird die
  // finale Reihenfolge an den Server gesendet.
  const activeDragIdxRef = useRef(null);   // aktueller Index des gezogenen Items (ändert sich beim Live-Swap)
  const dragStartPosRef = useRef(null);    // Startposition des Pointers (für Long-Press-Threshold)
  const holdTimerRef = useRef(null);       // Timer für Long-Press (Mobile)
  const activePointerIdRef = useRef(null); // pointerId für setPointerCapture
  const pendingOrderRef = useRef(null);    // Reihenfolge die beim pointerup persistiert wird
  const [dragGhost, setDragGhost] = useState(null); // { idx, x, y, offsetX, offsetY, w, h, friend }
  useToastStyleFix();

  // iOS-Fix: Wenn die Seite vom Hintergrund zurückkommt (z. B. nach App-Wechsel
  // YouTube -> Safari), behält iOS manchmal den Fokus auf einem <input>, und
  // der erste Tap auf den "Speichern"-Button löst dann Text-Selection statt
  // eines Klicks aus. Wir entfokussieren beim Resume aktiv und stellen
  // sicher, dass keine versehentliche Selection auf dem Save-Button stehen
  // bleibt. Außerdem reagieren wir auf das pageshow-Event (BFCache).
  useEffect(() => {
    const clearStuckFocus = () => {
      try {
        const ae = document.activeElement;
        if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) {
          ae.blur();
        }
        if (window.getSelection) {
          const sel = window.getSelection();
          if (sel && sel.removeAllRanges) sel.removeAllRanges();
        }
      } catch (_) { /* noop */ }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") clearStuckFocus();
    };
    const onPageShow = () => clearStuckFocus();
    const onFocus = () => clearStuckFocus();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Scroll-Position wiederherstellen, wenn vom Settings-Screen zurückkommend.
  // Position wurde beim Klick auf den Settings-Button in sessionStorage gespeichert.
  // Wir warten bis das Board geladen ist (Content gerendert), damit der Scroll-Wert
  // valide angesprungen werden kann (sonst ist die Seite noch zu kurz).
  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    if (scrollRestoredRef.current) return;
    if (!board) return;
    let raw = null;
    try { raw = sessionStorage.getItem("dashboardScrollY"); } catch (_) { /* ignore */ }
    if (raw !== null) {
      const y = parseInt(raw, 10);
      if (!Number.isNaN(y)) {
        // Auf den nächsten Frame warten, damit das DOM mit Board-Inhalten vollständig steht.
        requestAnimationFrame(() => window.scrollTo(0, y));
      }
      try { sessionStorage.removeItem("dashboardScrollY"); } catch (_) { /* ignore */ }
    }
    scrollRestoredRef.current = true;
  }, [board]);

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [user, loading, navigate]);

  // ✅ Board laden beim Mount
  useEffect(() => {
    if (user) fetchBoard();
  }, [user, fetchBoard]);

  // Eintrage-Formular immer mit dem neuesten Server-Stand füllen, solange es
  // geschlossen ist. Sonst würde ein Eintrag am PC die inzwischen am Handy
  // gespeicherten Werte mit einem alten Stand überschreiben (Datenverlust).
  const myEntry = board?.users?.find((u) => u.user_id === user?.user_id);
  const myEntryKey = myEntry ? JSON.stringify([myEntry.week_number, myEntry.values, myEntry.days]) : "";
  useEffect(() => {
    if (!myEntry || logging) return;
    const freshForm = { ...(myEntry.values || {}) };
    const freshDays = myEntry.days || {};
    setLogForm(freshForm);
    setLogDays(JSON.parse(JSON.stringify(freshDays)));
    setSavedLogForm(freshForm);
    setSavedLogDays(JSON.parse(JSON.stringify(freshDays)));
    baseUpdatedAtRef.current = myEntry.updated_at || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEntryKey, logging]);

  // Nach einem Konflikt: neuesten Stand vom Server ins Formular holen.
  const reloadMyProgress = async () => {
    try {
      const { data } = await api.get("/progress/me");
      const freshForm = { ...(data.values || {}) };
      const freshDays = data.days || {};
      setLogForm(freshForm);
      setLogDays(JSON.parse(JSON.stringify(freshDays)));
      setSavedLogForm(freshForm);
      setSavedLogDays(JSON.parse(JSON.stringify(freshDays)));
      baseUpdatedAtRef.current = data.updated_at || null;
      fetchBoard();
    } catch { /* egal */ }
  };

  // --- Seen-Effects (Animationen nur 1× pro Viewer) ---
  // Persistiert in der DB pro Viewer. Wir laden die Liste 1× beim Mount
  // und halten sie als Set { "<type>_<targetUserId>_<weekNumber>" } im State.
  // Track ob Seen-Effects bereits aus der DB geladen wurden – erst DANN
  // dürfen wir den Initial-Scan für Celebrations/Failings starten, sonst
  // würde die "Week N failed"-Animation feuern, obwohl sie längst gesehen
  // (und in der DB markiert) wurde.
  const seenEffectsLoadedRef = useRef(false);
  const [seenEffects, setSeenEffects] = useState(() => new Set());
  const fetchSeenEffects = useCallback(async () => {
    try {
      const { data } = await api.get("/me/seen-effects");
      const items = Array.isArray(data?.items) ? data.items : [];
      setSeenEffects(new Set(items.map((it) => `${it.type}_${it.target_user_id}_${it.week_number}`)));
    } catch (e) {
      console.error("Failed to fetch seen effects:", e);
    } finally {
      seenEffectsLoadedRef.current = true;
    }
  }, []);
  useEffect(() => {
    if (user) fetchSeenEffects();
  }, [user, fetchSeenEffects]);

  // ✅ Check Celebrations nach Board-Load – aber erst, wenn die Seen-Effects
  // aus der DB geladen wurden. Sonst würde die "Week N failed"-Animation
  // einmalig direkt nach dem Login fälschlich erneut feuern.
  useEffect(() => {
    if (board && user && seenEffectsLoadedRef.current) {
      checkCelebrations(board, user, seenEffects);
    }
  }, [board, user, seenEffects, checkCelebrations]);

  // --- Friends API ---
  const fetchFriends = useCallback(async () => {
    try {
      const { data } = await api.get("/friends");
      setFriends(Array.isArray(data?.friends) ? data.friends : []);
    } catch (e) {
      console.error("Failed to fetch friends:", e);
    }
  }, []);

  useEffect(() => {
    if (user) fetchFriends();
  }, [user, fetchFriends]);

  // Freundschaftsanfragen (Plan 4b): eingehende mit Badge am Crew-Knopf.
  const [friendRequests, setFriendRequests] = useState({ incoming: [], outgoing: [] });
  const fetchFriendRequests = useCallback(async () => {
    try {
      const { data } = await api.get("/friends/requests");
      setFriendRequests({ incoming: data?.incoming || [], outgoing: data?.outgoing || [] });
      return data;
    } catch (e) {
      console.error("Failed to fetch friend requests:", e);
      return null;
    }
  }, []);
  useEffect(() => {
    if (user) fetchFriendRequests();
  }, [user, fetchFriendRequests]);

  // "Als App installieren" (Plan 10): dezent, nie beim ersten Besuch, nie während
  // Einführung/Tour – und nur EINMAL (Dean 2026-11-26), danach nur noch über die Einstellungen.
  const [installSheet, setInstallSheet] = useState(null); // Plattform oder null
  useEffect(() => {
    if (!user) return undefined;
    const state = countVisit();
    const onTour = (e) => { if (e.detail === "progress-saved") markLogged(); };
    window.addEventListener(TOUR_EVENT, onTour);
    const platform = currentPlatform();
    const busy = user.onboarding_done === false || (Number.isInteger(user.tour_step) && user.tour_step >= 0);
    let timer;
    if (!busy && shouldAutoShow(platform, state)) {
      timer = setTimeout(() => {
        writeInstallState({ ...readInstallState(), never: true }); // gezeigt = erledigt
        setInstallSheet(platform);
      }, 2500);
    }
    return () => { clearTimeout(timer); window.removeEventListener(TOUR_EVENT, onTour); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id]);

  // Einladungslink, der vor dem Login geöffnet wurde: jetzt beitreten.
  useEffect(() => {
    if (!user) return;
    const handle = consumePendingJoin();
    if (!handle) return;
    api.post("/friends/join", { handle })
      .then(({ data }) => {
        toast.success(t("crew.joined", { name: data?.friend?.name || handle }), { duration: 3000 });
        fetchFriends();
        fetchBoard();
      })
      .catch((err) => toast.error(err.response?.data?.detail || t("crew.addFailed"), { duration: 3000 }));
  }, [user, fetchFriends, fetchBoard, t]);

  // Markiert eine Animation als "gesehen" (auch für MICH SELBST, damit die
  // Failed-Animation nicht bei jedem Reload erneut spielt). Lokal sofort
  // ins Set einfügen, damit kein Re-Render die Animation nochmal zeigt.
  const markEffectSeen = useCallback(async ({ target_user_id, week_number, type }) => {
    if (!target_user_id || !week_number || !type) return;
    const key = `${type}_${target_user_id}_${week_number}`;
    setSeenEffects((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    try {
      await api.post("/me/seen-effects", { target_user_id, week_number, type });
    } catch (e) {
      console.error("Failed to mark seen effect:", e);
    }
  }, []);


  const handleAddFriend = async (e) => {
    e?.preventDefault?.();
    if (addingFriend) return;
    const name = friendName.trim();
    const handle = friendHandle.trim().toUpperCase().replace(/^#/, "");
    if (!name || !handle) {
      toast.error(t("crew.needNameCode"), { duration: 2500 });
      return;
    }
    if (handle.length !== 5) {
      toast.error(t("crew.codeLength"), { duration: 2500 });
      return;
    }
    setAddingFriend(true);
    try {
      const { data } = await api.post("/friends/add", { name, handle });
      // Seit Plan 4b eine Anfrage; nur wenn die Person mir schon eine geschickt hatte, sofort verbunden.
      track("friend_added");
      if (data?.status === "connected") toast.success(t("crew.added", { name }), { duration: 2500 });
      else toast.success(t("crew.requestSent", { name }), { duration: 2500 });
      setFriendName("");
      setFriendHandle("");
      await Promise.all([fetchFriends(), fetchBoard(), fetchFriendRequests()]);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("crew.addFailed"), { duration: 2500 });
    } finally {
      setAddingFriend(false);
    }
  };

  const handleRemoveFriend = async (friendId) => {
    try {
      await api.delete(`/friends/${friendId}`);
      setFriends((p) => p.filter((f) => f.user_id !== friendId));
      fetchBoard();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("crew.removeFailed"), { duration: 2500 });
    }
  };

  const persistFriendOrder = useCallback(async (order) => {
    try {
      await api.put("/friends/order", { order });
    } catch (err) {
      console.error("Failed to persist friend order:", err);
    }
  }, []);

  // Lokale Live-Umsortierung OHNE Server-Persistierung.
  // Wird während des Ziehens bei jedem Tile-Wechsel aufgerufen.
  const reorderFriendsLocal = useCallback((srcIdx, targetIdx) => {
    if (srcIdx == null || targetIdx == null || srcIdx === targetIdx) return;
    setFriends((prev) => {
      if (srcIdx < 0 || srcIdx >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(srcIdx, 1);
      const clampedTarget = Math.max(0, Math.min(targetIdx, next.length));
      next.splice(clampedTarget, 0, moved);
      pendingOrderRef.current = next.map((f) => f.user_id);
      return next;
    });
  }, []);

  // ===== Drag-Helper =====
  const findTileIdxFromPoint = (clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const tile = el.closest("[data-friend-idx]");
    if (!tile) return null;
    const idx = Number(tile.getAttribute("data-friend-idx"));
    return Number.isFinite(idx) ? idx : null;
  };

  const beginDrag = (idx, clientX, clientY, tileEl) => {
    const rect = tileEl.getBoundingClientRect();
    activeDragIdxRef.current = idx;
    setDragGhost({
      idx,
      x: clientX,
      y: clientY,
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
      w: rect.width,
      h: rect.height,
      friend: friends[idx],
    });
    try { if (navigator.vibrate) navigator.vibrate(15); } catch (_) {}
  };

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const endDrag = (commit) => {
    clearHoldTimer();
    if (commit && pendingOrderRef.current) {
      persistFriendOrder(pendingOrderRef.current);
    }
    pendingOrderRef.current = null;
    activeDragIdxRef.current = null;
    activePointerIdRef.current = null;
    dragStartPosRef.current = null;
    setDragGhost(null);
  };

  // ===== Pointer Event Handlers (unified mouse + touch) =====
  const handlePointerDown = (idx) => (e) => {
    // Nur Primärtaste (Maus) oder Touch/Pen
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Klick auf den Entfernen-Button NICHT als Drag starten
    if (e.target.closest("[data-no-drag]")) return;

    dragStartPosRef.current = { x: e.clientX, y: e.clientY, idx };
    activePointerIdRef.current = e.pointerId;
    const tileEl = e.currentTarget;

    if (e.pointerType === "mouse") {
      // Maus: sofort starten (klassisches Drag-Verhalten)
      try { tileEl.setPointerCapture(e.pointerId); } catch (_) {}
      beginDrag(idx, e.clientX, e.clientY, tileEl);
    } else {
      // Touch/Pen: Long-Press 220ms zum Starten – verhindert versehentliches Greifen beim Scrollen
      clearHoldTimer();
      holdTimerRef.current = setTimeout(() => {
        try { tileEl.setPointerCapture(e.pointerId); } catch (_) {}
        beginDrag(idx, e.clientX, e.clientY, tileEl);
      }, 220);
    }
  };

  const handlePointerMove = (e) => {
    // Long-Press noch nicht ausgelöst? Threshold prüfen
    if (activeDragIdxRef.current == null) {
      const start = dragStartPosRef.current;
      if (start && holdTimerRef.current) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 8) clearHoldTimer();
      }
      return;
    }

    // Drag aktiv: Ghost mitbewegen
    setDragGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));

    // Live-Swap: Tile unter dem Cursor/Finger ermitteln
    const overIdx = findTileIdxFromPoint(e.clientX, e.clientY);
    if (overIdx == null) return;
    const currentIdx = activeDragIdxRef.current;
    if (overIdx === currentIdx) return;

    // Sofort tauschen + Index nachführen
    reorderFriendsLocal(currentIdx, overIdx);
    activeDragIdxRef.current = overIdx;
  };

  const handlePointerUp = (e) => {
    const wasDragging = activeDragIdxRef.current != null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    endDrag(wasDragging);
  };

  const handlePointerCancel = () => {
    endDrag(false);
  };

  // Während aktivem Drag: globaler Scroll- & Touch-Block,
  // damit das Dashboard nicht scrollt, während man umsortiert.
  useEffect(() => {
    if (!dragGhost) return;
    const block = (e) => { e.preventDefault(); };
    document.addEventListener("touchmove", block, { passive: false });
    document.addEventListener("wheel", block, { passive: false });
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.body.style.overscrollBehavior = "contain";
    return () => {
      document.removeEventListener("touchmove", block);
      document.removeEventListener("wheel", block);
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, [dragGhost]);

  // ✅ WebSocket mit Hook
  // Toast-IDs: Stable IDs verhindern, dass dasselbe Event (z. B. wegen
  // doppelt eingehender WebSocket-Frames bei Mehrfach-Verbindungen) zweimal
  // angezeigt wird – Sonner ersetzt einen bestehenden Toast mit gleicher ID.
  const handleWebSocketMessage = useCallback((msg) => {
    if (msg.type === "progress_updated" || msg.type === "boost_applied") {
      flashUser(msg.user_id);
      refreshUser(msg.user_id);
      if (msg.type === "progress_updated") window.dispatchEvent(new Event(CHALLENGES_EVENT));
    } else if (msg.type === "boost_canceled") {
      if (msg.user_id !== user?.user_id) {
        toast(t("live.boostCanceled", { name: msg.user_name }), { icon: "✖" });
      }
      refreshUser(msg.user_id);
    } else if (msg.type === "week_completed") {
      if (msg.user_id !== user?.user_id) {
        toast.success(t("live.weekDoneOther", { name: msg.user_name, week: msg.week_number }), {
          id: `wk-done-${msg.user_id}-${msg.week_number}`,
          duration: 3000,
        });
      } else {
        toast.success(t("live.weekDoneMe"), {
          id: `wk-done-self-${msg.week_number}`,
          duration: 3000,
        });
      }
      triggerCelebration(msg.user_id);
      refreshUser(msg.user_id);
    } else if (msg.type === "friend_request") {
      fetchFriendRequests().then((data) => {
        const r = (data?.incoming || []).find((x) => x.user_id === msg.user_id);
        if (r) toast(`${r.name} ${t("crew.requestAction")}`, { id: `fr-${msg.user_id}`, duration: 4000 });
      });
    } else if (msg.type === "friend_accepted" || msg.type === "friend_joined") {
      Promise.all([fetchFriends(), fetchBoard(), fetchFriendRequests()]).then(([, b]) => {
        const u = (b?.users || []).find((x) => x.user_id === msg.user_id);
        if (u) toast.success(t(msg.type === "friend_joined" ? "crew.joined" : "crew.accepted", { name: u.name }), { id: `fa-${msg.user_id}`, duration: 3000 });
      });
    } else if (msg.type === "challenge") {
      window.dispatchEvent(new Event(CHALLENGES_EVENT));
      // „fordert dich heraus“ zeigt der Ready-Check selbst (mit Balken + Sound), kein extra Hinweis
      if (msg.to_user_id === user?.user_id && msg.from_user_id !== user?.user_id && msg.event !== "withdrawn" && msg.event !== "created") {
        toast(t(`chal.live.${msg.event}`, { name: msg.from_name || "" }), { id: `ch-${msg.id}-${msg.event}`, duration: 3000 });
      }
    } else if (msg.type === "live_workout") {
      // Workout-Modus eines Crew-Mitglieds: nur dessen Karte anpassen, kein Board-Neuladen
      setBoard((prev) => (prev?.users ? { ...prev, users: prev.users.map((u) => (u.user_id === msg.user_id ? { ...u, live: msg.live } : u)) } : prev));
    } else if (msg.type === "emoji") {
      // Live bekommen: Animation auf der eigenen Karte + kurzer Hinweis, sofort als gesehen merken
      if (user?.user_id) {
        pushBurst(user.user_id, { id: msg.id, emoji: msg.emoji, from: msg.from_name });
        toast(t("emoji.gotOne", { name: msg.from_name || "", emoji: msg.emoji }), { id: `emoji-${msg.id}`, duration: 2500 });
        api.post("/me/emojis/seen", { ids: [msg.id] }).catch(() => {});
      }
    } else if (msg.type === "goals_updated" || msg.type === "profile_updated" || msg.type === "milestone_reached") {
      refreshUser(msg.user_id);
      if (msg.type === "profile_updated") fetchFriends();
    } else if (msg.type === "presence_snapshot" || msg.type === "presence_changed") {
      if (Array.isArray(msg.online_user_ids)) {
        updateOnlineUsers(msg.online_user_ids);
      }
    }
  }, [flashUser, fetchBoard, refreshUser, triggerCelebration, updateOnlineUsers, user?.user_id, fetchFriends, fetchFriendRequests, t, pushBurst, setBoard]);

  useWebSocket({
    user,
    onMessage: handleWebSocketMessage,
    enabled: !!user,
  });

  const me = board?.users.find((u) => u.user_id === user?.user_id);
  const hasBoostedThisWeek = me?.exercises.some((e) => e.boosted_this_week) || false;

  // Sort: own card first, then in friends order (matches the order in the friend panel).
  const sortedUsers = useMemo(() => {
    if (!board) return [];
    const friendOrderIndex = new Map();
    friends.forEach((f, i) => friendOrderIndex.set(f.user_id, i));
    return [...board.users].sort((a, b) => {
      if (a.user_id === user?.user_id) return -1;
      if (b.user_id === user?.user_id) return 1;
      const ai = friendOrderIndex.has(a.user_id) ? friendOrderIndex.get(a.user_id) : 9999;
      const bi = friendOrderIndex.has(b.user_id) ? friendOrderIndex.get(b.user_id) : 9999;
      return ai - bi;
    });
  }, [board, friends, user?.user_id]);


  // Track mobile carousel active index
  const carouselRef = useRef(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  // Mobile-Viewport-Detection: isActive-Scale soll NUR im Carousel (< lg) greifen.
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 1023px)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 1023px)");
    const onChange = (e) => setIsMobileViewport(e.matches);
    setIsMobileViewport(mql.matches);
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, []);
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const handler = () => {
      if (el.clientWidth === 0) return;
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setCarouselIdx(idx);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [sortedUsers.length]);

  // Heutiger Wochentag-Index: Mo=0, Di=1, ..., So=6
  const getTodayIdx = () => (new Date().getDay() + 6) % 7;
  // "Noch 3 Tage" bis Sonntag (inklusive heute), Sonntag = letzter Tag.
  const daysLeft = 7 - getTodayIdx();
  const daysLeftLabel = daysLeft === 1 ? t("hero.lastDay") : t("hero.daysLeft", { n: daysLeft });

  // Offline gespeicherten Stand sofort zeigen: Snapshots, eigene Karte, lokaler Board-Stand
  const applyLocalProgress = (days) => {
    const copy = JSON.parse(JSON.stringify(days || {}));
    setSavedLogDays(copy);
    setSavedLogForm(sumsFromDays(copy));
    setBoard((prev) => {
      if (!prev?.users) return prev;
      const next = {
        ...prev,
        users: prev.users.map((u) => (u.user_id === user?.user_id ? { ...u, days: copy, values: { ...(u.values || {}), ...sumsFromDays(copy) } } : u)),
      };
      saveSnapshot("board", { userId: user?.user_id, data: next });
      return next;
    });
  };

  // Postausgang senden (beim Start, wenn wieder online, alle 30 s solange etwas wartet).
  // Konflikt (anderes Gerät hat inzwischen gespeichert): eigene Änderung auf den neuen Stand aufrechnen.
  const flushingRef = useRef(false);
  const runFlush = useCallback(async () => {
    if (flushingRef.current || !user?.user_id) return;
    const mine = readOutbox().filter((o) => o.userId === user.user_id);
    if (!mine.length) return;
    flushingRef.current = true;
    let sent = 0;
    try {
      for (const o of mine) {
        try {
          try {
            await api.put("/progress/me", o.payload);
          } catch (e) {
            if (e.response?.status !== 409) throw e;
            const { data: cur } = await api.get("/progress/me", { params: { week: o.payload.week_number } });
            // Antwort ging verloren, Anfrage kam aber an: schon gespeichert, nicht doppelt zählen
            if (!alreadyApplied(cur?.days || {}, o.baseDays, o.payload.days)) {
              const days = mergeDays(cur?.days || {}, o.baseDays, o.payload.days);
              await api.put("/progress/me", { week_number: o.payload.week_number, days, base_updated_at: cur?.updated_at ?? null });
            }
          }
          sent += 1;
        } catch (e) {
          if (isNetworkError(e)) break; // immer noch offline: später nochmal
          toast.error(e.response?.data?.detail || t("offline.rejected"), { duration: 5000 });
        }
        // gesendet oder vom Server abgelehnt: aus dem Postausgang
        writeOutbox(readOutbox().filter((x) => !(x.userId === o.userId && x.payload.week_number === o.payload.week_number)));
      }
    } finally {
      flushingRef.current = false;
    }
    if (sent) {
      toast.success(t("offline.synced"), { id: "offline-synced", duration: 3000 });
      fetchBoard().catch(() => {});
    }
  }, [user?.user_id, fetchBoard, t]);
  // Mehrere Tabs offen: immer nur einer sendet (Web Locks); ohne diese Funktion direkt
  const flushOutbox = useCallback(async () => {
    if (navigator.locks?.request) {
      await navigator.locks.request("tyc-outbox", { ifAvailable: true }, async (lock) => { if (lock) await runFlush(); });
    } else await runFlush();
  }, [runFlush]);
  useEffect(() => {
    if (!user?.user_id) return undefined;
    flushOutbox();
    const h = () => flushOutbox();
    window.addEventListener("online", h);
    const iv = window.setInterval(() => { if (readOutbox().length) flushOutbox(); }, 30000);
    return () => { window.removeEventListener("online", h); window.clearInterval(iv); };
  }, [user?.user_id, flushOutbox]);

  const handleLogProgress = async ({ silent = false } = {}) => {
    if (!me) return;
    // Nie zwei Speichervorgänge gleichzeitig (sonst hielte der zweite den ersten für ein anderes Gerät).
    if (saveBusyRef.current) {
      saveAgainRef.current = true;
      return;
    }
    saveBusyRef.current = true;
    let sentPayload = null;
    try {
      const payload = { week_number: me.week_number, base_updated_at: baseUpdatedAtRef.current };
      if (logMode === "days") {
        payload.days = logDays;
      } else {
        // GESAMT-Modus: Differenz zum bisherigen Stand dem HEUTIGEN Tag zuordnen,
        // damit der Wert im Mo–So Tab am richtigen Wochentag erscheint.
        const todayIdx = getTodayIdx();
        const newDays = { ...logDays };
        // Sicherstellen, dass das heutige Tagesobjekt existiert (auch wenn keine Änderung erfolgt)
        newDays[todayIdx] = { ...(logDays[todayIdx] || {}) };

        me.exercises.forEach((ex) => {
          const newTotal = Number(logForm[ex.key]) || 0;
          const prevSum = [0, 1, 2, 3, 4, 5, 6].reduce(
            (acc, di) => acc + (Number(logDays?.[di]?.[ex.key]) || 0),
            0
          );
          const delta = newTotal - prevSum;
          // Keine Änderung -> Tag nicht anfassen
          if (delta === 0) return;
          const round2 = (n) => Math.round(n * 100) / 100;

          if (prevSum === 0) {
            // Legacy / noch keine Tagesaufteilung vorhanden:
            // Den vollen Wert dem heutigen Tag zuschreiben.
            newDays[todayIdx] = { ...newDays[todayIdx], [ex.key]: Math.max(0, round2(newTotal)) };
            return;
          }

          if (delta > 0) {
            // Wert wurde ERHÖHT -> die Differenz dem heutigen Tag gutschreiben.
            const currentToday = Number(newDays?.[todayIdx]?.[ex.key]) || 0;
            newDays[todayIdx] = {
              ...newDays[todayIdx],
              [ex.key]: Math.max(0, round2(currentToday + delta)),
            };
            return;
          }

          // delta < 0: Wert wurde VERRINGERT. Zuerst HEUTE abziehen, bis 0.
          // Reicht das nicht, von den anderen Tagen abziehen (neueste zuerst,
          // also rückwärts vom heutigen Tag). So sinkt die Wochensumme auch
          // dann zuverlässig, wenn der heutige Tag den Abzug nicht voll
          // aufnehmen kann.
          let remaining = -delta; // positiver Betrag, der abgezogen werden muss
          const currentToday = Number(newDays?.[todayIdx]?.[ex.key]) || 0;
          const subToday = Math.min(currentToday, remaining);
          newDays[todayIdx] = {
            ...newDays[todayIdx],
            [ex.key]: Math.max(0, round2(currentToday - subToday)),
          };
          remaining = round2(remaining - subToday);
          if (remaining > 0) {
            for (let off = 1; off < 7 && remaining > 0; off++) {
              const di = (todayIdx - off + 7) % 7;
              const cur = Number(newDays?.[di]?.[ex.key]) || 0;
              if (cur <= 0) continue;
              const sub = Math.min(cur, remaining);
              newDays[di] = {
                ...newDays[di],
                [ex.key]: Math.max(0, round2(cur - sub)),
              };
              remaining = round2(remaining - sub);
            }
          }
        });

        payload.days = newDays;
        // Optimistisch State aktualisieren, damit der Mo–So Tab sofort den richtigen Tag zeigt
        setLogDays(newDays);
      }
      sentPayload = payload;
      const { data: savedDoc } = await api.put("/progress/me", payload);
      if (savedDoc?.updated_at) baseUpdatedAtRef.current = savedDoc.updated_at;
      tourEvent("progress-saved");
      // Speichern erfolgreich -> Snapshots aktualisieren, damit ein späteres
      // "Abbrechen" auf genau diese persistierten Werte zurücksetzt.
      // payload.days ist im Days-Modus = logDays, im Gesamt-Modus = newDays.
      const savedDaysSnap = payload.days
        ? JSON.parse(JSON.stringify(payload.days))
        : JSON.parse(JSON.stringify(logDays || {}));
      setSavedLogDays(savedDaysSnap);
      // savedLogForm aus den Tageswerten neu berechnen (Summen pro Übung),
      // damit Gesamt-Modus konsistent bleibt.
      if (me?.exercises) {
        const sums = {};
        me.exercises.forEach((ex) => {
          sums[ex.key] = [0, 1, 2, 3, 4, 5, 6].reduce(
            (acc, di) => acc + (Number(savedDaysSnap?.[di]?.[ex.key]) || 0),
            0
          );
        });
        setSavedLogForm(sums);
      }
      if (!silent) {
        const vRows = voiceSummaryRef.current;
        voiceSummaryRef.current = null;
        if (vRows?.length) {
          toast.success(t("log.saved"), {
            duration: 6000,
            description: <VoiceSaved rows={vRows} exercises={me?.exercises || []} todayIdx={getTodayIdx()} dayNames={weekdayNames(locale, "long")} t={t} locale={locale} />,
          });
        } else toast.success(t("log.saved"), { duration: 2500 });
        track("log_saved");
        closeStepSettings();
        setLogging(false);
      }
      fetchBoard();
    } catch (e) {
      if (isNetworkError(e) && sentPayload?.days) {
        // Kein Netz: am Gerät merken, eigene Karte gleich aktualisieren, später automatisch senden
        writeOutbox(queueEntry(readOutbox(), {
          userId: user.user_id,
          baseDays: JSON.parse(JSON.stringify(savedLogDays || {})),
          payload: JSON.parse(JSON.stringify(sentPayload)),
          at: Date.now(),
        }));
        applyLocalProgress(sentPayload.days);
        saveAgainRef.current = false;
        if (!silent) {
          const vRows = voiceSummaryRef.current;
          voiceSummaryRef.current = null;
          toast(t("offline.savedLocal"), {
            id: "offline-saved",
            duration: vRows?.length ? 6000 : 3500,
            description: vRows?.length
              ? <VoiceSaved rows={vRows} exercises={me?.exercises || []} todayIdx={getTodayIdx()} dayNames={weekdayNames(locale, "long")} t={t} locale={locale} />
              : t("offline.savedLocalText"),
          });
          closeStepSettings();
          setLogging(false);
        }
        return;
      }
      if (e.response?.status === 409) {
        // Anderes Gerät war schneller: nichts überschreiben, Nutzer entscheidet.
        saveAgainRef.current = false;
        toast.error(t("log.conflict"), {
          id: "log-conflict",
          duration: 10000,
          action: { label: t("log.conflictReload"), onClick: () => reloadMyProgress() },
        });
      } else if (!silent) {
        toast.error(e.response?.data?.detail || t("common.saveFailed"), { duration: 3000 });
      }
    } finally {
      saveBusyRef.current = false;
      if (saveAgainRef.current) {
        saveAgainRef.current = false;
        handleLogProgressRef.current?.({ silent: true });
      }
    }
  };
  // Ref aktuell halten, damit der debounced Live-Save-Timer immer die
  // neueste Version der Funktion (mit aktuellem State) aufruft.
  handleLogProgressRef.current = handleLogProgress;

  const toggleActivityDay = (key, day) => {
    const next = JSON.parse(JSON.stringify(logDays || {}));
    const on = Number(next?.[day]?.[key]) > 0;
    next[day] = { ...(next[day] || {}), [key]: on ? 0 : 1 };
    setLogDays(next);
    setLogForm((f) => ({ ...f, [key]: doneDays(next, key).length }));
    scheduleLiveSave();
  };

  // opts.silent: ohne Toast und ohne das Formular zu schließen (Workout „Live eintragen“ je Runde)
  const applyVoiceItems = (items, opts = {}) => {
    track("voice_used");
    const round2 = (n) => Math.round(n * 100) / 100;
    const today = getTodayIdx();
    const newDays = JSON.parse(JSON.stringify(logDays || {}));
    const newForm = { ...(logForm || {}) };
    const sumOf = (key) => [0, 1, 2, 3, 4, 5, 6].reduce((a, d) => a + (Number(newDays?.[d]?.[key]) || 0), 0);
    // Wochensumme kommt aus dem Formular (enthält auch alte Einträge ohne Mo–So-Aufteilung).
    // Gesamt-Modus: Speichern verteilt den Rest (Summe − Tage) wie gewohnt auf heute.
    const actKeys = new Set((me?.exercises || []).filter(isActivity).map((e) => e.key));
    const rows = [];
    for (const it of items) {
      if (actKeys.has(it.key)) {
        const v = it.amount === 0 ? 0 : 1; // „lösch heute“ / „heute nicht im Gym“ = Haken weg
        rows.push({ key: it.key, day: it.day, kind: v === 0 ? "day" : Number(newDays?.[it.day]?.[it.key]) > 0 ? "doneSame" : "done", amount: v, from: Number(newDays?.[it.day]?.[it.key]) || 0 });
        // Aktivität: der Tag gilt als erledigt (nie mehr als 1 pro Tag)
        newDays[it.day] = { ...(newDays[it.day] || {}), [it.key]: v };
        newForm[it.key] = doneDays(newDays, it.key).length;
        continue;
      }
      const formTotal = Number(newForm[it.key]) || 0;
      const curDay = Number(newDays?.[it.day]?.[it.key]) || 0;
      if (it.mode === "set") rows.push({ key: it.key, day: it.day, kind: round2(formTotal) === round2(it.amount) ? "same" : "set", amount: it.amount, from: formTotal });
      else if (it.mode === "day") rows.push({ key: it.key, day: it.day, kind: round2(curDay) === round2(it.amount) ? "same" : "day", amount: it.amount, from: curDay });
      else rows.push({ key: it.key, day: it.day, kind: "add", amount: it.amount });
      if (it.mode === "set") {
        if (logMode === "days") {
          const delta = it.amount - sumOf(it.key);
          const cur = Number(newDays?.[today]?.[it.key]) || 0;
          newDays[today] = { ...(newDays[today] || {}), [it.key]: Math.max(0, round2(cur + delta)) };
        }
        newForm[it.key] = round2(it.amount);
      } else if (it.mode === "day") {
        // „heute 10 gemacht“ = Stand dieses Tages (nicht dazuzählen); Wochensumme ändert sich um die Differenz
        const cur = Number(newDays?.[it.day]?.[it.key]) || 0;
        newDays[it.day] = { ...(newDays[it.day] || {}), [it.key]: round2(it.amount) };
        newForm[it.key] = round2(logMode === "days" ? sumOf(it.key) : Math.max(0, formTotal + it.amount - cur));
      } else {
        const cur = Number(newDays?.[it.day]?.[it.key]) || 0;
        newDays[it.day] = { ...(newDays[it.day] || {}), [it.key]: round2(cur + it.amount) };
        newForm[it.key] = round2(logMode === "days" ? sumOf(it.key) : formTotal + it.amount);
      }
    }
    setLogDays(newDays);
    setLogForm(newForm);
    setVoiceOpen(false);
    voiceSummaryRef.current = opts.silent ? null : rows;
    voiceSaveRef.current = opts.silent ? "silent" : true;
    tourEvent("voice-logged");
  };
  // Dashboard-Mikro (eine gemeinsame Erkennung): Einträge bei geschlossenem Formular, Stoppuhr-Befehle immer
  const globalVoiceOn = useGlobalVoiceRouter({
    exercises: me?.exercises || [],
    todayIdx: getTodayIdx(),
    formOpen: logging,
    panelOpen: logging && voiceOpen,
    openForm: () => { setLogMode("total"); setLogging(true); },
    onItems: (items) => {
      // Löschen geht immer erst über die Prüfen-Ansicht
      if (voiceConfirmOn || items.some((it) => it.clear)) { setVoiceInitial(items); setLogging(true); setVoiceOpen(true); }
      else applyVoiceItems(items);
    },
    onHeard: setVoiceHeard,
    onAsk: setVoiceAsk,
  });
  // Formular auf + Dashboard-Mikro an -> Formular-Mikro läuft mit; Formular zu -> Formular-Mikro aus
  useEffect(() => {
    if (!logging) { setVoiceOpen(false); setVoiceInitial(null); }
    else if (globalVoiceOn) setVoiceOpen(true);
  }, [logging, globalVoiceOn]);
  useEffect(() => { if (!globalVoiceOn) { setVoiceHeard(""); setVoiceAsk(""); } }, [globalVoiceOn]);
  // nach dem Übernehmen mit dem neuen Stand speichern (Tage + Summe sind dann bereits konsistent)
  useEffect(() => {
    if (!voiceSaveRef.current) return;
    const silent = voiceSaveRef.current === "silent";
    voiceSaveRef.current = false;
    handleLogProgressRef.current?.({ silent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDays, logForm]);

  const setDayValue = (dayIdx, exKey, v) => {
    setLogDays((p) => ({ ...p, [dayIdx]: { ...(p[dayIdx] || {}), [exKey]: Number(v) || 0 } }));
    scheduleLiveSave();
  };

  const syncTotalToDays = () => {
    if (!me) return;
    const todayIdx = getTodayIdx();
    const newDays = { ...logDays };
    newDays[todayIdx] = { ...(logDays[todayIdx] || {}) };
    me.exercises.forEach((ex) => {
      const newTotal = Number(logForm[ex.key]) || 0;
      const prevSum = [0, 1, 2, 3, 4, 5, 6].reduce(
        (acc, di) => acc + (Number(logDays?.[di]?.[ex.key]) || 0),
        0
      );
      const delta = newTotal - prevSum;
      if (delta === 0) return;
      const round2 = (n) => Math.round(n * 100) / 100;

      if (prevSum === 0) {
        newDays[todayIdx] = { ...newDays[todayIdx], [ex.key]: Math.max(0, round2(newTotal)) };
        return;
      }

      if (delta > 0) {
        const currentToday = Number(newDays?.[todayIdx]?.[ex.key]) || 0;
        newDays[todayIdx] = {
          ...newDays[todayIdx],
          [ex.key]: Math.max(0, round2(currentToday + delta)),
        };
        return;
      }

      // delta < 0: erst HEUTE abziehen, dann rückwärts die anderen Tage.
      let remaining = -delta;
      const currentToday = Number(newDays?.[todayIdx]?.[ex.key]) || 0;
      const subToday = Math.min(currentToday, remaining);
      newDays[todayIdx] = {
        ...newDays[todayIdx],
        [ex.key]: Math.max(0, round2(currentToday - subToday)),
      };
      remaining = round2(remaining - subToday);
      if (remaining > 0) {
        for (let off = 1; off < 7 && remaining > 0; off++) {
          const di = (todayIdx - off + 7) % 7;
          const cur = Number(newDays?.[di]?.[ex.key]) || 0;
          if (cur <= 0) continue;
          const sub = Math.min(cur, remaining);
          newDays[di] = {
            ...newDays[di],
            [ex.key]: Math.max(0, round2(cur - sub)),
          };
          remaining = round2(remaining - sub);
        }
      }
    });
    setLogDays(newDays);
  };

  const handleBoost = async (exercise_key) => {
    try {
      await api.post("/boost", { exercise_key });
      track("boost_used");
      toast.success(t("boost.activated"), { icon: "🔥", duration: 2500 });
      fetchBoard();
    } catch (e) {
      toast.error(e.response?.data?.detail || t("boost.failed"), { duration: 2500 });
    }
  };

  const handleCancelBoost = async () => {
    try {
      await api.delete("/boost");
      toast.success(t("boost.canceled"), { duration: 2500 });
      setCancelDialog(null);
      fetchBoard();
    } catch (e) {
      toast.error(e.response?.data?.detail || t("boost.cancelFailed"), { duration: 2500 });
    }
  };

  if (loading || !user || !board) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <p className="text-[#CCFF00] font-anton text-3xl tracking-widest animate-pulse">LOADING...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <header className="border-b border-[#1A1A1A] bg-[#0A0A0A]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-3" data-testid="dashboard-header">
          <div className="flex items-center gap-3">
            <Lightning size={26} weight="fill" className="text-[#CCFF00]" />
            <span className="font-anton text-2xl tracking-widest">TRACKER</span>
            <span className="hidden md:inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#00FF66] ml-4 border border-[#1A2A1A] px-2 py-1">
              <Pulse size={10} weight="fill" /> LIVE
            </span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-3">
            <MusicButton />
            <button
              onClick={() => { setShowInsights(true); track("insights_opened"); }}
              data-testid="open-insights"
              aria-label={t("nav.insights")}
              className="border border-[#222] hover:border-[#CCFF00] hover:text-[#CCFF00] px-2.5 md:px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
            >
              <ChartBar size={16} weight="duotone" />
              <span className="hidden md:inline">{t("nav.insights")}</span>
            </button>
            <button
              onClick={() => { setShowRanking(true); track("ranking_opened"); }}
              data-testid="open-ranking"
              aria-label={t("nav.ranking")}
              className="border border-[#222] hover:border-[#CCFF00] hover:text-[#CCFF00] px-2.5 md:px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
            >
              <Trophy size={16} weight="duotone" />
              <span className="hidden md:inline">{t("nav.ranking")}</span>
            </button>
            <button
              onClick={(e) => {
                try { e.currentTarget.blur(); } catch (_) { /* ignore */ }
                try {
                  sessionStorage.setItem("dashboardScrollY", String(window.scrollY));
                } catch (_) { /* ignore storage errors */ }
                navigate("/settings");
              }}
              data-testid="settings-button"
              aria-label={t("nav.settings")}
              data-tour="settings-link"
              className="border border-[#222] active:border-[#CCFF00] active:text-[#CCFF00] [@media(hover:hover)]:hover:border-[#CCFF00] [@media(hover:hover)]:hover:text-[#CCFF00] focus:outline-none px-2.5 md:px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
            >
              <Gear size={16} weight="duotone" />
              <span className="hidden md:inline">{t("nav.settings")}</span>
            </button>
            <button
              onClick={logout}
              data-testid="logout-button"
              aria-label={t("nav.logout")}
              className="border border-[#222] [@media(hover:hover)]:hover:border-[#FF3B30] [@media(hover:hover)]:hover:text-[#FF3B30] active:border-[#FF3B30] active:text-[#FF3B30] focus:border-[#FF3B30] focus:text-[#FF3B30] focus-visible:border-[#FF3B30] focus-visible:text-[#FF3B30] px-2.5 md:px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
            >
              <SignOut size={16} weight="duotone" />
              <span className="hidden md:inline">{t("nav.logout")}</span>
            </button>
          </div>
        </div>
      </header>

      {(!online || pendingOffline > 0) && (
        <div className="border-b border-[#FF8800]/40 bg-[#FF8800]/10" data-testid="offline-banner">
          <p className="max-w-7xl mx-auto px-6 py-2.5 text-xs text-[#FFB866] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FF8800] shrink-0" />
            {!online
              ? t("offline.banner", { time: new Date(loadSnapshot("board")?.at || Date.now()).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) })
              : t("offline.pending", { n: pendingOffline })}
          </p>
        </div>
      )}

      <section className="border-b border-[#1A1A1A] tactical-grid">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
          <div className="md:flex-1 md:min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-[#CCFF00] mb-3">/ {t("hero.kicker")}</p>
            <h1 className="font-anton text-5xl md:text-6xl leading-none tracking-tight mb-3">
              {t("hero.week")} <span className="text-[#CCFF00] text-glow-lime">{String(me?.week_number || 1).padStart(2, "0")}</span> · <span className="whitespace-nowrap">{t("hero.getToWork")}</span>
            </h1>
            {/* Erklärtext entfernt (Dean 2026-11-27) */}
            <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-ink-3" data-testid="days-left">
              {daysLeftLabel}
            </p>
            {hasBoostedThisWeek && (
              <div className="mt-4 inline-flex items-center gap-2 border border-[#FF8800]/40 bg-[#FF8800]/10 text-[#FF8800] px-3 py-1.5 text-[10px] uppercase tracking-widest" data-testid="boost-used-banner">
                <Flame size={12} weight="fill" /> {t("boost.usedThisWeek")}
              </div>
            )}
          </div>
          {/* Mobile: grid-cols-3 -> erste 3 in voller Größe in Reihe 1, weitere wrappen darunter.
              PC (md+): flex-row, alle Ziele in einer einzigen Reihe rechts neben dem Text. */}
          {/* Im Urlaub/krank: keine Wochenziele (gibt es diese Woche nicht) */}
          {!me?.all_paused && (() => {
            // Übungen und Aktivitäten: sind beide da, dezent getrennt mit kleiner Überschrift (Dean 2026-11-27)
            const exs = (me?.exercises || []).filter((e) => !isActivity(e));
            const acts = (me?.exercises || []).filter(isActivity);
            const both = exs.length > 0 && acts.length > 0;
            const tileOf = (ex) => (
              <div
                key={ex.key}
                className="border border-[#222] bg-[#121212] p-3 md:p-4 relative min-w-0 md:min-w-[120px] md:max-w-[190px] flex flex-col justify-between"
                data-testid={`hero-goal-${ex.key}`}
              >
                {/* Name passt sich ein (enger/kleiner, notfalls zweizeilig) statt abgeschnitten zu werden */}
                <p className={`text-[10px] uppercase tracking-wider md:tracking-widest text-ink-2 mb-1 flex items-start gap-1 ${ex.boosted_this_week ? "pr-3 md:pr-2" : ""}`}>
                  <ExerciseIcon icon={ex.icon} size={12} className="shrink-0 mt-px" />
                  <FitLabel testid={`hero-goal-label-${ex.key}`}>{exerciseLabel(ex)}</FitLabel>
                </p>
                <p className="font-anton text-3xl leading-none" style={{ color: ex.color }}>
                  {isActivity(ex) ? ex.goal : amountParts(ex.goal, ex.unit, locale).num}<span className={`text-ink-3 ml-1 whitespace-nowrap ${isActivity(ex) ? "text-sm" : "text-base"}`}>{isActivity(ex) ? t("hero.perWeek") : amountParts(ex.goal, ex.unit, locale).unit}</span>
                </p>
                {ex.boosted_this_week && (
                  <Flame size={14} weight="fill" className="absolute top-1 right-0.5 md:top-1.5 md:right-1.5 text-[#FF8800]" />
                )}
              </div>
            );
            const group = (list, label, tid) => (
              <div className="min-w-0 md:shrink-0" data-testid={tid}>
                {both && <p className="text-[9px] uppercase tracking-[0.3em] text-ink-3 mb-1.5">{label}</p>}
                <div className="grid grid-cols-3 gap-3 md:flex md:flex-row md:flex-nowrap md:gap-3">{list.map(tileOf)}</div>
              </div>
            );
            return (
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:gap-6 md:shrink-0" data-testid="hero-goals-strip">
                {exs.length > 0 && group(exs, t("settings.tabExercises"), "hero-goals-exercises")}
                {acts.length > 0 && group(acts, t("settings.tabActivities"), "hero-goals-activities")}
              </div>
            );
          })()}
        </div>
      </section>

      <section className="border-b border-[#1A1A1A] bg-[#0E0E0E]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {me?.starts_on ? (
            <div className="border border-[#CCFF00]/40 bg-[#CCFF00]/[0.05] p-4 md:p-5 flex items-center gap-4" data-testid="starts-on-banner">
              <Lightning size={22} weight="fill" className="text-[#CCFF00] shrink-0" />
              <div>
                <p className="font-anton text-xl tracking-tight">
                  {t("start.banner", { date: new Date(me.starts_on).toLocaleDateString(locale, { weekday: "long", day: "2-digit", month: "2-digit" }).toUpperCase() })}
                </p>
                <p className="text-xs text-ink-2 mt-1">{t("start.bannerText")}</p>
              </div>
            </div>
          ) : me?.all_paused ? (
            // Alle Übungen pausiert (ersetzt Urlaub/Krank): ruhiger Hinweis mit „Alle fortsetzen“
            <div className="border border-[#333] bg-[#121212] p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-4" data-testid="paused-banner">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Pause size={24} weight="fill" className="text-ink-2 shrink-0" />
                <div className="min-w-0">
                  <p className="font-anton text-xl tracking-tight">{t("pauseAll.title")}</p>
                  <p className="text-xs text-ink-2 mt-1">{t("pauseAll.meText")}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try { await api.post("/goals/me/pause-all", { action: "resume" }); await fetchBoard(); } catch (e) { toast.error(e.response?.data?.detail || t("common.error"), { duration: 2500 }); }
                }}
                data-testid="paused-banner-resume"
                className="shrink-0 self-start sm:self-auto border border-[#CCFF00]/60 text-[#CCFF00] hover:bg-[#CCFF00] hover:text-black uppercase tracking-widest text-xs px-4 py-2.5 transition-colors"
              >
                {t("pauseAll.resumeAll")}
              </button>
            </div>
          ) : !logging ? (
            <>
            <div className="flex items-stretch gap-2">
            <button
              onClick={() => { setLogging(true); tourEvent("log-open"); }}
              data-testid="open-log-progress"
              data-tour="log-button"
              className="flex-1 md:flex-none whitespace-nowrap bg-[#CCFF00] text-black font-bold uppercase tracking-wider md:tracking-widest py-4 px-4 md:px-8 flex items-center justify-center gap-2 hover:bg-[#D4FF33] glow-lime transition-all hover:-translate-y-0.5"
            >
              <Plus size={18} weight="bold" /> {t("log.open")}
            </button>
            <GlobalMicButton />
            </div>
            {globalVoiceOn && (
              <p className="text-[11px] text-ink-3 leading-relaxed" data-testid="global-voice-status">
                {voiceAsk ? <span className="text-[#CCFF00]">{voiceAsk}</span> : voiceHeard ? <span className="text-ink-2">„{spokenDigits(voiceHeard).slice(0, 80)}“</span> : t("voice.globalHint")}
              </p>
            )}
            {/* Smarter Ziel-Vorschlag (Plan 12f) */}
            <GoalHint me={me} onChanged={fetchBoard} />
            </>
          ) : (
            <div className="relative border border-[#CCFF00] bg-[#0A0A0A] p-6" data-tour="log-form">
              {/* Live-Werte-Indikator: pulsierender grüner Punkt in der oberen rechten
                  Ecke des LOG WEEK PROGRESS Feldes. Absolut positioniert + außerhalb
                  des space-y-5 Wrappers, damit beim Ein-/Ausschalten der Lampe NICHTS
                  verschoben wird und die Boxhöhe identisch bleibt. */}
              {liveSaveEnabled && (
                <div
                  className="absolute top-3 right-3 pointer-events-none flex items-center gap-1.5 z-10"
                  data-testid="live-save-indicator"
                  aria-hidden="true"
                >
                  <span className="relative flex w-2.5 h-2.5">
                    <span className="absolute inset-0 rounded-full bg-[#00FF66] opacity-60 animate-ping" />
                    <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-[#00FF66] shadow-[0_0_8px_rgba(0,255,102,0.6)]" />
                  </span>
                </div>
              )}
              <div className="space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-anton text-2xl tracking-tight">{t("log.title", { week: me?.week_number })}</h3>
                  <button
                    type="button"
                    onClick={(e) => { toggleStepSettings(); e.currentTarget.blur(); }}
                    data-testid="toggle-step-settings"
                    data-tour="log-gear"
                    title={logMode === "total" ? t("log.stepsTitle") : t("log.liveTitle")}
                    aria-label={t("common.settings")}
                    aria-pressed={showStepSettings}
                    className={`w-7 h-7 flex items-center justify-center transition-colors focus:outline-none ${showStepSettings ? "text-black bg-[#FFD700]" : "text-[#FFD700] [@media(hover:hover)]:hover:bg-[#FFD700]/15 active:bg-[#FFD700]/15"}`}
                  >
                    <Gear size={18} weight={showStepSettings ? "fill" : "bold"} />
                  </button>
                  {/* Workout-Modus (Intervall-Timer) */}
                  <button
                    type="button"
                    onClick={(e) => { unlockAudio(); setWorkoutOpen(true); e.currentTarget.blur(); }}
                    title={t("wo.title")}
                    aria-label={t("wo.title")}
                    data-testid="open-workout"
                    className="w-7 h-7 flex items-center justify-center text-[#CCFF00] transition-colors focus:outline-none [@media(hover:hover)]:hover:bg-[#CCFF00]/15 active:bg-[#CCFF00]/15"
                  >
                    <Timer size={18} weight="bold" />
                  </button>
                  <VoiceLogButton active={voiceOpen} onClick={(e) => { setVoiceOpen((v) => !v); e.currentTarget.blur(); }} />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="flex border border-[#222]" data-tour="log-mode">
                    <button onClick={() => setLogMode("total")} data-testid="log-mode-total" className={`px-3 py-1.5 text-[10px] uppercase tracking-widest ${logMode === "total" ? "bg-[#CCFF00] text-black" : "text-ink-2 hover:text-white"}`}>{t("log.total")}</button>
                    <button onClick={() => { if (logMode === "total") syncTotalToDays(); setLogMode("days"); }} data-testid="log-mode-days" className={`px-3 py-1.5 text-[10px] uppercase tracking-widest ${logMode === "days" ? "bg-[#CCFF00] text-black" : "text-ink-2 hover:text-white"}`}>{t("log.days")}</button>
                  </div>
                  <button onClick={() => {
                    // Ungespeicherte Änderungen verwerfen: Werte auf zuletzt
                    // gespeicherten Snapshot zurücksetzen, damit beim erneuten
                    // Öffnen wieder die persistierten Werte erscheinen.
                    setLogForm({ ...(savedLogForm || {}) });
                    setLogDays(JSON.parse(JSON.stringify(savedLogDays || {})));
                    closeStepSettings();
                    setLogging(false);
                  }} className="ml-auto pl-2 text-ink-2 hover:text-white text-xs uppercase tracking-widest" data-testid="close-log-progress">{t("common.cancel")}</button>
                </div>
              </div>
              {voiceOpen && me && (
                <VoiceLogPanel
                  key={voiceInitial ? "review" : "listen"}
                  exercises={me.exercises}
                  todayIdx={getTodayIdx()}
                  dayNames={weekdayNames(locale, "long")}
                  onApply={applyVoiceItems}
                  onClose={() => { setVoiceOpen(false); setVoiceInitial(null); }}
                  onTimeout={() => { setVoiceOpen(false); setVoiceInitial(null); setGlobalVoice(false); }}
                  autoApply={!voiceConfirmOn}
                  initialItems={voiceInitial}
                />
              )}
              {logMode === "total" ? (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-ink-2" data-testid="gesamt-day-hint">
                    {t("log.todayHintPre")} <span className="text-[#CCFF00]">{dayShort[getTodayIdx()]}</span> {t("log.todayHintPost")}
                  </p>
                  {/* Live-Werte Toggle: NUR sichtbar, wenn die Einstellungen (Zahnrad) geöffnet sind.
                      Wenn aktiv, werden Eingaben automatisch nach kurzer Pause ans Backend gesendet. */}
                  {showStepSettings && (
                    <label className="flex items-center gap-3 cursor-pointer select-none w-fit" data-testid="live-save-toggle-label">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={liveSaveEnabled}
                        onClick={() => setLiveSaveEnabled((v) => !v)}
                        data-testid="live-save-toggle"
                        style={{ WebkitTapHighlightColor: "transparent" }}
                        className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${liveSaveEnabled ? "bg-[#CCFF00]" : "bg-[#2A2A2A] border border-[#333]"}`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${liveSaveEnabled ? "left-[22px] bg-black" : "left-0.5 bg-[#888]"}`}
                        />
                      </button>
                      <span className="text-[10px] uppercase tracking-widest text-ink-2">
                        {t("log.live")} <span className={liveSaveEnabled ? "text-[#CCFF00]" : "text-ink-3"}>{liveSaveEnabled ? t("common.on") : t("common.off")}</span>
                      </span>
                    </label>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {me?.exercises.filter((ex) => !isActivity(ex)).map((ex) => (
                      <NumInput
                        key={ex.key}
                        label={`${exerciseLabel(ex)}${ex.unit ? ` (${ex.unit})` : ""}`}
                        value={logForm[ex.key] || 0}
                        step={getStep(ex)}
                        onChange={(v) => { setLogForm((f) => ({ ...f, [ex.key]: v })); scheduleLiveSave(); }}
                        testid={`input-${ex.key}`}
                        color={ex.color}
                        icon={ex.icon}
                        goal={ex.goal}
                        unit={ex.unit}
                        stepSettings={showStepSettings ? {
                          displayValue: stepInputDisplay[ex.key] ?? "",
                          placeholderValue: customSteps[ex.key] ?? getDefaultStep(ex),
                          onChange: (v) => updateCustomStep(ex.key, v),
                        } : null}
                      />
                    ))}
                  </div>
                  {me?.exercises.some(isActivity) && (
                    <div className="space-y-2.5" data-testid="activity-log-list">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-ink-3">{t("settings.tabActivities")}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {me.exercises.filter(isActivity).map((a) => (
                          <ActivityLogRow key={a.key} activity={a} days={logDays} todayIdx={getTodayIdx()} dayNames={dayShort} onToggle={toggleActivityDay} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full" data-testid="days-grid">
                  {/* Live-Werte Toggle: nur sichtbar wenn die Einstellungen (Zahnrad) geöffnet sind.
                      Synchron mit dem Toggle im Gesamt-Modus. */}
                  {showStepSettings && (
                    <label className="flex items-center gap-3 cursor-pointer select-none w-fit mb-3" data-testid="live-save-toggle-label-days">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={liveSaveEnabled}
                        onClick={() => setLiveSaveEnabled((v) => !v)}
                        data-testid="live-save-toggle-days"
                        style={{ WebkitTapHighlightColor: "transparent" }}
                        className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${liveSaveEnabled ? "bg-[#CCFF00]" : "bg-[#2A2A2A] border border-[#333]"}`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${liveSaveEnabled ? "left-[22px] bg-black" : "left-0.5 bg-[#888]"}`}
                        />
                      </button>
                      <span className="text-[10px] uppercase tracking-widest text-ink-2">
                        {t("log.live")} <span className={liveSaveEnabled ? "text-[#CCFF00]" : "text-ink-3"}>{liveSaveEnabled ? t("common.on") : t("common.off")}</span>
                      </span>
                    </label>
                  )}
                  <table className="w-full text-[13px] md:text-[15px] border-collapse table-fixed">
                    <colgroup>
                      <col className="w-[28px] md:w-[110px]" />
                      <col className="w-auto" />
                      <col className="w-auto" />
                      <col className="w-auto" />
                      <col className="w-auto" />
                      <col className="w-auto" />
                      <col className="w-auto" />
                      <col className="w-auto" />
                      <col className="w-[56px] md:w-[120px]" />
                    </colgroup>
                    <thead>
                      <tr className="text-[10px] md:text-[11px] uppercase tracking-wider md:tracking-widest text-ink-3">
                        <th className="text-left py-2 pr-1 md:pr-3">
                          <span className="hidden md:inline">{t("common.exercise")}</span>
                        </th>
                        {dayShort.map((d, i) => (
                          <th key={i} className={`px-0.5 md:px-2 text-center ${i === getTodayIdx() ? "text-[#CCFF00]" : i > getTodayIdx() ? "opacity-50" : ""}`} data-testid={`day-header-${i}`}>{d}</th>
                        ))}
                        <th className="pl-1 md:px-2 text-right">Σ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {me?.exercises.map((ex) => {
                        const sum = [0,1,2,3,4,5,6].reduce((acc, di) => acc + (Number(logDays?.[di]?.[ex.key]) || 0), 0);
                        const formattedSum = sum.toLocaleString(locale, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2
                        });
                        const formattedGoal = ex.goal.toLocaleString(locale, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2
                        });

                        return (
                          <tr key={ex.key} className="border-t border-[#1A1A1A]">
                            <td className="py-2 pr-1 md:pr-3 align-middle">
                              <div className="flex items-center gap-1 md:gap-2" style={{ color: ex.color }}>
                                <ExerciseIcon icon={ex.icon} size={14} className="shrink-0" />
                                <span className="hidden md:inline text-[11px] uppercase tracking-wider leading-tight whitespace-nowrap">
                                  {exerciseLabel(ex)}{ex.unit && !isActivity(ex) ? ` (${ex.unit})` : ""}
                                </span>
                              </div>
                            </td>
                            {isActivity(ex) ? [0,1,2,3,4,5,6].map((di) => (
                              <td key={di} className="px-0.5 md:px-2 py-1">
                                <ActivityDayButton compact on={Number(logDays?.[di]?.[ex.key]) > 0} future={di > getTodayIdx()} today={di === getTodayIdx()}
                                  color={ex.color} label={dayShort[di]} onClick={() => toggleActivityDay(ex.key, di)} testid={`activity-cell-${ex.key}-${di}`} />
                              </td>
                            )) : [0,1,2,3,4,5,6].map((di) => {
                              const cellValue = logDays?.[di]?.[ex.key] ?? "";
                              const displayValue = Number(cellValue) === 0 ? "" : cellValue;

                              return (
                                <td key={di} className="px-0.5 md:px-2 py-1">
                                  <AutoFitNumberInput
                                    step={ex.unit === "km" ? 0.1 : 1}
                                    value={displayValue}
                                    placeholder={di > getTodayIdx() ? "" : "0"}
                                    onChange={(e) => setDayValue(di, ex.key, e.target.value)}
                                    disabled={di > getTodayIdx()}
                                    ariaLabel={`${exerciseLabel(ex)} ${dayShort[di]}`}
                                    baseFontStyle={{ fontSize: 'clamp(12px, 3vw, 19px)' }}
                                    className={`w-full bg-[#0A0A0A] border outline-none text-center text-white py-1.5 px-0.5 font-anton placeholder:text-ink-3 disabled:opacity-40 disabled:border-[#1A1A1A] ${di === getTodayIdx() ? "border-[#333] focus:border-[#CCFF00]" : "border-[#222] focus:border-[#CCFF00]"}`}
                                  />
                                </td>
                              );
                            })}
                            <td className="pl-1 md:px-2 text-right font-anton align-middle" style={{ color: ex.color }} data-testid={`sum-${ex.key}`}>
                              <div className="flex flex-col leading-tight items-end">
                                <span className="text-[15px] md:text-[17px]">{isActivity(ex) ? doneDays(logDays, ex.key).length : formattedSum}</span>
                                <span className="text-[10px] md:text-[11px] text-ink-3 whitespace-nowrap">/ {formattedGoal}{ex.unit && !isActivity(ex) ? ` ${ex.unit}` : isActivity(ex) ? <span className="font-sans font-bold ml-px">×</span> : ""}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                type="button"
                onPointerDown={(e) => {
                  // iOS-Fix: vor dem Klick sicherstellen, dass kein Input mehr
                  // den Fokus hat (sonst kann iOS den Tap als Text-Selection
                  // interpretieren). Außerdem evtl. bestehende Text-Auswahl
                  // entfernen, damit der Button sauber klickbar bleibt.
                  try {
                    const ae = document.activeElement;
                    if (ae && ae !== e.currentTarget && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) {
                      ae.blur();
                    }
                    if (window.getSelection) {
                      const sel = window.getSelection();
                      if (sel && sel.removeAllRanges) sel.removeAllRanges();
                    }
                  } catch (_) { /* noop */ }
                }}
                onClick={handleLogProgress}
                data-testid="save-progress-button"
                style={{
                  WebkitUserSelect: "none",
                  userSelect: "none",
                  WebkitTouchCallout: "none",
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "manipulation",
                }}
                className="w-full bg-[#CCFF00] text-black font-bold uppercase tracking-widest whitespace-nowrap px-3 py-4 hover:bg-[#D4FF33] glow-lime transition-all"
              >
                <span className="sm:hidden">{t("log.save")}</span>
                <span className="hidden sm:inline">{t("log.saveNotify")}</span>
              </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Crew-Challenges (Plan 12e) */}
      {!me?.starts_on && <ChallengesSection board={board} meId={user.user_id} openFor={challengeFor} onCloseFor={() => setChallengeFor(null)} onlineIds={onlineUserIds} />}
      {/* Herausforderung bekommen: Ready-Check mit 60-s-Balken */}
      {!me?.starts_on && <ChallengeReadyCheck board={board} meId={user.user_id} />}

      <section className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="font-anton text-3xl tracking-tight">{t("crew.title")}</h2>
            <button
              type="button"
              onClick={() => {
                if (showFriendPanel) closeFriendPanel();
                else { setShowFriendPanel(true); tourEvent("crew-open"); }
              }}
              data-testid="toggle-friend-panel"
              data-tour="crew-toggle"
              title={t("crew.manageTitle")}
              aria-label={t("crew.add")}
              aria-expanded={showFriendPanel}
              className={`relative w-9 h-9 border flex items-center justify-center transition-colors ${showFriendPanel ? "border-[#CCFF00] text-black bg-[#CCFF00]" : "border-[#222] text-[#CCFF00] hover:border-[#CCFF00] hover:bg-[#CCFF00]/10"}`}
            >
              <UserPlus size={18} weight="bold" />
              {friendRequests.incoming.length > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-[#FF3B30] text-white text-[10px] font-bold leading-[18px] text-center"
                  data-testid="friend-request-badge"
                >
                  {friendRequests.incoming.length}
                </span>
              )}
            </button>
          </div>
          <span className="text-xs uppercase tracking-widest text-ink-2" data-testid="crew-count">{board.users.length} {t("crew.athletes")}</span>
        </div>

        <AnimatePresence initial={false}>
          {showFriendPanel && (
            <motion.div
              key="friend-panel"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 32 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: "hidden" }}
              data-testid="friend-panel-wrapper"
            >
              <div
                className="border border-[#CCFF00] bg-[#0A0A0A] p-5 md:p-6 space-y-5"
                data-testid="friend-panel"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-[#CCFF00]">/ FRIENDS</p>
                    <h3 className="font-anton text-2xl tracking-tight mt-1">{t("crew.manage")}</h3>
                  </div>
                  <button
                    onClick={closeFriendPanel}
                    data-testid="close-friend-panel"
                    className="text-ink-2 hover:text-white text-xs uppercase tracking-widest flex items-center gap-1"
                  >
                    <X size={14} /> {t("common.close")}
                  </button>
                </div>

                <CrewRequests
                  requests={friendRequests}
                  onChanged={() => Promise.all([fetchFriendRequests(), fetchFriends(), fetchBoard()])}
                />

                {/* Add friend form */}
                <form
                  onSubmit={handleAddFriend}
                  data-tour="invite"
                  data-testid="friend-add-form"
                  className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-3 items-stretch"
                >
                  <div
                    className="flex items-center bg-[#121212] border border-[#222] focus-within:border-[#CCFF00] px-3 transition-colors cursor-text"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) friendNameRef.current?.focus();
                    }}
                    data-testid="friend-add-combined"
                  >
                    <input
                      ref={friendNameRef}
                      type="text"
                      value={friendName}
                      onChange={handleNameChange}
                      onPaste={handleCombinedPaste}
                      placeholder={t("common.name")}
                      maxLength={80}
                      data-testid="friend-add-name"
                      className="bg-transparent outline-none text-white py-3 font-anton text-lg placeholder:text-ink-3 min-w-0"
                    />
                    <span className="ml-3 md:ml-0 font-anton text-lg text-[#CCFF00] select-none">#</span>
                    <input
                      ref={friendHandleRef}
                      type="text"
                      value={friendHandle}
                      onChange={handleHashtagChange}
                      onPaste={handleCombinedPaste}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace" && friendHandle.length === 0) {
                          e.preventDefault();
                          friendNameRef.current?.focus();
                        }
                      }}
                      placeholder="ABC23"
                      maxLength={5}
                      data-testid="friend-add-handle"
                      className="bg-transparent outline-none text-white py-3 pl-1 md:pl-2 font-anton text-lg tracking-[0.3em] w-[7ch] placeholder:text-ink-3"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={addingFriend}
                    data-testid="friend-add-submit"
                    className="bg-[#CCFF00] text-black font-bold uppercase tracking-widest px-5 py-3 flex items-center justify-center gap-2 hover:bg-[#D4FF33] transition-all disabled:opacity-60"
                  >
                    <Plus size={16} weight="bold" /> {addingFriend ? "..." : t("crew.addButton")}
                  </button>
                </form>

                {/* Einladungslink nur noch in den Einstellungen (Dean 2026-11-27) */}

                {/* Friend list */}
                {friends.length === 0 ? (
                  <div className="border border-dashed border-[#222] py-8 text-center text-ink-3 uppercase tracking-widest text-xs" data-testid="friend-list-empty">
                    {t("crew.noFriends")}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3" data-testid="friend-list">
                    {friends.map((f, idx) => {
                      const isDragged = dragGhost && dragGhost.friend?.user_id === f.user_id;
                      return (
                      <div
                        key={f.user_id}
                        data-friend-idx={idx}
                        onPointerDown={handlePointerDown(idx)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerCancel}
                        onContextMenu={(e) => e.preventDefault()}
                        onDragStart={(e) => e.preventDefault()}
                        style={{
                          touchAction: "none",
                          WebkitUserSelect: "none",
                          opacity: isDragged ? 0.35 : 1,
                          transition: dragGhost ? "transform 180ms ease, opacity 120ms ease" : "transform 220ms ease, opacity 180ms ease, border-color 120ms ease",
                        }}
                        className={`group relative w-[160px] border ${isDragged ? "border-[#CCFF00]" : dragGhost ? "border-[#222]" : "border-[#222] hover:border-[#CCFF00]"} bg-[#121212] p-3 select-none cursor-grab active:cursor-grabbing`}
                      >
                        <button
                          type="button"
                          data-no-drag
                          onClick={() => setRemoveFriendDialog(f)}
                          data-testid={`friend-remove-${f.user_id}`}
                          className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center text-ink-3 hover:text-[#FF3B30] transition-colors z-10"
                        >
                          <Trash size={13} weight="bold" />
                        </button>
                        <div className="pt-5 pb-1 px-1 text-center pointer-events-none">
                          <p className="font-anton text-sm leading-tight break-words">
                            <span className="text-white">{f.name}</span>
                            <span className="text-[#CCFF00] ml-1 whitespace-nowrap">#{f.handle || "—"}</span>
                          </p>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {board.users.length === 0 ? (
          <div className="border border-dashed border-[#222] p-12 text-center text-ink-3 uppercase tracking-widest text-sm">
            {t("crew.noMembers")}
          </div>
        ) : (
          <>
            {/* Mobile portrait: horizontal swipe carousel (< md). Desktop: grid */}
            <div
              ref={carouselRef}
              className="flex lg:grid lg:grid-cols-2 xl:grid-cols-3 gap-12 lg:gap-5 overflow-x-auto lg:overflow-visible snap-x-mandatory lg:[scroll-snap-type:none] -mx-6 px-6 lg:mx-0 lg:px-0 pt-8 pb-8 lg:pt-4 lg:pb-4 scrollbar-hide"
              data-testid="crew-list"
            >
              {sortedUsers.map((u, idx) => (
                <div
                  key={u.user_id}
                  className="flex-none w-[85vw] lg:w-auto snap-item lg:[scroll-snap-align:none]"
                >
                  <UserCard
                    entry={u}
                    isMe={u.user_id === user.user_id}
                    flash={!!flashing[u.user_id]}
                    canBoost={true}
                    onBoost={handleBoost}
                    onCancelBoost={(exKey) => setCancelDialog(exKey)}
                    hasBoostedThisWeek={hasBoostedThisWeek}
                    hideBoostButtons={hideBoostButtons}
                    celebrating={!!celebratingUsers[u.user_id]}
                    pendingCelebration={!!pendingCelebration[u.user_id]}
                    pendingFailing={!!pendingFailing[u.user_id]}
                    onCelebrationShown={handleCelebrationShown}
                    onFailingShown={handleFailingShown}
                    isOnline={u.user_id === user.user_id || onlineUserIds.has(u.user_id)}
                    isActive={isMobileViewport && idx === carouselIdx}
                    seenEffects={seenEffects}
                    onMarkSeen={markEffectSeen}
                    burst={(emojiQueues[u.user_id] || [])[0] || null}
                    onBurstDone={(id) => burstDone(u.user_id, id)}
                    onSendEmoji={u.user_id === user.user_id ? undefined : (e) => sendEmoji(u.user_id, e)}
                    onChallenge={u.user_id === user.user_id || !(me?.exercises || []).some((e) => !isActivity(e)) ? undefined : () => setChallengeFor(u.user_id)}
                  />
                </div>
              ))}
            </div>
            {/* Page dots indicator (mobile only) */}
            {sortedUsers.length > 1 && (
              <div className="lg:hidden flex justify-center gap-1.5 mt-4" data-testid="carousel-dots">
                {sortedUsers.map((u, idx) => (
                  <div
                    key={u.user_id}
                    className={`h-1 transition-all ${idx === carouselIdx ? "w-8 bg-[#CCFF00]" : "w-2 bg-[#333]"}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <MilestoneToasts toasts={milestoneToasts} onDismiss={dismissMilestone} />
      <Ranking
        open={showRanking}
        onClose={() => setShowRanking(false)}
        users={board.users}
        meId={user.user_id}
      />
      <Insights open={showInsights} onClose={() => setShowInsights(false)} meId={user.user_id} />

      {user.onboarding_done === false && me && (
        <Onboarding
          user={user}
          exercises={me.exercises}
          onDone={() => {
            setUser({ ...user, onboarding_done: true, tour_step: 0 });
            fetchBoard();
          }}
        />
      )}

      <Workout open={workoutOpen} onClose={() => setWorkoutOpen(false)} exercises={me?.exercises || []} onLog={applyVoiceItems} />

      <InstallSheet
        open={!!installSheet}
        platform={installSheet}
        onClose={() => setInstallSheet(null)}
      />

      {/* Geführte Tour (Plan 4a): nach dem Einführungs-Dialog, Fortschritt am Konto */}
      {user.onboarding_done !== false && Number.isInteger(user.tour_step) && user.tour_step >= 0 && me && (
        <GuidedTour
          step={user.tour_step}
          onStep={(n) => {
            setUser({ ...user, tour_step: n });
            api.put("/me/tour", { step: n }).catch(() => {});
          }}
          onNeed={(what) => {
            if (what === "log") setLogging(true);
            else if (what === "log-closed") setLogging(false);
            else if (what === "crew") setShowFriendPanel(true);
            else tourNeed(what); // z. B. eigene Karte umdrehen (UserCard hört zu)
          }}
          onEnd={() => {
            setUser({ ...user, tour_step: -1 });
            api.put("/me/tour", { step: -1 }).catch(() => {});
          }}
        />
      )}

      {/* Cancel Boost Confirmation Dialog */}
      {cancelDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setCancelDialog(null)}
          data-testid="cancel-boost-overlay"
        >
          <div
            className="bg-[#121212] border border-[#FF8800] max-w-sm w-full p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
            data-testid="cancel-boost-dialog"
          >
            <div className="flex items-center gap-3">
              <Flame size={28} weight="fill" className="text-[#FF8800]" />
              <h3 className="font-anton text-2xl tracking-tight">{t("boost.cancelTitle")}</h3>
            </div>
            <p className="text-sm text-ink-2 leading-relaxed">
              {t("boost.cancelText")}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelDialog(null)}
                data-testid="cancel-boost-no"
                className="flex-1 border border-[#222] hover:border-[#444] py-3 px-4 text-xs uppercase tracking-widest transition-colors"
              >
                {t("common.noKeep")}
              </button>
              <button
                onClick={handleCancelBoost}
                data-testid="cancel-boost-yes"
                className="flex-1 bg-[#FF3B30] hover:bg-[#FF5040] text-white font-bold uppercase tracking-widest py-3 px-4 transition-all"
              >
                {t("boost.cancelYes")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Friend Confirmation Dialog */}
      {removeFriendDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setRemoveFriendDialog(null)}
          data-testid="remove-friend-overlay"
        >
          <div
            className="bg-[#121212] border border-[#FF3B30] max-w-sm w-full p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
            data-testid="remove-friend-dialog"
          >
            <div className="flex items-center gap-3">
              <Trash size={26} weight="bold" className="text-[#FF3B30]" />
              <h3 className="font-anton text-2xl tracking-tight">{t("crew.removeTitle")}</h3>
            </div>
            <p className="text-sm text-ink-2 leading-relaxed">
              <span className="text-white font-anton">{removeFriendDialog.name}</span>
              <span className="text-[#CCFF00] ml-1">#{removeFriendDialog.handle || "—"}</span>
              <span> {t("crew.removeText")}</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRemoveFriendDialog(null)}
                data-testid="remove-friend-no"
                className="flex-1 border border-[#222] hover:border-[#444] py-3 px-4 text-xs uppercase tracking-widest transition-colors"
              >
                {t("common.noKeep")}
              </button>
              <button
                onClick={() => {
                  const id = removeFriendDialog.user_id;
                  setRemoveFriendDialog(null);
                  handleRemoveFriend(id);
                }}
                data-testid="remove-friend-yes"
                className="flex-1 bg-[#FF3B30] hover:bg-[#FF5040] text-white font-bold uppercase tracking-widest py-3 px-4 transition-all"
              >
                {t("crew.removeYes")}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-[#1A1A1A] py-8 px-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] uppercase tracking-[0.3em] text-ink-3">
        <span className="whitespace-nowrap">TRACKER · STAY CONSISTENT</span>
        <button
          type="button"
          onClick={() => setShowFeedback(true)}
          className="whitespace-nowrap uppercase tracking-[0.3em] text-ink-3 hover:text-[#CCFF00] transition-colors"
          data-testid="footer-feedback"
        >
          {t("settings.feedbackButton")}
        </button>
        <LegalLinks />
      </footer>
      <FeedbackDialog open={showFeedback} onClose={() => setShowFeedback(false)} />

      {/* Drag Ghost (folgt Pointer beim Umsortieren) */}
      {dragGhost && dragGhost.friend && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: dragGhost.x - dragGhost.offsetX,
            top: dragGhost.y - dragGhost.offsetY,
            width: dragGhost.w,
            height: dragGhost.h,
            pointerEvents: "none",
            zIndex: 9999,
            transform: "scale(1.05)",
            transformOrigin: "center",
            boxShadow: "0 20px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(204,255,0,0.6), 0 0 24px rgba(204,255,0,0.25)",
            background: "#121212",
            border: "1px solid #CCFF00",
            padding: "12px",
          }}
          data-testid="drag-ghost"
        >
          <div className="pt-5 pb-1 px-1 text-center">
            <p className="font-anton text-sm leading-tight break-words">
              <span className="text-white">{dragGhost.friend.name}</span>
              <span className="text-[#CCFF00] ml-1 whitespace-nowrap">#{dragGhost.friend.handle || "—"}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

