# Acceptance record — 2026-11-17

## Verified locally

- Node 24.16.0, DBX plugin CLI 0.1.10, macOS arm64.
- TypeScript strict check and Vite static production build.
- 65 unit/component tests across lossless JSON, bounded grid projection, original paths, typed edits, virtualization, localization, shared document history and Host bridge.
- Forty-five real Chromium/Playwright browser flows: source/grid edits and undo/redo; tree search, literal special-key path copy and invalid-source recovery; typed edit dialog, export, locale and 390px layout; official DBX development-host opaque iframe, copy and live theme changes; retained schema/sort and stale-inline-draft regressions; source object block highlighting, duplicate-value mapping, key/column rename collisions and history, actual pointer drags for split/index/data columns (desktop and mobile), icon filters, and nested-grid non-overlap with child resizes; independent tab expansion/selection/source highlighting, search-match retention, width/sort/filter/page/scroll restoration, invalid-source recovery, stale-path cleanup, and reset on a new file with the same schema; cancel-on-internal-interaction for keys and values in both views, real Chromium document focus loss/recovery with focus emulation disabled, and isolated dev-host focus behavior; repeated Host context identity isolation and deferred import/error/busy races across identity changes; disabling/clearing drafts during deferred reads/writes.
- The dev-host iframe uses `sandbox="allow-scripts"`. Plugin parsing and editing run there with no runtime network permission. Browser file input is available as an import fallback.
- Package contract checks include minimal permissions, version identity, relative local resources, MIT and bundled dependency notices. Official CLI packaging validates the actual manifest and archive.

## Compatibility and precise limits

The published CLI 0.1.10 dev host advertises Host API 1.0.0 and injects a legacy bridge with no `capabilities` object. The plugin targets Host API major 1. Its original `copy()` operation is supported on that bridge; newer clipboard-read, native file-save and state persistence controls require their capability flags and disable on unsupported hosts. No sandbox fallback calls browser storage or browser clipboard APIs.

The installed native DBX version is 0.6.71-beta.20261115.1. Desktop installation/clipboard/file operations are tracked separately from dev-host verification.

- Input: 10 MiB UTF-8; nesting: 256. Parsing is synchronous and is not a streaming large-file engine.
- Tree: 5,000 visible flattened rows, virtualized at 28px. Collapse branches to explore other nodes beyond the display limit.
- Grid: up to 50 rows per page; nested row budgets total at most 5,000. At more than 128 columns or 100,000 projected cells, complete row values replace the wide matrix so fields remain accessible.
- Numeric tokens retain their original lexeme. Sorting uses exact decimal coefficients and BigInt exponents.
- Duplicate object keys, including escaped equivalent keys, are rejected to prevent silent overwrite.
- Shared history groups contiguous typing and keeps at most 100 previous snapshots, with an estimated 20 MiB UTF-16 snapshot budget.
- Draft storage is opt-in: up to two drafts, each at most 96 KiB input, with combined serialized value at most 240 KiB. Excess input removes its stale small draft and displays an unsaved message. Draft persistence is not a substitute for file export.

## Publication status

Source CI, Release publication and official store review/signing/merge must each be checked independently. A store PR containing an unsigned candidate intentionally stays red until a maintainer signs it; this is distinct from source test/build status.

## v0.2.2 focus behavior

Cancel inline key/value drafts only on confirmed pointer/click/focus transfers inside the plugin document. Window blur, host chrome focus and focus returning to the document/body do not cancel a draft. Source revision changes still invalidate stale edits. No host focus notification is requested.

The browser focus-loss cases disable Playwright focus emulation, verify `document.hasFocus() === false` after another page takes focus, and resume/commit the original draft after returning. Native DBX app-switch verification for this patch is tracked separately; it must not be inferred from these browser cases.

## v0.2.3 grid layout

Browser coverage verifies headerless object tables with editable keys and resizable columns, one-based array row numbers with zero-based paths after sorting, pagination above the table only when needed, light/dark header and row-number colors, and source fold control alignment on wrapped lines before and after folding.
