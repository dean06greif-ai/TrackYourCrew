// Eingabefeld für Fortschritt (Zahl mit +/–, Schrittweiten, Stoppuhr bei Zeit-Übungen), ausgelagert aus Dashboard.jsx (BACKLOG W1, 2026-11-25).
import { useEffect, useRef, useState, useCallback } from "react";
import { Gear, Plus, Minus } from "@phosphor-icons/react";
import ExerciseIcon from "./ExerciseIcon";
import { useI18n } from "../i18n";
import Stopwatch from "./Stopwatch";
import { isTimeUnit } from "../lib/stopwatch";
import { formatAmount } from "../lib/amount";

export function NumInput({ label, value, onChange, step, testid, color, icon, goal, unit, stepSettings }) {
  const { t, locale } = useI18n();
  // Round to step precision to avoid floating-point drift (e.g. 0.1+0.1+0.1=0.30000000000000004)
  const decimals = step < 1 ? 2 : 0;
  const round = (n) => Number(Number(n).toFixed(decimals));

  // ── Press-and-Hold (gedrückt halten) für + / − ─────────────────────────────
  // Beim Klick wird wie gehabt einmal inkrementiert/dekrementiert. Wenn der
  // Button länger gedrückt gehalten wird, läuft der Wert nach kurzer Verzögerung
  // automatisch und beschleunigend weiter, bis losgelassen wird.
  // Wir nutzen Refs, damit der laufende Timer immer den AKTUELLSTEN Wert sieht
  // (sonst hätten wir wegen Closure einen veralteten value).
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);

  const holdTimeoutRef = useRef(null);
  const holdIntervalRef = useRef(null);
  const holdStartRef = useRef(0);

  const applyDelta = (dir) => {
    const s = Number(stepRef.current) || 0;
    const current = Number(valueRef.current) || 0;
    const next = dir === "inc" ? current + s : current - s;
    const safe = Math.max(0, round(next));
    valueRef.current = safe; // sofort aktualisieren, damit der nächste Tick weiterzählt
    onChange(safe);
  };

  const stopHold = () => {
    if (holdTimeoutRef.current) { clearTimeout(holdTimeoutRef.current); holdTimeoutRef.current = null; }
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
    holdStartRef.current = 0;
  };

  const startHold = (dir) => (e) => {
    // Nur Primärtaste bei Maus
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    stopHold();
    // Sofort einmal auslösen (klassisches Klick-Verhalten)
    applyDelta(dir);
    holdStartRef.current = Date.now();
    // Nach 350 ms startet der Repeat-Modus (schnell). Bei längerem Halten
    // wird der Intervall-Tick zusätzlich verkürzt → spürbar beschleunigend.
    holdTimeoutRef.current = setTimeout(() => {
      let tickMs = 80; // schnell
      holdIntervalRef.current = setInterval(() => {
        applyDelta(dir);
        const held = Date.now() - holdStartRef.current;
        // Stufenweise schneller: nach 1.2 s → 45 ms, nach 2.5 s → 25 ms, nach 4 s → 15 ms
        const desired = held > 4000 ? 15 : held > 2500 ? 25 : held > 1200 ? 45 : 80;
        if (desired !== tickMs) {
          tickMs = desired;
          clearInterval(holdIntervalRef.current);
          holdIntervalRef.current = setInterval(() => applyDelta(dir), tickMs);
        }
      }, tickMs);
    }, 350);
    // Pointer-Capture, damit pointerup auch ankommt, wenn der Finger leicht abrutscht
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  };

  // Beim Unmount sicher alle Timer aufräumen
  useEffect(() => () => stopHold(), []);

  const holdHandlers = (dir) => ({
    onPointerDown: startHold(dir),
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
    onContextMenu: (e) => e.preventDefault(), // Long-Press-Kontextmenü auf Mobile unterdrücken
  });

  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color }}>
        {icon && <ExerciseIcon icon={icon} size={12} />} {label}
      </label>
      <div className="flex items-stretch border border-[#222]">
        <button
          type="button"
          {...holdHandlers("dec")}
          style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent" }}
          className="px-3 bg-[#121212] hover:bg-[#1A1A1A] border-r border-[#222] select-none"
          data-testid={`${testid}-dec`}
        >
          <Minus size={16} />
        </button>
        <input
          type="number"
          value={Number(value) === 0 ? "" : value}
          step={step}
          placeholder="0"
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="flex-1 bg-[#0A0A0A] text-white font-anton text-2xl text-center focus:outline-none focus:bg-[#121212] px-2 py-2 w-full min-w-0 placeholder:text-ink-3 placeholder:font-anton"
          data-testid={testid}
        />
        <button
          type="button"
          {...holdHandlers("inc")}
          style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent" }}
          className="px-3 bg-[#121212] hover:bg-[#1A1A1A] border-l border-[#222] select-none"
          data-testid={`${testid}-inc`}
        >
          <Plus size={16} />
        </button>
      </div>
      <p className="text-[10px] text-ink-3 mt-1 uppercase tracking-widest">{t("log.goal")}: {formatAmount(goal, unit, locale)}</p>
      {/* Stoppuhr für Zeit-Übungen (Plan 13f): gestoppte Zeit kommt dazu */}
      {isTimeUnit(unit) && (
        <Stopwatch id={testid} unit={unit} color={color} goal={goal} value={value} onAdd={(add) => onChange(Math.round(((Number(valueRef.current ?? value) || 0) + add) * 100) / 100)} />
      )}
      {stepSettings && (
        <div className="mt-2" data-testid={`${testid}-step-setting-wrap`}>
          <label className="text-[10px] uppercase tracking-widest text-[#FFD700] flex items-center gap-1 mb-1">
            <Gear size={10} weight="bold" /> {t("log.stepValues")}
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={stepSettings.displayValue}
            placeholder={String(stepSettings.placeholderValue)}
            onChange={(e) => stepSettings.onChange(e.target.value)}
            className="w-full bg-[#0A0A0A] border border-[#222] focus:border-[#FFD700] outline-none text-white text-sm py-1.5 px-2 placeholder:text-ink-3 font-mono"
            data-testid={`${testid}-step-setting`}
          />
        </div>
      )}
    </div>
  );
}

/**
 * AutoFitNumberInput
 * - Standard-Schriftgröße kommt aus `baseFontStyle` (z.B. clamp() für PC/Mobile).
 * - Sobald der eingetragene Wert breiter wäre als das Eingabefeld (und somit
 *   abgeschnitten würde), wird die Schrift dynamisch verkleinert, damit alles
 *   sichtbar bleibt. Bei kürzeren Werten kehrt sie automatisch zur Basisgröße
 *   zurück. Reagiert auch auf Viewport-Resize.
 */
export function AutoFitNumberInput({ value, onChange, step, placeholder, className, baseFontStyle }) {
  const inputRef = useRef(null);
  const measureRef = useRef(null);
  const [adjustedSize, setAdjustedSize] = useState(null);

  const fit = useCallback(() => {
    const input = inputRef.current;
    const measure = measureRef.current;
    if (!input || !measure) return;

    // Verfügbare Innenbreite des Inputs (ohne Padding/Border) ermitteln –
    // ohne dabei die inline font-size des Inputs zu verändern, denn das würde
    // die per `baseFontStyle` gesetzte clamp()-Größe zerstören und zu einer
    // falschen Basis-Schriftgröße führen.
    const cs = window.getComputedStyle(input);
    const padLeft = parseFloat(cs.paddingLeft) || 0;
    const padRight = parseFloat(cs.paddingRight) || 0;
    const borderL = parseFloat(cs.borderLeftWidth) || 0;
    const borderR = parseFloat(cs.borderRightWidth) || 0;
    const avail = input.clientWidth - padLeft - padRight - borderL - borderR - 2; // kleiner Puffer
    if (avail <= 0) return;

    const text = (value === "" || value == null) ? (placeholder || "0") : String(value);

    // Mess-Span exakt mit den BASIS-Schrifteigenschaften versehen (nicht mit der
    // aktuell ggf. bereits verkleinerten fontSize). Dadurch bekommen wir immer
    // die "Wunsch"-Schriftgröße, die wir in das Feld setzen wollen, wenn der
    // Platz ausreicht.
    measure.style.fontFamily = cs.fontFamily;
    measure.style.fontWeight = cs.fontWeight;
    measure.style.fontStyle = cs.fontStyle;
    measure.style.letterSpacing = cs.letterSpacing;
    // Tabular-Numerals erzwingen: Damit alle Ziffern exakt gleich breit gerendert
    // werden und gleich lange Zahlen (z. B. "4,51" vs. "4,52") zur identischen
    // skalierten Schriftgröße führen.
    measure.style.fontVariantNumeric = "tabular-nums";
    measure.style.fontFeatureSettings = '"tnum"';
    // Basis-fontSize: bevorzugt aus baseFontStyle (z.B. clamp(...)), sonst
    // aus dem aktuellen computed style des Inputs.
    measure.style.fontSize = (baseFontStyle && baseFontStyle.fontSize)
      ? String(baseFontStyle.fontSize)
      : cs.fontSize;
    measure.textContent = text;

    // Aufgelöste Pixelgröße der Basisschrift sowie gemessene Textbreite
    const baseFontPx = parseFloat(window.getComputedStyle(measure).fontSize) || 16;
    const w = measure.offsetWidth;

    if (w <= avail) {
      setAdjustedSize(null);
      return;
    }
    // Proportional schrumpfen, Untergrenze 8px
    const scaled = Math.max(8, Math.floor(baseFontPx * (avail / w) * 0.98));
    setAdjustedSize(scaled);
  }, [value, placeholder, baseFontStyle]);

  useEffect(() => { fit(); }, [fit]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", fit);
      return () => window.removeEventListener("resize", fit);
    }
    const ro = new ResizeObserver(() => fit());
    ro.observe(input);
    return () => ro.disconnect();
  }, [fit]);

  const mergedStyle = {
    ...(baseFontStyle || {}),
    // Tabular-Numerals: gleich lange Zahlen → exakt gleiche Pixelbreite →
    // konsistente Autofit-Skalierung (verhindert, dass z. B. "4,52" kleiner
    // angezeigt wird als "4,51").
    fontVariantNumeric: "tabular-nums",
    fontFeatureSettings: '"tnum"',
    // ⛓ Höhe & Line-Height an die BASIS-Schriftgröße koppeln, damit das
    // Eingabefeld seine exakten Maße behält – unabhängig davon, ob Autofit
    // die fontSize verkleinert oder ob das Feld leer / mit Wert ist.
    // height = lineHeight + py-1.5*2 (12px) + Border (2px)
    ...((baseFontStyle && baseFontStyle.fontSize)
      ? {
          lineHeight: `calc(${baseFontStyle.fontSize} * 1.25)`,
          height: `calc(${baseFontStyle.fontSize} * 1.25 + 14px)`,
          paddingTop: 0,
          paddingBottom: 0,
          boxSizing: "border-box",
        }
      : {}),
    ...(adjustedSize ? { fontSize: `${adjustedSize}px` } : {}),
  };

  return (
    <>
      <input
        ref={inputRef}
        type="number"
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        style={mergedStyle}
        className={className}
      />
      <span
        ref={measureRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          visibility: "hidden",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          left: -9999,
          top: -9999,
        }}
      />
    </>
  );
}
