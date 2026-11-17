import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeView } from "../src/components/TreeView";
import { SAMPLE } from "../src/sample";
import { Highlight } from "../src/components/InlineValue";
import { GridView } from "../src/components/GridView";
import { parseJson, stringifyJson } from "../src/core/json";
import type { ViewProps } from "../src/components/types";
afterEach(cleanup);
function props(source: string, overrides: Partial<ViewProps> = {}): ViewProps {
  return {
    revision: source,
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
    onRename: vi.fn(),
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
    fireEvent.click(screen.getByRole("button", { name: "Filter score" }));
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
    expect(screen.queryByText("x")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /^Expand (object|list)/ })[0]);
    expect(screen.getByText("x")).toBeTruthy();
    expect(screen.getByText("list[0]")).toBeTruthy();
    unmount();
    render(<GridView {...props("[{},{}]")} />);
    expect(screen.getAllByText("object[0]")).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: /^Expand (object|list)/ }),
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
  it("localizes tree menus and keyboard inline errors in Chinese", () => {
    const p = props('{"count":1}', { locale: "zh-CN" });
    render(<TreeView {...p} />);
    const value = screen.getByText("1", { selector: ".jg-value" });
    fireEvent.keyDown(value, { key: "F2" });
    const editor = screen.getByRole("textbox", { name: "编辑值" });
    fireEvent.change(editor, { target: { value: "true" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(screen.getByRole("alert")).toHaveTextContent("请保持当前类型");
    fireEvent.change(editor, { target: { value: "invalid" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(screen.getByRole("alert")).toHaveTextContent("JSON 值无效");
    fireEvent.keyDown(editor, { key: "Escape" });
    fireEvent.contextMenu(screen.getByText("1", { selector: ".jg-value" }));
    expect(screen.getByRole("menuitem", { name: "复制路径" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "复制键名" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
    expect(p.onAction).toHaveBeenCalledWith("rename", ["count"]);
    fireEvent.keyDown(screen.getByText("1", { selector: ".jg-value" }), {
      key: "Enter",
    });
    expect(screen.getByRole("textbox", { name: "编辑值" })).toBeTruthy();
    expect(p.onEdit).not.toHaveBeenCalled();
  });
  it("localizes grid filtering and pagination without translating JSON keys or types", () => {
    const p = props(
      JSON.stringify(
        Array.from({ length: 51 }, (_, index) => ({ score: index })),
      ),
      { locale: "zh-CN" },
    );
    render(<GridView {...p} />);
    expect(screen.getByText("#")).toBeTruthy();
    expect(screen.queryByText("object")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText("50", { selector: ".jg-value" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "筛选 score" }));
    fireEvent.change(screen.getByRole("textbox", { name: "筛选 score" }), {
      target: { value: ">49" },
    });
    expect(screen.getByText("1 行")).toBeTruthy();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "筛选 score" }), {
      target: { value: ">100" },
    });
    expect(screen.getByText("没有匹配的行")).toBeTruthy();
  });
  it("localizes wide-grid fallback explanations", () => {
    const source = JSON.stringify([
      Object.fromEntries(
        Array.from({ length: 129 }, (_, index) => [`field${index}`, index]),
      ),
    ]);
    render(
      <GridView {...props(source, { locale: "zh-CN", expansion: "none" })} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 行、129 个字段超出表格显示上限",
    );
    expect(screen.getByRole("button", { name: "展开表格" })).toBeTruthy();
  });
  it("keeps sample order rows visible while nesting stays collapsed by default", () => {
    render(<GridView {...props(SAMPLE)} />);
    for (const name of ['"Alice Chen"', '"Noah Park"', '"Mia Wilson"'])
      expect(screen.getByText(name)).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /^Expand items\[/ }),
    ).toHaveLength(3);
    expect(
      screen.getAllByRole("button", { name: /^Expand shipping\{/ }),
    ).toHaveLength(3);
    expect(screen.queryByText('"Mechanical keyboard"')).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /^Expand items\[/ })[0]);
    expect(screen.getByText('"Mechanical keyboard"')).toBeTruthy();
  });
  it("highlights every case-insensitive literal occurrence without HTML injection", () => {
    const text = "<img src=x> A.* a.* A.*";
    const { container, rerender } = render(
      <Highlight text={text} query="a.*" />,
    );
    expect(container.querySelectorAll("mark")).toHaveLength(3);
    expect(container.textContent).toBe(text);
    expect(container.querySelector("img")).toBeNull();
    rerender(<Highlight text="😀 hi 😀 HI" query="hi" />);
    expect(container.querySelectorAll("mark")).toHaveLength(2);
    expect(container.textContent).toBe("😀 hi 😀 HI");
  });
  it("resets grid state when valid source replacement removes the sorted column", () => {
    const initial = props('[{"a":2},{"a":1}]');
    const { rerender } = render(<GridView {...initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Sort a" }));
    fireEvent.click(screen.getByRole("button", { name: "Filter a" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Filter a" }), {
      target: { value: ">0" },
    });
    rerender(<GridView {...props('[{"b":2},{"b":1}]')} />);
    expect(screen.getByRole("button", { name: "Sort b" })).toHaveTextContent(
      "↕",
    );
    expect(screen.queryByRole("textbox", { name: "Filter b" })).toBeNull();
    expect(screen.getByText("2", { selector: ".jg-value" })).toBeTruthy();
    expect(screen.getByText("1", { selector: ".jg-value" })).toBeTruthy();
  });
  it("resets filters, width and page when a schema changes with retained columns", () => {
    const before = JSON.stringify(
      Array.from({ length: 60 }, (_, a) => ({ a })),
    );
    const after = JSON.stringify(
      Array.from({ length: 60 }, (_, a) => ({ a, b: true })),
    );
    const { rerender } = render(<GridView {...props(before)} />);
    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize a" }), {
      key: "ArrowRight",
    });
    fireEvent.click(screen.getByRole("button", { name: "Filter a" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Filter a" }), {
      target: { value: ">0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.queryByText("0", { selector: ".jg-value" })).toBeNull();
    rerender(<GridView {...props(after)} />);
    expect(screen.queryByRole("textbox", { name: "Filter a" })).toBeNull();
    expect(
      screen.getByRole("separator", { name: "Resize a" }).closest("th"),
    ).toHaveStyle({ width: "180px" });
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    expect(screen.getByText("0", { selector: ".jg-value" })).toBeTruthy();
  });
  it.each([
    ["grid", GridView],
    ["tree", TreeView],
  ] as const)(
    "cancels %s drafts after a changed valid root source",
    (_name, View) => {
      const initial = props('{"a":"old"}');
      const { rerender } = render(<View {...initial} />);
      fireEvent.doubleClick(
        screen.getByText('"old"', { selector: ".jg-value" }),
      );
      fireEvent.change(screen.getByRole("textbox", { name: "Edit value" }), {
        target: { value: "stale" },
      });
      rerender(
        <View {...props('{"a":"oldf"}', { onCommit: initial.onCommit })} />,
      );
      expect(screen.queryByRole("textbox", { name: "Edit value" })).toBeNull();
      expect(
        screen.getByText('"oldf"', { selector: ".jg-value" }),
      ).toBeTruthy();
      expect(initial.onCommit).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["grid", GridView],
    ["tree", TreeView],
  ] as const)(
    "cancels %s drafts after an array shift with the same displayed target value",
    (_name, View) => {
      const initial = props('["same","tail"]');
      const { rerender } = render(<View {...initial} />);
      fireEvent.doubleClick(
        screen.getByText('"same"', { selector: ".jg-value" }),
      );
      fireEvent.change(screen.getByRole("textbox", { name: "Edit value" }), {
        target: { value: "stale" },
      });
      rerender(
        <View
          {...props('["same","same","tail"]', { onCommit: initial.onCommit })}
        />,
      );
      expect(screen.queryByRole("textbox", { name: "Edit value" })).toBeNull();
      expect(
        screen.getAllByText('"same"', { selector: ".jg-value" }),
      ).toHaveLength(2);
      expect(initial.onCommit).not.toHaveBeenCalled();
    },
  );
  it("keeps a nested order array compact by default and honors explicit expand-all", () => {
    const initial = props(SAMPLE, { path: ["orders"] });
    const { rerender } = render(<GridView {...initial} />);
    expect(
      screen.getAllByRole("button", { name: /^Expand items\[/ }),
    ).toHaveLength(3);
    expect(
      screen.getAllByRole("button", { name: /^Expand shipping\{/ }),
    ).toHaveLength(3);
    expect(screen.queryByText('"Mechanical keyboard"')).toBeNull();
    for (const name of ['"Alice Chen"', '"Noah Park"', '"Mia Wilson"'])
      expect(screen.getByText(name)).toBeTruthy();
    rerender(<GridView {...initial} expansion="all" expansionVersion={1} />);
    expect(screen.getByText('"Mechanical keyboard"')).toBeTruthy();
    expect(screen.getByText('"Shanghai"')).toBeTruthy();
  });
});
