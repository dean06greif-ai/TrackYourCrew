// Kurzer Text, der in eine feste Breite passen muss (z. B. Übungsname in den Wochenziel-Kacheln).
// Statt abzuschneiden (Dean 2026-11-27): erst Buchstabenabstand enger, dann Schrift etwas kleiner,
// erst wenn das nicht reicht, zweizeilig (mit Silbentrennung). Die Kachel bleibt so klein wie möglich.
import { useLayoutEffect, useRef } from "react";

const STEPS = [
  { size: null, track: null }, // wie per className vorgegeben
  { size: null, track: "0.02em" },
  { size: 9, track: "0.02em" },
  { size: 8, track: "0" },
];

export default function FitLabel({ children, className = "", testid }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      const s = el.style;
      s.whiteSpace = "nowrap";
      s.display = "";
      s.webkitLineClamp = "";
      for (const st of STEPS) {
        s.fontSize = st.size ? `${st.size}px` : "";
        s.letterSpacing = st.track ?? "";
        if (el.scrollWidth <= el.clientWidth + 0.5) return;
      }
      // reicht nicht: zwei Zeilen, kleinste Stufe, lange Wörter trennen
      s.whiteSpace = "normal";
      s.display = "-webkit-box";
      s.webkitLineClamp = "2";
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    document.fonts?.ready?.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, [children]);
  return (
    <span
      ref={ref}
      lang={typeof document !== "undefined" ? document.documentElement.lang : undefined}
      className={`block min-w-0 overflow-hidden ${className}`}
      style={{ WebkitBoxOrient: "vertical", hyphens: "auto", overflowWrap: "break-word", lineHeight: 1.25 }}
      data-testid={testid}
    >
      {children}
    </span>
  );
}
