# JSON Grid 0.2.0

- 点击网格或树节点，源码对应行同步高亮；对象和数组覆盖整个块。
- 双击字段名行内编辑。对象数组列头重命名覆盖所有行，重名时拒绝整次操作，支持撤销。
- 中线可拖动两区宽度；所有表格列（包括键名/索引列）支持鼠标拖拽和键盘调整。自动索引列默认 48px。
- 所有列筛选默认只显示图标，点击打开，收起后保留条件，可显式清空。
- 嵌套容器使用 `key[count]` / `key{count}` 单次展开；匿名容器使用 `list[count]` / `object[count]`。
- 子表和子列调整会增大父列，并推动后续列，避免覆盖；移除了子树聚焦功能。

Source block highlighting, inline field/column renaming, draggable split and all columns, compact indices, icon filters, and single-toggle nested tables that grow parent columns. Subtree focus was removed.

Verified with 61 unit/component tests and 24 real browser cases, including the official opaque-origin DBX development host. Lossless numbers, shared history, context isolation and draft/import race checks remain covered.

MIT licensed. Static universal plugin with bundled dependencies; permissions remain `host.storage` and `host.clipboard:read`. No native sidecar or runtime network permission.

The `.dbxp` remains an **unsigned review candidate**. Official marketplace publication requires DBX Store maintainer review, signing and merge. Manual installation requires explicitly enabling unsigned development packages; restore that setting after installation.
