import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Fire, Flag } from "@phosphor-icons/react";
import ExerciseIcon from "./ExerciseIcon";
import { useI18n } from "../i18n";
import PausedPanel from "./PausedPanel";
import { EmojiSender, ChallengeButton, EmojiBurst } from "./CardActions";
import { exerciseLabel } from "../lib/exercises";
import { avatarSrc } from "../lib/api";
import { tourEvent, markFlipped, TOUR_NEED } from "../lib/tour";
import { playWeekDoneSound, playWeekFailedSound, whenAudioReady } from "../utils/soundEffects";
import { formatAmount, amountParts } from "../lib/amount";
import { CardBack } from "./card/CardBack";
import { MetricRow } from "./card/MetricRow";
import { ActivityRow } from "./card/ActivityRow";
import { isActivity } from "../lib/activities";
import { InfoIcon } from "./card/Rank";

// Touch-Device Detection: Auf Touch-Geräten lösen Tap/Swipe ein "Hover" aus,
// was zu einem ruckartigen Wechsel zwischen scale 1.03 (isActive) und
// scale 1.04 (whileHover) führt. Deshalb whileHover dort komplett deaktivieren.
function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setIsTouch(mql.matches);
    update();
    if (mql.addEventListener) mql.addEventListener("change", update);
    else mql.addListener(update);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", update);
      else mql.removeListener(update);
    };
  }, []);
  return isTouch;
}

export default function UserCard({ entry, isMe, flash, canBoost, onBoost, onCancelBoost, hasBoostedThisWeek, hideBoostButtons, celebrating, failing, pendingCelebration, pendingFailing, onCelebrationShown, onFailingShown, isOnline, isActive, seenEffects, onMarkSeen, onSendEmoji, onChallenge, burst, onBurstDone }) {
  const { t, locale } = useI18n();
  const { name, picture, week_number, values, handle, streak, all_time } = entry;
  const updated_at = entry.last_active_at || entry.updated_at; // „Stand“: letzter Eintrag, auch aus früheren Wochen
  // Übungen (Balken, Rang, Radar) und Aktivitäten (Kästchen) getrennt (Dean 2026-11-26)
  const exercises = (entry.exercises || []).filter((e) => !isActivity(e));
  const activities = (entry.exercises || []).filter(isActivity);
  const curStreak = streak?.current || 0;
  const [showInfo, setShowInfo] = useState(false);
  const infoWrapRef = useRef(null);
  const cardRef = useRef(null);
  const isTouch = useIsTouchDevice();

  const [showDone, setShowDone] = useState(false);
  const [showFail, setShowFail] = useState(false);
  const [failedWeekLabel, setFailedWeekLabel] = useState(0);
  const doneShownRef = useRef(false);
  const failShownRef = useRef(false);

  // 🔄 CARD FLIP STATE
  // flipped=false → Vorderseite, flipped=true → Rückseite.
  // Echter 3D-Flip via rotateY 0° → 180° an einem preserve-3d Container.
  // Beide Seiten haben backface-visibility:hidden → der Browser blendet
  // jeweils die Rückseite jeder Fläche automatisch aus, sobald sie über
  // 90° gedreht ist. KEIN Opacity-Crossfade mehr → kein schwarzes Aufblitzen
  // mehr in der Mitte der Drehung.
  const [flipped, setFlipped] = useState(false);
  // Eigene Karte: einmal umgedreht -> Tour weiter (Plan 4a/4b).
  useEffect(() => {
    if (!flipped || !isMe) return;
    markFlipped();
    tourEvent("card-flipped");
  }, [flipped, isMe]);
  // Tutorial per Pfeil: eigene Karte passend zum Schritt umdrehen (Rückseite / Vorderseite).
  useEffect(() => {
    if (!isMe) return undefined;
    const onNeed = (e) => {
      if (e.detail === "card-back") setFlipped(true);
      else if (e.detail === "card-front") setFlipped(false);
    };
    window.addEventListener(TOUR_NEED, onNeed);
    return () => window.removeEventListener(TOUR_NEED, onNeed);
  }, [isMe]);

  // Double-Tap / Double-Click Erkennung, die NICHT beim Scrollen auslöst:
  // - pointerdown: Startposition + Zeit merken
  // - pointermove: bei Bewegung > 10px gilt es als Scroll/Drag, nicht als Tap
  // - pointerup: war es ein "sauberer" Tap (kurz + kaum Bewegung)?
  //   → mit letztem Tap vergleichen. Wenn < 350ms her und nahe beieinander → Double-Tap.
  // Interaktive Kinder (Buttons, Inputs, Links) sind ausgenommen, damit Boost-/Info-
  // Klicks die Karte nicht ausversehen flippen.
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
  const pointerDownRef = useRef({ x: 0, y: 0, time: 0, moved: false, valid: false });

  const isInteractiveTarget = (el) => {
    if (!el || !el.closest) return false;
    return !!el.closest('button, a, input, select, textarea, [role="button"]');
  };

  const handlePointerDown = (e) => {
    if (isInteractiveTarget(e.target)) {
      pointerDownRef.current = { x: 0, y: 0, time: 0, moved: false, valid: false };
      return;
    }
    pointerDownRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      moved: false,
      valid: true,
    };
  };

  const handlePointerMove = (e) => {
    if (!pointerDownRef.current.valid) return;
    const dx = e.clientX - pointerDownRef.current.x;
    const dy = e.clientY - pointerDownRef.current.y;
    if (Math.hypot(dx, dy) > 10) {
      pointerDownRef.current.moved = true;
    }
  };

  const handlePointerUp = (e) => {
    const down = pointerDownRef.current;
    if (!down.valid) return;
    pointerDownRef.current = { x: 0, y: 0, time: 0, moved: false, valid: false };
    if (down.moved) return; // war ein Scroll/Drag
    const now = Date.now();
    if (now - down.time > 400) return; // zu langer Druck → kein Tap
    if (isInteractiveTarget(e.target)) return;

    const last = lastTapRef.current;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    const dist = Math.hypot(dx, dy);
    const gap = now - last.time;

    if (last.time > 0 && gap < 350 && dist < 30) {
      // 🎉 Double-Tap erkannt → Karte umdrehen
      setFlipped((f) => !f);
      lastTapRef.current = { time: 0, x: 0, y: 0 };
    } else {
      lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
    }
  };

  // Verhindert, dass der native Double-Click-Zoom/Selektion stört
  const handleDoubleClickNative = (e) => {
    if (isInteractiveTarget(e.target)) return;
    e.preventDefault();
  };

  // Beim 2. Mousedown innerhalb der Double-Click-Zeit das Default-Verhalten
  // (Wort-/Textmarkierung) unterdrücken, ohne Klicks auf Buttons zu kapern.
  const handleMouseDownPrevent = (e) => {
    if (isInteractiveTarget(e.target)) return;
    if (e.detail && e.detail > 1) {
      e.preventDefault();
    }
  };

  // Hilfsfunktion: hat dieser Viewer den Effekt für die aktuelle Woche schon gesehen?
  const isCelebrationSeen = () => {
    if (!seenEffects) return false;
    return seenEffects.has?.(`celebration_${entry.user_id}_${week_number}`);
  };
  // Failure-Animation gilt als "gesehen", sobald sie für (Viewer, Target, week_number)
  // einmal abgespielt wurde – auch für MICH SELBST. So replayt sie nicht bei jedem
  // Reload in derselben Folgewoche, sondern wirklich nur einmal pro User & Woche.
  const isFailureSeen = () => {
    if (!seenEffects) return false;
    return seenEffects.has?.(`failure_${entry.user_id}_${week_number}`);
  };

  // IntersectionObserver: nur noch für die VISUELLE Animation zuständig.
  // - Bei FREMDEN Usern: Effekt nur abspielen, wenn noch nicht gesehen.
  //   Nach Anzeige wird via onMarkSeen in der DB markiert.
  // - Bei MIR SELBST: Sound wird direkt hier ausgelöst, wenn die Animation
  //   erscheint (statt im Streak-Watcher) – das war das Problem mit dem
  //   Failed-Sound, der bisher nicht zuverlässig zur Animation passte.
  useEffect(() => {
    if (!pendingCelebration && !pendingFailing) return;
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e || !e.isIntersecting) return;

        // --- Celebration ---
        if (pendingCelebration && !doneShownRef.current) {
          if (!isCelebrationSeen()) {
            doneShownRef.current = true;
            setShowDone(true);
            // ⚠️ KEIN Sound hier auslösen! Der Week-Done-Sound wird
            // ausschließlich vom Streak-Watcher unten ausgelöst, wenn sich
            // mein eigener Streak erhöht. Sonst würde der Sound mehrfach
            // feuern (einmal bei Streak-Up, einmal bei Animation).
            setTimeout(() => {
              setShowDone(false);
              onCelebrationShown && onCelebrationShown(entry.user_id);
              // Auch für mich selbst merken, sonst kommt "WEEK DONE" bei jedem Neuladen.
              onMarkSeen && onMarkSeen({
                target_user_id: entry.user_id,
                week_number,
                type: "celebration",
              });
            }, 2500);
          } else {
            // Schon gesehen → trotzdem dem Hook melden, damit der Pending-Flag clearet.
            doneShownRef.current = true;
            onCelebrationShown && onCelebrationShown(entry.user_id);
          }
        }

        // --- Failing (aus missed_weeks der Vorwoche, einmal pro Betrachter und Woche) ---
        if (pendingFailing && !failShownRef.current) {
          failShownRef.current = true;
          if (isFailureSeen()) {
            onFailingShown && onFailingShown(entry.user_id);
            return;
          }
          const showFailNow = () => {
            setShowFail(true);
            setFailedWeekLabel(Math.max(1, week_number - 1));
            if (isMe) {
              try { playWeekFailedSound(); } catch (err) { /* noop */ }
            }
            setTimeout(() => {
              setShowFail(false);
              onFailingShown && onFailingShown(entry.user_id);
              onMarkSeen && onMarkSeen({ target_user_id: entry.user_id, week_number, type: "failure" });
            }, 2500);
          };
          // Browser spielen Ton erst nach dem ersten Antippen ab. Für die eigene
          // Karte warten wir darauf, damit Animation und Ton zusammen kommen.
          if (isMe) whenAudioReady(showFailNow);
          else showFailNow();
        }
      },
      { threshold: 0.35 }
    );
    obs.observe(el);
    return () => obs.disconnect();
    // isCelebrationSeen / isFailureSeen sind dünne Wrapper über
    // seenEffects, entry.user_id, week_number und isMe – alle bereits in
    // den Dependencies. Würde man die Funktionen selbst aufnehmen, würden
    // sie bei jedem Render neu erstellt werden und den Effekt unnötig
    // ständig neu starten (Endlosschleife / Performance-Problem).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCelebration, pendingFailing, isMe, entry.user_id, week_number, onCelebrationShown, onFailingShown, onMarkSeen, seenEffects]);

  const isCelebrating = celebrating || showDone;
  const isFailing = (failing || showFail) && !isCelebrating;

  useEffect(() => {
    if (!showInfo) return;
    const handler = (e) => {
      if (infoWrapRef.current && !infoWrapRef.current.contains(e.target)) {
        setShowInfo(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [showInfo]);

  // 🎵 STREAK SOUNDS – Done bei Anstieg.
  // streakInitedRef verhindert, dass ein Sound auf dem ersten Render
  // feuert (AudioContext ist dann meist noch suspended, weil noch
  // keine User-Geste passiert ist).
  // ⚠️ Der Failed-Sound wird NICHT mehr hier abgespielt, sondern direkt
  // im IntersectionObserver, wenn die "Week N failed"-Animation für mich
  // erscheint. Dadurch ist der Sound zuverlässig an die Animation gekoppelt.
  const [displayStreak, setDisplayStreak] = useState(curStreak);
  const [glowing, setGlowing] = useState(false);
  const prevStreakRef = useRef(curStreak);
  const streakInitedRef = useRef(false);

  useEffect(() => {
    const prev = prevStreakRef.current;

    if (curStreak > prev) {
      if (isMe && streakInitedRef.current) {
        playWeekDoneSound();
      }

      setGlowing(true);
      let n = prev;
      const interval = setInterval(() => {
        n += 1;
        setDisplayStreak(n);
        if (n >= curStreak) {
          clearInterval(interval);
          setTimeout(() => setGlowing(false), 1500);
        }
      }, 450);
      prevStreakRef.current = curStreak;
      streakInitedRef.current = true;
      return () => clearInterval(interval);
    }

    setDisplayStreak(curStreak);
    prevStreakRef.current = curStreak;
    streakInitedRef.current = true;
  }, [curStreak, isMe, entry.user_id, week_number]);

  const baseBorder = isMe ? "border-[#CCFF00]" : "border-[#222]";
  const overlayBorder = isCelebrating
    ? "border-2 border-[#FFD600] shadow-[inset_0_0_0_2px_rgba(255,214,0,0.4)]"
    : isFailing
    ? "border-2 border-[#FF3B30] shadow-[inset_0_0_0_2px_rgba(255,59,48,0.35)]"
    : "";
  const borderClass = overlayBorder || `border ${baseBorder}`;

  // ─────────────────────────────────────────────────────────────────────
  // 🔄 ECHTER 3D-FLIP – Aufbau
  //
  // Outer Wrapper (`perspective: 1500px`)
  //   └── motion.div (scale/hover/y-Animationen, KEIN preserve-3d, da auf
  //        dieser Ebene andere Transforms laufen, die das 3D zerstören würden)
  //         └── flip-Container (preserve-3d, animiert rotateY 0° ↔ 180°)
  //               ├── Vorderseite  (rotateY  0°, backface-visibility:hidden)
  //               └── Rückseite    (rotateY 180°, backface-visibility:hidden)
  //
  // Wichtig:
  //  • Beide Faces sind ABSOLUT positioniert und exakt deckungsgleich,
  //    damit beim Flip kein Sprung entsteht.
  //  • Die Höhe wird über die VORDERSEITE bestimmt (relative im Layout),
  //    die Rückseite liegt absolut darüber (position:absolute, inset:0).
  //  • KEINE Opacity-Transitions auf den Faces – sonst entsteht in der
  //    Mitte der Drehung ein dunkler Moment (genau das Problem von vorher).
  //  • Eigene Transform-Inline auf den Faces – damit Browser ohne
  //    perspektivischen Skip korrekt rendern (insb. Safari/iOS).
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ perspective: "1500px", overflow: "visible" }}
      className="relative h-full"
      data-testid={`user-card-wrap-${entry.user_id}`}
    >
      {/* Emoji-Animation oben rechts (geschickt oder empfangen) */}
      <EmojiBurst item={burst} onDone={onBurstDone} />
      <motion.div
        ref={cardRef}
        // Nur anheben, nicht vergrößern: Skalieren rechnet das fertige Bild hoch und macht Text
        // unscharf (Dean, 2026-11-25). Ganze Pixel bleiben scharf.
        animate={{
          y: isActive ? -4 : 0,
          zIndex: isActive ? 5 : 1,
        }}
        whileHover={isTouch ? undefined : { y: -6, zIndex: 30 }}
        transition={{
          y: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
          default: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
        }}
        style={{
          // kein dauerhaftes willChange: sonst bleibt die Karte eine Bitmap-Ebene und wirkt bei
          // Windows-Skalierung (125 %) leicht weich
          transformOrigin: "center center",
          overflow: "visible",
          // 🚫 Verhindert, dass beim (Doppel-)Klick Text markiert wird.
          userSelect: "none",
          WebkitUserSelect: "none",
          MozUserSelect: "none",
          msUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
        className="relative h-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerDownRef.current = { x: 0, y: 0, time: 0, moved: false, valid: false };
        }}
        onMouseDown={handleMouseDownPrevent}
        onDoubleClick={handleDoubleClickNative}
        data-testid={`user-card-${entry.user_id}`}
        data-tour={isMe ? "my-card" : undefined}
      >
        {/* 🔄 Flip-Container – führt ALLEIN die rotateY-Animation aus.
            Dadurch kollidiert das 3D nicht mit dem Scale/Hover-Transform
            der äußeren motion.div. */}
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: "relative",
            transformStyle: "preserve-3d",
            WebkitTransformStyle: "preserve-3d",
            willChange: "transform",
          }}
          className="relative h-full"
        >
          {/* ─────── VORDERSEITE ───────
              Bestimmt die Höhe des Flip-Containers (relative im Layout).
              Die Rückseite liegt absolut darüber. */}
          <div
            style={{
              position: "relative",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              // Eigene transform-Inline zwingt den Browser, diese Seite als
              // eigenen 3D-Layer zu rendern – verhindert Backface-Glitches in
              // Chrome/Safari.
              transform: "rotateY(0deg)",
              WebkitTransform: "rotateY(0deg)",
              pointerEvents: flipped ? "none" : "auto",
            }}
            className={`${borderClass} bg-[#121212] p-6 md:p-7 flex flex-col gap-6 h-full ${flash ? "flash-update" : ""}`}
            data-testid={`user-card-front-${entry.user_id}`}
            aria-hidden={flipped}
          >
            {isMe && (
              <div className="absolute top-2 left-2 md:-top-2 md:-left-2 bg-[#CCFF00] text-black text-[10px] font-bold tracking-widest uppercase px-2 py-1 z-10">{t("common.you")}</div>
            )}

            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                {picture ? (
                  <img src={avatarSrc(picture)} alt={name} className="w-12 h-12 object-cover border border-[#333]" />
                ) : (
                  <div className="w-12 h-12 bg-[#1A1A1A] border border-[#333] flex items-center justify-center font-anton text-xl">
                    {name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <span
                  data-testid={`presence-${entry.user_id}`}
                  title={isOnline ? "Online" : "Offline"}
                  aria-label={isOnline ? "Online" : "Offline"}
                  className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#121212] transition-colors ${
                    isOnline
                      ? "bg-[#22FF77] shadow-[0_0_4px_rgba(34,255,119,0.35)]"
                      : "bg-[#FF3B30] shadow-[0_0_3px_rgba(255,59,48,0.25)]"
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0 self-center">
                <h3 className="font-anton text-2xl leading-none truncate">{name}</h3>
                {handle && <p className="text-xs text-ink-3 truncate mt-1 tracking-widest">#{handle}</p>}
              </div>

              <div className="text-right shrink-0">
                {entry.starts_on ? (
                  <>
                    <p className="text-[10px] uppercase tracking-widest text-ink-3">{t("card.starts")}</p>
                    <p className="font-anton text-2xl text-[#CCFF00] leading-none">
                      {new Date(entry.starts_on).toLocaleDateString(locale, { weekday: "short" }).replace(".", "").toUpperCase()}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] uppercase tracking-widest text-ink-3">{t("card.week")}</p>
                    <p className="font-anton text-3xl text-[#CCFF00] leading-none">{String(week_number).padStart(2, "0")}</p>
                  </>
                )}
              </div>
            </div>

            {exercises.length > 0 && (
            <div ref={infoWrapRef} className="absolute top-1.5 right-1.5 z-20" data-testid={`user-info-wrap-${entry.user_id}`}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowInfo((v) => !v); }}
                data-testid={`user-info-button-${entry.user_id}`}
                title={t("card.increases")}
                aria-label={t("card.increases")}
                aria-expanded={showInfo}
                className={`group relative w-5 h-5 border bg-transparent flex items-center justify-center transition-all after:content-[''] after:absolute after:-inset-2.5 ${
                  showInfo
                    ? "border-[#555] bg-[#1A1A1A]"
                    : "border-[#333] hover:border-[#555] hover:bg-[#0A0A0A]"
                }`}
              >
                <InfoIcon color={showInfo ? "#CCCCCC" : "#888888"} size={17} />
              </button>

              <AnimatePresence>
                {showInfo && (
                  <motion.div
                    key="info-popup"
                    initial={{ opacity: 0, y: -4, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute top-full right-0 mt-2 min-w-[180px] max-w-[240px] border border-[#444] bg-[#0A0A0A] shadow-[0_8px_24px_rgba(0,0,0,0.6)] z-30 cursor-pointer"
                    data-testid={`user-info-popup-${entry.user_id}`}
                    onClick={(e) => { e.stopPropagation(); setShowInfo(false); }}
                    title={t("common.close")}
                  >
                    <div className="absolute -top-1.5 right-2 w-2.5 h-2.5 bg-[#0A0A0A] border-l border-t border-[#444] rotate-45" />
                    <ul className="relative divide-y divide-[#1A1A1A]" data-testid={`user-info-list-${entry.user_id}`}>
                      {exercises.map((ex) => (
                        <li
                          key={ex.key}
                          className="flex items-center justify-between gap-3 px-3 py-2"
                          data-testid={`user-info-row-${entry.user_id}-${ex.key}`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <ExerciseIcon icon={ex.icon} size={12} className="shrink-0" />
                            <span className="font-anton text-sm truncate" style={{ color: ex.color }}>{exerciseLabel(ex)}</span>
                          </span>
                          <span className="font-anton tabular-nums text-sm whitespace-nowrap" style={{ color: ex.color }}>
                            +{Number.isFinite(Number(ex.progression_pct)) ? ex.progression_pct : 10}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            )}

            <div className="flex items-center gap-3 -mt-2" data-testid={`streak-row-${entry.user_id}`}>
              <div className={`flex items-center gap-1.5 px-2 py-1 border transition-colors ${displayStreak > 0 ? "border-[#FF5722]/70 text-[#FF5722] bg-[#FF5722]/[0.06]" : "border-[#222] text-ink-3"}`}>
                <Fire size={14} weight={displayStreak > 0 ? "fill" : "regular"} />
                <motion.span
                  key={`streak-${displayStreak}`}
                  className="font-anton text-lg leading-none tabular-nums inline-block"
                  initial={{ y: 0, scale: 1 }}
                  animate={glowing
                    ? { y: [0, -4, 0], scale: [1, 1.25, 1], filter: ["drop-shadow(0 0 0px #FF5722)", "drop-shadow(0 0 8px #FF5722)", "drop-shadow(0 0 0px #FF5722)"] }
                    : { y: 0, scale: 1 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                >
                  {displayStreak}
                </motion.span>
                <span className="text-[10px] uppercase tracking-widest">Streak</span>
              </div>
            </div>

            {entry.all_paused ? (
              <PausedPanel isMe={isMe} />
            ) : (
            <div className="space-y-5">
              {exercises.map((ex) => (
                <MetricRow
                  key={ex.key}
                  exercise={ex}
                  value={Number(values?.[ex.key]) || 0}
                  canBoost={isMe && canBoost && !ex.boosted_this_week && !hasBoostedThisWeek && !hideBoostButtons}
                  onBoost={onBoost}
                  onCancelBoost={onCancelBoost}
                  isMe={isMe}
                  showPace={isMe && !entry.starts_on}
                />
              ))}
              {activities.length > 0 && (
                <div className={`${exercises.length ? "space-y-3 pt-4 border-t border-[#1A1A1A]" : "space-y-6"}`} data-testid={`activities-${entry.user_id}`}>
                  {activities.map((a) => <ActivityRow key={a.key} activity={a} value={values?.[a.key]} large={exercises.length === 0} />)}
                </div>
              )}
            </div>
            )}

            {all_time && (
              <div className={`mt-auto ${exercises.length ? "border-t border-[#1A1A1A] pt-3" : ""}`} data-testid={`all-time-${entry.user_id}`}>
                {exercises.length > 0 && (<>
                <p className="text-[10px] uppercase tracking-[0.25em] text-ink-3 mb-2">{t("card.allTime")}</p>
                <div
                  className={`grid items-start ${exercises.length >= 5 ? "gap-1.5" : exercises.length === 4 ? "gap-2" : "gap-2"}`}
                  style={{ gridTemplateColumns: `repeat(${exercises.length}, minmax(0, 1fr))` }}
                >
                  {exercises.map((ex) => (
                    <div key={ex.key} className="text-center min-w-0">
                      <p
                        className={`font-anton leading-none ${exercises.length >= 5 ? "text-sm md:text-base" : exercises.length === 4 ? "text-base md:text-lg" : "text-lg"} truncate`}
                        style={{ color: ex.color }}
                        title={formatAmount(all_time[ex.key] || 0, ex.unit, locale)}
                      >
                        {amountParts(all_time[ex.key] || 0, ex.unit, locale).num}
                      </p>
                      <p className="text-[10px] uppercase tracking-widest text-ink-3 mt-0.5 truncate">{amountParts(all_time[ex.key] || 0, ex.unit, locale).unit || t("common.reps")}</p>
                    </div>
                  ))}
                </div>
                </>)}
                {(updated_at || isMe || onSendEmoji || onChallenge) && (
                  // „Stand“-Zeile; auf Karten der anderen rechts dezent: Emoji schicken + Herausfordern
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#1A1A1A] min-h-[2.25rem]">
                    <p className="text-[10px] uppercase tracking-widest text-ink-3 min-w-0 truncate flex-1">
                      {updated_at ? `${t("card.lastSync")} · ${new Date(updated_at).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}` : isMe ? `${t("card.lastSync")} · ${t("card.noEntries")}` : ""}
                    </p>
                    {!isMe && (
                      <div className="flex items-center gap-1 shrink-0 -my-1" data-testid={`card-actions-${entry.user_id}`}>
                        {onSendEmoji && <EmojiSender name={name} onSend={onSendEmoji} disabled={!!entry.starts_on} />}
                        {onChallenge && exercises.length > 0 && !entry.all_paused && !entry.starts_on && <ChallengeButton name={name} onClick={onChallenge} />}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <AnimatePresence>
              {isCelebrating && (
                <motion.div
                  key="celebrate"
                  className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 overflow-hidden"
                  data-testid={`celebration-${entry.user_id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <motion.div
                    className="absolute inset-0 bg-[#FFD600]/20"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.7, 0.2, 0.5, 0.15] }}
                    transition={{ duration: 1.6, times: [0, 0.15, 0.4, 0.7, 1] }}
                  />
                  <motion.div
                    className="relative font-anton text-5xl md:text-6xl text-[#FFD600] tracking-widest text-center"
                    style={{ textShadow: "0 0 28px rgba(255,214,0,0.9), 0 0 10px rgba(255,214,0,1)" }}
                    initial={{ scale: 0.5, opacity: 0, rotate: -3 }}
                    animate={{ scale: [0.5, 1.15, 1, 1.05, 1], opacity: 1, rotate: 0 }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                  >
                    {t("card.weekDone")}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {isFailing && (
                <motion.div
                  key="fail"
                  className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 overflow-hidden"
                  data-testid={`week-failed-card-${entry.user_id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <motion.div
                    className="absolute inset-0 bg-[#FF3B30]/20"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.7, 0.2, 0.5, 0.15] }}
                    transition={{ duration: 1.6, times: [0, 0.15, 0.4, 0.7, 1] }}
                  />
                  <motion.div
                    className="relative font-anton text-5xl md:text-6xl text-[#FF3B30] tracking-widest text-center"
                    style={{ textShadow: "0 0 28px rgba(255,59,48,0.9), 0 0 10px rgba(255,59,48,1)" }}
                    initial={{ scale: 0.5, opacity: 0, rotate: -3 }}
                    animate={{ scale: [0.5, 1.15, 1, 1.05, 1], opacity: 1, rotate: 0 }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                  >
                    {failedWeekLabel > 0 ? t("card.weekFailedN", { week: failedWeekLabel }) : t("card.weekFailed")}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ─────── RÜCKSEITE ───────
              Status-Panel inspiriert vom geteilten Konzept-Bild, aber komplett
              im bestehenden Website-Stil (Dark-Theme, #CCFF00 Akzent, Anton).
              Zeigt oben groß die gewählte Übung + Wochenziel, daneben den
              Rang-Badge (Lauf/Klimm/Liege) und darunter ein Radar-Diagramm
              mit allen Übungen. Klick auf ein Label im Radar wechselt die
              oben angezeigte Übung.
              
              Liegt position:absolute exakt deckungsgleich über der Vorderseite
              und ist um 180° vorgedreht – beim Flip dreht der Container auf
              180°, die Rückseite landet auf 0° (sichtbar), die Vorderseite
              auf 180° (durch backface-visibility:hidden ausgeblendet). */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              WebkitTransform: "rotateY(180deg)",
              pointerEvents: flipped ? "auto" : "none",
            }}
            className={`${borderClass} bg-[#121212]`}
            data-testid={`user-card-back-${entry.user_id}`}
            aria-hidden={!flipped}
          >
            {/* Vollflächige, undurchsichtige Hintergrund-Schicht in
                Karten-Hintergrundfarbe. Garantiert, dass NICHTS von der
                Vorderseite durchscheint, egal wie der Browser
                backface-visibility behandelt. Alle Inhalte liegen darüber. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[#121212] pointer-events-none"
              style={{ zIndex: 0 }}
            />
            <div className="relative p-6 md:p-7 h-full" style={{ zIndex: 1 }}>
              {isMe && (
                <div className="absolute top-2 left-2 md:-top-2 md:-left-2 bg-[#CCFF00] text-black text-[10px] font-bold tracking-widest uppercase px-2 py-1 z-10">{t("common.you")}</div>
              )}
              {exercises.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-4" data-testid={`card-back-empty-${entry.user_id}`}>
                  <Flag size={28} weight="fill" className="text-[#CCFF00]/70" />
                  <p className="font-anton text-2xl tracking-tight">{t("card.backOnlyActivitiesTitle")}</p>
                  <p className="text-xs text-ink-2 leading-relaxed max-w-[16rem]">{t("card.backOnlyActivitiesText")}</p>
                </div>
              ) : (
              <CardBack
                exercises={exercises}
                values={values}
                weekNumber={week_number}
                userId={entry.user_id}
                bestGoals={entry.best_goals || {}}
                bestWeeklies={entry.best_weeklies || {}}
                archived={entry.archived_exercises || []}
                allTime={all_time || {}}
                entry={entry}
                isMe={isMe}
              />
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
