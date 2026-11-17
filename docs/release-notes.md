# JSON Grid 0.1.0

A local JSON workbench for DBX with synchronized source, editable nested grids and a DevTools-style tree.

- Convert objects, object arrays, mixed arrays and primitive values into nested tables.
- Edit values inline; change types, add, rename and delete through node actions.
- Copy correctly escaped JSONPath, keys or subtree JSON.
- Search keys/values, navigate matches, filter ancestors/rows and sort columns while retaining source indices.
- Expand/collapse, choose expansion depth, resize columns and paginate large collections.
- Format/minify, parse JSON strings, encode JSON strings, import/export and share undo/redo across views.
- Preserve unsafe integers and numeric lexemes, distinguish missing from null and reject duplicate object keys.
- Chinese/English UI, DBX theme tokens, capability-checked clipboard/file operations and opt-in bounded drafts.

MIT licensed. No native sidecar or network permission. `host.storage` stores optional drafts/settings; `host.clipboard:read` enables the user-triggered Paste button where supported. Keyboard paste works without clipboard-read support.

The universal `.dbxp` is an **unsigned review candidate**. Official marketplace discovery and installation require DBX Store maintainer review, signing and merge. For local testing, DBX permits manual installation when unsigned development packages are explicitly enabled.

Limits: 10 MiB UTF-8 input, 256 nesting levels, 5,000 tree/display expansion budget, up to 50 grid rows per page. Wide schemas switch to complete expandable row values. Drafts retain at most two small documents (96 KiB input each, at most 240 KiB serialized combined). Larger documents should be exported.
