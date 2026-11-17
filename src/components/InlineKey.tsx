import { useEffect, useState } from "react";
import { Highlight } from "./InlineValue";
import { viewLabels } from "./viewLabels";
import type { ViewProps } from "./types";

export function InlineKey({
  name,
  revision,
  query,
  disabled,
  locale,
  onCommit,
  onSelect,
}: {
  name: string;
  revision: string;
  query: string;
  disabled: boolean;
  locale: ViewProps["locale"];
  onCommit(name: string): void;
  onSelect?(): void;
}) {
  const t = viewLabels(locale);
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(name),
    [error, setError] = useState(""),
    [started, setStarted] = useState(revision);
  useEffect(() => {
    setEditing(false);
    setError("");
  }, [revision, name]);
  const start = () => {
    if (disabled) return;
    onSelect?.();
    setDraft(name);
    setError("");
    setStarted(revision);
    setEditing(true);
  };
  return editing && started === revision ? (
    <span className="jg-inline-editor jg-key-editor">
      <input
        autoFocus
        aria-label={`${t.editKey} ${name}`}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            setEditing(false);
            setError("");
          }
          if (e.key === "Enter" && !disabled && started === revision) {
            e.preventDefault();
            try {
              onCommit(draft);
              setEditing(false);
              setError("");
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }
        }}
      />
      {error && <span role="alert">{error}</span>}
    </span>
  ) : (
    <span
      className="jg-key"
      tabIndex={disabled ? -1 : 0}
      title={t.keyHint}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        start();
      }}
      onKeyDown={(e) => {
        if (e.key === "F2" || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          start();
        }
      }}
    >
      <Highlight text={name} query={query} />
    </span>
  );
}
