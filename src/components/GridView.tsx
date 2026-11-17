import { useEffect, useMemo, useRef, useState } from "react";
import { compareValues, gridModel } from "../core/grid";
import {
  findMatches,
  parseJson,
  pathKey,
  summary,
  typeOf,
  type JsonPath,
} from "../core/json";
import { InlineValue, Highlight } from "./InlineValue";
import { NodeMenu } from "./NodeMenu";
import type { ViewProps } from "./types";
import "./views.css";
import { viewLabels } from "./viewLabels";
export function GridView(props: ViewProps) {
  const searchMatches = useMemo(
    () => findMatches(props.value, props.query),
    [props.value, props.query],
  );
  return (
    <div className="jg-grid-root">
      <NestedGrid
        {...props}
        depth={0}
        budget={5000}
        searchMatches={searchMatches}
      />
    </div>
  );
}
function NestedGrid(
  props: ViewProps & {
    depth: number;
    budget: number;
    searchMatches: JsonPath[];
  },
) {
  const t = viewLabels(props.locale);
  const { value, path, depth, selected, query, filter } = props,
    model = useMemo(() => gridModel(value, path), [value, pathKey(path)]),
    [sort, setSort] = useState<{ key: string; direction: number } | null>(null),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [page, setPage] = useState(0),
    [expanded, setExpanded] = useState(new Set<string>()),
    [widths, setWidths] = useState<Record<string, number>>({}),
    [collapsed, setCollapsed] = useState(props.expansion === "none"),
    root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setCollapsed(props.expansion === "none");
    const next = new Set<string>();
    const max =
      props.expansion === "all"
        ? 256
        : typeof props.expansion === "number"
          ? props.expansion
          : props.expansion === "none"
            ? 0
            : 2;
    if (depth < max)
      for (const row of model.rows.slice(0, 50))
        for (const cell of row.cells)
          if (
            cell.value !== undefined &&
            ["array", "object"].includes(typeOf(cell.value)) &&
            cell.path.length > path.length
          )
            next.add(pathKey(cell.path));
    setExpanded(next);
  }, [props.expansionVersion, props.expansion, pathKey(path)]);
  const matches = props.searchMatches;
  let rows = model.rows.filter((row) => {
    if (
      filter &&
      query &&
      !matches.some(
        (match) =>
          row.path.every((key, index) => match[index] === key) ||
          match.every((key, index) => row.path[index] === key),
      )
    )
      return false;
    return Object.entries(filters).every(([key, expression]) => {
      if (!expression) return true;
      const cell = row.cells.find((c) => c.key === key);
      if (!cell || cell.missing) return false;
      const text = summary(cell.value!);
      const numeric = expression.match(
        /^(>=|<=|>|<|=)\s*(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?)$/i,
      );
      if (numeric && typeOf(cell.value!) === "number") {
        const comparison = compareValues(cell.value!, parseJson(numeric[2]));
        return numeric[1] === ">"
          ? comparison > 0
          : numeric[1] === "<"
            ? comparison < 0
            : numeric[1] === ">="
              ? comparison >= 0
              : numeric[1] === "<="
                ? comparison <= 0
                : comparison === 0;
      }
      return expression.startsWith("=")
        ? text.replace(/^"|"$/g, "") === expression.slice(1)
        : text.toLocaleLowerCase().includes(expression.toLocaleLowerCase());
    });
  });
  if (sort)
    rows = [...rows].sort((a, b) => {
      const ac = a.cells.find((c) => c.key === sort.key),
        bc = b.cells.find((c) => c.key === sort.key);
      if (ac?.missing || bc?.missing)
        return ac?.missing === bc?.missing ? 0 : ac?.missing ? 1 : -1;
      return compareValues(ac!.value!, bc!.value!) * sort.direction;
    });
  const pageSize = Math.max(1, Math.min(50, props.budget));
  const currentPage = Math.min(
      page,
      Math.max(0, Math.ceil(rows.length / pageSize) - 1),
    ),
    shown = rows.slice(
      currentPage * pageSize,
      currentPage * pageSize + pageSize,
    );
  const openedCount = shown.reduce(
      (count, row) =>
        count +
        row.cells.filter(
          (cell) =>
            !cell.missing &&
            ["array", "object"].includes(typeOf(cell.value!)) &&
            expanded.has(pathKey(cell.path)) &&
            cell.path.length > path.length,
        ).length,
      0,
    ),
    childBudget = Math.floor(
      Math.max(0, props.budget - shown.length) / Math.max(1, openedCount),
    );
  useEffect(() => {
    if (!query) return;
    const index = rows.findIndex((row) =>
      row.path.every((key, i) => selected[i] === key),
    );
    if (index >= 0) setPage(Math.floor(index / pageSize));
    setCollapsed(false);
    setExpanded((previous) => {
      const next = new Set(previous);
      for (let n = path.length + 1; n < selected.length; n++)
        next.add(pathKey(selected.slice(0, n)));
      return next;
    });
  }, [pathKey(selected), query, pageSize]);
  useEffect(() => {
    if (query)
      root.current
        ?.querySelector('[data-selected="true"]')
        ?.scrollIntoView?.({ block: "nearest" });
  }, [pathKey(selected), query, currentPage]);
  return (
    <div
      className="jg-nested-grid"
      ref={root}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="jg-grid-caption">
        <button
          aria-label={collapsed ? t.expandGrid : t.collapseGrid}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <span>{depth === 0 ? t.jsonData : String(path.at(-1))}</span>
        <span className="jg-muted">{t.rows(model.rows.length)}</span>
      </div>
      {model.notice && (
        <div className="jg-grid-notice" role="status">
          {t.wide(model.columnCount, model.rows.length)}
        </div>
      )}
      {!collapsed && (
        <>
          <div className="jg-grid-scroll">
            <table className="jg-table">
              <thead>
                <tr>
                  <th className="jg-index">{t.index}</th>
                  {model.columns.map((column) => (
                    <th
                      key={column}
                      style={{
                        width: widths[column] || 180,
                        minWidth: widths[column] || 180,
                      }}
                    >
                      <button
                        className="jg-sort"
                        aria-label={`${t.sort} ${column}`}
                        onClick={() => {
                          setSort({
                            key: column,
                            direction:
                              sort?.key === column ? -sort.direction : 1,
                          });
                          setPage(0);
                        }}
                      >
                        <Highlight text={column} query={query} />{" "}
                        {sort?.key === column
                          ? sort.direction === 1
                            ? "↑"
                            : "↓"
                          : "↕"}
                      </button>
                      <span
                        role="separator"
                        aria-label={`${t.resize} ${column}`}
                        aria-orientation="vertical"
                        tabIndex={0}
                        className="jg-resize"
                        onKeyDown={(e) => {
                          if (e.key === "ArrowRight" || e.key === "ArrowLeft")
                            setWidths((w) => ({
                              ...w,
                              [column]: Math.max(
                                90,
                                (w[column] || 180) +
                                  (e.key === "ArrowRight" ? 20 : -20),
                              ),
                            }));
                        }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          const start = e.clientX,
                            width = widths[column] || 180;
                          const move = (event: PointerEvent) =>
                            setWidths((w) => ({
                              ...w,
                              [column]: Math.max(
                                90,
                                width + event.clientX - start,
                              ),
                            }));
                          const stop = () => {
                            window.removeEventListener("pointermove", move);
                            window.removeEventListener("pointerup", stop);
                          };
                          window.addEventListener("pointermove", move);
                          window.addEventListener("pointerup", stop);
                        }}
                      />
                      <input
                        aria-label={`${t.filter} ${column}`}
                        placeholder={t.filterHint}
                        value={filters[column] || ""}
                        onChange={(e) => {
                          setFilters({ ...filters, [column]: e.target.value });
                          setPage(0);
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={pathKey(row.path)}>
                    <th className="jg-row-key">
                      <NodeMenu
                        locale={props.locale}
                        path={row.path}
                        value={row.value}
                        disabled={props.disabled}
                        onAction={props.onAction}
                      >
                        <button onClick={() => props.onSelect(row.path)}>
                          <Highlight text={String(row.key)} query={query} />
                        </button>
                        <small>{typeOf(row.value)}</small>
                      </NodeMenu>
                    </th>
                    {row.cells.map((cell) => {
                      const branch =
                          !cell.missing &&
                          ["array", "object"].includes(typeOf(cell.value!)),
                        key = pathKey(cell.path),
                        same = key === pathKey(path),
                        isOpen = expanded.has(key) && !same;
                      return (
                        <td
                          key={cell.key}
                          data-selected={key === pathKey(selected)}
                          className={
                            key === pathKey(selected) ? "jg-selected" : ""
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!cell.missing) props.onSelect(cell.path);
                          }}
                        >
                          {cell.missing ? (
                            <button
                              className="jg-missing"
                              disabled={props.disabled}
                              onClick={() => props.onAction("add", row.path)}
                            >
                              {t.missing}
                            </button>
                          ) : (
                            <NodeMenu
                              locale={props.locale}
                              path={cell.path}
                              value={cell.value!}
                              disabled={props.disabled}
                              onAction={props.onAction}
                            >
                              <div className="jg-cell-value">
                                {branch && !same && (
                                  <button
                                    className="jg-expander"
                                    aria-label={`${isOpen ? t.collapse : t.expand} ${cell.key}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpanded((old) => {
                                        const next = new Set(old);
                                        if (next.has(key)) next.delete(key);
                                        else next.add(key);
                                        return next;
                                      });
                                    }}
                                  >
                                    {isOpen ? "▾" : "▸"}
                                  </button>
                                )}
                                <InlineValue
                                  locale={props.locale}
                                  value={cell.value!}
                                  query={query}
                                  disabled={props.disabled}
                                  onCommit={(next) =>
                                    props.onCommit(cell.path, next)
                                  }
                                  onEdit={() => props.onEdit(cell.path)}
                                />
                                <button
                                  className="jg-edit"
                                  aria-label={`${t.edit} ${cell.key}`}
                                  disabled={props.disabled}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    props.onEdit(cell.path);
                                  }}
                                >
                                  ⋯
                                </button>
                              </div>
                              {isOpen &&
                                (childBudget > 0 ? (
                                  <NestedGrid
                                    {...props}
                                    path={cell.path}
                                    depth={depth + 1}
                                    budget={childBudget}
                                  />
                                ) : (
                                  <button
                                    onClick={() =>
                                      props.onAction("focus", cell.path)
                                    }
                                  >
                                    {t.gridLimit}
                                  </button>
                                ))}
                            </NodeMenu>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <div className="jg-empty">
              {query || Object.values(filters).some(Boolean)
                ? t.noRows
                : t.empty}
            </div>
          )}
          <div className="jg-pagination">
            <span>{t.rows(rows.length)}</span>
            <button
              aria-label={t.previous}
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              ‹
            </button>
            <span>
              {currentPage + 1} /{" "}
              {Math.max(1, Math.ceil(rows.length / pageSize))}
            </span>
            <button
              aria-label={t.next}
              disabled={(currentPage + 1) * pageSize >= rows.length}
              onClick={() => setPage(currentPage + 1)}
            >
              ›
            </button>
          </div>
        </>
      )}
    </div>
  );
}
