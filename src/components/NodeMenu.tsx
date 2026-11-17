import { useEffect, useRef, useState, type ReactNode } from "react";
import { typeOf, type JsonPath, type JsonValue } from "../core/json";
import { viewLabels } from "./viewLabels";
import type { ViewProps } from "./types";
import type { NodeAction } from "./types";
export function NodeMenu({
  path,
  value,
  disabled,
  onAction,
  children,
  locale,
}: {
  locale: ViewProps["locale"];
  path: JsonPath;
  value: JsonValue;
  disabled: boolean;
  onAction(action: NodeAction, path: JsonPath): void;
  children: ReactNode;
}) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null),
    ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!point) return;
    ref.current?.querySelector("button")?.focus();
    const close = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) setPoint(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [point]);
  const t = viewLabels(locale);
  const actions: [NodeAction, string][] = [
    ["copy-path", t.copyPath],
    ["copy-key", t.copyKey],
    ["copy-value", t.copyValue],
    ["focus", t.focus],
  ];
  if (!disabled) {
    if (["array", "object"].includes(typeOf(value)))
      actions.push(["add", t.add]);
    if (path.length) {
      if (typeof path.at(-1) === "string") actions.push(["rename", t.rename]);
      actions.push(["delete", t.delete]);
    }
  }
  return (
    <div
      className="jg-node-menu-host"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPoint({
          x: Math.min(e.clientX, window.innerWidth - 180),
          y: Math.min(e.clientY, window.innerHeight - 240),
        });
      }}
      onKeyDown={(e) => {
        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
          e.preventDefault();
          setPoint({ x: 40, y: 80 });
        }
      }}
    >
      {children}
      {point && (
        <div
          ref={ref}
          role="menu"
          className="jg-node-menu"
          style={{ left: point.x, top: point.y }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") setPoint(null);
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const buttons = Array.from(
                  ref.current!.querySelectorAll("button"),
                ),
                index = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
              buttons[
                (index + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                  buttons.length
              ]?.focus();
            }
          }}
        >
          {actions.map(([action, label]) => (
            <button
              key={action}
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                onAction(action, path);
                setPoint(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
