import { useState, type ReactNode } from "react";
import { parseJson, stringifyJson, typeOf, type JsonValue } from "../core/json";
import { viewLabels, viewSummary } from "./viewLabels";
import type { ViewProps } from "./types";
export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  // Escape the user's literal query; regexp positions refer to the original text.
  const pattern = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "giu",
  );
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    parts.push(text.slice(cursor, index));
    parts.push(<mark key={index}>{match[0]}</mark>);
    cursor = index + match[0].length;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
export function InlineValue({
  value,
  query,
  disabled,
  onCommit,
  onEdit,
  locale,
}: {
  locale: ViewProps["locale"];
  value: JsonValue;
  query: string;
  disabled: boolean;
  onCommit(value: JsonValue): void;
  onEdit(): void;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(""),
    [error, setError] = useState("");
  const t = viewLabels(locale);
  const kind = typeOf(value),
    expandable = kind === "array" || kind === "object";
  function commit() {
    try {
      const next = kind === "string" ? draft : parseJson(draft);
      if (typeOf(next) !== kind) {
        setError(t.keepType);
        return;
      }
      onCommit(next);
      setEditing(false);
      setError("");
    } catch {
      setError(t.invalidJson);
    }
  }
  function startEditing() {
    if (disabled) return;
    if (expandable) onEdit();
    else {
      setDraft(kind === "string" ? String(value) : stringifyJson(value));
      setError("");
      setEditing(true);
    }
  }
  return editing ? (
    <span className="jg-inline-editor">
      <input
        aria-label={t.editValue}
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
      title={t.editHint}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEditing();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          e.stopPropagation();
          startEditing();
        }
      }}
    >
      <Highlight text={viewSummary(value, locale)} query={query} />
    </span>
  );
}
