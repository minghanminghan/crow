# TODO

## CLI over HTTP (for hosting)

- Add `POST /api/canvas/:id/ops` that takes `Op[]` and calls `applyOps` from `src/lib/ops.ts`. Returns results, or 4xx with the `OpError` message.
- Add read routes for `ls` and `show` (filters as query params, reusing `view`), plus board create/rename/delete.
- Auth: API token in a header (`Authorization: Bearer $CROW_TOKEN`), checked by the routes.
- CLI: when `CROW_URL` is set, send ops over HTTP instead of touching `data/` directly. Keep local mode for dev.
- Ship: `pnpm build:cli` → `dist/crow.mjs`; publish or `npm i -g` from the repo so `crow` is on PATH.
- Local mode reads `./data` relative to cwd, so it only works from the repo (or with `DATA_DIR`). HTTP mode removes this.

## CLI limitations

- Live reload drops unsaved browser edits. If a CLI change lands within ~500ms of typing, those keystrokes are lost.
- Undo in an open tab can revert a CLI change (history stores whole-doc snapshots).
- Text notes only. No `add --file` for images/files; `edit --text` fails on file nodes.
- `rename` writes without a version check, so it can (rarely) clobber a browser save.
- `--color` isn't validated (JSON Canvas expects `1`–`6` or a hex color).
- No CLI tests.
- Notes with a URL fetch a link preview over the network, which slows `add`/`edit` (and batch retries refetch).

## CLI open questions

- Who's the main user, people or agents? Agents want batch ops and compact output; people want readable output.
- Should remote changes merge with unsaved browser edits instead of replacing them?
- MCP server or Claude skill on top of the CLI?
