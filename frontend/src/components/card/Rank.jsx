// Teil der Nutzerkarte, ausgelagert aus UserCard.jsx (BACKLOG W1, 2026-11-25).
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "../../i18n";
import { RANK_COLORS } from "../../lib/ranks";
import { formatAmount } from "../../lib/amount";

// 🔺 PyramidIcon: kleines 3-Etagen-Pyramiden-Symbol als Trigger-Button neben
// dem RANK-Label. Optisch im selben Stil wie das Info-Icon auf der Vorderseite
// (dünner Rahmen, Hover-Glow, dunkler Hintergrund). Die "Etagen" sind drei
// gestapelte Trapeze, deren Breite nach oben abnimmt → klassischer Pyramiden-
// Aufbau. Farbe übernimmt die aktuelle Rang-Farbe, damit der Button visuell
// mit dem RankBadge daneben verbunden ist.
// "i"-Symbol als Vektor im selben Stil wie das Pyramiden-Symbol (gleiche
// Linienstärke, gleiche Farben, gleiche Größe) – scharf auf jedem Bildschirm.
export function InfoIcon({ color = "#888888", size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" style={{ display: "block" }} aria-hidden="true">
      <circle cx="11" cy="5.4" r="1.75" fill="none" stroke={color} strokeWidth={1.2} />
      <path
        d="M8.7 9.1H12.2V16.1H13.7V18H8.3V16.1H9.8V10.9H8.7Z"
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PyramidIcon({ color = "#CCFF00", active = false, size = 22 }) {
  // Schlichtes Dreieck mit zwei horizontalen Strichen im gleichen Abstand
  // (Dreiecks-Höhe in drei gleich große Segmente unterteilt). Die Striche
  // enden genau auf den Schenkeln der Pyramide, sodass die Form ruhig
  // und präzise wirkt.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      style={{ display: "block", overflow: "visible" }}
      aria-hidden="true"
    >
      {/* Außen-Dreieck */}
      <polygon
        points="11,4 18.4,18 3.6,18"
        fill={active ? color : "none"}
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {/* Obere horizontale Trennlinie (Höhen-Drittel 1) */}
      <line
        x1="8.53"
        y1="8.67"
        x2="13.47"
        y2="8.67"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      {/* Untere horizontale Trennlinie (Höhen-Drittel 2) */}
      <line
        x1="6.07"
        y1="13.33"
        x2="15.93"
        y2="13.33"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </svg>
  );
}

// 🔺 PyramidModal: schickes Overlay-Panel, das beim Klick aufs Pyramiden-
// Icon erscheint und ALLE Rang-Schwellwerte einer Übung als gestapelte
// Pyramide darstellt (F unten = breiteste Basis, S+ oben = Spitze).
// Stil identisch zum bestehenden Website-Look: #0F0F0F bg, dünne #2A2A2A-
// Rahmen, Anton-Font, je Etage Rang-Farbe + Schwellwert in der gewählten
// Einheit. Der aktuell erreichte Rang ist hervorgehoben (Glow + stärkerer
// Rahmen). Schließt per Klick außerhalb oder Klick auf das X.
export function PyramidPopup({ rank, thresholds, unit, onClose, anchorRef, accentColor = "#CCFF00" }) {
  const { locale } = useI18n();
  // Klick außerhalb / Escape → schließen (analog zum Info-Popup).
  // ⚠️ MUSS vor jedem early-return stehen (Rules of Hooks).
  useEffect(() => {
    const onDown = (e) => {
      if (anchorRef?.current && anchorRef.current.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchorRef]);

  // Verfügbare Breite messen: auf breiten Karten (PC) wird die Pyramide breiter,
  // die Etagenhöhe bleibt gleich (kein Verzerren der Schrift).
  const boxRef = useRef(null);
  const [boxW, setBoxW] = useState(264);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setBoxW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sicherheitsnetz: ohne Schwellen/Rang rendern wir nichts.
  if (!rank || !thresholds || thresholds.length === 0) return null;

  // Schwellen kommen von F → S+ (aufsteigend). Für die Pyramide drehen wir um:
  // S+ oben (Spitze), F unten (Basis).
  const ordered = [...thresholds].reverse();
  const N = ordered.length;

  // ── Pyramide v3: RANK-COLOR-STYLE ───────────────────────────────────────
  // Komplett überarbeitet auf Userwunsch:
  //   • S+ ist selbst die SPITZE (echtes Dreieck) – kein separates Dach mehr.
  //   • Pyramide insgesamt etwas breiter, damit sie nicht zu spitz wirkt.
  //   • Jede Etage glüht in ihrer EIGENEN Rang-Farbe (RANK_COLORS).
  //     → Wenn du oben in RANK_COLORS die Farben änderst, ändert sich
  //       die Pyramide hier automatisch mit.
  //   • Rang-Buchstabe leuchtet stark (wie bisher), der Schwellwert
  //     deutlich dezenter (kleiner, gedimmt, weniger Glow).
  //   • Der AKTUELL erreichte Rang ist stärker hervorgehoben: dickerer
  //     Stroke, kräftigerer Glow und ein leichter Fill-Hint in seiner
  //     eigenen Farbe.
  //
  // Geometrie:
  //   – Echte Pyramide: Breite wächst linear von 0 (oben, Spitze) bis
  //     BASE_W (unten, Basis F-Etage). Dadurch wird S+ automatisch zum
  //     Dreieck, ganz ohne separate Cap.
  //   – Die S+-Etage bekommt etwas mehr Höhe, damit der Buchstabe und
  //     der Schwellwert auch in der schmalen Spitze gut Platz haben.
  const PYR_W = Math.max(240, Math.min(440, Math.round(boxW))); // SVG-Breite = verfügbarer Platz
  const BASE_W = PYR_W - 20;  // Breite der UNTERSTEN Etage (F)
  const TIER_H = 26;          // Höhe je Etage (E…S)
  const TIER_H_TOP = 56;      // S+ (Dreieck) ist deutlich höher
  const GAP = 3;              // Kleine Lücke zwischen Etagen
  const PAD_Y = 10;

  // Höhe je Etage – S+ (Index 0) ist höher als die anderen.
  const tierHeight = (i) => (i === 0 ? TIER_H_TOP : TIER_H);

  // Akkumulierte Höhe aller Etagen + Gaps.
  let contentH = 0;
  for (let k = 0; k < N; k++) {
    contentH += tierHeight(k);
    if (k < N - 1) contentH += GAP;
  }
  const SVG_H = PAD_Y * 2 + contentH;
  const apexY = PAD_Y;                 // Oberkante = Spitze
  const baseY = PAD_Y + contentH;      // Unterkante = Basis
  const CENTER_X = PYR_W / 2;

  // Lineare Pyramide: Breite = 0 an Spitze, BASE_W an Basis.
  const widthAtY = (y) => {
    const frac = (y - apexY) / (baseY - apexY);
    const clamped = frac < 0 ? 0 : frac > 1 ? 1 : frac;
    return clamped * BASE_W;
  };

  // Top-Y einer Etage i.
  const rowTopY = (i) => {
    let y = apexY;
    for (let k = 0; k < i; k++) y += tierHeight(k) + GAP;
    return y;
  };

  return (
    <motion.div
      key="pyramid-popup"
      initial={{ opacity: 0, y: -4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.96 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="absolute left-0 right-0 border border-[#444] bg-[#0A0A0A] shadow-[0_8px_24px_rgba(0,0,0,0.6)] z-30"
      style={{ top: 24 }}
      data-testid="pyramid-popup"
      onClick={(e) => { e.stopPropagation(); onClose?.(); }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* Kleines Dreieck oben rechts – identisch zum Info-Popup (gleicher Rand) */}
      <div
        className="absolute -top-1.5 right-2 w-2.5 h-2.5 bg-[#0A0A0A] border-l border-t border-[#444] rotate-45"
      />

      <div ref={boxRef} className="relative px-3 py-3 flex justify-center bg-[#0A0A0A]">
        <svg
          width="100%"
          height={SVG_H}
          viewBox={`0 0 ${PYR_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ overflow: "visible", display: "block" }}
          aria-hidden="true"
        >
          {/* ── ETAGEN (jede in ihrer eigenen Rang-Farbe) ───────────────── */}
          {ordered.map((t, i) => {
            const isCurrent = t.letter === rank.letter;
            // Eigene Farbe pro Rang aus RANK_COLORS → ändert sich
            // automatisch mit, wenn die Palette oben angepasst wird.
            const palette = RANK_COLORS[t.letter] || RANK_COLORS.F;
            const tierColor = palette.color;

            const y0 = rowTopY(i);
            const y1 = y0 + tierHeight(i);
            const wTop = widthAtY(y0);
            const wBot = widthAtY(y1);
            const xTopL = CENTER_X - wTop / 2;
            const xTopR = CENTER_X + wTop / 2;
            const xBotL = CENTER_X - wBot / 2;
            const xBotR = CENTER_X + wBot / 2;

            // S+ (i=0) ist ein echtes Dreieck (Top-Breite = 0):
            // Polygon nur aus Apex + Basis-Kante.
            const points = i === 0
              ? `${CENTER_X},${y0} ${xBotR},${y1} ${xBotL},${y1}`
              : `${xTopL},${y0} ${xTopR},${y0} ${xBotR},${y1} ${xBotL},${y1}`;

            // Glow pro Etage – insgesamt deutlich gedimmt im Vergleich zu
            // vorher. Alle Etagen glühen aber noch leicht. Der aktuelle
            // Rang bleibt klar hervorgehoben (etwas stärkerer Glow + Fill
            // + dickere Stroke unten), aber ohne die übertriebene Helligkeit
            // von früher.
            const glowSoft = `drop-shadow(0 0 1px ${tierColor}66)`;
            const glowStrong = `drop-shadow(0 0 2px ${tierColor}AA) drop-shadow(0 0 5px ${tierColor}55)`;

            // ── Textpositionen ────────────────────────────────────────
            // S+ (Dreieck, Spitze): Letter und Wert untereinander, beide
            // mittig – im UNTEREN Drittel der Spitze, wo sie breit genug
            // ist. Andere Etagen: Letter links, Wert rechts (wie bisher).
            const midY = (y0 + y1) / 2;
            const xLeftMid = (xTopL + xBotL) / 2;
            const xRightMid = (xTopR + xBotR) / 2;
            const padX = 8;

            // Letter & Wert für S+ (Dreieck) – mittig gestapelt
            const sLetterY = y0 + tierHeight(i) * 0.58;
            const sValueY  = y0 + tierHeight(i) * 0.84;

            return (
              <g
                key={t.letter}
                data-testid={`pyramid-tier-${t.letter}`}
                style={{
                  filter: isCurrent ? glowStrong : glowSoft,
                  opacity: isCurrent ? 1 : 0.92,
                }}
              >
                {/* Aktueller Rang: leichter Fill zur Hervorhebung */}
                {isCurrent && (
                  <polygon
                    points={points}
                    fill={tierColor}
                    opacity={0.16}
                  />
                )}
                <polygon
                  points={points}
                  fill="none"
                  stroke={tierColor}
                  strokeWidth={isCurrent ? 2.1 : 1.1}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {i === 0 ? (
                  <>
                    {/* S+ – Buchstabe, mittig, kräftig aber Glow gedimmt */}
                    <text
                      x={CENTER_X}
                      y={sLetterY}
                      fill={tierColor}
                      fontSize={isCurrent ? 14 : 13}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{
                        fontFamily: "Anton, sans-serif",
                        letterSpacing: "0.12em",
                        textShadow: isCurrent
                          ? `0 0 4px ${tierColor}99, 0 0 8px ${tierColor}55`
                          : `0 0 2px ${tierColor}55`,
                        fontWeight: isCurrent ? 800 : 700,
                      }}
                    >
                      {t.letter}
                    </text>
                    {/* S+ – Wert, mittig darunter, sehr dezent (wie der Rand) */}
                    <text
                      x={CENTER_X}
                      y={sValueY}
                      fill={tierColor}
                      fontSize={7.5}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{
                        fontFamily: "Anton, sans-serif",
                        letterSpacing: "0.04em",
                        opacity: isCurrent ? 0.55 : 0.4,
                      }}
                    >
                      {formatAmount(t.min, unit, locale)}
                    </text>
                  </>
                ) : (
                  <>
                    {/* Rang links – kräftig & klar lesbar, Glow aber gedimmt */}
                    <text
                      x={xLeftMid + padX}
                      y={midY}
                      fill={tierColor}
                      fontSize={isCurrent ? 13.5 : 12.5}
                      textAnchor="start"
                      dominantBaseline="middle"
                      style={{
                        fontFamily: "Anton, sans-serif",
                        letterSpacing: "0.12em",
                        textShadow: isCurrent
                          ? `0 0 4px ${tierColor}99, 0 0 8px ${tierColor}55`
                          : `0 0 2px ${tierColor}55`,
                        fontWeight: isCurrent ? 800 : 700,
                      }}
                    >
                      {t.letter}
                    </text>
                    {/* Wert rechts – sehr dezent (wie der Rand der Etage) */}
                    <text
                      x={xRightMid - padX}
                      y={midY}
                      fill={tierColor}
                      fontSize={8.5}
                      textAnchor="end"
                      dominantBaseline="middle"
                      style={{
                        fontFamily: "Anton, sans-serif",
                        letterSpacing: "0.04em",
                        opacity: isCurrent ? 0.55 : 0.4,
                      }}
                    >
                      {formatAmount(t.min, unit, locale)}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </motion.div>
  );
}

// 🛡️ RankBadge: zwei rotierte Rahmen (wie im Referenz-Bild) mit dem
// Rang-Buchstaben in der Mitte. Komplett SVG → skaliert sauber auf Mobile
// und Desktop, kein Asset nötig.
export function RankBadge({ rank, size = 96 }) {
  if (!rank) return null;
  const { letter, color, glow } = rank;
  const half = size / 2;
  const inner = size * 0.62; // Größe des inneren rotierten Quadrats
  const outer = size * 0.78; // Größe des äußeren rotierten Quadrats
  return (
    <div
      className="relative inline-flex items-center justify-center select-none"
      style={{ width: size, height: size, filter: `drop-shadow(0 0 8px ${glow})` }}
      data-testid={`rank-badge-${letter}`}
      aria-label={`Rank ${letter}`}
      role="img"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <radialGradient id={`rank-grad-${letter}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="60%" stopColor={color} stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Sanfter Farb-Halo hinter dem Badge */}
        <circle cx={half} cy={half} r={half} fill={`url(#rank-grad-${letter})`} />

        {/* Äußerer Rahmen (leicht rotiert, dunklere Akzentfarbe) */}
        <rect
          x={half - outer / 2}
          y={half - outer / 2}
          width={outer}
          height={outer}
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          opacity={0.55}
          transform={`rotate(18 ${half} ${half})`}
        />

        {/* Innerer Rahmen (stärker, deutlicher rotiert) – Hauptframe */}
        <rect
          x={half - inner / 2}
          y={half - inner / 2}
          width={inner}
          height={inner}
          fill="rgba(0,0,0,0.55)"
          stroke={color}
          strokeWidth={2}
          transform={`rotate(-12 ${half} ${half})`}
        />

        {/* Rang-Buchstabe in der Mitte */}
        <text
          x={half}
          y={half + (letter === "S+" ? size * 0.085 : size * 0.105)}
          textAnchor="middle"
          fill={color}
          style={{
            fontFamily: "Anton, sans-serif",
            fontSize: letter === "S+" ? size * 0.42 : size * 0.55,
            fontWeight: 700,
            letterSpacing: "0.04em",
            paintOrder: "stroke",
          }}
          stroke="rgba(0,0,0,0.45)"
          strokeWidth={0.8}
        >
          {letter}
        </text>
      </svg>
    </div>
  );
}

