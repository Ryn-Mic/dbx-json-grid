import { useRef, type PointerEvent } from "react";

/** Capture synchronously so even a fast drag or a pointer outside the pane keeps resizing. */
export function ResizeHandle({
  value,
  min,
  max = 10000,
  step = 20,
  onChange,
  label,
  className = "jg-resize",
  scale = () => 1,
  axis = () => "x",
  onDragging,
  onDoubleClick,
}: {
  value: number;
  min: number;
  max?: number;
  step?: number;
  onChange(value: number): void;
  label: string;
  className?: string;
  scale?: () => number;
  axis?: () => "x" | "y";
  onDragging?(active: boolean): void;
  onDoubleClick?(): void;
}) {
  const drag = useRef<{
    id: number;
    start: number;
    value: number;
    scale: number;
    axis: "x" | "y";
  } | null>(null);
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  const stop = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    onDragging?.(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={className}
      onDoubleClick={onDoubleClick}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const direction = axis();
        drag.current = {
          id: event.pointerId,
          start: direction === "x" ? event.clientX : event.clientY,
          value,
          scale: scale(),
          axis: direction,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        onDragging?.(true);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        onChange(
          clamp(
            current.value +
              ((current.axis === "x" ? event.clientX : event.clientY) -
                current.start) /
                current.scale,
          ),
        );
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={(event) => {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          onChange(
            clamp(
              value +
                (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) *
                  step,
            ),
          );
        }
      }}
    >
      <span />
    </div>
  );
}
