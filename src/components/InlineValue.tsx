import { useState } from "react";
import {
  parseJson,
  stringifyJson,
  summary,
  typeOf,
  type JsonValue,
} from "../core/json";
export function Highlight({ text, query }: { text: string; query: string }) {
  const index = query
    ? text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
    : -1;
  return index < 0 ? (
    <>{text}</>
  ) : (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}
export function InlineValue({
  value,
  query,
  disabled,
  onCommit,
  onEdit,
}: {
  value: JsonValue;
  query: string;
  disabled: boolean;
  onCommit(value: JsonValue): void;
  onEdit(): void;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(""),
    [error, setError] = useState("");
  const kind = typeOf(value),
    expandable = kind === "array" || kind === "object";
  function commit() {
    try {
      const next = kind === "string" ? draft : parseJson(draft);
      if (typeOf(next) !== kind)
        throw new Error("Keep the current type, or use Edit value");
      onCommit(next);
      setEditing(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return editing ? (
    <span className="jg-inline-editor">
      <input
        aria-label="Edit value"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setEditing(false);
            setError("");
          }
        }}
      />
      {error && <span role="alert">{error}</span>}
    </span>
  ) : (
    <span
      className={`jg-value jg-${kind}`}
      tabIndex={disabled ? -1 : 0}
      title="Double-click to edit"
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        if (expandable) onEdit();
        else {
          setDraft(kind === "string" ? String(value) : stringifyJson(value));
          setEditing(true);
        }
      }}
    >
      <Highlight text={summary(value)} query={query} />
    </span>
  );
}
