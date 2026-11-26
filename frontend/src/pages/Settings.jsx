import { useEffect, useLayoutEffect, useState, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FloppyDisk, ArrowCounterClockwise, Lightning, Plus, Trash, X, Camera, User, Flame, Copy, Check, PencilSimple, DotsSixVertical, DotsThreeVertical, Pause, Play, FlagCheckered, ChatCircleText, CaretDown } from "@phosphor-icons/react";
import { useAuth } from "../contexts/AuthContext";
import { api, avatarSrc, shrinkImage } from "../lib/api";
import ExerciseIcon from "../components/ExerciseIcon";
import IconPicker from "../components/IconPicker";
import { InviteBox } from "../components/CrewRequests";
import InstallSheet from "../components/InstallSheet";
import MyData from "../components/MyData";
import PauseLossInfo from "../components/PauseLossInfo";
import { currentPauseWeeks, goalAfterPause, pauseLossPct } from "../lib/pause";
import ReminderCard from "../components/ReminderCard";
import { currentPlatform } from "../lib/install";
import { iconForExercise, exerciseLabel, splitVariant } from "../lib/exercises";
import { suggestForName, variantStartSuggestion } from "../lib/suggest";
import GearPicker from "../components/GearPicker";
import FeedbackDialog from "../components/FeedbackDialog";
import { useI18n, LANGUAGES, formatNumber } from "../i18n";
import { toast } from "sonner";

import { formatAmount } from "../lib/amount";
import { micEnabled, setMicEnabled, speechSupported } from "../lib/mic";
import { voiceConfirm, setVoiceConfirm } from "../lib/voiceHub";
import { ACTIVITY_IDEAS, ACTIVITY_UNIT, isActivity, typeOf } from "../lib/activities";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
// Muss mit EXERCISE_PALETTE in backend/server.py übereinstimmen.
const EXERCISE_PALETTE = ["#CCFF00", "#FF3B30", "#00F0FF", "#FF8800", "#A855F7", "#22FF77", "#FF1493"];
// Vorschlag fürs Ziel einer neuen Übung (grau im Feld, gilt wenn man nichts einträgt)
const NEW_GOAL_DEFAULT = 10;
const MAX_EXERCISES = 7; // aktive + pausierte (abgeschlossene zählen nicht)
const DELOAD_AFTER_MISSES = 4;

const clampPct = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n))) : 10;
};

// Farbe bleibt bei der Übung (auch beim Umsortieren). Nur fehlende oder doppelte
// Farben bekommen die nächste freie aus der Palette. Gleiche Regel wie im Backend.
const assignColors = (list) => {
  // 1. Durchgang: vorhandene, eindeutige Farben reservieren.
  const used = new Set();
  const keep = (list || []).map((ex) => {
    const ok = EXERCISE_PALETTE.includes(ex.color) && !used.has(ex.color);
    if (ok) used.add(ex.color);
    return ok;
  });
  // 2. Durchgang: Übungen ohne (gültige) Farbe bekommen die nächste freie.
  return (list || []).map((ex, i) => {
    let color = ex.color;
    if (!keep[i]) {
      color = EXERCISE_PALETTE.find((c) => !used.has(c)) || EXERCISE_PALETTE[0];
      used.add(color);
    }
    return { ...ex, color, progression_pct: clampPct(ex.progression_pct) };
  });
};

// Status einer Übung aus dem Server-State: active | paused | completed
const statusOf = (stateForEx) => stateForEx?.status || "active";
const STATUS_ORDER = { active: 0, paused: 1, completed: 2 };

const isDistanceUnit = (unit) => {
  const u = (unit || "").toLowerCase();
  return u.includes("km") || u === "m" || u.includes("mi");
};

const fmtNum = (v, unit) => {
  const n = Number(v) || 0;
  const u = (unit || "").toLowerCase();
  return u.includes("km") || u === "m" || u.includes("mi") ? Math.round(n * 10) / 10 : Math.round(n);
};

export default function Settings() {
  const { user, loading, setUser } = useAuth();
  const { t, lang, setLang, locale } = useI18n();
  const [showFeedback, setShowFeedback] = useState(false);
  const navigate = useNavigate();

  const [savingProfile, setSavingProfile] = useState(false);
  const [micOn, setMicOn] = useState(() => micEnabled());
  const [confirmOn, setConfirmOn] = useState(() => voiceConfirm());
  // Übungen / Aktivitäten (Dean 2026-11-26): zwei Abschnitte in einer Liste
  const [section, setSection] = useState("exercise");
  const [ideaIdx, setIdeaIdx] = useState(0);
  const sectionPicked = useRef(false);
  const [profileName, setProfileName] = useState("");
  const [profilePic, setProfilePic] = useState("");
  const [handleCopied, setHandleCopied] = useState(false);

  // "App auf dem Handy" (Plan 10): Anleitung jederzeit hier erreichbar.
  const [installPlatformName] = useState(() => currentPlatform());
  // "Weitere Einstellungen" auf/zu – merkt sich der Browser
  const [moreOpen, setMoreOpen] = useState(() => {
    try { return window.localStorage.getItem("tyc_settings_more") === "1"; } catch { return false; }
  });
  const toggleMore = (v) => {
    setMoreOpen(v);
    try { window.localStorage.setItem("tyc_settings_more", v ? "1" : "0"); } catch { /* egal */ }
  };
  const [installOpen, setInstallOpen] = useState(false);

  // Freundschaftsanfragen per Code empfangen (Plan 4b). Speichert sofort.
  const [acceptRequests, setAcceptRequests] = useState(true);
  useEffect(() => {
    if (!user) return;
    api.get("/me/friend-requests-setting").then(({ data }) => setAcceptRequests(data?.accept !== false)).catch(() => {});
  }, [user]);
  const toggleAcceptRequests = async (next) => {
    setAcceptRequests(next);
    try {
      await api.put("/me/friend-requests-setting", { accept: next });
    } catch (e) {
      setAcceptRequests(!next);
      toast.error(e.response?.data?.detail || t("common.updateFailed"), { duration: 2500 });
    }
  };
  // Initial-Werte für die beiden Auto-Save-Toggles aus dem localStorage lesen,
  // damit beim Öffnen der Settings sofort der korrekte Zustand angezeigt wird
  // und nicht kurz auf "An" geflasht wird, bevor der Server-Wert eintrifft.
  // Fallback: "Aus" (false bzw. true bei hideBoostButtons, damit activateBoost=false).
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      const v = typeof window !== "undefined" && window.localStorage.getItem("pref:remember_me");
      if (v === "true") return true;
      if (v === "false") return false;
    } catch (_) {}
    return false;
  });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [hideBoostButtons, setHideBoostButtons] = useState(() => {
    try {
      const v = typeof window !== "undefined" && window.localStorage.getItem("pref:hide_boost_buttons");
      if (v === "true") return true;
      if (v === "false") return false;
    } catch (_) {}
    // Default: Boost-Buttons sind ausgeblendet (activateBoost = false beim ersten Öffnen)
    return true;
  });
  const [savingHideBoost, setSavingHideBoost] = useState(false);
  const fileRef = useRef(null);

  // Übungen: lokaler Bearbeitungsstand. `goal_input` ist das Feld "Ziel diese Woche".
  const [exercises, setExercises] = useState([]);
  const [originalExercises, setOriginalExercises] = useState([]);
  const [startDate, setStartDate] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [state, setState] = useState({});            // gespeicherter Stand vom Server
  const [previewState, setPreviewState] = useState(null); // Vorschau ungespeicherter Änderungen
  const [saving, setSaving] = useState(false);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // Übung, die gelöscht werden soll
  const [menuFor, setMenuFor] = useState(null);           // offenes "⋮"-Menü (Übungs-Key)
  const [variantOpen, setVariantOpen] = useState({});      // neue Übung: Varianten-Feld aufgeklappt

  // "⋮"-Menü schließen bei Klick daneben oder Escape.
  useEffect(() => {
    if (!menuFor) return;
    const onDown = (e) => {
      if (!e.target?.closest?.("[data-exercise-menu]")) setMenuFor(null);
    };
    const onKey = (e) => e.key === "Escape" && setMenuFor(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuFor]);
  useEffect(() => {
    if (!loading && !user) navigate("/");
    if (user) {
      setProfileName(user.name || "");
      setProfilePic(user.picture || "");
    }
  }, [user, loading, navigate]);

  // Beim Öffnen der Settings IMMER ganz oben starten – ohne sichtbaren
  // Sprung/Flash in der Mitte. useLayoutEffect feuert synchron VOR dem
  // ersten Paint, sodass der Browser nie eine andere Scrollposition zeigt.
  // Zusätzlich schalten wir die automatische Scroll-Wiederherstellung
  // des Browsers aus, damit eine alte Position nicht kurz aufblitzt.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const prevRestoration = window.history.scrollRestoration;
    try {
      window.history.scrollRestoration = "manual";
    } catch (_) {}
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    return () => {
      try {
        window.history.scrollRestoration = prevRestoration || "auto";
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await api.get("/auth/preferences");
        const v = !!data.remember_me;
        setRememberMe(v);
        try { window.localStorage.setItem("pref:remember_me", String(v)); } catch (_) {}
      } catch (err) {
        console.error("Failed to load auth preferences:", err);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await api.get("/me/hide-boost-buttons");
        const v = !!data.hide_boost_buttons;
        setHideBoostButtons(v);
        try { window.localStorage.setItem("pref:hide_boost_buttons", String(v)); } catch (_) {}
      } catch (err) {
        console.error("Failed to load hide-boost-buttons preference:", err);
      }
    })();
  }, [user]);

  // Server-Antwort von /goals/me in den lokalen Bearbeitungsstand übernehmen.
  // Reihenfolge: aktive, dann pausierte, dann abgeschlossene Übungen.
  const applyGoals = useCallback((data) => {
    const st = data.state || {};
    const sorted = [...(data.exercises || [])].sort(
      (a, b) => STATUS_ORDER[statusOf(st[a.key])] - STATUS_ORDER[statusOf(st[b.key])]
    );
    const exs = assignColors(sorted).map((ex) => ({
      ...ex,
      goal_input: String(fmtNum(st[ex.key]?.current_goal ?? ex.base_value, ex.unit)),
    }));
    setExercises(exs);
    setOriginalExercises(JSON.parse(JSON.stringify(exs)));
    setStartDate(data.start_date);
    setCurrentWeek(data.current_week || 1);
    setState(st);
    setPreviewState(null);
  }, []);

  const loadGoals = useCallback(async () => {
    try {
      const { data } = await api.get("/goals/me");
      applyGoals(data);
    } catch (err) {
      console.error("Failed to load goals:", err);
    }
  }, [applyGoals]);

  useEffect(() => {
    if (!user) return;
    loadGoals();
  }, [user, loadGoals]);

  const toggleRememberMe = async (val) => {
    setSavingPrefs(true);
    const prev = rememberMe;
    setRememberMe(val);
    try { window.localStorage.setItem("pref:remember_me", String(val)); } catch (_) {}
    try {
      await api.put("/auth/preferences", { remember_me: val });
      toast.success(val ? t("settings.rememberOn") : t("settings.rememberOff"), { duration: 2500 });
    } catch (e) {
      setRememberMe(prev);
      try { window.localStorage.setItem("pref:remember_me", String(prev)); } catch (_) {}
      toast.error(t("common.updateFailed"), { duration: 2500 });
    } finally {
      setSavingPrefs(false);
    }
  };

  // UI-Toggle "Activate Boost" ist die Inverse des intern gespeicherten
  // `hide_boost_buttons` (Backend-Feld bleibt unverändert).
  // activateBoost = true  -> Boost-Buttons werden angezeigt   (hide_boost_buttons = false)
  // activateBoost = false -> Boost-Buttons werden ausgeblendet (hide_boost_buttons = true)
  const activateBoost = !hideBoostButtons;
  const toggleHideBoostButtons = async (newActivateBoost) => {
    setSavingHideBoost(true);
    const prev = hideBoostButtons;
    const newHide = !newActivateBoost;
    setHideBoostButtons(newHide);
    try { window.localStorage.setItem("pref:hide_boost_buttons", String(newHide)); } catch (_) {}
    try {
      await api.put("/me/hide-boost-buttons", { hide_boost_buttons: newHide });
      toast.success(newActivateBoost ? t("settings.boostOn") : t("settings.boostOff"), { duration: 2500 });
    } catch (e) {
      setHideBoostButtons(prev);
      try { window.localStorage.setItem("pref:hide_boost_buttons", String(prev)); } catch (_) {}
      toast.error(t("common.updateFailed"), { duration: 2500 });
    } finally {
      setSavingHideBoost(false);
    }
  };

  // Sprache wechseln: sofort sichtbar, am Konto gespeichert (alle Geräte).
  // Unveränderte Standard-Übungen benennt der Server dabei gleich mit um.
  const changeLanguage = async (code) => {
    if (code === lang) return;
    setLang(code);
    try {
      await api.put("/me/language", { language: code });
      setUser({ ...user, language: code });
      await loadGoals();
      toast.success(t("settings.languageSaved"), { duration: 2000 });
    } catch {
      toast.error(t("common.updateFailed"), { duration: 2500 });
    }
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // Plan 9: im Browser auf 256×256 verkleinern (statt große Bilder abzulehnen).
    if (f.size > 25_000_000) { toast.error(t("settings.imageTooLarge"), { duration: 2500 }); return; }
    shrinkImage(f)
      .then((dataUrl) => setProfilePic(dataUrl))
      .catch(() => toast.error(t("settings.imageTooLarge"), { duration: 2500 }));
  };

  // Profil-Knopf (Dean 2026-11-26): neon nur bei Änderung an Name/Bild, sonst grau „Gespeichert ✓“.
  // So ist klar, dass er nur Name und Bild speichert – die Schalter darunter speichern sofort.
  const profileDirty = !!user && ((profileName || "").trim() !== (user.name || "") || (profilePic || "") !== (user.picture || ""));

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const { data } = await api.put("/profile", { name: profileName, picture: profilePic });
      setUser({ ...user, name: data.name, picture: data.picture });
      toast.success(t("settings.profileSaved"), { duration: 2500 });
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.updateFailed"), { duration: 2500 });
    } finally {
      setSavingProfile(false);
    }
  };

  // ===== Übungen bearbeiten =====
  const isNew = (ex) => !originalExercises.some((o) => o.key === ex.key);
  const savedGoal = (ex) => fmtNum(state[ex.key]?.current_goal ?? ex.base_value, ex.unit);

  // Nutzlast für PUT /goals/me und die Vorschau. `set_goal` nur, wenn das Ziel
  // geändert wurde (oder die Übung neu ist).
  const toPayload = useCallback((list) => ({
    exercises: assignColors(list).map((ex) => {
      const isFresh = !originalExercises.some((o) => o.key === ex.key);
      const split = isFresh && !(ex.variant || "").trim() ? splitVariant(ex.name) : null;
      // Neue Übung: graue Vorschläge (Einheit/Startwert aus dem Namen) gelten, wenn das Feld leer bleibt
      const sug = isFresh ? suggestForName(split?.name ?? ex.name, t("suggest.sec")) : null;
      const item = {
        key: ex.key,
        name: (split?.name ?? ex.name ?? "").trim() || (isFresh ? t("settings.newExercise") : t("common.exercise")),
        unit: (ex.unit || "").trim() || (sug?.unit ?? ""),
        icon: ex.icon,
        color: ex.color,
        variant: (split?.variant || ex.variant || "").trim(),
        base_value: Number(ex.base_value) || 0,
        progression_pct: clampPct(ex.progression_pct),
        type: typeOf(ex),
      };
      if (isActivity(ex)) {
        item.unit = ACTIVITY_UNIT;
        item.progression_pct = 0;
        item.variant = "";
        if (!(ex.name || "").trim()) item.name = isFresh ? t("settings.newActivity") : t("common.activity");
      }
      const wasNew = !originalExercises.some((o) => o.key === ex.key);
      // Leeres Feld = grauer Vorschlag gilt (neu: 10, sonst bleibt das Ziel wie es ist)
      const rawGoal = String(ex.goal_input ?? "").trim();
      const goal = rawGoal === "" ? (wasNew ? (sug?.start ?? NEW_GOAL_DEFAULT) : NaN) : Number(rawGoal.replace(",", "."));
      const before = fmtNum(state[ex.key]?.current_goal ?? ex.base_value, ex.unit);
      if (Number.isFinite(goal) && goal >= 0 && (wasNew || goal !== before)) item.set_goal = goal;
      return item;
    }),
  }), [originalExercises, state, t]);

  const updateExercise = (idx, patch) => {
    setExercises((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  // Icon gilt als selbst gewählt, wenn es in dieser Sitzung im Icon-Knopf gewählt
  // wurde oder (bei gespeicherten Übungen) nicht zum gespeicherten Namen passt.
  const iconIsManual = (ex) => {
    if (ex.iconManual !== undefined) return ex.iconManual;
    const orig = originalExercises.find((o) => o.key === ex.key);
    return !!orig && orig.icon !== iconForExercise(orig.name);
  };

  // Name ändern: solange das Icon nicht selbst gewählt ist, passt es sich an.
  const renameExercise = (idx, ex, name) => {
    const patch = { name };
    if (!iconIsManual(ex)) {
      const auto = iconForExercise(name);
      if (auto) patch.icon = auto;
    }
    updateExercise(idx, patch);
  };

  const notDoneOf = (type) => exercises.filter((ex) => typeOf(ex) === type && statusOf(state[ex.key]) !== "completed").length;
  const notDoneCount = notDoneOf(section);

  const addExercise = (type = section, idea = null) => {
    if (notDoneOf(type) >= MAX_EXERCISES) {
      toast.error(t(type === "activity" ? "settings.maxActivities" : "settings.maxExercises", { n: MAX_EXERCISES }), { duration: 2500 });
      return;
    }
    const activeCount = exercises.filter((ex) => statusOf(state[ex.key]) === "active").length;
    const fresh = type === "activity" ? {
      key: `new_${Date.now().toString(36)}`,
      name: idea ? t(`idea.${idea.key}.name`) : "",
      unit: ACTIVITY_UNIT,
      icon: idea ? idea.icon : "gym",
      iconManual: !!idea,
      base_value: idea ? idea.per : 2,
      goal_input: idea ? String(idea.per) : "",
      progression_pct: 0,
      type: "activity",
    } : {
      key: `new_${Date.now().toString(36)}`, // Server vergibt den endgültigen Schlüssel
      name: "", // grau „Neue Übung“ als Platzhalter – einfach drüberschreiben
      unit: "",
      icon: "squat",
      base_value: NEW_GOAL_DEFAULT,
      goal_input: "", // grau „10“ als Platzhalter
      progression_pct: 5,
    };
    // Neue Übung ans Ende der aktiven Übungen (vor Pausierte/Abgeschlossene).
    setExercises((prev) => assignColors([...prev.slice(0, activeCount), fresh, ...prev.slice(activeCount)]));
  };

  const isDirty = useMemo(() => {
    const strip = (list) => list.map(({ key, name, unit, icon, variant, progression_pct, goal_input, base_value, type }) =>
      ({ key, name, unit, icon, variant: variant || "", progression_pct, goal_input, base_value, type: type || "exercise" }));
    return JSON.stringify(strip(exercises)) !== JSON.stringify(strip(originalExercises));
  }, [exercises, originalExercises]);

  // Live-Vorschau: Backend rechnet die ungespeicherten Änderungen durch
  // (eine einzige Rechenlogik für Ziele, Pausen, Boosts und den -10%-Abzug).
  useEffect(() => {
    if (!isDirty || exercises.length === 0) {
      setPreviewState(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.post("/goals/me/preview", toPayload(exercises));
        setPreviewState(data.state || null);
      } catch {
        setPreviewState(null); // z. B. ungültige Eingabe: Vorschau einfach weglassen
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [exercises, isDirty, toPayload]);
  // ===== Drag & Drop für Übungs-Reihenfolge =====
  // Identisches Pattern wie das Crew-Drag-and-Drop im Dashboard (Pointer Events,
  // Live-Swap, Long-Press auf Touch). Die Reihenfolge der Übungen wirkt sich
  // automatisch auf die Vorderseite der UserCard (Reihenfolge der Werte) und
  // auf die Position im Radar-Diagramm auf der Rückseite aus, weil beides die
  // Reihenfolge aus dem exercises-Array übernimmt.
  const activeDragIdxRef = useRef(null);
  const dragStartPosRef = useRef(null);
  const holdTimerRef = useRef(null);
  const activePointerIdRef = useRef(null);
  const pendingOrderRef = useRef(null);
  // Throttle-Timestamp, damit pro Bewegung max. ein Swap alle ~90ms passiert.
  // Verhindert das Ping-Pong-Oszillieren beim Ziehen nach unten/in andere
  // Grid-Zeilen, das bisher zum Freeze + Crash geführt hat.
  const lastSwapAtRef = useRef(0);
  // Letzte Pointer-Position für Auto-Scroll (während Drag).
  const lastPointerRef = useRef({ x: 0, y: 0 });
  // RAF-Handle für die Auto-Scroll-Schleife.
  const autoScrollRafRef = useRef(null);
  const [dragGhost, setDragGhost] = useState(null); // { idx, x, y, offsetX, offsetY, w, h, exercise }

  // Reihenfolge beim Loslassen sofort speichern (wie bei der Crew). Gespeichert
  // wird nur die neue Reihenfolge des gespeicherten Stands, andere noch nicht
  // gespeicherte Änderungen bleiben unberührt im Formular.
  const persistOrder = useCallback(async (orderedList) => {
    const keys = orderedList.map((e) => e.key);
    const pos = (k) => { const i = keys.indexOf(k); return i === -1 ? 999 : i; };
    const saved = [...originalExercises].sort((a, b) => pos(a.key) - pos(b.key));
    if (saved.map((e) => e.key).join() === originalExercises.map((e) => e.key).join()) return;
    try {
      await api.put("/goals/me", toPayload(saved));
      setOriginalExercises(JSON.parse(JSON.stringify(saved)));
    } catch (err) {
      console.error("Failed to persist exercise order:", err);
      toast.error(t("settings.orderFailed"), { duration: 2500 });
    }
  }, [originalExercises, toPayload, t]);

  const reorderExercisesLocal = useCallback((srcIdx, targetIdx) => {
    if (srcIdx == null || targetIdx == null || srcIdx === targetIdx) return;
    setExercises((prev) => {
      if (srcIdx < 0 || srcIdx >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(srcIdx, 1);
      const clampedTarget = Math.max(0, Math.min(targetIdx, next.length));
      next.splice(clampedTarget, 0, moved);
      pendingOrderRef.current = next;
      return next;
    });
  }, []);

  const beginExerciseDrag = (idx, clientX, clientY, tileEl) => {
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
      exercise: exercises[idx],
    });
    try { if (navigator.vibrate) navigator.vibrate(15); } catch (_) {}
  };

  const clearExerciseHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const endExerciseDrag = (commit) => {
    clearExerciseHoldTimer();
    stopAutoScroll();
    if (commit && pendingOrderRef.current) persistOrder(pendingOrderRef.current);
    pendingOrderRef.current = null;
    activeDragIdxRef.current = null;
    activePointerIdRef.current = null;
    dragStartPosRef.current = null;
    lastSwapAtRef.current = 0;
    setDragGhost(null);
  };

  // ---- Swap-Evaluation (shared zwischen Pointer-Move und Auto-Scroll-RAF) ----
  // Einfacher direkter Swap (wie das Crew-Drag-and-Drop im Dashboard): sobald
  // der Pointer/Finger über einer anderen Übungskachel liegt, wird sofort
  // umsortiert. Frühere Mittelpunkt-Hysterese + Throttle haben das Ziehen
  // "nach unten auf den direkten Nachbarn" blockiert.
  const evaluateSwap = (clientX, clientY) => {
    const currentIdx = activeDragIdxRef.current;
    if (currentIdx == null) return;
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return;
    const tile = el.closest("[data-exercise-idx]");
    if (!tile) return;
    const overIdx = Number(tile.getAttribute("data-exercise-idx"));
    if (!Number.isFinite(overIdx) || overIdx === currentIdx) return;

    reorderExercisesLocal(currentIdx, overIdx);
    activeDragIdxRef.current = overIdx;
  };

  // ---- Auto-Scroll am Viewport-Rand während eines Drags ----
  // Mobil ist es unmöglich, eine Übung auf eine Position weit unten zu ziehen,
  // wenn die Seite während des Drags nicht mitscrollt. Sobald der Pointer
  // in eine "Hot Zone" am oberen oder unteren Bildschirmrand kommt, scrollen
  // wir die Seite per requestAnimationFrame automatisch in die passende
  // Richtung - und triggern parallel weiter Swaps, damit das Umsortieren
  // auch während des Scrollens flüssig weiterläuft.
  const stopAutoScroll = () => {
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  };

  const autoScrollTick = () => {
    if (activeDragIdxRef.current == null) {
      autoScrollRafRef.current = null;
      return;
    }
    const { x, y } = lastPointerRef.current;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    // Pointer außerhalb des sichtbaren Viewports? Dann NICHT scrollen.
    // Sonst rastet der Auto-Scroll am unteren Rand fest, wenn der Finger
    // beim schnellen Ziehen kurz unterhalb des Bildschirms landet oder
    // das Pointer-up-Event verloren geht.
    if (y < 0 || y > vh) {
      autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
      return;
    }
    const edge = 90;       // Hot-Zone Größe in px
    const maxSpeed = 22;   // Maximale Scroll-Geschwindigkeit pro Frame
    let delta = 0;
    if (y < edge) {
      // Je näher am oberen Rand, desto schneller scrollen wir nach oben.
      delta = -Math.ceil(((edge - y) / edge) * maxSpeed);
    } else if (y > vh - edge) {
      // Analog unten.
      delta = Math.ceil(((y - (vh - edge)) / edge) * maxSpeed);
    }

    // Nach-unten-Scroll begrenzen: Wir scrollen nur so weit, bis der untere
    // Rand der letzten Übungskachel vollständig im Viewport sichtbar ist.
    // Verhindert das Durchscrollen ins Nichts unterhalb der Liste.
    if (delta > 0) {
      const tiles = document.querySelectorAll("[data-exercise-idx]");
      if (tiles.length > 0) {
        const lastTile = tiles[tiles.length - 1];
        const rect = lastTile.getBoundingClientRect();
        // Kleiner Sicherheitspuffer, damit die Kachel wirklich komplett zu
        // sehen ist (Schatten / glow / abgerundete Ecken).
        const buffer = 16;
        const overflow = rect.bottom + buffer - vh;
        if (overflow <= 0) {
          // Letzte Kachel ist bereits vollständig sichtbar -> kein weiteres
          // Nach-unten-Scrollen mehr.
          delta = 0;
        } else {
          // Höchstens so viel scrollen, dass die letzte Kachel genau noch
          // sichtbar wird, aber nicht weiter.
          delta = Math.min(delta, overflow);
        }
      }
    }

    if (delta !== 0) {
      // window.scrollBy umgeht body.overflow:hidden Restriktionen nicht in
      // allen Browsern - daher schalten wir den Block beim Drag-Start auf
      // touchAction/overscrollBehavior um (siehe useEffect), Body-Overflow
      // bleibt frei, damit der programmgesteuerte Scroll funktioniert.
      window.scrollBy(0, delta);
      // Nach dem Scrollen liegt unter der gleichen clientY ggf. ein neues
      // Tile - also Swap-Auswertung erneut anstoßen.
      evaluateSwap(x, y);
    }
    autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
  };

  const ensureAutoScroll = () => {
    if (autoScrollRafRef.current == null && activeDragIdxRef.current != null) {
      autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
    }
  };

  // Drag-Aktivierung: entweder über den dedizierten Drag-Handle (sofort bei
  // Maus, Long-Press 220ms bei Touch) ODER per Long-Press direkt auf der
  // gesamten Übungs-Card. Interaktive Elemente innerhalb der Card
  // (Inputs, Buttons, Selects, Textareas, Links sowie alles mit
  // [data-no-drag]) werden vom Drag explizit ausgeschlossen, damit normale
  // Eingaben weiterhin möglich bleiben.
  const isInteractiveTarget = (target) => {
    if (!target) return false;
    // Das dedizierte Drag-Handle (die 6 Punkte neben der Übung) hat HÖCHSTE
    // Priorität: es ist selbst ein <button>, soll aber NICHT als "interaktives
    // Ziel" gelten – sonst würde der Drag-Start sofort abgebrochen werden
    // und das Klicken/Ziehen am Handle hätte keinen Effekt.
    if (target.closest && target.closest("[data-drag-handle]")) return false;
    if (target.closest && target.closest("[data-no-drag]")) return true;
    const tag = (target.tagName || "").toLowerCase();
    if (["input", "textarea", "select", "button", "a", "label"].includes(tag)) return true;
    // Auch verschachtelte interaktive Vorfahren erfassen (z.B. Buttons mit Icons)
    if (target.closest && target.closest("input, textarea, select, button, a, label")) return true;
    return false;
  };

  const handleExercisePointerDown = (idx) => (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (isInteractiveTarget(e.target)) return;
    // Card-Element finden (für Geometrie des Ghosts)
    const cardEl = e.currentTarget.closest("[data-exercise-idx]") || e.currentTarget;
    if (!cardEl) return;
    // Erkennen, ob der Pointer-Down vom dedizierten Drag-Handle kam.
    // Nur dort starten wir bei der Maus sofort. Auf der restlichen Card
    // wird AUCH bei der Maus ein Long-Press erwartet, damit die vielen
    // Inputs/Klicks innerhalb der Card nicht versehentlich einen Drag
    // auslösen.
    const fromHandle = !!(e.target.closest && e.target.closest("[data-drag-handle]"));
    dragStartPosRef.current = { x: e.clientX, y: e.clientY, idx };
    activePointerIdRef.current = e.pointerId;

    if (e.pointerType === "mouse" && fromHandle) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
      beginExerciseDrag(idx, e.clientX, e.clientY, cardEl);
    } else {
      // Long-Press: 220ms via Drag-Handle, 380ms wenn auf der Card direkt
      // (etwas länger, damit normale Tipp-Interaktionen nicht versehentlich
      // ein Drag triggern).
      const holdMs = fromHandle ? 220 : 380;
      clearExerciseHoldTimer();
      holdTimerRef.current = setTimeout(() => {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
        beginExerciseDrag(idx, e.clientX, e.clientY, cardEl);
      }, holdMs);
    }
  };

  const handleExercisePointerMove = (e) => {
    if (activeDragIdxRef.current == null) {
      const start = dragStartPosRef.current;
      if (start && holdTimerRef.current) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 8) clearExerciseHoldTimer();
      }
      return;
    }
    // Letzte Pointer-Position cachen (wird vom Auto-Scroll-RAF gelesen).
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    setDragGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
    // Swap-Auswertung (Throttle + Mittelpunkt-Hysterese siehe evaluateSwap).
    evaluateSwap(e.clientX, e.clientY);
    // Auto-Scroll-Schleife starten, falls noch nicht aktiv. Sobald der Pointer
    // in die Rand-Hot-Zone kommt, scrollt die Seite automatisch mit.
    ensureAutoScroll();
  };

  const handleExercisePointerUp = (e) => {
    const wasDragging = activeDragIdxRef.current != null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    endExerciseDrag(wasDragging);
  };

  const handleExercisePointerCancel = () => {
    endExerciseDrag(false);
  };

  // Während aktivem Drag globalen Scroll & Touch blockieren - sonst rutscht
  // beim Ziehen auf Mobile die ganze Seite mit. Body.overflow bleibt
  // bewusst frei, damit das programmgesteuerte Auto-Scrollen am Rand
  // (window.scrollBy in autoScrollTick) zuverlässig funktioniert.
  // touchAction/overscrollBehavior + preventDefault auf touchmove/wheel
  // verhindern weiterhin User-initiiertes Scrollen.
  //
  // Zusätzlich hängen wir GLOBALE pointerup/pointercancel-Listener an
  // window. Wenn beim schnellen Ziehen das Pointer-Event vom Original-Tile
  // verloren geht (Pointer verlässt Viewport, Browser cancelt Touch, etc.),
  // wurden vorher weder Drag-Zustand noch Auto-Scroll-RAF beendet -> die
  // Übungskachel "klebte" am unteren Rand und die Seite scrollte
  // dauerhaft weiter. Die window-Listener garantieren, dass jedes Loslassen
  // erkannt wird und endExerciseDrag aufgerufen wird.
  useEffect(() => {
    if (!dragGhost) return;
    const block = (e) => { e.preventDefault(); };
    document.addEventListener("touchmove", block, { passive: false });
    document.addEventListener("wheel", block, { passive: false });
    // Globale Selektion verhindern, damit beim Hovern über andere Übungen
    // (Pointer hat noch keinen Capture-Target) der Text nicht markiert wird.
    const blockSelect = (e) => { e.preventDefault(); };
    document.addEventListener("selectstart", blockSelect);
    try { window.getSelection()?.removeAllRanges(); } catch (_) {}
    const prevTouchAction = document.body.style.touchAction;
    const prevOverscroll = document.body.style.overscrollBehavior;
    const prevUserSelect = document.body.style.userSelect;
    const prevWebkitUserSelect = document.body.style.webkitUserSelect;
    document.body.style.touchAction = "none";
    document.body.style.overscrollBehavior = "contain";
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";

    // Globale Release-Handler - greifen auch dann, wenn das ursprüngliche
    // Pointer-Up-Event nicht mehr beim Tile ankommt.
    const globalUp = () => {
      if (activeDragIdxRef.current != null) endExerciseDrag(true);
    };
    const globalCancel = () => {
      if (activeDragIdxRef.current != null) endExerciseDrag(false);
    };
    window.addEventListener("pointerup", globalUp);
    window.addEventListener("pointercancel", globalCancel);
    window.addEventListener("blur", globalCancel);
    // Auch globalen pointermove anhängen, damit lastPointerRef weiter
    // aktualisiert wird, falls der Pointer durch Auto-Scroll kurz "abreißt".
    const globalMove = (e) => {
      if (activeDragIdxRef.current == null) return;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", globalMove);

    return () => {
      document.removeEventListener("touchmove", block);
      document.removeEventListener("wheel", block);
      document.removeEventListener("selectstart", blockSelect);
      window.removeEventListener("pointerup", globalUp);
      window.removeEventListener("pointercancel", globalCancel);
      window.removeEventListener("blur", globalCancel);
      window.removeEventListener("pointermove", globalMove);
      document.body.style.touchAction = prevTouchAction;
      document.body.style.overscrollBehavior = prevOverscroll;
      document.body.style.userSelect = prevUserSelect;
      document.body.style.webkitUserSelect = prevWebkitUserSelect;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragGhost]);

  // Speichert die übergebene Liste (Standard: aktueller Bearbeitungsstand).
  // Varianten-Wechsel einer gespeicherten Übung (direkt in der Karte eingetragen, Dean 2026-11-25):
  // beim Speichern wird die alte Übung abgeschlossen (Archiv) und die Variante startet neu.
  // Startwert = selbst eingetragenes Ziel, sonst Vorschlag passend zur Richtung (schwerer -> weniger).
  const variantChange = (ex) => {
    const o = originalExercises.find((x) => x.key === ex.key);
    if (!o || (ex.variant || "").trim() === (o.variant || "").trim()) return null;
    const goalNow = fmtNum(state[ex.key]?.current_goal ?? o.base_value, ex.unit);
    const raw = String(ex.goal_input ?? "").trim();
    const typed = raw !== "" ? Number(raw.replace(",", ".")) : NaN;
    const start = Number.isFinite(typed) && typed !== goalNow
      ? typed
      : variantStartSuggestion(goalNow, o.variant, (ex.variant || "").trim(), ex.unit);
    return { from: (o.variant || "").trim(), to: (ex.variant || "").trim(), start, goalNow };
  };

  const doSave = async (list = exercises, { quiet = false } = {}) => {
    setSaving(true);
    try {
      const changes = list.map((ex) => [ex, variantChange(ex)]).filter(([, c]) => c);
      // 1) normale Änderungen speichern; Übungen mit neuer Variante dabei unverändert lassen
      const base = list.map((ex) => {
        const c = changes.find(([e]) => e.key === ex.key)?.[1];
        return c ? { ...ex, variant: c.from, goal_input: String(c.goalNow) } : ex;
      });
      let { data } = await api.put("/goals/me", toPayload(base));
      // 2) Varianten-Wechsel: alte Übung ins Archiv, Variante startet neu
      for (const [ex, c] of changes) {
        ({ data } = await api.post(`/goals/me/exercises/${encodeURIComponent(ex.key)}/upgrade`, { variant: c.to, start_value: c.start }));
        toast.success(t("settings.upgraded", { name: exerciseLabel({ ...ex, variant: c.to }) }), { duration: 2500 });
      }
      applyGoals(data);
      setVariantOpen({});
      if (!quiet && !changes.length) toast.success(t("common.saved"), { duration: 2000 });
      return true;
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.saveFailed"), { duration: 3000 });
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Pausieren / Fortsetzen / Abschließen wirkt sofort. Ungespeicherte Änderungen
  // werden vorher mitgespeichert, damit nichts verloren geht.
  const changeStatus = async (ex, action) => {
    setMenuFor(null);
    if (isDirty) {
      const ok = await doSave(exercises, { quiet: true });
      if (!ok) return;
    }
    try {
      const { data } = await api.post(`/goals/me/exercises/${encodeURIComponent(ex.key)}/status`, { action });
      applyGoals(data);
      toast.success(t(`settings.status.${action}`, { name: exerciseLabel(ex) }), { duration: 2000 });
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.error"), { duration: 3000 });
    }
  };

  // Alle aktiven Übungen pausieren bzw. alle pausierten fortsetzen (ersetzt Urlaub/Krank)
  const pauseAll = async (action) => {
    if (isDirty) {
      const ok = await doSave(exercises, { quiet: true });
      if (!ok) return;
    }
    try {
      const { data } = await api.post("/goals/me/pause-all", { action });
      applyGoals(data);
      toast.success(t(action === "pause" ? "pauseAll.pausedToast" : "pauseAll.resumedToast"), { duration: 2200 });
    } catch (e) {
      toast.error(e.response?.data?.detail || t("common.error"), { duration: 3000 });
    }
  };

  // Name verlassen: steht eine Variante im Namen ("Liegestütze +20 kg"), wandert sie
  // ins Varianten-Feld (auch bei gespeicherten Übungen; gewechselt wird beim Speichern).
  const pullVariantFromName = (idx, ex) => {
    const { name, variant } = splitVariant(ex.name);
    if (!variant) return;
    if (isNew(ex) && (ex.variant || "").trim()) return;
    updateExercise(idx, { name, variant });
    setVariantOpen((o) => ({ ...o, [ex.key]: true }));
    toast(t("settings.variantDetected", { variant }), { duration: 2000 });
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    if (isNew(target)) {
      setExercises((prev) => prev.filter((e) => e.key !== target.key));
      return;
    }
    const ok = await doSave(exercises.filter((e) => e.key !== target.key), { quiet: true });
    if (ok) toast.success(t("settings.deleted", { name: target.name }), { duration: 2000 });
  };

  const resetStart = async () => {
    try {
      await api.post("/goals/me/reset-start");
      toast.success(t("settings.resetDone"), { duration: 2500 });
      await loadGoals();
    } catch (e) {
      toast.error(t("settings.resetFailed"), { duration: 2500 });
    } finally {
      setShowResetConfirm(false);
    }
  };

  // Aufteilung für die Anzeige (Indizes beziehen sich auf `exercises`).
  const shownState = previewState || state;
  const activeList = exercises
    .map((ex, idx) => ({ ex, idx }))
    .filter(({ ex }) => statusOf(state[ex.key]) === "active");
  const pausedList = exercises.filter((ex) => statusOf(state[ex.key]) === "paused");
  const completedList = exercises.filter((ex) => statusOf(state[ex.key]) === "completed");
  useEffect(() => {
    if (sectionPicked.current || !originalExercises.length) return;
    sectionPicked.current = true;
    if (originalExercises.every(isActivity)) setSection("activity");
  }, [originalExercises]);

  const tableExercises = exercises.filter((ex) => !isActivity(ex) && statusOf(state[ex.key]) !== "completed");

  const rows = useMemo(() => {
    if (!tableExercises.length) return [];
    const progs = tableExercises.map((ex) => shownState[ex.key]?.progression || []);
    const lastWeek = Math.max(currentWeek, ...progs.map((p) => (p.length ? p[p.length - 1].week : 1)));
    const out = [];
    for (let w = 1; w <= lastWeek; w++) {
      out.push({ week: w, cells: progs.map((p) => p.find((c) => c.week === w) || null) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(tableExercises.map((e) => e.key)), shownState, currentWeek]);

  const tableScrollRef = useRef(null);
  const currentRowRef = useRef(null);
  useEffect(() => {
    if (!currentRowRef.current || !tableScrollRef.current) return;
    const rowTop = currentRowRef.current.offsetTop;
    tableScrollRef.current.scrollTop = Math.max(0, rowTop - 40);
  }, [rows.length, currentWeek]);
  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <header className="border-b border-[#1A1A1A] bg-[#0A0A0A]/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lightning size={26} weight="fill" className="text-[#CCFF00]" />
            <span className="font-anton text-2xl tracking-widest">TRACKER</span>
          </div>
          <button
            onClick={(e) => { try { e.currentTarget.blur(); } catch (_) { /* ignore */ } navigate("/dashboard"); }}
            data-testid="back-to-dashboard"
            className="border border-[#222] active:border-[#CCFF00] active:text-[#CCFF00] [@media(hover:hover)]:hover:border-[#CCFF00] [@media(hover:hover)]:hover:text-[#CCFF00] focus:outline-none px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
          >
            <ArrowLeft size={16} /> {t("common.back")}
          </button>
        </div>
      </header>

      {/* Profile section */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <p className="text-xs uppercase tracking-[0.3em] text-[#CCFF00] mb-3">/ PROFILE</p>
        <h1 className="font-anton text-4xl md:text-5xl leading-none tracking-tight mb-8">
          {t("settings.account")}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-[auto,1fr] gap-6 items-start">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {profilePic ? (
                <img src={avatarSrc(profilePic)} alt="profile" className="w-32 h-32 object-cover border border-[#333]" data-testid="profile-pic-preview" />
              ) : (
                <div className="w-32 h-32 bg-[#121212] border border-[#333] flex items-center justify-center">
                  <User size={48} className="text-ink-3" />
                </div>
              )}

              <button
                onClick={() => fileRef.current?.click()}
                data-testid="upload-pic-button"
                className="absolute -bottom-2 -right-2 bg-[#CCFF00] text-black p-2 hover:bg-[#D4FF33] glow-lime"
              >
                <Camera size={16} weight="bold" />
              </button>

              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" data-testid="upload-pic-input" />
            </div>

          </div>

          <div className="space-y-4">
            <div className="border border-[#222] bg-[#121212] p-5">
              <label className="text-[10px] uppercase tracking-widest text-ink-2 mb-2 block">{t("settings.displayName")}</label>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="relative flex-1 min-w-0 group">
                  <textarea
                    rows={1}
                    value={profileName}
                    onChange={(e) => {
                      setProfileName(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = e.target.scrollHeight + "px";
                    }}
                    ref={(el) => {
                      if (el) {
                        el.style.height = "auto";
                        el.style.height = el.scrollHeight + "px";
                      }
                    }}
                    className="w-full bg-transparent outline-none font-anton text-3xl text-white py-2 pr-8 resize-none overflow-hidden block"
                    style={{
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                      whiteSpace: "pre-wrap",
                      lineHeight: "1.2",
                    }}
                    data-testid="input-display-name"
                    maxLength={80}
                  />
                  <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-[#333] group-focus-within:bg-[#CCFF00] transition-colors" />
                  <PencilSimple
                    size={20}
                    weight="regular"
                    className="absolute right-0 bottom-3 text-ink-3 group-focus-within:text-[#CCFF00] transition-colors pointer-events-none"
                    data-testid="display-name-edit-icon"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0 pb-2">
                  <span
                    className="font-anton text-3xl text-[#CCFF00] leading-none tracking-wider select-all whitespace-nowrap"
                    data-testid="profile-handle"
                  >
                    #{user.handle || "—"}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const tag = `${profileName || user.name}#${user.handle || ""}`;
                      try {
                        if (navigator.clipboard?.writeText) {
                          await navigator.clipboard.writeText(tag);
                        } else {
                          const ta = document.createElement("textarea");
                          ta.value = tag;
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand("copy");
                          document.body.removeChild(ta);
                        }
                        setHandleCopied(true);
                        toast.success(t("common.copied"), { duration: 2000 });
                        setTimeout(() => setHandleCopied(false), 1800);
                      } catch (e) {
                        toast.error(t("common.copyFailed"), { duration: 2000 });
                      }
                    }}
                    data-testid="copy-handle-button"
                    title={t("settings.copyTag")}
                    className="text-ink-3 hover:text-[#CCFF00] transition-colors p-0 bg-transparent border-0"
                  >
                    {handleCopied ? <Check size={20} weight="bold" /> : <Copy size={20} weight="bold" />}
                  </button>
                </div>
              </div>
              {/* Einladungslink direkt beim eigenen Code (Plan 4b) */}
              <InviteBox handle={user.handle} embedded />
            </div>
            <div className="border border-[#222] bg-[#121212] p-5">
              <label className="text-[10px] uppercase tracking-widest text-ink-2 mb-2 block">{t("settings.email")}</label>
              <p className="font-anton text-xl text-ink-3">{user.email}</p>
            </div>

            <button
              onClick={saveProfile}
              disabled={savingProfile}
              data-testid="save-profile-button"
              data-dirty={profileDirty ? "1" : "0"}
              className="w-full md:w-auto justify-center bg-[#CCFF00] hover:bg-[#D4FF33] text-black font-bold uppercase tracking-widest py-3 px-6 flex items-center gap-2 transition-all hover:-translate-y-0.5 glow-lime disabled:opacity-60"
            >
              <FloppyDisk size={16} weight="bold" />
              {savingProfile ? t("common.saving") : t("settings.saveProfile")}
            </button>

            {/* Weitere Einstellungen: eingeklappt, damit die Seite ruhig bleibt (Dean, 2026-11-24) */}
            <div className="border border-[#222] mt-6" data-testid="more-settings">
              <button
                type="button"
                onClick={() => toggleMore(!moreOpen)}
                aria-expanded={moreOpen}
                data-testid="more-settings-toggle"
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-[#121212] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-anton text-xl tracking-tight">{t("settings.moreTitle")}</p>
                  <p className="text-xs text-ink-3 mt-1 truncate">{t("settings.moreSummary")}</p>
                </div>
                <CaretDown size={18} weight="bold" className={`shrink-0 text-ink-2 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
              </button>
              {moreOpen && (
              <div className="px-3 pb-3 sm:px-5 sm:pb-5 [&>*]:!mb-3 [&>*:last-child]:!mb-0" data-testid="more-settings-body">
            {/* Sprache: gilt sofort und für alle Geräte (am Konto gespeichert) */}
            <div className="border border-[#222] bg-[#121212] p-5 mb-10" data-testid="language-row">
              <p className="font-anton text-xl tracking-tight mb-1">{t("settings.language")}</p>
              <p className="text-xs text-ink-2 mb-3">{t("settings.languageText")}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => changeLanguage(l.code)}
                    aria-pressed={lang === l.code}
                    className={`py-2.5 border text-sm transition-colors ${lang === l.code ? "border-[#CCFF00] bg-[#CCFF00] text-black font-bold" : "border-[#222] text-ink-2 hover:border-[#444]"}`}
                    data-testid={`settings-lang-${l.code}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Erinnerung am Handy per Push (Plan 5) – am PC unsichtbar */}
            <ReminderCard platform={installPlatformName} onInstall={() => setInstallOpen(true)} />

            {/* App auf dem Handy installieren (Plan 10) – nur am Handy, am PC ausgeblendet */}
            {installPlatformName !== "desktop" && (
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5 border border-[#222] bg-[#121212] p-5 mb-10" data-testid="install-row">
              <div className="flex-1">
                <p className="font-anton text-xl tracking-tight">{t("settings.installTitle")}</p>
                <p className="text-xs text-ink-2 mt-1 leading-relaxed">
                  {installPlatformName === "installed" ? t("settings.installDone") : t("settings.installText")}
                </p>
              </div>
              {["ios", "android", "inapp"].includes(installPlatformName) && (
                <button
                  type="button"
                  onClick={() => setInstallOpen(true)}
                  data-testid="install-open"
                  className="shrink-0 border border-[#CCFF00]/60 text-[#CCFF00] hover:bg-[#CCFF00] hover:text-black uppercase tracking-widest text-xs px-4 py-2.5 transition-colors"
                >
                  {t("settings.installButton")}
                </button>
              )}
            </div>
)}
            <InstallSheet open={installOpen} platform={installPlatformName} forced onClose={() => setInstallOpen(false)} />

            {/* Crew: Einladungslink + Anfragen empfangen (Plan 4b) */}
            <div className="space-y-4 mb-10" data-testid="crew-settings">
              <div className="flex items-center gap-5 border border-[#222] bg-[#121212] p-5" data-testid="accept-requests-row">
                <button
                  type="button"
                  role="switch"
                  aria-checked={acceptRequests}
                  onClick={() => toggleAcceptRequests(!acceptRequests)}
                  data-testid="accept-requests-toggle"
                  className={`relative w-14 h-7 border transition-colors flex-shrink-0 ${acceptRequests ? "bg-[#CCFF00] border-[#CCFF00]" : "bg-[#0A0A0A] border-[#333] hover:border-[#555]"}`}
                >
                  <span className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 transition-all ${acceptRequests ? "left-[30px] bg-black" : "left-0.5 bg-[#555]"}`} />
                </button>
                <div className="flex-1">
                  <p className="font-anton text-xl tracking-tight">{t("settings.acceptRequests")}</p>
                  <p className="text-xs text-ink-2 mt-1 leading-relaxed">{t("settings.acceptRequestsText")}</p>
                </div>
              </div>
            </div>

            {/* Mikrofon-Funktionen (pro Gerät): aus = keine Mikro-Knöpfe bei Stoppuhr und Eintragen */}
            {speechSupported() && (
              <div className="flex items-center gap-5 border border-[#222] bg-[#121212] p-5 mb-10" data-testid="mic-row">
                <button
                  type="button"
                  role="switch"
                  aria-checked={micOn}
                  onClick={() => {
                    const v = !micOn;
                    setMicOn(v);
                    setMicEnabled(v);
                    toast.success(v ? t("settings.micOn") : t("settings.micOff"), { duration: 2000 });
                  }}
                  data-testid="mic-toggle"
                  className={`relative w-14 h-7 border transition-colors flex-shrink-0 ${micOn ? "bg-[#CCFF00] border-[#CCFF00]" : "bg-[#0A0A0A] border-[#333] hover:border-[#555]"}`}
                >
                  <span className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 transition-all ${micOn ? "left-[30px] bg-black" : "left-0.5 bg-[#555]"}`} />
                </button>
                <div className="flex-1">
                  <p className="font-anton text-xl tracking-tight">{t("settings.mic")}</p>
                  <p className="text-xs text-ink-2 mt-1 leading-relaxed">{t("settings.micText")}</p>
                </div>
              </div>
            )}

            {/* Eintragen per Sprache: „fertig“ trägt direkt ein – oder erst prüfen */}
            {speechSupported() && micOn && (
              <div className="flex items-center gap-5 border border-[#222] bg-[#121212] p-5 mb-10" data-testid="voice-confirm-row">
                <button
                  type="button"
                  role="switch"
                  aria-checked={confirmOn}
                  onClick={() => {
                    const v = !confirmOn;
                    setConfirmOn(v);
                    setVoiceConfirm(v);
                  }}
                  data-testid="voice-confirm-toggle"
                  className={`relative w-14 h-7 border transition-colors flex-shrink-0 ${confirmOn ? "bg-[#CCFF00] border-[#CCFF00]" : "bg-[#0A0A0A] border-[#333] hover:border-[#555]"}`}
                >
                  <span className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 transition-all ${confirmOn ? "left-[30px] bg-black" : "left-0.5 bg-[#555]"}`} />
                </button>
                <div className="flex-1">
                  <p className="font-anton text-xl tracking-tight">{t("settings.voiceConfirm")}</p>
                  <p className="text-xs text-ink-2 mt-1 leading-relaxed">{t("settings.voiceConfirmText")}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-5 border border-[#222] bg-[#121212] p-5 mb-10" data-testid="remember-me-row">
              <button
                type="button"
                role="switch"
                aria-checked={rememberMe}
                onClick={() => toggleRememberMe(!rememberMe)}
                disabled={savingPrefs}
                data-testid="remember-me-toggle"
                className={`relative w-14 h-7 border transition-colors flex-shrink-0 ${rememberMe ? "bg-[#CCFF00] border-[#CCFF00]" : "bg-[#0A0A0A] border-[#333] hover:border-[#555]"} disabled:opacity-60`}
              >
                <span className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 transition-all ${rememberMe ? "left-[30px] bg-black" : "left-0.5 bg-[#555]"}`} />
              </button>

              <div className="flex-1">
                <p className="font-anton text-xl tracking-tight">{t("settings.remember")}</p>
                <p className="text-xs text-ink-2 mt-1 leading-relaxed">
                  {rememberMe ? t("settings.rememberOnText") : t("settings.rememberOffText")}
                </p>
              </div>
            </div>

            {/* Geführte Tour neu starten (Plan 4a) */}
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5 border border-[#222] bg-[#121212] p-5 mb-10" data-testid="tour-row">
              <div className="flex-1">
                <p className="font-anton text-xl tracking-tight">{t("settings.tour")}</p>
                <p className="text-xs text-ink-2 mt-1 leading-relaxed">{t("settings.tourText")}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try { await api.put("/me/tour", { step: 0 }); } catch { /* egal, startet trotzdem */ }
                  setUser({ ...user, tour_step: 0 });
                  navigate("/dashboard");
                }}
                data-testid="tour-start"
                className="shrink-0 border border-[#CCFF00]/60 text-[#CCFF00] hover:bg-[#CCFF00] hover:text-black uppercase tracking-widest text-xs px-4 py-2.5 transition-colors"
              >
                {t("settings.tourStart")}
              </button>
            </div>

            {/* Eigene Daten: herunterladen / Konto löschen (DSGVO) */}
            <MyData handle={user.handle} onDeleted={() => { setUser(null); navigate("/", { replace: true }); }} />
              </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-6">
        <div className="border-t border-[#1A1A1A]" />
      </div>

      {/* Exercises */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <p className="text-xs uppercase tracking-[0.3em] text-[#CCFF00] mb-3">{t("settings.goalsKicker")}</p>
        <h2 className="font-anton text-4xl md:text-5xl leading-none tracking-tight mb-3">{t("settings.goalsTitle")}</h2>
        <div className="flex border border-[#222] w-full max-w-sm mb-5" role="tablist" data-testid="section-tabs">
          {["exercise", "activity"].map((sec) => (
            <button
              key={sec}
              type="button"
              role="tab"
              aria-selected={section === sec}
              onClick={() => { setSection(sec); setMenuFor(null); }}
              data-testid={`section-${sec}`}
              className={`flex-1 py-2.5 text-[11px] uppercase tracking-widest transition-colors ${section === sec ? "bg-[#CCFF00] text-black font-bold" : "text-ink-2 hover:text-white"}`}
            >
              {t(sec === "activity" ? "settings.tabActivities" : "settings.tabExercises")}
            </button>
          ))}
        </div>
        <p className="text-ink-2 max-w-xl leading-relaxed mb-6 text-pretty">
          {section === "activity" ? t("settings.activitiesText") : t("settings.goalsText", { n: DELOAD_AFTER_MISSES })}
        </p>

        {section === "exercise" && (
        <div className="flex items-center gap-5 border border-[#222] bg-[#121212] p-5 mb-8 max-w-xl" data-testid="hide-boost-buttons-row">
          <button
            type="button"
            role="switch"
            aria-checked={activateBoost}
            onClick={() => toggleHideBoostButtons(!activateBoost)}
            disabled={savingHideBoost}
            data-testid="hide-boost-buttons-toggle"
            className={`relative w-14 h-7 border transition-colors flex-shrink-0 ${activateBoost ? "bg-[#FF8800] border-[#FF8800]" : "bg-[#0A0A0A] border-[#333] hover:border-[#555]"} disabled:opacity-60`}
          >
            <span className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 transition-all ${activateBoost ? "left-[30px] bg-black" : "left-0.5 bg-[#555]"}`} />
          </button>
          <div>
            <p className="font-anton text-xl tracking-tight flex items-center gap-2">
              <Flame size={16} weight="fill" className="text-[#FF8800]" /> {t("settings.boostToggle")}
            </p>
            <p className="text-xs text-ink-2 mt-1 leading-relaxed">
              {t("settings.boostText")}
            </p>
          </div>
        </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {activeList.filter(({ ex }) => typeOf(ex) === section).map(({ ex, idx }, pos) => {
            const isAct = isActivity(ex);
            const isDragged = dragGhost && dragGhost.exercise?.key === ex.key;
            const st = state[ex.key];
            const fresh = isNew(ex);
            const sug = fresh ? suggestForName(ex.name, t("suggest.sec")) : null; // graue Vorschläge
            const goalNow = savedGoal(ex);
            const base = fmtNum(ex.base_value, ex.unit);
            const inStartWeek = fresh || (ex.added_week || 1) === currentWeek;
            const goalChanged = !fresh && String(ex.goal_input) !== String(goalNow);
            const missStreak = st?.miss_streak || 0;
            const boostedNow = (st?.effective_boost_weeks || []).includes(currentWeek);
            return (
              <div
                key={ex.key}
                data-exercise-idx={idx}
                onPointerDown={handleExercisePointerDown(idx)}
                onPointerMove={handleExercisePointerMove}
                onPointerUp={handleExercisePointerUp}
                onPointerCancel={handleExercisePointerCancel}
                onContextMenu={(e) => { if (dragGhost) e.preventDefault(); }}
                onDragStart={(e) => e.preventDefault()}
                style={{
                  opacity: isDragged ? 0.35 : 1,
                  transition: dragGhost ? "transform 180ms ease, opacity 120ms ease" : "border-color 120ms ease",
                  touchAction: "auto",
                  WebkitTapHighlightColor: "transparent",
                  userSelect: dragGhost ? "none" : "auto",
                  WebkitUserSelect: dragGhost ? "none" : "auto",
                  cursor: dragGhost ? "grabbing" : undefined,
                  contain: "layout",
                }}
                className={`border ${isDragged ? "border-[#CCFF00]" : "border-[#222]"} bg-[#121212] p-5 space-y-4 relative`}
                data-testid={`exercise-card-${ex.key}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest" style={{ color: ex.color }}>
                    <button
                      type="button"
                      data-drag-handle
                      onPointerDown={handleExercisePointerDown(idx)}
                      onPointerMove={handleExercisePointerMove}
                      onPointerUp={handleExercisePointerUp}
                      onPointerCancel={handleExercisePointerCancel}
                      onDragStart={(e) => e.preventDefault()}
                      title={t("settings.dragTitle")}
                      aria-label={t("settings.dragAria")}
                      data-testid={`drag-handle-${ex.key}`}
                      style={{ touchAction: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent" }}
                      className="w-6 h-6 -ml-1 flex items-center justify-center text-ink-3 hover:text-[#CCFF00] cursor-grab active:cursor-grabbing transition-colors"
                    >
                      <DotsSixVertical size={16} weight="bold" />
                    </button>
                    <ExerciseIcon icon={ex.icon} size={14} /> {t(isAct ? "settings.activityN" : "settings.exerciseN", { n: pos + 1 })}
                    {fresh && <span className="ml-1 px-1.5 py-0.5 bg-[#CCFF00] text-black text-[10px] font-bold">{t("settings.new")}</span>}
                  </div>
                  <div className="relative" data-no-drag data-exercise-menu>
                    <button
                      type="button"
                      onClick={() => setMenuFor((m) => (m === ex.key ? null : ex.key))}
                      aria-label={t("settings.optionsFor", { name: ex.name })}
                      aria-expanded={menuFor === ex.key}
                      data-testid={`exercise-menu-${ex.key}`}
                      className={`w-7 h-7 flex items-center justify-center border transition-colors ${menuFor === ex.key ? "border-[#555] text-white bg-[#1A1A1A]" : "border-transparent text-ink-3 hover:text-white hover:border-[#333]"}`}
                    >
                      <DotsThreeVertical size={18} weight="bold" />
                    </button>
                    {menuFor === ex.key && (
                      <div className="absolute right-0 top-full mt-1 z-30 min-w-[200px] border border-[#333] bg-[#0A0A0A] shadow-[0_10px_30px_rgba(0,0,0,0.6)]" role="menu">
                        {!fresh && (
                          <>
                            <button role="menuitem" onClick={() => changeStatus(ex, "complete")} className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs uppercase tracking-widest text-[#CFCFCF] hover:bg-[#151515] hover:text-white" data-testid={`complete-exercise-${ex.key}`}>
                              <FlagCheckered size={14} weight="fill" /> {t("settings.complete")}
                            </button>
                            <button role="menuitem" onClick={() => changeStatus(ex, "pause")} className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs uppercase tracking-widest text-[#CFCFCF] hover:bg-[#151515] hover:text-white border-t border-[#1A1A1A]" data-testid={`pause-exercise-${ex.key}`}>
                              <Pause size={14} weight="fill" /> {t("settings.pause")}
                            </button>
                          </>
                        )}
                        <button role="menuitem" onClick={() => { setMenuFor(null); setDeleteTarget(ex); }} className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs uppercase tracking-widest text-[#FF3B30] hover:bg-[#1A0D0C] border-t border-[#1A1A1A]" data-testid={`remove-exercise-${ex.key}`}>
                          <Trash size={14} /> {t("common.delete")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-end gap-3">
                  <IconPicker
                    value={ex.icon}
                    onChange={(k) => updateExercise(idx, { icon: k, iconManual: true })}
                    color={ex.color}
                    auto={!iconIsManual(ex) && iconForExercise(ex.name) === ex.icon}
                    testid={`icon-picker-${ex.key}`}
                  />
                  <input
                    type="text"
                    value={ex.name}
                    onChange={(e) => renameExercise(idx, ex, e.target.value)}
                    onBlur={() => { if (!isAct) pullVariantFromName(idx, ex); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
                    className="min-w-0 flex-1 h-[42px] bg-transparent border-b-2 border-[#333] focus:border-[#CCFF00] outline-none font-anton text-2xl text-white py-1 transition-colors placeholder:text-ink-3"
                    placeholder={fresh ? t(isAct ? "settings.newActivity" : "settings.newExercise") : t("common.name")}
                    autoFocus={fresh && !ex.name}
                    maxLength={40}
                    data-testid={`input-name-${ex.key}`}
                  />
                </div>

                {/* Variante direkt in der Karte (Dean 2026-11-25); ohne Variante nur „+ Variante“.
                    Bleibt offen, solange ein Wechsel ansteht (auch wenn man sie leert = zurück zur Grundübung). */}
                {isAct ? null : (ex.variant || variantOpen[ex.key] || (!fresh && variantChange(ex))) ? (
                  <>
                  <div className="flex items-center gap-3 -mt-2">
                    {/* Label so breit wie der Icon-Knopf: Feld beginnt bündig mit dem Namen */}
                    <label htmlFor={`variant-${ex.key}`} className="w-[52px] shrink-0 text-[10px] uppercase tracking-wider text-ink-3 overflow-hidden">{t("settings.variant")}</label>
                    <input
                      id={`variant-${ex.key}`}
                      type="text"
                      value={ex.variant || ""}
                      onChange={(e) => updateExercise(idx, { variant: e.target.value })}
                      placeholder={t("settings.variantPlaceholder")}
                      maxLength={30}
                      autoFocus={!ex.variant}
                      className="min-w-0 flex-1 h-8 bg-[#0A0A0A] border border-[#222] focus:border-[#CCFF00] outline-none px-2 text-sm text-white placeholder:text-ink-3 transition-colors"
                      data-testid={`input-variant-${ex.key}`}
                    />
                  </div>
                  {(() => {
                    const c = !fresh && variantChange(ex);
                    if (!c) return null;
                    return (
                      <p className="text-[10px] text-[#CCFF00] leading-snug -mt-1" data-testid={`variant-hint-${ex.key}`}>
                        {t(c.to ? "settings.variantSaveHint" : "settings.variantSaveHintBase", {
                          name: exerciseLabel({ ...ex, variant: c.to }),
                          start: formatAmount(c.start, ex.unit, locale).replace(" ", "\u00a0"),
                        })}
                      </p>
                    );
                  })()}
                  </>
                ) : (
                  <div className="flex items-center gap-2 -mt-2 min-h-4 text-[10px] uppercase tracking-widest">
                    {ex.variant && (
                      <span className="text-ink-2 normal-case tracking-normal text-xs truncate" data-testid={`variant-${ex.key}`}>
                        <span className="uppercase tracking-widest text-[10px] text-ink-3 mr-2">{t("settings.variant")}</span>{ex.variant}
                      </span>
                    )}
                    <button
                      type="button"
                      data-no-drag
                      onClick={() => setVariantOpen((o) => ({ ...o, [ex.key]: true }))}
                      className="uppercase tracking-widest text-ink-3 hover:text-[#CCFF00] transition-colors"
                      data-testid={`variant-button-${ex.key}`}
                    >
                      {ex.variant ? t("settings.variantChange") : t("settings.variantAdd")}
                    </button>
                  </div>
                )}

                {isAct ? (() => {
                  const per = Number(String(ex.goal_input ?? "").trim() || goalNow || ex.base_value || 2) || 2;
                  const setPer = (n) => {
                    const v = Math.max(1, Math.min(7, n));
                    updateExercise(idx, inStartWeek ? { goal_input: String(v), base_value: v } : { goal_input: String(v) });
                  };
                  return (
                    <div className="flex items-end justify-between gap-3" data-no-drag>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-ink-3 mb-1">{t("settings.perWeek")}</p>
                        <div className="flex items-center border border-[#2A2A2A] h-[42px]" data-testid={`per-week-${ex.key}`}>
                          <button type="button" onClick={() => setPer(per - 1)} disabled={per <= 1} className="w-10 h-full text-ink-2 hover:text-[#CCFF00] disabled:opacity-30" aria-label="−" data-testid={`per-week-dec-${ex.key}`}>−</button>
                          <span className="font-anton text-xl w-12 text-center border-x border-[#2A2A2A] leading-[40px]" data-testid={`per-week-value-${ex.key}`}>{per}</span>
                          <button type="button" onClick={() => setPer(per + 1)} disabled={per >= 7} className="w-10 h-full text-ink-2 hover:text-[#CCFF00] disabled:opacity-30" aria-label="+" data-testid={`per-week-inc-${ex.key}`}>+</button>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-start">
                  <div className="flex flex-col items-center">
                    <label className="text-[10px] uppercase tracking-widest text-ink-3 mb-1 h-4 flex items-center gap-1" htmlFor={`goal-${ex.key}`}>
                      {inStartWeek ? t("settings.startValue") : t("settings.goalNow")}
                    </label>
                    <input
                      id={`goal-${ex.key}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={ex.goal_input}
                      placeholder={fresh ? String(sug?.start ?? NEW_GOAL_DEFAULT) : String(goalNow)}
                      step={(ex.unit || "").toLowerCase().includes("km") ? 0.5 : 1}
                      onChange={(e) => updateExercise(idx, inStartWeek
                        ? { goal_input: e.target.value, base_value: e.target.value === "" ? (fresh ? (sug?.start ?? NEW_GOAL_DEFAULT) : base) : Number(e.target.value) || 0 }
                        : { goal_input: e.target.value })}
                      className={`w-full h-[42px] bg-[#0A0A0A] border outline-none font-anton text-xl text-center px-2 transition-colors text-white placeholder:text-ink-3 focus:border-[#CCFF00] ${goalChanged ? "border-[#CCFF00]/60" : "border-[#222]"}`}
                      data-testid={`input-goal-${ex.key}`}
                    />
                  </div>
                  <div className="flex flex-col items-center">
                    <label className="text-[10px] uppercase tracking-widest text-ink-3 mb-1 h-4 flex items-center" htmlFor={`unit-${ex.key}`}>{t("settings.unit")}</label>
                    <input
                      id={`unit-${ex.key}`}
                      type="text"
                      value={ex.unit}
                      onChange={(e) => updateExercise(idx, { unit: e.target.value })}
                      placeholder={sug?.unit || t("settings.unitPlaceholder")}
                      maxLength={20}
                      className="w-full h-[42px] bg-[#0A0A0A] border border-[#222] outline-none font-anton text-xl text-center px-2 placeholder:text-ink-3 placeholder:font-sans placeholder:text-xs placeholder:tracking-wide transition-colors text-white focus:border-[#CCFF00]"
                      data-testid={`input-unit-${ex.key}`}
                    />
                  </div>
                  <div className="flex flex-col items-center" data-testid={`gear-wrap-${ex.key}`}>
                    <label className="text-[10px] uppercase tracking-widest text-ink-3 mb-1 h-4 flex items-center pointer-events-none">{t("settings.increase")}</label>
                    <div className="h-[42px] flex items-center justify-center">
                      <GearPicker
                        value={clampPct(ex.progression_pct)}
                        onChange={(n) => updateExercise(idx, { progression_pct: n })}
                        color={ex.color}
                        testid={`gear-${ex.key}`}
                      />
                    </div>
                  </div>
                </div>
                )}

                {/* Hinweise zum Ziel: Startwert, Zurücksetzen, Boost, Abzug */}
                {!fresh && !isAct && (
                  <div className="text-[10px] uppercase tracking-widest text-ink-3 leading-relaxed space-y-1 -mt-1">
                    {!inStartWeek && (
                      <p className="flex items-center gap-2 flex-wrap">
                        <span>{t("settings.startAt", { week: ex.added_week || 1 })}: {formatAmount(base, ex.unit, locale)}</span>
                        {Number(ex.goal_input) !== base && (
                          <button
                            type="button"
                            data-no-drag
                            onClick={() => updateExercise(idx, { goal_input: String(base) })}
                            className="uppercase tracking-widest text-ink-2 hover:text-[#CCFF00] underline underline-offset-2"
                            data-testid={`reset-goal-${ex.key}`}
                          >
                            {t("settings.resetToStart")}
                          </button>
                        )}
                        {goalChanged && (
                          <button
                            type="button"
                            data-no-drag
                            onClick={() => updateExercise(idx, { goal_input: String(goalNow) })}
                            className="uppercase tracking-widest text-ink-2 hover:text-white underline underline-offset-2"
                          >
                            {t("settings.undo")}
                          </button>
                        )}
                      </p>
                    )}
                    {boostedNow && <p className="text-[#FF8800]">{t("settings.boostedNow")}</p>}
                    {missStreak > 0 && (
                      <p className="text-[#FF8800]/80">
                        {t("settings.missStreak", { n: missStreak, left: DELOAD_AFTER_MISSES - missStreak })}
                      </p>
                    )}
                  </div>
                )}

              </div>
            );
          })}
          {notDoneCount < MAX_EXERCISES && (
            <button
              onClick={() => addExercise(section)}
              data-testid={section === "activity" ? "add-activity-button" : "add-exercise-button"}
              className={`border border-dashed border-[#333] hover:border-[#CCFF00] hover:text-[#CCFF00] text-ink-2 transition-colors flex md:flex-col items-center justify-center gap-2 md:gap-3 px-4 py-4 text-xs uppercase tracking-widest ${section === "activity" ? "md:min-h-[180px]" : "md:min-h-[240px]"}`}
            >
              <Plus size={14} weight="bold" className="md:w-6 md:h-6" />
              <span>{t(section === "activity" ? "settings.addActivity" : "settings.addExercise")}</span>
              <span className="text-ink-3">{notDoneCount}/{MAX_EXERCISES}</span>
            </button>
          )}
        </div>

        {/* Ideen zum Durchblättern (nur Aktivitäten) */}
        {section === "activity" && (() => {
          const idea = ACTIVITY_IDEAS[ideaIdx % ACTIVITY_IDEAS.length];
          const name = t(`idea.${idea.key}.name`);
          const have = exercises.some((ex) => isActivity(ex) && (ex.name || "").trim().toLowerCase() === name.toLowerCase());
          return (
            <div className="border border-[#333] bg-gradient-to-br from-[#161616] to-[#0E0E0E] p-4 mb-8 max-w-xl" data-testid="activity-ideas">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#CCFF00]">💡 {t("settings.ideas")}</p>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setIdeaIdx((i) => (i + ACTIVITY_IDEAS.length - 1) % ACTIVITY_IDEAS.length)} className="w-8 h-8 border border-[#333] text-ink-2 hover:text-[#CCFF00] hover:border-[#CCFF00] flex items-center justify-center" aria-label={t("common.back")} data-testid="idea-prev"><CaretLeft size={14} weight="bold" /></button>
                  <button type="button" onClick={() => setIdeaIdx((i) => (i + 1) % ACTIVITY_IDEAS.length)} className="w-8 h-8 border border-[#333] text-ink-2 hover:text-[#CCFF00] hover:border-[#CCFF00] flex items-center justify-center" aria-label={t("common.next")} data-testid="idea-next"><CaretRight size={14} weight="bold" /></button>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <span className="w-11 h-11 border border-[#CCFF00] text-[#CCFF00] flex items-center justify-center shrink-0"><ExerciseIcon icon={idea.icon} size={22} /></span>
                <div className="min-w-0">
                  <p className="font-anton text-xl leading-tight">{name} · {t("settings.timesPerWeek", { n: idea.per })}</p>
                  <p className="text-xs text-ink-2 mt-0.5">{t(`idea.${idea.key}.text`)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <button
                  type="button"
                  onClick={() => addExercise("activity", idea)}
                  disabled={have || notDoneCount >= MAX_EXERCISES}
                  className="bg-[#CCFF00] text-black font-bold uppercase tracking-widest text-[11px] px-3 py-2 flex items-center gap-1.5 hover:bg-[#D4FF33] disabled:bg-[#2A2A2A] disabled:text-ink-3"
                  data-testid="idea-take"
                >
                  {have ? <><Check size={14} weight="bold" /> {t("settings.ideaHave")}</> : <><Plus size={14} weight="bold" /> {t("settings.ideaTake")}</>}
                </button>
                <div className="flex gap-1">
                  {ACTIVITY_IDEAS.map((it, i) => <span key={it.key} className={`w-1.5 h-1.5 ${i === ideaIdx % ACTIVITY_IDEAS.length ? "bg-[#CCFF00]" : "bg-[#333]"}`} />)}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Speichern-Leiste: klebt unten, sobald es ungespeicherte Änderungen gibt */}
        <div className={`flex flex-wrap items-center gap-3 mb-12 ${isDirty ? "sticky bottom-4 z-20 bg-[#0A0A0A]/90 backdrop-blur border border-[#CCFF00]/40 p-3 -mx-3" : ""}`}>
          <button
            onClick={() => doSave()}
            disabled={saving || !isDirty}
            data-testid="save-goals-button"
            className="w-full md:w-auto justify-center bg-[#CCFF00] hover:bg-[#D4FF33] text-black font-bold uppercase tracking-widest py-3 px-6 flex items-center gap-2 transition-all hover:-translate-y-0.5 glow-lime disabled:opacity-40 disabled:hover:translate-y-0"
          >
            <FloppyDisk size={16} weight="bold" /> {saving ? t("common.saving") : isDirty ? t("settings.saveChanges") : t("settings.allSaved")}
          </button>
          {isDirty && (
            <button
              onClick={() => { setExercises(JSON.parse(JSON.stringify(originalExercises))); setPreviewState(null); }}
              data-testid="discard-goals-button"
              className="w-full md:w-auto justify-center border border-[#222] hover:border-[#444] py-3 px-5 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
            >
              <X size={14} /> {t("settings.discard")}
            </button>
          )}
        </div>

        {/* Pausierte Übungen */}
        {pausedList.length > 0 && (
          <div className="mb-10" data-testid="paused-exercises">
            <h3 className="font-anton text-2xl tracking-tight mb-1 flex items-center gap-2"><Pause size={18} weight="fill" className="text-ink-2" /> {t("settings.pausedTitle")}</h3>
            <p className="text-xs text-ink-2 mb-1">{t("settings.pausedText")}</p>
            <div className="max-w-xl mb-4"><PauseLossInfo /></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {pausedList.map((ex) => {
                const prog = state[ex.key]?.progression || [];
                const since = prog.find((p) => p.status === "paused" && p.week >= (ex.added_week || 1) && prog.slice(prog.indexOf(p)).every((q) => q.week > currentWeek || q.status === "paused"));
                return (
                  <div key={ex.key} className="border border-[#222] bg-[#0E0E0E] p-4 flex flex-col gap-3" data-testid={`paused-card-${ex.key}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <ExerciseIcon icon={ex.icon} size={16} className="shrink-0 opacity-60" />
                      <span className="font-anton text-xl truncate text-ink-2">{exerciseLabel(ex)}</span>
                      <span className="ml-auto text-[10px] uppercase tracking-widest text-ink-3 shrink-0">{t("settings.since", { week: since?.week ?? currentWeek })}</span>
                    </div>
                    {(() => {
                      // Mit welchem Ziel geht es jetzt weiter? (letztes Ziel × Formverlust)
                      const weeks = currentPauseWeeks(prog, currentWeek);
                      const last = [...prog].reverse().find((p) => p.week < currentWeek && p.goal > 0)?.goal;
                      if (!last) return null;
                      const pct = pauseLossPct(weeks);
                      return (
                        <p className="text-[11px] text-ink-2 leading-snug" data-testid={`paused-goal-${ex.key}`}>
                          {t(pct < 100 ? "pause.resumeGoal" : "pause.resumeGoalSame", { goal: `${fmtNum(goalAfterPause(last, weeks, ex.unit), ex.unit)}${ex.unit ? ` ${ex.unit}` : ""}`, pct, n: weeks })}
                        </p>
                      );
                    })()}
                    <div className="flex gap-2">
                      <button onClick={() => changeStatus(ex, "resume")} className="flex-1 border border-[#CCFF00]/50 text-[#CCFF00] hover:bg-[#CCFF00] hover:text-black py-2 text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors" data-testid={`resume-exercise-${ex.key}`}>
                        <Play size={12} weight="fill" /> {t("settings.resume")}
                      </button>
                      <button onClick={() => setDeleteTarget(ex)} className="border border-[#222] hover:border-[#FF3B30] hover:text-[#FF3B30] text-ink-3 px-3 transition-colors" aria-label={t("settings.deleteAria", { name: ex.name })}>
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Alle auf einmal (ersetzt Urlaub/Krank): erst sichtbar, wenn schon etwas pausiert ist */}
            <div className="flex flex-wrap gap-2 mt-4" data-testid="pause-all-row">
              {activeList.length > 0 && (
                <button type="button" onClick={() => pauseAll("pause")} data-testid="pause-all"
                  className="inline-flex items-center gap-2 border border-[#333] text-ink-2 hover:text-white hover:border-[#555] uppercase tracking-widest text-[10px] px-4 py-2.5 transition-colors">
                  <Pause size={12} weight="fill" /> {t("pauseAll.pauseAll")}
                </button>
              )}
              {pausedList.length > 1 && (
                <button type="button" onClick={() => pauseAll("resume")} data-testid="resume-all"
                  className="inline-flex items-center gap-2 border border-[#CCFF00]/50 text-[#CCFF00] hover:bg-[#CCFF00] hover:text-black uppercase tracking-widest text-[10px] px-4 py-2.5 transition-colors">
                  <Play size={12} weight="fill" /> {t("pauseAll.resumeAll")}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Abgeschlossene Übungen */}
        {completedList.length > 0 && (
          <div className="mb-10" data-testid="completed-exercises">
            <h3 className="font-anton text-2xl tracking-tight mb-1 flex items-center gap-2"><FlagCheckered size={18} weight="fill" className="text-[#CCFF00]" /> {t("settings.completedTitle")}</h3>
            <p className="text-xs text-ink-2 mb-4">{t("settings.completedText")}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {completedList.map((ex) => {
                const prog = (state[ex.key]?.progression || []).filter((p) => p.week < currentWeek);
                const done = prog.filter((p) => p.status === "completed").length;
                const total = prog.filter((p) => p.status === "completed" || p.status === "missed").length;
                const lastGoal = [...prog].reverse().find((p) => p.goal > 0)?.goal || 0;
                return (
                  <div key={ex.key} className="border border-[#222] bg-[#0E0E0E] p-4 flex flex-col gap-3" data-testid={`completed-card-${ex.key}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <ExerciseIcon icon={ex.icon} size={16} className="shrink-0" />
                      <span className="font-anton text-xl truncate" style={{ color: ex.color }}>{exerciseLabel(ex)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="border border-[#1A1A1A] py-2">
                        <p className="font-anton text-lg leading-none">{done}/{total}</p>
                        <p className="text-[10px] uppercase tracking-widest text-ink-3 mt-1">{t("archive.weeksDone")}</p>
                      </div>
                      <div className="border border-[#1A1A1A] py-2">
                        <p className="font-anton text-lg leading-none">{formatNumber(fmtNum(lastGoal, ex.unit), locale)}<span className="text-[10px] text-ink-3">{ex.unit ? ` ${ex.unit}` : ""}</span></p>
                        <p className="text-[10px] uppercase tracking-widest text-ink-3 mt-1">{t("archive.lastGoal")}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => changeStatus(ex, "resume")} disabled={notDoneCount >= MAX_EXERCISES} className="flex-1 border border-[#333] hover:border-[#CCFF00] hover:text-[#CCFF00] text-ink-2 py-2 text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40" data-testid={`reopen-exercise-${ex.key}`}>
                        <ArrowCounterClockwise size={12} /> {t("settings.reopen")}
                      </button>
                      <button onClick={() => setDeleteTarget(ex)} className="border border-[#222] hover:border-[#FF3B30] hover:text-[#FF3B30] text-ink-3 px-3 transition-colors" aria-label={t("settings.deleteAria", { name: ex.name })}>
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {startDate && (
          <p className="text-xs uppercase tracking-widest text-ink-3 mb-8 text-pretty">
            {t("settings.programStarted", { date: new Date(startDate).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" }), week: currentWeek })}
          </p>
        )}

        {/* Wochen-Progression: gehört zu den Übungen (Aktivitäten haben keine Steigerung) */}
        {section === "exercise" && tableExercises.length > 0 && (
        <div className="border border-[#1A1A1A] bg-[#121212] p-4 md:p-6 mb-10" data-testid="progression-table">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h3 className="font-anton text-2xl tracking-tight">{t("settings.progressionTitle")}</h3>
            {previewState && <span className="text-[10px] uppercase tracking-widest text-[#CCFF00]">{t("settings.preview")}</span>}
          </div>
          <p className="text-[10px] md:text-xs uppercase tracking-wider md:tracking-widest text-ink-2 mb-5 flex flex-wrap gap-x-3 gap-y-1">
            <span>{t("settings.currentWeek", { week: currentWeek })}</span>
            <span><Flame size={12} weight="fill" className="inline align-middle text-[#FF8800]" /> Boost</span>
            <span><span className="text-[#FF3B30]">✕</span> {t("settings.legendMissed")}</span>
            <span><span className="text-[#CCFF00]">●</span> {t("settings.legendManual")}</span>
            <span>‖ {t("settings.legendPaused")}</span>
          </p>

          <div
            ref={tableScrollRef}
            className="overflow-y-auto overflow-x-auto max-h-[420px] md:max-h-[460px] scrollbar-dark"
            style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
            data-testid="progression-scroll"
          >
            <table className="w-full text-xs md:text-sm border-collapse" data-testid="progression-table">
              <thead className="sticky top-0 z-10 bg-[#121212]">
                <tr className="text-[10px] md:text-[10px] uppercase tracking-wider md:tracking-widest text-ink-3 border-b border-[#1A1A1A]">
                  <th className="py-2 pr-1 md:pr-4 text-left w-16 bg-[#121212]">{t("common.week")}</th>
                  {tableExercises.map((ex) => (
                    <th key={ex.key} className="py-2 px-1 md:px-4 truncate text-center bg-[#121212]" style={{ color: ex.color }}>{exerciseLabel(ex)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-anton">
                {rows.map(({ week, cells }) => {
                  const isCurrent = week === currentWeek;
                  const isPast = week < currentWeek;
                  return (
                    <tr
                      key={week}
                      ref={isCurrent ? currentRowRef : null}
                      className={`border-b border-[#1A1A1A] hover:bg-[#0E0E0E] ${isCurrent ? "bg-[#CCFF00]/[0.06]" : ""} ${isPast ? "opacity-80" : ""}`}
                      data-testid={`progression-row-${week}`}
                      style={{ height: "38px" }}
                    >
                      <td className={`py-2 pr-1 md:pr-4 text-left w-16 ${isCurrent ? "text-[#CCFF00]" : isPast ? "text-ink-3" : "text-ink-2"}`}>
                        {String(week).padStart(2, "0")}
                      </td>
                      {cells.map((cell, ci) => {
                        const ex = tableExercises[ci];
                        if (!cell || cell.status === "pre_existence") {
                          return <td key={ex.key} className="py-2 px-1 md:px-4 text-center" data-testid={`progression-cell-${week}-${ex.key}`} />;
                        }
                        if (cell.status === "paused") {
                          return <td key={ex.key} className="py-2 px-1 md:px-4 text-center text-[#333]" data-testid={`progression-cell-${week}-${ex.key}`}>‖</td>;
                        }
                        const missed = cell.status === "missed";
                        const boosted = cell.boost && !cell.voided_boost;
                        return (
                          <td key={ex.key} className={`py-2 px-1 md:px-4 ${missed ? "text-[#FF3B30]" : "text-white"}`} data-testid={`progression-cell-${week}-${ex.key}`}>
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full">
                              <span className="flex justify-end pr-1">{cell.manual && <span className="text-[#CCFF00] text-[10px]" title={t("settings.legendManual")}>●</span>}</span>
                              <span className={`tabular-nums leading-none ${missed ? "line-through decoration-2" : ""}`}>{isDistanceUnit(ex.unit) ? Number(fmtNum(cell.goal, ex.unit)).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : formatNumber(fmtNum(cell.goal, ex.unit), locale)}</span>
                              <div className="flex items-center gap-1 pl-1 min-w-0">
                                {ex.unit && <span className={`text-[10px] md:text-xs leading-none ${missed ? "text-[#FF3B30]" : "text-ink-3"}`}>{ex.unit}</span>}
                                {boosted && <Flame size={11} weight="fill" className="text-[#FF8800]" />}
                                {cell.voided_boost && <Flame size={11} weight="fill" className="text-ink-3" />}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Feedback und Neustart nebeneinander (am Handy untereinander) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch" data-testid="bottom-cards">
        <div className="border border-[#CCFF00]/30 bg-[#121212] p-5 flex flex-col items-start" data-testid="feedback-row">
          <p className="font-anton text-lg tracking-tight mb-1">{t("settings.feedbackTitle")}</p>
          <p className="text-xs text-ink-2 mb-4 leading-relaxed">{t("settings.feedbackText")}</p>
          <button
            onClick={() => setShowFeedback(true)}
            data-testid="open-feedback"
            className="mt-auto border border-[#CCFF00]/50 text-[#CCFF00] hover:bg-[#CCFF00] hover:text-black py-2.5 px-5 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
          >
            <ChatCircleText size={14} weight="fill" /> {t("settings.feedbackButton")}
          </button>
        </div>

        <div className="border border-[#2A1414] bg-[#0E0A0A] p-5 flex flex-col items-start">
          <p className="font-anton text-lg tracking-tight mb-1">{t("settings.restartTitle")}</p>
          <p className="text-xs text-ink-2 mb-4 leading-relaxed">
            {t("settings.restartText")}
          </p>
          <button
            onClick={() => setShowResetConfirm(true)}
            data-testid="reset-start-button"
            className="mt-auto border border-[#3A1A1A] hover:border-[#FF3B30] hover:text-[#FF3B30] text-[#AA6666] py-2.5 px-5 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
          >
            <ArrowCounterClockwise size={14} /> {t("settings.restartButton")}
          </button>
        </div>
        </div>
        <FeedbackDialog open={showFeedback} onClose={() => setShowFeedback(false)} />
      </section>

      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={() => setShowResetConfirm(false)}
          data-testid="reset-confirm-overlay"
        >
          <div className="bg-[#0E0E0E] border border-[#FF3B30]/50 max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" data-testid="reset-confirm-dialog">
            <h3 className="font-anton text-2xl tracking-tight mb-2">{t("settings.restartConfirmTitle")}</h3>
            <p className="text-sm text-ink-2 leading-relaxed mb-6">
              {t("settings.restartConfirmPre")} <span className="text-white font-bold">{t("settings.restartConfirmBold")}</span> {t("settings.restartConfirmPost")}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowResetConfirm(false)} data-testid="reset-confirm-no" className="flex-1 border border-[#222] hover:border-[#444] py-3 px-4 text-xs uppercase tracking-widest transition-colors">
                {t("common.noKeep")}
              </button>
              <button onClick={resetStart} data-testid="reset-confirm-yes" className="flex-1 bg-[#FF3B30] hover:bg-[#FF5C52] text-black font-bold py-3 px-4 text-xs uppercase tracking-widest transition-colors">
                {t("settings.restartYes")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={() => setDeleteTarget(null)}
          data-testid="delete-confirm-overlay"
        >
          <div className="bg-[#0E0E0E] border border-[#FF3B30]/50 max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" data-testid="delete-confirm-dialog">
            <h3 className="font-anton text-2xl tracking-tight mb-2">{t("settings.deleteTitle", { name: (exerciseLabel(deleteTarget) || t("common.exercise")).toUpperCase() })}</h3>
            {isNew(deleteTarget) ? (
              <p className="text-sm text-ink-2 leading-relaxed mb-6">{t("settings.deleteUnsaved")}</p>
            ) : (
              <>
                <p className="text-sm text-ink-2 leading-relaxed mb-3">
                  {t("settings.deleteText")}
                </p>
                {statusOf(state[deleteTarget.key]) !== "completed" && (
                  <p className="text-xs text-[#CCFF00] leading-relaxed mb-6">
                    {t("settings.deleteTip")}
                  </p>
                )}
              </>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} data-testid="delete-confirm-no" className="flex-1 border border-[#222] hover:border-[#444] py-3 px-4 text-xs uppercase tracking-widest transition-colors">
                {t("common.cancel")}
              </button>
              {!isNew(deleteTarget) && statusOf(state[deleteTarget.key]) === "active" && (
                <button onClick={() => { const target = deleteTarget; setDeleteTarget(null); changeStatus(target, "complete"); }} className="flex-1 border border-[#CCFF00]/60 text-[#CCFF00] hover:bg-[#CCFF00] hover:text-black py-3 px-4 text-xs uppercase tracking-widest transition-colors">
                  {t("settings.complete")}
                </button>
              )}
              <button onClick={confirmDelete} data-testid="delete-confirm-yes" className="flex-1 bg-[#FF3B30] hover:bg-[#FF5C52] text-black font-bold py-3 px-4 text-xs uppercase tracking-widest transition-colors">
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Drag Ghost: folgt dem Pointer beim Umsortieren der Übungen */}
      {dragGhost && dragGhost.exercise && (
        <div
          style={{
            position: "fixed",
            left: dragGhost.x - dragGhost.offsetX,
            top: dragGhost.y - dragGhost.offsetY,
            width: dragGhost.w,
            // Maximalhöhe begrenzen, damit auf Mobile nicht ein riesiger Ghost mitfliegt
            maxHeight: Math.min(dragGhost.h, 140),
            overflow: "hidden",
            pointerEvents: "none",
            zIndex: 70,
            opacity: 0.92,
            transform: "scale(1.03)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(204,255,0,0.4)",
            background: "#121212",
            border: "1px solid #CCFF00",
          }}
          data-testid="exercise-drag-ghost"
        >
          <div className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest" style={{ color: dragGhost.exercise.color }}>
              <DotsSixVertical size={16} weight="bold" />
              <ExerciseIcon icon={dragGhost.exercise.icon} size={14} /> {exerciseLabel(dragGhost.exercise)}
            </div>
            <div className="font-anton text-2xl text-white truncate">
              {dragGhost.exercise.goal_input}{dragGhost.exercise.unit ? ` ${dragGhost.exercise.unit}` : ""}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}