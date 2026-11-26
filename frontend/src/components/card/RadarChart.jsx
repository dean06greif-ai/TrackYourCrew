// Teil der Nutzerkarte, ausgelagert aus UserCard.jsx (BACKLOG W1, 2026-11-25).
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Lightning } from "@phosphor-icons/react";
import ExerciseIcon from "../ExerciseIcon";
import { exerciseLabel } from "../../lib/exercises";
import { RANK_COLORS, RANK_LETTER_ORDER } from "../../lib/ranks";

// ─────────────────────────────────────────────────────────────────────────
// RÜCKSEITE: Status-Panel + Radar-Diagramm
// Stil & Farben passen sich an die bestehende Website an (#121212, #CCFF00,
// Anton-Font, dünne #222-Rahmen). Inspiration: Solo-Leveling-Statusfenster,
// ABER ohne Blau/Cyan – nur die bestehende Akzentfarbe #CCFF00 + die
// individuellen Übungsfarben aus `exercises[i].color`.
// ─────────────────────────────────────────────────────────────────────────
export function RadarChart({ exercises, values, selectedIdx, onSelect, size = 250, mode = "week", rankByKey = null }) {
  const N = exercises.length;
  // 👆 Touch/Hover-Tracking für die Icon-Buttons an den Radar-Ecken:
  //    • Beim Hover (Desktop) oder Tap (Mobile) wird der Index gespeichert,
  //      um den Übungs-Namen als schwebenden Tooltip einzublenden und das
  //      Icon mit einem dezenten Glow + leichter Skalierung hervorzuheben.
  //    • Auf Touch-Geräten verschwindet der Tooltip nach kurzer Zeit
  //      automatisch, damit er nicht „kleben" bleibt.
  const [activeIdx, setActiveIdx] = useState(null);
  const tooltipTimerRef = useRef(null);
  const triggerActive = (i) => {
    setActiveIdx(i);
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = setTimeout(() => {
      setActiveIdx((cur) => (cur === i ? null : cur));
    }, 1600);
  };
  useEffect(() => () => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
  }, []);
  if (N < 3) {
    // Radar braucht mind. 3 Achsen. Bei < 3 Übungen einfach nichts zeichnen.
    return null;
  }
  const cx = size / 2;
  const r = size / 2 - 32; // Platz für die Icon-Buttons an den Ecken
  // Optisch zentrieren: Bei ungerader Achsenzahl (3, 5, 7) ist die Form oben
  // spitz und unten flach (oben bis -r, unten nur bis r·cos(π/N)). Ohne
  // Ausgleich hängt das Radar sichtbar zu weit oben. Wir verschieben die
  // Mitte so, dass die gezeichnete Form vertikal mittig sitzt.
  const cy = size / 2 + (N % 2 === 1 ? (r * (1 - Math.cos(Math.PI / N))) / 2 : 0);
  // 🎯 Achsen-Anordnung (symmetrisch um die vertikale Achse):
  //   i=0 → immer oben Mitte (Übung 1)
  //   i=1 → links     (Übung 2)
  //   i=2 → rechts    (Übung 3)
  //   i=3 → unten-links bzw. bei N=4 unten Mitte (Übung 4)
  //   i=4 → unten-rechts (Übung 5)
  //   i=5/6 → folgen demselben links/rechts-Muster, damit auch 6/7 Übungen
  //           sauber symmetrisch sitzen.
  // Ungerade Indizes werden gegen den Uhrzeigersinn (links) angeordnet,
  // gerade Indizes (außer 0) im Uhrzeigersinn (rechts).
  const angleFor = (i) => {
    if (i === 0) return -Math.PI / 2;
    const step = (Math.PI * 2) / N;
    const halfIdx = Math.floor((i + 1) / 2); // 1,2 -> 1 ; 3,4 -> 2 ; 5,6 -> 3
    const sign = i % 2 === 1 ? -1 : 1;        // ungerade = links, gerade = rechts
    return -Math.PI / 2 + sign * halfIdx * step;
  };

  // 🐛 FIX: Polygone (Grid-Ringe & Daten-Fläche) müssen ihre Eckpunkte in
  // KREIS-Reihenfolge (nach Winkel sortiert) verbinden – sonst erzeugt
  // die symmetrische Anordnung (i=0 oben, i=1 links, i=2 rechts, i=3 unten)
  // ein sich selbst kreuzendes "Bow-Tie"-Polygon. Wir berechnen die Achsen
  // einmal und sortieren sie nach normalisiertem Winkel (0..2π).
  const axes = exercises.map((ex, i) => ({ ex, i, angle: angleFor(i) }));
  const axesByAngle = [...axes].sort((a, b) => {
    const TWOPI = Math.PI * 2;
    const na = ((a.angle % TWOPI) + TWOPI) % TWOPI;
    const nb = ((b.angle % TWOPI) + TWOPI) % TWOPI;
    return na - nb;
  });

  // ── RANK-Modus: Ring-Aufteilung dynamisch ──────────────────────────────
  // Innermost Ring = F, Outermost Ring = ein Rang über dem aktuell höchsten
  // erreichten Rang (Cap bei S+). Für jede Übung wird der Punkt auf der
  // Achse so platziert, dass man neben dem aktuellen Rang auch sieht, wie
  // weit die Übung schon Richtung nächstem Rang fortgeschritten ist.
  let rankOuterSlot = 0;   // Index des äußersten Rings
  let rankRings = [];      // Ring-Definitionen für Rank-Modus
  if (mode === "rank") {
    let maxIdx = 0;
    if (rankByKey) {
      for (const ex of exercises) {
        const info = rankByKey[ex.key];
        if (info && info.rankIndex > maxIdx) maxIdx = info.rankIndex;
      }
    }
    rankOuterSlot = Math.min(7, maxIdx + 1); // einen Rang höher, max S+
    if (rankOuterSlot < 1) rankOuterSlot = 1;
    const total = rankOuterSlot + 1; // F..outerSlot ⇒ outerSlot+1 Ringe
    for (let i = 0; i < total; i++) {
      const letter = RANK_LETTER_ORDER[i] || RANK_LETTER_ORDER[RANK_LETTER_ORDER.length - 1];
      const color = (RANK_COLORS[letter] || RANK_COLORS.F).color;
      rankRings.push({ frac: (i + 1) / total, letter, color });
    }
  }

  const rings = mode === "rank"
    ? rankRings.map((rg) => rg.frac)
    : [0.25, 0.5, 0.75, 1];

  const dataPoints = exercises.map((ex, i) => {
    const a = angleFor(i);
    if (mode === "rank") {
      const info = rankByKey ? rankByKey[ex.key] : null;
      // Übungen ohne Rang-Kind sitzen im Zentrum (kein Rang erkannt).
      if (!info) {
        return { x: cx, y: cy, pct: 0, hasRank: false };
      }
      const total = rankOuterSlot + 1;
      // Position = (rankIndex + 1 + subProgress) / total  →  F sitzt auf
      // dem innersten Ring (Fraktion 1/total), S+ ggf. außen.
      const raw = (info.rankIndex + 1 + (info.subProgress || 0)) / total;
      const pct = Math.max(0, Math.min(1, raw));
      return {
        x: cx + Math.cos(a) * r * pct,
        y: cy + Math.sin(a) * r * pct,
        pct,
        hasRank: true,
        color: info.color,
      };
    }
    // WEEK-Modus (Default): Wochenfortschritt = current / goal.
    const v = values[ex.key] || 0;
    const pct = ex.goal > 0 ? Math.min(1, v / ex.goal) : 0;
    return {
      x: cx + Math.cos(a) * r * pct,
      y: cy + Math.sin(a) * r * pct,
      pct,
    };
  });
  // Polygon-Pfad: NICHT in Index-Reihenfolge, sondern in Kreis-Reihenfolge
  // (sortiert nach Winkel). Datenpunkte bleiben oben in Original-Reihenfolge
  // (für die Kreis-Marker + selectedIdx-Mapping).
  const dataPathStr = axesByAngle
    .map(({ i }) => `${dataPoints[i].x},${dataPoints[i].y}`)
    .join(" ");

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      data-testid="card-back-radar-wrapper"
    >
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      data-testid="card-back-radar"
      style={{ overflow: "visible" }}
    >
      {/* Grid-Ringe */}
      {rings.map((ring, ri) => {
        const pts = axesByAngle
          .map(({ angle: a }) => {
            return `${cx + Math.cos(a) * r * ring},${cy + Math.sin(a) * r * ring}`;
          })
          .join(" ");
        const isRank = mode === "rank";
        const rankInfo = isRank ? rankRings[ri] : null;
        const isOuter = ri === rings.length - 1;
        return (
          <polygon
            key={ri}
            points={pts}
            fill="none"
            stroke={isRank && rankInfo ? rankInfo.color : "#1F2A0A"}
            strokeWidth={isRank && isOuter ? 1.4 : 1}
            opacity={isRank ? (isOuter ? 0.85 : 0.35) : (isOuter ? 0.9 : 0.55)}
            strokeDasharray={isRank && !isOuter ? "2 3" : undefined}
          />
        );
      })}

      {/* Rang-Beschriftung pro Ring (nur im Rank-Modus). Sitzt direkt auf
          der Ring-Polygonkante zwischen den beiden Achsen, deren Mitte
          am nächsten zum Punkt „oben rechts" liegt. Dadurch sitzen die
          Labels exakt AUF dem jeweiligen Ring (statt auf einer
          theoretischen Diagonalen, die innen am Ring vorbei läuft). */}
      {mode === "rank" && (() => {
        const TWOPI = Math.PI * 2;
        const targetAngle = -Math.PI / 4; // oben-rechts
        const norm = (a) => ((a % TWOPI) + TWOPI) % TWOPI;
        const tgt = norm(targetAngle);
        // Finde die zwei Achsen, zwischen denen targetAngle liegt.
        let best = { a: axesByAngle[0], b: axesByAngle[1] || axesByAngle[0] };
        let bestDist = Infinity;
        for (let k = 0; k < axesByAngle.length; k++) {
          const aA = axesByAngle[k];
          const aB = axesByAngle[(k + 1) % axesByAngle.length];
          const na = norm(aA.angle);
          let nb = norm(aB.angle);
          if (nb < na) nb += TWOPI;
          let t = tgt;
          if (t < na) t += TWOPI;
          if (t >= na && t <= nb) {
            const mid = (na + nb) / 2;
            const d = Math.abs(mid - t);
            if (d < bestDist) {
              bestDist = d;
              best = { a: aA, b: aB };
            }
          }
        }
        const aA = best.a.angle;
        const aB = best.b.angle;
        return rankRings.map((rg, ri) => {
          // Mittelpunkt der Polygon-Kante zwischen aA und aB auf Ring rg.frac
          const xA = cx + Math.cos(aA) * r * rg.frac;
          const yA = cy + Math.sin(aA) * r * rg.frac;
          const xB = cx + Math.cos(aB) * r * rg.frac;
          const yB = cy + Math.sin(aB) * r * rg.frac;
          const lx = (xA + xB) / 2;
          const ly = (yA + yB) / 2;
          return (
            <text
              key={`rng-lbl-${ri}`}
              x={lx}
              y={ly}
              fill={rg.color}
              fontSize={7.5}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontFamily: "Anton, sans-serif",
                letterSpacing: "0.1em",
                opacity: ri === rankRings.length - 1 ? 0.95 : 0.7,
                paintOrder: "stroke",
                stroke: "#0A0A0A",
                strokeWidth: 2.4,
              }}
            >
              {rg.letter}
            </text>
          );
        });
      })()}

      {/* Achsen */}
      {exercises.map((ex, i) => {
        const a = angleFor(i);
        return (
          <line
            key={ex.key}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(a) * r}
            y2={cy + Math.sin(a) * r}
            stroke="#222"
            strokeWidth={1}
            opacity={0.7}
          />
        );
      })}

      {/* Daten-Polygon
          Hinweis: Im Rank-Modus war Fill/Stroke vorher #E879F9 (lila).
          Auf User-Wunsch jetzt einheitlich #CCFF00 (gelb), passend zum
          Week-Tab. Die einzelnen Daten-Punkte behalten ihre rang-
          spezifischen Farben (siehe unten), damit pro Übung erkennbar
          bleibt, in welcher Rang-Stufe sie aktuell sitzt. */}
      <polygon
        points={dataPathStr}
        fill="#CCFF00"
        fillOpacity={0.18}
        stroke="#CCFF00"
        strokeWidth={1.5}
      />

      {/* Daten-Punkte */}
      {dataPoints.map((p, i) => {
        const isSel = i === selectedIdx;
        const baseFill = mode === "rank"
          ? (p.color || "#E879F9")
          : (isSel ? exercises[i].color : "#CCFF00");
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={isSel ? 4 : 2.5}
            fill={baseFill}
            stroke="#121212"
            strokeWidth={1}
          />
        );
      })}

      {/* Zentrum: Lightning-Icon (App-Logo) statt Samurai-Helm */}
      <g
        transform={`translate(${cx} ${cy})`}
        data-testid="card-back-radar-logo"
        style={{ pointerEvents: "none" }}
      >
        {/* Blitz-Icon mit dünner, scharfer, gleichmäßig breiter schwarzer
            Kontur. Wir nutzen eine echte SVG-Stroke auf dem Icon und
            `paint-order: stroke fill`, sodass die Outline pixel-perfekt
            UND gleichmäßig dick um die Blitz-Form gezeichnet wird. Die
            Stroke-Breite ist in den internen SVG-Koordinaten von phosphor
            (viewBox 256). 15 entspricht ca. 1 px auf dem Bildschirm –
            nochmal einen Tick dicker als zuvor (11), weiterhin scharf. */}
        <foreignObject x="-11" y="-11" width="22" height="22">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
            <Lightning
              size={18}
              weight="fill"
              style={{
                color: '#CCFF00',
                stroke: '#000',
                strokeWidth: 15,
                strokeLinejoin: 'round',
                strokeLinecap: 'round',
                paintOrder: 'stroke fill',
                overflow: 'visible',
              }}
            />
          </div>
        </foreignObject>
      </g>
    </svg>

    {/* 🎯 Icon-Buttons an den Achsen-Ecken (statt Text-Kürzel).
        Liegen als HTML-Layer ÜBER dem SVG – das erlaubt smoothe
        Touch-/Hover-Animationen (scale, glow) und einen schwebenden
        Tooltip mit dem vollen Übungsnamen. Position wird mit den
        gleichen Winkeln wie die Achsen berechnet, damit Icon und
        Achse exakt fluchten. */}
      {exercises.map((ex, i) => {
        const a = angleFor(i);
        const lr = r + 20;
        const lx = cx + Math.cos(a) * lr;
        const ly = cy + Math.sin(a) * lr;
        const isSel = i === selectedIdx;
        const isActive = activeIdx === i;
        const accent = ex.color || "#CCFF00";
        const boxSize = 34;
        const iconSize = 20;
        // Tooltip-Position dynamisch: über dem Icon, wenn es im unteren
        // Halbkreis sitzt, sonst darunter. So bleibt der Name immer im
        // Sichtbereich der Karte und kollidiert nicht mit dem Radar.
        return (
          <div
            key={ex.key}
            style={{
              position: "absolute",
              left: lx - boxSize / 2,
              top: ly - boxSize / 2,
              width: boxSize,
              height: boxSize,
              pointerEvents: "auto",
              zIndex: isActive || isSel ? 3 : 2,
            }}
          >
            <motion.button
              type="button"
              data-testid={`card-back-radar-label-${ex.key}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(i);
                triggerActive(i);
              }}
              onPointerEnter={() => setActiveIdx(i)}
              onPointerLeave={() => setActiveIdx((cur) => (cur === i ? null : cur))}
              whileTap={{ scale: 0.86 }}
              whileHover={{ scale: 1.14 }}
              animate={{
                scale: isSel ? 1.08 : 1,
                boxShadow:
                  isSel || isActive
                    ? `0 0 14px ${accent}CC, 0 0 4px ${accent}, inset 0 0 6px ${accent}33`
                    : `0 0 0px ${accent}00, 0 0 0px ${accent}00, inset 0 0 0px ${accent}00`,
              }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              aria-label={exerciseLabel(ex)}
              style={{
                width: boxSize,
                height: boxSize,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isSel ? `${accent}1A` : "rgba(14,14,14,0.85)",
                border: `1px solid ${isSel || isActive ? accent : "#2A2A2A"}`,
                color: isSel || isActive ? accent : "#888",
                cursor: "pointer",
                outline: "none",
                padding: 0,
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
                userSelect: "none",
                transition: "color 0.18s ease, background 0.18s ease, border-color 0.18s ease",
              }}
            >
              <ExerciseIcon icon={ex.icon} size={iconSize} />
            </motion.button>
          </div>
        );
      })}
    </div>
  );
}

