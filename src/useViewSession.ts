import { useCallback, useEffect, useMemo, useState } from "react";
import { findMatches, getAt, type JsonPath, type JsonValue } from "./core/json";
import type { ViewProps } from "./components/types";

/** Navigation belongs to a view; only the document and its history are shared. */
export function useViewSession(value: JsonValue | undefined) {
  const [selected, setSelected] = useState<JsonPath>([]);
  const [selectionActive, setSelectionActive] = useState(false);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [expansion, setExpansion] = useState<ViewProps["expansion"]>("default");
  const [expansionVersion, setExpansionVersion] = useState(0);
  const select = useCallback((path: JsonPath) => {
    setSelected(path);
    setSelectionActive(true);
    setSelectionVersion((version) => version + 1);
  }, []);
  useEffect(() => {
    if (value === undefined) return;
    try {
      getAt(value, selected);
    } catch {
      setSelected([]);
      setSelectionActive(false);
    }
  }, [value, selected]);
  const matches = useMemo(
    () => (value === undefined || !query ? [] : findMatches(value, query)),
    [value, query],
  );
  useEffect(() => {
    setMatchIndex(0);
    if (query && matches.length) select(matches[0]);
  }, [matches, query, select]);
  const activeIndex = matches.length ? matchIndex % matches.length : 0;
  const chooseMatch = (direction: number) => {
    if (!matches.length) return;
    const next = (activeIndex + direction + matches.length) % matches.length;
    setMatchIndex(next);
    select(matches[next]);
  };
  const expand = (next: ViewProps["expansion"]) => {
    setExpansion(next);
    setExpansionVersion((version) => version + 1);
  };
  const reset = () => {
    setSelected([]);
    setSelectionActive(false);
    setSelectionVersion((version) => version + 1);
    setQuery("");
    setFilter(false);
    setMatchIndex(0);
    setExpansion("default");
    setExpansionVersion((version) => version + 1);
  };
  return {
    selected,
    setSelected: select,
    selectionActive,
    selectionVersion,
    select,
    query,
    setQuery,
    filter,
    setFilter,
    matches,
    activeIndex,
    chooseMatch,
    expansion,
    expansionVersion,
    expand,
    reset,
  };
}
