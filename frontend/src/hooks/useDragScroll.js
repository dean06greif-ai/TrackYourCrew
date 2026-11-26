import { useCallback, useEffect, useRef, useState } from "react";

// Ref als Callback: die Leiste kann später erscheinen (z. B. Panel öffnet sich).

// Waagerechte Leiste, die man mit Finger UND Maus seitlich ziehen kann (Mausrad scrollt auch seitlich).
// Nach einem echten Ziehen wird der folgende Klick geschluckt, damit kein Reiter ausversehen wechselt.
// Gibt außerdem zurück, ob links/rechts noch etwas versteckt ist (für Verlaufs-Kanten).
export default function useDragScroll() {
  const [el, setEl] = useState(null);
  const drag = useRef({ active: false, x: 0, left: 0, moved: false });
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, [el]);

  useEffect(() => {
    if (!el) return undefined;
    update();
    const onDown = (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return; // Finger: natives Wischen
      drag.current = { active: true, x: e.clientX, left: el.scrollLeft, moved: false };
    };
    const onMove = (e) => {
      const d = drag.current;
      if (!d.active) return;
      const dx = e.clientX - d.x;
      if (Math.abs(dx) > 4) d.moved = true;
      if (d.moved) {
        el.scrollLeft = d.left - dx;
        e.preventDefault();
      }
    };
    const onUp = () => {
      drag.current.active = false;
    };
    const onClick = (e) => {
      if (drag.current.moved) {
        e.preventDefault();
        e.stopPropagation();
        drag.current.moved = false;
      }
    };
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    el.addEventListener("click", onClick, true);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [el, update]);

  return { ref: setEl, edges, update };
}
