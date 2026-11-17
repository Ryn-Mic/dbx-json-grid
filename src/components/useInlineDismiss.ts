import { useEffect, useRef } from "react";

/** Cancel only for confirmed interactions in this plugin document, never for window blur. */
export function useInlineDismiss(editing: boolean, cancel: () => void) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!editing || !element) return;
    const doc = element.ownerDocument;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !element.contains(event.target))
        cancel();
    };
    const focus = (event: FocusEvent) => {
      // Returning to a window may report its document/body, without choosing another control.
      if (
        !doc.hasFocus() ||
        event.target === doc.body ||
        event.target === doc.documentElement
      )
        return;
      outside(event);
    };
    doc.addEventListener("pointerdown", outside, true);
    doc.addEventListener("click", outside, true); // Also covers accessibility/keyboard activation.
    doc.addEventListener("focusin", focus, true);
    return () => {
      doc.removeEventListener("pointerdown", outside, true);
      doc.removeEventListener("click", outside, true);
      doc.removeEventListener("focusin", focus, true);
    };
  }, [editing, cancel]);
  return ref;
}
