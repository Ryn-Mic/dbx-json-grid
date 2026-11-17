# JSON Grid 0.2.2

- 双击行内编辑字段名或值时，点击插件内其他单元格、源码区或空白处，会取消编辑并丢弃未提交修改。
- 插件内用 Tab 等方式将焦点移到其他控件，也会取消编辑；再次双击另一个单元格只保留新的编辑框。
- 切到其他应用或插件外宿主区域时保留编辑框和草稿，回来继续。不会仅凭 blur 或空的焦点去向丢弃内容，不要求宿主配合。
- Enter 提交、Esc 取消保持不变。JSON 源码、撤销历史或文档发生变化时，仍清理过期编辑草稿。
- 展开、选中、搜索、筛选、列宽、分页等 tab 状态保留功能不变；切换插件内部 tab 会取消未提交的行内编辑。

Inline keys and values now cancel on confirmed interactions elsewhere inside the plugin document. Window focus loss preserves the editor and its draft. Returning to the editor continues editing; Enter commits and Escape cancels. No host focus API or new permissions are required.

Verified with65 unit/component tests and40 browser cases, including real Chromium focus-loss/recovery with focus emulation disabled and the official DBX opaque-origin development host. Native desktop acceptance is tracked separately.

MIT licensed. Static universal plugin; permissions remain `host.storage` and `host.clipboard:read`. The `.dbxp` is an unsigned review candidate. Official marketplace publication requires DBX Store maintainer review, signing and merge.
