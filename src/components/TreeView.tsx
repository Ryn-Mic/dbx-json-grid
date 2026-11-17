import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  childrenOf,
  findMatches,
  getAt,
  pathKey,
  typeOf,
  type JsonPath,
  type JsonValue,
} from "../core/json";
import { InlineValue, Highlight } from "./InlineValue";
import { InlineKey } from "./InlineKey";
import { NodeMenu } from "./NodeMenu";
import type { ViewProps } from "./types";
import "./views.css";
import { viewLabels, containerLabel } from "./viewLabels";
const isBranch = (value: JsonValue) =>
  ["array", "object"].includes(typeOf(value));
export function TreeView(props: ViewProps) {
  const t = viewLabels(props.locale);
  const { value, path, selected, query, filter } = props,
    [open, setOpen] = useState(new Set<string>()),
    [scroll, setScroll] = useState(0),
    [viewportHeight, setViewportHeight] = useState(560),
    viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (props.active === false || !viewport.current) return;
    const element = viewport.current;
    const measure = () => setViewportHeight(element.clientHeight || 560);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.active]);
  useEffect(() => {
    const next = new Set<string>();
    function visit(p: JsonPath, depth: number) {
      if (!isBranch(getAt(value, p))) return;
      const max =
        props.expansion === "all"
          ? 256
          : typeof props.expansion === "number"
            ? props.expansion
            : props.expansion === "none"
              ? 0
              : 2;
      if (depth >= max || next.size >= 5000) return;
      next.add(pathKey(p));
      childrenOf(value, p).forEach((c) => visit(c.path, depth + 1));
    }
    visit(path, 0);
    setOpen(next);
  }, [props.expansionVersion, props.expansion, pathKey(path)]);
  const matches = useMemo(() => findMatches(value, query), [value, query]);
  useEffect(() => {
    if (!query) return;
    setOpen((previous) => {
      const next = new Set(previous);
      for (let n = path.length; n < selected.length; n++)
        next.add(pathKey(selected.slice(0, n)));
      return next;
    });
  }, [pathKey(selected), query]);
  const matchingAncestors = useMemo(() => {
    const result = new Set<string>();
    for (const match of matches)
      for (let length = 0; length <= match.length; length++)
        result.add(pathKey(match.slice(0, length)));
    return result;
  }, [matches]);
  const allowed = (p: JsonPath) =>
    !filter || !query || matchingAncestors.has(pathKey(p));
  const rows: { path: JsonPath; value: JsonValue; depth: number }[] = [];
  let capped = false;
  function walk(p: JsonPath, depth: number) {
    if (!allowed(p)) return;
    if (rows.length >= 5000) {
      capped = true;
      return;
    }
    const current = getAt(value, p);
    rows.push({ path: p, value: current, depth });
    if (open.has(pathKey(p)) || (filter && query))
      for (const child of childrenOf(value, p)) walk(child.path, depth + 1);
  }
  walk(path, 0);
  const selectedIndex = rows.findIndex(
    (r) => pathKey(r.path) === pathKey(selected),
  );
  useEffect(() => {
    if (query && props.active !== false && selectedIndex >= 0 && viewport.current) {
      viewport.current.scrollTop = Math.max(0, selectedIndex * 28 - 84);
      setScroll(viewport.current.scrollTop);
    }
  }, [selectedIndex, query, props.active]);
  function toggle(p: JsonPath, recursive = false) {
    setOpen((previous) => {
      const next = new Set(previous),
        closing = next.has(pathKey(p));
      let count = 0;
      function apply(target: JsonPath) {
        if (count++ >= 5000) return;
        if (closing) next.delete(pathKey(target));
        else next.add(pathKey(target));
        if (recursive)
          childrenOf(value, target)
            .filter((c) => isBranch(c.value))
            .forEach((c) => apply(c.path));
      }
      apply(p);
      return next;
    });
  }
  const start = Math.max(0, Math.floor(scroll / 28) - 8),
    visible = rows.slice(
      start,
      start + Math.ceil(viewportHeight / 28) + 16,
    );
  return (
    <div className="jg-tree-wrap">
      <div
        role="tree"
        aria-label={t.tree}
        className="jg-tree"
        ref={viewport}
        onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).tagName === "INPUT") return;
          const row = rows[Math.max(0, selectedIndex)];
          if (!row) return;
          if (
            [
              "ArrowDown",
              "ArrowUp",
              "ArrowRight",
              "ArrowLeft",
              "Enter",
              "F2",
            ].includes(e.key)
          )
            e.preventDefault();
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            const index = Math.max(
              0,
              Math.min(
                rows.length - 1,
                selectedIndex + (e.key === "ArrowDown" ? 1 : -1),
              ),
            );
            props.onSelect(rows[index].path);
            viewport.current!.scrollTop = Math.max(0, index * 28 - 100);
          }
          if (e.key === "ArrowRight") {
            if (isBranch(row.value) && !open.has(pathKey(row.path)))
              toggle(row.path);
            else if (rows[selectedIndex + 1])
              props.onSelect(rows[selectedIndex + 1].path);
          }
          if (e.key === "ArrowLeft") {
            if (open.has(pathKey(row.path))) toggle(row.path);
            else if (row.path.length > path.length)
              props.onSelect(row.path.slice(0, -1));
          }
          if ((e.key === "Enter" || e.key === "F2") && !props.disabled)
            props.onEdit(row.path);
        }}
      >
        <div style={{ height: rows.length * 28, position: "relative" }}>
          {visible.map((row, index) => (
            <div
              key={pathKey(row.path)}
              style={{
                position: "absolute",
                top: (start + index) * 28,
                left: 0,
                right: 0,
              }}
            >
              <NodeMenu
                locale={props.locale}
                path={row.path}
                value={row.value}
                disabled={props.disabled}
                onAction={props.onAction}
              >
                <div
                  role="treeitem"
                  aria-level={row.depth + 1}
                  aria-selected={pathKey(row.path) === pathKey(selected)}
                  aria-expanded={
                    isBranch(row.value)
                      ? open.has(pathKey(row.path))
                      : undefined
                  }
                  className={`jg-tree-row ${pathKey(row.path) === pathKey(selected) ? "jg-selected" : ""}`}
                  style={{ paddingLeft: row.depth * 18 + 8 }}
                  onClick={() => props.onSelect(row.path)}
                >
                  <button
                    className="jg-expander"
                    aria-label={`${open.has(pathKey(row.path)) ? t.collapse : t.expand} ${String(row.path.at(-1) ?? t.root)}`}
                    disabled={!isBranch(row.value)}
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onSelect(row.path);
                      toggle(row.path, e.altKey);
                    }}
                  >
                    {isBranch(row.value)
                      ? open.has(pathKey(row.path))
                        ? "▾"
                        : "▸"
                      : "·"}
                  </button>
                  {typeof row.path.at(-1) === "string" ? (
                    <InlineKey
                      name={String(row.path.at(-1))}
                      revision={props.revision}
                      query={query}
                      disabled={props.disabled}
                      locale={props.locale}
                      onCommit={(name) => props.onRename(row.path, name)}
                    />
                  ) : (
                    <span className="jg-key">
                      <Highlight
                        text={
                          isBranch(row.value)
                            ? containerLabel(row.value, row.path)
                            : String(row.path.at(-1) ?? "$")
                        }
                        query={query}
                      />
                    </span>
                  )}
                  {isBranch(row.value) &&
                    typeof row.path.at(-1) === "string" && (
                      <span className="jg-branch-count">
                        {Array.isArray(row.value)
                          ? `[${row.value.length}]`
                          : `{${Object.keys(row.value as object).length}}`}
                      </span>
                    )}
                  {!isBranch(row.value) && (
                    <>
                      <span className="jg-colon">:</span>
                      <InlineValue
                        revision={props.revision}
                        locale={props.locale}
                        value={row.value}
                        query={query}
                        disabled={props.disabled}
                        onCommit={(next) => props.onCommit(row.path, next)}
                        onEdit={() => props.onEdit(row.path)}
                      />
                    </>
                  )}
                </div>
              </NodeMenu>
            </div>
          ))}
        </div>
      </div>
      {capped && (
        <div role="status" className="jg-limit">
          {t.treeLimit}
        </div>
      )}
      {rows.length === 0 && <div className="jg-empty">{t.noNodes}</div>}
    </div>
  );
}
