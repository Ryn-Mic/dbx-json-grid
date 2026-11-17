import { useEffect, useRef, useState } from "react";
import { Filter, X } from "lucide-react";
import { viewLabels } from "./viewLabels";
import type { ViewProps } from "./types";

export function ColumnFilter({
  name,
  value,
  onChange,
  locale,
}: {
  name: string;
  value: string;
  onChange(value: string): void;
  locale: ViewProps["locale"];
}) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState({ left: 0, top: 0 });
  const t = viewLabels(locale);
  useEffect(() => {
    if (!open) return;
    const position = () => {
      const box = root.current!.getBoundingClientRect();
      setPoint({
        left: Math.max(8, Math.min(box.right - 205, window.innerWidth - 213)),
        top: Math.min(box.bottom + 5, window.innerHeight - 50),
      });
    };
    position();
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
    };
  }, [open]);
  return (
    <div
      className="jg-filter-control"
      ref={root}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          setOpen(false);
          root.current?.querySelector("button")?.focus();
        }
      }}
    >
      <button
        className={`jg-filter-button ${value ? "jg-filter-active" : ""}`}
        aria-label={`${t.filter} ${name}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Filter size={12} />
      </button>
      {open && (
        <div className="jg-filter-popover" style={point}>
          <input
            autoFocus
            aria-label={`${t.filter} ${name}`}
            placeholder={t.filterHint}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            aria-label={t.clearFilter}
            disabled={!value}
            onClick={() => onChange("")}
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
