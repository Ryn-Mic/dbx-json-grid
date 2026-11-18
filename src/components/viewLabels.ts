import { summary, typeOf, type JsonPath, type JsonValue } from "../core/json";
import type { ViewProps } from "./types";
const en = {
  editValue: "Edit value",
  editHint: "Double-click, Enter or F2 to edit",
  keepType: "Keep the current type, or use Edit value",
  invalidJson: "Invalid JSON value. Keep the current type, or use Edit value.",
  copyPath: "Copy path",
  copyKey: "Copy key",
  copyValue: "Copy value",
  add: "Add child",
  rename: "Rename",
  delete: "Delete",
  tree: "JSON tree",
  expand: "Expand",
  collapse: "Collapse",
  root: "root",
  treeLimit:
    "Showing the first 5,000 nodes. Collapse branches to see other nodes.",
  noNodes: "No matching nodes",
  key: "Key",
  value: "Value",
  pagination: "Table pages",
  sort: "Sort",
  resize: "Resize",
  filter: "Filter",
  filterHint: "Filter · =, >, <",
  missing: "missing · add",
  edit: "Edit",
  gridLimit: "Visible row limit reached. Collapse other branches to expand this one.",
  clearFilter: "Clear filter",
  keyHint: "Double-click or F2 to rename",
  editKey: "Edit field name",
  noRows: "No matching rows",
  empty: "Empty container",
  previous: "Previous page",
  next: "Next page",
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
  add: "添加子项",
  rename: "重命名",
  delete: "删除",
  tree: "JSON 树",
  expand: "展开",
  collapse: "折叠",
  root: "根节点",
  treeLimit: "仅显示前 5,000 个节点。请折叠分支以查看其他节点。",
  noNodes: "没有匹配的节点",
  key: "键",
  value: "值",
  pagination: "表格分页",
  sort: "排序",
  resize: "调整列宽",
  filter: "筛选",
  filterHint: "筛选 · =、>、<",
  missing: "缺失 · 添加",
  edit: "编辑",
  gridLimit: "已达到可见行数上限，请折叠其他分支后再展开。",
  clearFilter: "清除筛选",
  keyHint: "双击或 F2 重命名",
  editKey: "编辑字段名",
  noRows: "没有匹配的行",
  empty: "空容器",
  previous: "上一页",
  next: "下一页",
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

export function containerLabel(value: JsonValue, path: JsonPath) {
  const name = path.at(-1), named = typeof name === 'string';
  if (Array.isArray(value)) return `${named ? name : 'list'}[${value.length}]`;
  const count = Object.keys(value as object).length;
  return named ? `${name}{${count}}` : `object[${count}]`;
}
