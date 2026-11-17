import { useEffect, useState, type ReactNode } from "react";
import type { JsonValue } from "../core/json";
import type { ViewProps } from "./types";
import { GridView } from "./GridView";
import { TreeView } from "./TreeView";

export function ViewPanels({
  value,
  tab,
  grid,
  tree,
  children,
}: {
  value: JsonValue | undefined;
  tab: "grid" | "tree";
  grid: Omit<ViewProps, "value">;
  tree: Omit<ViewProps, "value">;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState({
    grid: tab === "grid",
    tree: tab === "tree",
  });
  const [lastValidValue, setLastValidValue] = useState(value);
  // Keep the structured views mounted during temporary invalid source input.
  // A new document remounts this component with a new key and clears the cache.
  if (value !== undefined && value !== lastValidValue) setLastValidValue(value);
  useEffect(() => {
    setVisited((previous) =>
      previous[tab] ? previous : { ...previous, [tab]: true },
    );
  }, [tab]);
  return (
    <>
      {lastValidValue !== undefined && (
        <>
          {(visited.grid || tab === "grid") && (
            <div
              role="tabpanel"
              id="grid-panel"
              aria-labelledby="grid-tab"
              className="view-tabpanel"
              hidden={tab !== "grid" || value === undefined}
              inert={tab !== "grid" || value === undefined}
            >
              <GridView {...grid} value={lastValidValue} />
            </div>
          )}
          {(visited.tree || tab === "tree") && (
            <div
              role="tabpanel"
              id="tree-panel"
              aria-labelledby="tree-tab"
              className="view-tabpanel"
              hidden={tab !== "tree" || value === undefined}
              inert={tab !== "tree" || value === undefined}
            >
              <TreeView {...tree} value={lastValidValue} />
            </div>
          )}
        </>
      )}
      {value === undefined && children}
    </>
  );
}
