# JSON Grid 0.2.1

- 网格和树形分别记住离开时的展开状态和选中节点，切回来同步恢复源码高亮。
- 列宽、排序、列筛选、分页、滚动位置、搜索条件与当前搜索结果也分别保留。
- 全部展开/折叠和指定深度仅作用于当前 tab。
- 编辑源码时即使暂时无效也保留视图；路径被删除后清理无效选中，打开新文件或切换 Host 工作区时重置。
- 状态保留在当前工作台会话内，不新增持久化存储或权限。

Grid and tree tabs now retain their own exploration state and selection when switching. The JSON source and undo history remain shared. Hidden views cannot scroll or take focus. Temporary invalid input preserves state; opening a new document clears it.

Verified with 61 unit/component tests and 29 real browser cases, including the official DBX development host and five tab-state regressions.

MIT licensed. Static universal plugin; permissions remain `host.storage` and `host.clipboard:read`. The `.dbxp` is an unsigned review candidate. Official marketplace publication requires DBX Store maintainer review, signing and merge.
