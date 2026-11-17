import { describe, expect, it } from "vitest";
import { parseSource, sourceRange } from "../src/core/source";
import { EditorState } from "@codemirror/state";
import { highlightSource, sourceHighlight } from "../src/sourceHighlight";

describe("source block selection", () => {
  const text =
    '{\n  "a.b": [\n    {\n      "escaped\\\"key": 9007199254740993,\n      "same": true\n    },\n    { "same": true }\n  ],\n  "tail": null\n}';
  const tree = parseSource(text);
  it("resolves escaped keys and distinct duplicate values by original path without numeric conversion", () => {
    const range = sourceRange(text, tree, ["a.b", 0, 'escaped"key'])!;
    expect(text.slice(range.from, range.to)).toBe(
      '"escaped\\\"key": 9007199254740993',
    );
    const first = sourceRange(text, tree, ["a.b", 0, "same"])!;
    const second = sourceRange(text, tree, ["a.b", 1, "same"])!;
    expect(first.from).toBeLessThan(second.from);
    expect(text.slice(second.from, second.to)).toBe('"same": true');
  });
  it("highlights every occupied line of an object, clearing stale decorations on source edits", () => {
    const range = sourceRange(text, tree, ["a.b", 0])!;
    let state = EditorState.create({
      doc: text,
      extensions: [sourceHighlight],
    });
    state = state.update({ effects: highlightSource.of(range) }).state;
    const lines: number[] = [];
    state.field(sourceHighlight).between(0, text.length, (from) => {
      lines.push(state.doc.lineAt(from).number);
    });
    expect(lines).toEqual([3, 4, 5, 6]);
    state = state.update({
      changes: { from: 0, to: text.length, insert: "null" },
    }).state;
    expect(state.field(sourceHighlight).size).toBe(0);
  });
  it("includes multiline property names/colon/container from key through closing brace", () => {
    const source = '{\n "obj"\n : {\n  "x": 1\n }\n}';
    const range = sourceRange(source, parseSource(source), ["obj"])!;
    expect(source.slice(range.from, range.to)).toBe(
      '"obj"\n : {\n  "x": 1\n }',
    );
  });
  it("rejects invalid syntax, stale paths and incorrect array-key types", () => {
    expect(parseSource('{"a":')).toBeNull();
    expect(sourceRange(text, null, [])).toBeNull();
    expect(sourceRange(text, tree, ["absent"])).toBeNull();
    expect(sourceRange(text, tree, ["a.b", "0"])).toBeNull();
    expect(sourceRange(text, tree, ["a.b", 12])).toBeNull();
  });
});
