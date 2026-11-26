import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretDown } from "@phosphor-icons/react";
import ExerciseIcon, { ICON_KEYS } from "./ExerciseIcon";
import { useI18n } from "../i18n";

// Icon-Knopf (links neben dem Übungsnamen). Antippen öffnet eine Auswahl mit allen
// Icons (6 Spalten, aktuelles markiert). Schließt bei Auswahl, Klick daneben oder Escape.
// `auto` = Icon wurde automatisch aus dem Namen gewählt (nur Hinweis im Tooltip).
export default function IconPicker({ value, onChange, color = "#CCFF00", testid, auto = false, size = "md" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const popRef = useRef(null);

  // Die Auswahl hängt per Portal am <body> (sonst verdeckt die nächste Karte sie)
  // und wird unter dem Knopf ausgerichtet, ohne über den Bildschirmrand zu ragen.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const btn = wrapRef.current?.getBoundingClientRect();
      const pop = popRef.current?.getBoundingClientRect();
      if (!btn) return;
      const w = pop?.width || 0;
      const h = pop?.height || 0;
      const left = Math.max(8, Math.min(btn.left, window.innerWidth - w - 8));
      const below = btn.bottom + 4;
      const top = below + h > window.innerHeight - 8 && btn.top - h - 4 > 8 ? btn.top - h - 4 : below;
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      const inside = wrapRef.current?.contains(e.target) || popRef.current?.contains(e.target);
      if (!inside) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const box = size === "sm" ? "h-[36px] w-[46px]" : "h-[42px] w-[52px]";
  const iconSize = size === "sm" ? 18 : 22;
  const label = `${t("settings.chooseIcon")}: ${t(`icon.${value}`)}`;

  return (
    <div className="relative shrink-0" ref={wrapRef} data-no-drag>
      <button
        type="button"
        onClick={() => { setPos(null); setOpen((o) => !o); }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        title={auto ? `${label} · ${t("settings.iconAuto")}` : label}
        data-testid={testid}
        className={`${box} flex items-center justify-center gap-0.5 border bg-[#0A0A0A] transition-colors hover:bg-[#111]`}
        style={{ borderColor: color, color }}
      >
        <ExerciseIcon icon={value} size={iconSize} className="flex" />
        <CaretDown size={10} weight="bold" className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          role="group"
          aria-label={t("settings.chooseIcon")}
          className="fixed z-[60] p-2 border border-[#333] bg-[#0A0A0A] shadow-[0_10px_30px_rgba(0,0,0,0.7)] grid grid-cols-6 gap-1 w-max animate-[fadeIn_120ms_ease-out]"
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
          data-testid={testid ? `${testid}-grid` : undefined}
          data-no-drag
        >
          {ICON_KEYS.map((k) => {
            const active = k === value;
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  onChange(k);
                  setOpen(false);
                }}
                aria-pressed={active}
                aria-label={t(`icon.${k}`)}
                title={t(`icon.${k}`)}
                data-testid={testid ? `${testid}-${k}` : undefined}
                className={`w-10 h-10 flex items-center justify-center border transition-colors ${active ? "" : "border-[#222] text-ink-3 hover:border-[#444] hover:text-white"}`}
                style={active ? { borderColor: color, color } : undefined}
              >
                <ExerciseIcon icon={k} size={20} className="flex" />
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
