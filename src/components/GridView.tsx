import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { compareValues, gridModel } from "../core/grid";
import {
  findMatches,
  getAt,
  parseJson,
  pathKey,
  summary,
  typeOf,
  type JsonPath,
  type JsonValue,
} from "../core/json";
import { InlineValue, Highlight } from "./InlineValue";
import { InlineKey } from "./InlineKey";
import { ColumnFilter } from "./ColumnFilter";
import { ResizeHandle } from "./ResizeHandle";
import { NodeMenu } from "./NodeMenu";
import type { ViewProps } from "./types";
import { viewLabels, containerLabel } from "./viewLabels";
import "./views.css";

const dataId = (column: string) => `field:${column}`;
const branch = (value: JsonValue) =>
  ["array", "object"].includes(typeOf(value));
function passes(value: JsonValue, expression: string) {
  const numeric = expression.match(
    /^(>=|<=|>|<|=)\s*(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?)$/i,
  );
  if (numeric && typeOf(value) === "number") {
    const comparison = compareValues(value, parseJson(numeric[2]));
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
  const text = summary(value);
  return expression.startsWith("=")
    ? text.replace(/^"|"$/g, "") === expression.slice(1)
    : text.toLocaleLowerCase().includes(expression.toLocaleLowerCase());
}
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
    onWidth?(width: number): void;
  },
) {
  const t = viewLabels(props.locale);
  const { value, path, depth, selected, query, filter } = props;
  const model = useMemo(() => gridModel(value, path), [value, pathKey(path)]);
  const [sort, setSort] = useState<{ key: string; direction: number } | null>(
    null,
  );
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0),
    [expanded, setExpanded] = useState(new Set<string>());
  const [widths, setWidths] = useState<Record<string, number>>({}),
    [childWidths, setChildWidths] = useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState(false),
    root = useRef<HTMLDivElement>(null);
  const target = getAt(value, path),
    targetKind = typeOf(target),
    indexed = targetKind === "array";
  const columnFields =
    indexed &&
    model.rows.some((row) =>
      row.cells.some((cell) => cell.path.length > row.path.length),
    );
  const schemaKey = JSON.stringify([path, model.columns, indexed]);
  useEffect(() => {
    setSort(null);
    setFilters({});
    setWidths({});
    setPage(0);
    setChildWidths({});
  }, [schemaKey]);
  useEffect(() => {
    setCollapsed(depth === 0 && props.expansion === "none");
    const next = new Set<string>();
    const max =
      props.expansion === "all"
        ? 256
        : typeof props.expansion === "number"
          ? props.expansion
          : props.expansion === "none"
            ? 0
            : targetKind === "object"
              ? 1
              : 0;
    if (depth < max)
      for (const row of model.rows.slice(0, 50))
        for (const cell of row.cells)
          if (
            cell.value !== undefined &&
            branch(cell.value) &&
            cell.path.length > path.length
          )
            next.add(pathKey(cell.path));
    setExpanded(next);
  }, [props.expansionVersion, props.expansion, schemaKey, targetKind]);
  let rows = model.rows.filter((row) => {
    if (
      filter &&
      query &&
      !props.searchMatches.some(
        (match) =>
          row.path.every((key, i) => match[i] === key) ||
          match.every((key, i) => row.path[i] === key),
      )
    )
      return false;
    if (filters.index && !passes(row.key, filters.index)) return false;
    return model.columns.every((column) => {
      const expression = filters[dataId(column)];
      if (!expression) return true;
      const cell = row.cells.find((cell) => cell.key === column);
      return !!cell && !cell.missing && passes(cell.value!, expression);
    });
  });
  if (sort && model.columns.includes(sort.key))
    rows = [...rows].sort((a, b) => {
      const ac = a.cells.find((cell) => cell.key === sort.key),
        bc = b.cells.find((cell) => cell.key === sort.key);
      const am = !ac || ac.missing,
        bm = !bc || bc.missing;
      if (am || bm) return am === bm ? 0 : am ? 1 : -1;
      return compareValues(ac!.value!, bc!.value!) * sort.direction;
    });
  const pageSize = Math.max(1, Math.min(50, props.budget));
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / pageSize) - 1),
  );
  const shown = rows.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize,
  );
  const openedCount = shown.reduce(
    (n, row) =>
      n +
      row.cells.filter(
        (cell) =>
          !cell.missing &&
          branch(cell.value!) &&
          expanded.has(pathKey(cell.path)) &&
          cell.path.length > path.length,
      ).length,
    0,
  );
  const childBudget = Math.floor(
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

  const indexWidth = widths.index ?? (indexed ? 48 : 140);
  const columnWidths = model.columns.map((column) => {
    let required = 0;
    if (childBudget > 0)
      for (const row of shown) {
        const cell = row.cells.find((cell) => cell.key === column);
        if (
          cell &&
          !cell.missing &&
          branch(cell.value!) &&
          expanded.has(pathKey(cell.path))
        )
          required = Math.max(
            required,
            (childWidths[pathKey(cell.path)] ?? 0) + 18,
          );
      }
    return Math.max(widths[dataId(column)] ?? 180, required);
  });
  const tableWidth =
    indexWidth + columnWidths.reduce((sum, width) => sum + width, 0);
  useLayoutEffect(() => {
    props.onWidth?.(tableWidth + 2);
  }, [tableWidth, props.onWidth]);
  const setWidth = (id: string, width: number) =>
    setWidths((old) => ({ ...old, [id]: width }));
  const setFilter = (id: string, text: string) => {
    setFilters((old) => ({ ...old, [id]: text }));
    setPage(0);
  };
  const renderKey = (row: (typeof model.rows)[number]) =>
    typeof row.key === "string" &&
    row.path.length > path.length &&
    targetKind === "object" ? (
      <InlineKey
        name={row.key}
        query={query}
        revision={props.revision}
        locale={props.locale}
        disabled={props.disabled}
        onCommit={(name) => props.onRename(row.path, name)}
        onSelect={() => props.onSelect(row.path)}
      />
    ) : (
      <button onClick={() => props.onSelect(row.path)}>
        <Highlight text={String(row.key)} query={query} />
      </button>
    );
  return (
    <div
      className="jg-nested-grid"
      data-grid-path={pathKey(path)}
      ref={root}
      style={{ width: tableWidth + 2 }}
      onClick={(event) => event.stopPropagation()}
    >
      {depth === 0 && (
        <div className="jg-grid-caption">
          <button
            aria-label={collapsed ? t.expandGrid : t.collapseGrid}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? "▸" : "▾"}
          </button>
          <span>{t.jsonData}</span>
          <span className="jg-muted">{t.rows(model.rows.length)}</span>
        </div>
      )}
      {model.notice && (
        <div className="jg-grid-notice" role="status">
          {t.wide(model.columnCount, model.rows.length)}
        </div>
      )}
      {!collapsed && (
        <>
          <div className="jg-grid-scroll">
            <table className="jg-table" style={{ width: tableWidth }}>
              <colgroup>
                <col style={{ width: indexWidth }} />
                {model.columns.map((column, index) => (
                  <col key={column} style={{ width: columnWidths[index] }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="jg-index" style={{ width: indexWidth }}>
                    <div className="jg-column-heading">
                      <span>{indexed ? "#" : t.index}</span>
                      <ColumnFilter
                        key={schemaKey}
                        name={indexed ? "#" : t.index}
                        locale={props.locale}
                        value={filters.index ?? ""}
                        onChange={(text) => setFilter("index", text)}
                      />
                    </div>
                    <ResizeHandle
                      label={`${t.resize} ${indexed ? "#" : t.index}`}
                      min={indexed ? 36 : 70}
                      value={indexWidth}
                      onChange={(width) => setWidth("index", width)}
                    />
                  </th>
                  {model.columns.map((column, index) => (
                    <th key={column} style={{ width: columnWidths[index] }}>
                      <div className="jg-column-heading">
                        {columnFields ? (
                          <InlineKey
                            name={column}
                            revision={props.revision}
                            query={query}
                            locale={props.locale}
                            disabled={props.disabled}
                            onCommit={(name) =>
                              props.onRename(path, name, column)
                            }
                            onSelect={() => {
                              const row = model.rows.find((row) =>
                                row.cells.some(
                                  (cell) =>
                                    cell.key === column && !cell.missing,
                                ),
                              );
                              if (row) props.onSelect([...row.path, column]);
                            }}
                          />
                        ) : (
                          <span>{column}</span>
                        )}
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
                          {sort?.key === column
                            ? sort.direction === 1
                              ? "↑"
                              : "↓"
                            : "↕"}
                        </button>
                        <ColumnFilter
                          key={schemaKey}
                          name={column}
                          locale={props.locale}
                          value={filters[dataId(column)] ?? ""}
                          onChange={(text) => setFilter(dataId(column), text)}
                        />
                      </div>
                      <ResizeHandle
                        label={`${t.resize} ${column}`}
                        min={70}
                        value={columnWidths[index]}
                        onChange={(width) => setWidth(dataId(column), width)}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={pathKey(row.path)}>
                    <th
                      className={`jg-row-key ${pathKey(row.path) === pathKey(selected) ? "jg-selected" : ""}`}
                      data-selected={pathKey(row.path) === pathKey(selected)}
                    >
                      <NodeMenu
                        locale={props.locale}
                        path={row.path}
                        value={row.value}
                        disabled={props.disabled}
                        onAction={props.onAction}
                      >
                        {renderKey(row)}
                      </NodeMenu>
                    </th>
                    {row.cells.map((cell) => {
                      const isBranch = !cell.missing && branch(cell.value!),
                        key = pathKey(cell.path),
                        same = key === pathKey(path),
                        isOpen = expanded.has(key) && !same;
                      const label = isBranch
                        ? containerLabel(cell.value!, cell.path)
                        : "";
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
                                {isBranch ? (
                                  <button
                                    className="jg-container-toggle"
                                    aria-label={`${isOpen ? t.collapse : t.expand} ${label}`}
                                    aria-expanded={isOpen}
                                    disabled={same}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      props.onSelect(cell.path);
                                      setExpanded((old) => {
                                        const next = new Set(old);
                                        if (next.has(key)) next.delete(key);
                                        else next.add(key);
                                        return next;
                                      });
                                    }}
                                  >
                                    <span className="jg-expander">
                                      {isOpen ? "▾" : "▸"}
                                    </span>
                                    <span>
                                      <Highlight text={label} query={query} />
                                    </span>
                                  </button>
                                ) : (
                                  <InlineValue
                                    revision={props.revision}
                                    locale={props.locale}
                                    value={cell.value!}
                                    query={query}
                                    disabled={props.disabled}
                                    onCommit={(next) =>
                                      props.onCommit(cell.path, next)
                                    }
                                    onEdit={() => props.onEdit(cell.path)}
                                  />
                                )}
                                <button
                                  className="jg-edit"
                                  aria-label={`${t.edit} ${cell.key}`}
                                  disabled={props.disabled}
                                  onClick={(event) => {
                                    event.stopPropagation();
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
                                    onWidth={(width) =>
                                      setChildWidths((old) =>
                                        old[key] === width
                                          ? old
                                          : { ...old, [key]: width },
                                      )
                                    }
                                  />
                                ) : (
                                  <div className="jg-grid-notice">
                                    {t.gridLimit}
                                  </div>
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
