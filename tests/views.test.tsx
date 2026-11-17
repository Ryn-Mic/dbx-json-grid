import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeView } from "../src/components/TreeView";
import { GridView } from "../src/components/GridView";
import { parseJson, stringifyJson } from "../src/core/json";
import type { ViewProps } from "../src/components/types";
afterEach(cleanup);
function props(source: string, overrides: Partial<ViewProps> = {}): ViewProps {
  return {
    value: parseJson(source),
    path: [],
    selected: [],
    query: "",
    filter: false,
    expansion: "default",
    expansionVersion: 0,
    disabled: false,
    locale: "en",
    onSelect: vi.fn(),
    onEdit: vi.fn(),
    onCommit: vi.fn(),
    onAction: vi.fn(),
    ...overrides,
  };
}
describe("editable JSON views", () => {
  it("commits lossless numeric edits and cancels string edits", () => {
    const p = props('{"n":123,"s":"hello"}');
    render(<TreeView {...p} />);
    fireEvent.doubleClick(screen.getByText("123"));
    const input = screen.getByRole("textbox", { name: "Edit value" });
    fireEvent.change(input, { target: { value: "900719925474099312345" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(p.onCommit).toHaveBeenCalledWith(["n"], expect.anything());
    expect(
      stringifyJson((p.onCommit as ReturnType<typeof vi.fn>).mock.calls[0][1]),
    ).toBe("900719925474099312345");
    fireEvent.doubleClick(screen.getByText('"hello"'));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "changed" },
    });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(screen.getByText('"hello"')).toBeTruthy();
    expect(p.onCommit).toHaveBeenCalledTimes(1);
  });
  it("rejects accidental type changes and permits boolean and null edits", () => {
    const p = props('{"b":true,"n":null}');
    render(<TreeView {...p} />);
    fireEvent.doubleClick(screen.getByText("true"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: '"false"' },
    });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "false" },
    });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(p.onCommit).toHaveBeenCalledWith(["b"], false);
  });
  it("collapses the root and permits reopening it manually", () => {
    const p = props('{"nested":{"leaf":1}}', { expansion: "none" });
    render(<TreeView {...p} />);
    expect(screen.queryByText("nested")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand root" }));
    expect(screen.getByText("nested")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Expand nested" }));
    expect(screen.getByText("leaf")).toBeTruthy();
  });
  it("retains matching ancestors and hides unrelated branches", () => {
    render(
      <TreeView
        {...props('{"ancestor":{"child":"needle"},"unrelated":3}', {
          query: "needle",
          filter: true,
        })}
      />,
    );
    expect(screen.getByText("ancestor")).toBeTruthy();
    expect(screen.getByText("child")).toBeTruthy();
    expect(screen.queryByText("unrelated")).toBeNull();
  });
  it("sorts and filters while editing original array indices", () => {
    const p = props('[{"score":2},{"score":1}]');
    render(<GridView {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Sort score" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Filter score" }), {
      target: { value: "<2" },
    });
    expect(screen.queryByText("2")).toBeNull();
    fireEvent.doubleClick(screen.getByText("1", { selector: ".jg-value" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit value" }), {
      target: { value: "3" },
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Edit value" }), {
      key: "Enter",
    });
    expect(p.onCommit).toHaveBeenCalledWith([1, "score"], expect.anything());
  });
  it("distinguishes null from a missing cell and adds at the row path", () => {
    const p = props('[{"x":null},{"y":2}]');
    render(<GridView {...p} />);
    expect(screen.getByText("null")).toBeTruthy();
    const missing = screen.getAllByRole("button", { name: "missing · add" });
    fireEvent.click(missing[1]);
    expect(p.onAction).toHaveBeenCalledWith("add", [1]);
  });
  it("supports mixed arrays and empty object rows through nested grids", () => {
    const { unmount } = render(<GridView {...props('[1,{"x":2},[]]')} />);
    expect(screen.getByText("x")).toBeTruthy();
    expect(screen.getByText("[0 items]")).toBeTruthy();
    unmount();
    render(<GridView {...props("[{},{}]")} />);
    expect(screen.getAllByText("{0 keys}")).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: "Collapse value" }),
    ).toHaveLength(2);
  });
  it("paginates 50 source rows and opens a keyboard accessible context menu", () => {
    const p = props(JSON.stringify(Array.from({ length: 51 }, (_, i) => i)));
    render(<GridView {...p} />);
    expect(screen.queryByText("50", { selector: ".jg-value" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    const value = screen.getByText("50", { selector: ".jg-value" });
    fireEvent.contextMenu(value);
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Copy path" }));
    expect(p.onAction).toHaveBeenCalledWith("copy-path", [50]);
  });
  it("virtualizes large trees and reports the visible expansion cap", () => {
    render(
      <TreeView
        {...props(JSON.stringify(Array.from({ length: 6000 }, (_, i) => i)), {
          expansion: "all",
        })}
      />,
    );
    expect(screen.getAllByRole("treeitem").length).toBeLessThan(50);
    expect(screen.getByRole("status").textContent).toContain("5,000");
  });
  it("opens the original selected search row on a later grid page", () => {
    const value = JSON.stringify(
      Array.from({ length: 70 }, (_, i) => `item ${i}`),
    );
    render(
      <GridView {...props(value, { query: "item 65", selected: [65] })} />,
    );
    const selectedCell = screen
      .getByText("item 65", { selector: "mark" })
      .closest("td");
    expect(selectedCell?.dataset.selected).toBe("true");
  });
});
