import { summary, typeOf, type JsonValue } from "../core/json";
import type { ViewProps } from "./types";
const en = {
  editValue: "Edit value",
  editHint: "Double-click, Enter or F2 to edit",
  keepType: "Keep the current type, or use Edit value",
  invalidJson: "Invalid JSON value. Keep the current type, or use Edit value.",
  copyPath: "Copy path",
  copyKey: "Copy key",
  copyValue: "Copy value",
  focus: "Focus here",
  add: "Add child",
  rename: "Rename",
  delete: "Delete",
  tree: "JSON tree",
  expand: "Expand",
  collapse: "Collapse",
  root: "root",
  expandGrid: "Expand grid",
  collapseGrid: "Collapse grid",
  treeLimit:
    "Showing the first 5,000 nodes. Collapse branches or focus a subtree.",
  noNodes: "No matching nodes",
  jsonData: "JSON data",
  index: "Key / index",
  sort: "Sort",
  resize: "Resize",
  filter: "Filter",
  filterHint: "Filter · =, >, <",
  missing: "missing · add",
  edit: "Edit",
  gridLimit: "Visible row limit reached · focus subtree",
  noRows: "No matching rows",
  empty: "Empty container",
  previous: "Previous page",
  next: "Next page",
  rows: (count: number) => `${count} rows`,
  wide: (columns: number, rows: number) =>
    `Showing complete row values: ${columns} fields across ${rows} rows exceed the grid display limit.`,
};
const zh: typeof en = {
  editValue: "编辑值",
  editHint: "双击、Enter 或 F2 编辑",
  keepType: "请保持当前类型，或使用“编辑值”更改类型",
  invalidJson: "JSON 值无效。请保持当前类型，或使用“编辑值”更改类型。",
  copyPath: "复制路径",
  copyKey: "复制键名",
  copyValue: "复制值",
  focus: "聚焦此处",
  add: "添加子项",
  rename: "重命名",
  delete: "删除",
  tree: "JSON 树",
  expand: "展开",
  collapse: "折叠",
  root: "根节点",
  expandGrid: "展开表格",
  collapseGrid: "折叠表格",
  treeLimit: "仅显示前 5,000 个节点。请折叠分支或聚焦子树。",
  noNodes: "没有匹配的节点",
  jsonData: "JSON 数据",
  index: "键名 / 索引",
  sort: "排序",
  resize: "调整列宽",
  filter: "筛选",
  filterHint: "筛选 · =、>、<",
  missing: "缺失 · 添加",
  edit: "编辑",
  gridLimit: "已达到可见行数上限 · 聚焦子树",
  noRows: "没有匹配的行",
  empty: "空容器",
  previous: "上一页",
  next: "下一页",
  rows: (count: number) => `${count} 行`,
  wide: (columns: number, rows: number) =>
    `${rows} 行、${columns} 个字段超出表格显示上限，改为显示每行的完整值。`,
};
export const viewLabels = (locale: ViewProps["locale"]) =>
  locale === "zh-CN" ? zh : en;
export function viewSummary(value: JsonValue, locale: ViewProps["locale"]) {
  if (locale === "zh-CN") {
    if (Array.isArray(value)) return `[${value.length} 项]`;
    if (typeOf(value) === "object")
      return `{${Object.keys(value as object).length} 个键}`;
  }
  return summary(value);
}
