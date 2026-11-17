import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

export const highlightSource = StateEffect.define<{
  from: number;
  to: number;
} | null>();
export const sourceHighlight = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(current, transaction) {
    if (transaction.docChanged) current = Decoration.none;
    for (const effect of transaction.effects)
      if (effect.is(highlightSource)) {
        const range = effect.value;
        if (!range || range.to > transaction.newDoc.length)
          return Decoration.none;
        const first = transaction.newDoc.lineAt(range.from).number;
        const last = transaction.newDoc.lineAt(
          Math.max(range.from, range.to - 1),
        ).number;
        const lines = [];
        for (let line = first; line <= last; line++)
          lines.push(
            Decoration.line({
              attributes: { class: "cm-json-selected" },
            }).range(transaction.newDoc.line(line).from),
          );
        current = Decoration.set(lines);
      }
    return current;
  },
  provide: (field) => EditorView.decorations.from(field),
});
