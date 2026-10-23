# Research Canvas — Design

## Intent

A personal research canvas. You collect what you read (links, photos, videos, files) on an infinite canvas, write markdown notes next to it, put related items in loose groups, and draw labeled lines between ideas.

Why: a paper notebook is fast and focused but cannot hold URLs. Whiteboard tools (Excalidraw, tldraw) hold URLs but are slower than paper for getting ideas down and are built for drawing, not research. This app is for the research/note-taking process on a canvas, not general whiteboarding.

## Goals

- Getting an item onto the canvas takes one or two actions (paste, double-click, drop).
- URLs render as preview cards (image, title, site).
- Notes are markdown, rendered on the canvas.
- Groups are loose labeled boxes: move and resize. They do not own their contents.
- Lines connect any two nodes and may have a label.
- Many canvases, one per project.
- Simple. Few features.

## Non-goals (v1)

- Freehand drawing, shapes, search, mobile/phone capture, kb integration, sharing, multi-user, auth.

## Anti-goals

- Becoming a feature-heavy whiteboard. Every added tool must earn its place.
- Slow capture. If adding a link or note takes more steps than writing it in a notebook, it failed.

## Constraints (decided by user)

- Next.js, TypeScript, Tailwind, pnpm.
- Canvas built from scratch. No whiteboard library (no tldraw/Excalidraw/React Flow).
- Storage format: JSON Canvas 1.0 (https://jsoncanvas.org), one `.canvas` file per canvas.

## Calls made without the user (builder check)

- Runs only on `localhost` for one user (`pnpm dev` / `pnpm start`). No hosting, no auth. Writes straight to the filesystem.
- Obsidian: files must open in Obsidian, but round-trip is best effort. Keep unknown fields on nodes/edges/top level when saving. Render only `file` nodes under `data/`; others show as a plain file card.
- No external-edit detection. One tab per canvas assumed; last write wins.
- Rename keeps the id. Deleting nodes or canvases does not delete asset files.

## Storage

- Data folder: `data/` at project root (override with `DATA_DIR` env var). *(builder's call: path)*
- `data/<id>.canvas` — JSON Canvas document. `id` is a slug from the name plus a short random suffix.
- `data/assets/` — uploaded files. Referenced from `file` nodes by path relative to `data/` (e.g. `assets/abc123-photo.png`).
- Canvas display name: stored in the file under a top-level extra key `"name"` (spec allows extra keys). Fallback: the id.
- Link preview metadata (title, image, site) is cached on the link node as extra keys: `"title"`, `"image"`, `"site"`. Obsidian ignores unknown keys.
- Autosave: debounced write (~500 ms) after any change. Status shows "saving…" / "saved ✓".

### Node mapping

| App item | JSON Canvas node | Notes |
|---|---|---|
| Note | `text` | `text` is markdown |
| Link card | `link` | `url` + cached `title`/`image`/`site` |
| Photo / video / file | `file` | `file` = `assets/...`; render by extension |
| Group | `group` | `label` |
| Line | `edge` | `fromNode`, `toNode`, `fromSide`, `toSide`, optional `label` |

## Screens

### Home (`/`)

- Header: app name, "+ New canvas" button.
- Grid of canvas cards: name, item count, last edited (file mtime).
- Click opens the canvas. Right-click (or a small menu) offers Rename and Delete (with confirm).
- New canvas: prompt for name, create file, open it.

### Canvas (`/c/[id]`)

- Top bar: back arrow to home, canvas name (click to rename), save status.
- Bottom toolbar: Select, Note, Group, File (upload), zoom %.
- Infinite canvas with pan and zoom.

### Mockups (approved by user)

```
Home
┌──────────────────────────────────────────────────────────┐
│  whiteboard                               [ + New canvas ]│
├──────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌────────────────┐  ┌────────────┐  │
│  │ RAG research   │  │ Game jam ideas │  │ kb redesign│  │
│  │ 14 items       │  │ 6 items        │  │ 22 items   │  │
│  │ edited 2h ago  │  │ edited 3d ago  │  │ edited 1w  │  │
│  └────────────────┘  └────────────────┘  └────────────┘  │
└──────────────────────────────────────────────────────────┘

Canvas
┌──────────────────────────────────────────────────────────────────┐
│ ← RAG research                                          saved ✓  │
├──────────────────────────────────────────────────────────────────┤
│  ┌ Retrieval papers ──────────────────────┐                      │
│  │ ┌────────────┐  ┌────────────┐         │   ┌───────────────┐  │
│  │ │ [ image ]  │  │ [ image ]  │         │   │ ## Concerns   │  │
│  │ │ ColBERT v2 │  │ HyDE       │         │   │ - latency?    │  │
│  │ │ arxiv.org  │  │ arxiv.org  │         │   └───────────────┘  │
│  │ └────────────┘  └────────────┘         │           ▲          │
│  │ ┌──────────────────────────┐           │           │          │
│  │ │ - both rerank late       │───────────┼───────────┘          │
│  │ └──────────────────────────┘ "affects"│                      │
│  └────────────────────────────────────────┘                      │
│        ┌ Eval ───────────────┐                                   │
│        │ ┌──────────────┐    │                                   │
│        │ │ ▶ demo.mp4   │    │                                   │
│        │ └──────────────┘    │                                   │
│        │ 📄 benchmark.pdf    │                                   │
│        └─────────────────────┘                                   │
├──────────────────────────────────────────────────────────────────┤
│        [ ↖ Select ]  [ ✎ Note ]  [ ▢ Group ]  [ ⬆ File ]   100% │
└──────────────────────────────────────────────────────────────────┘
```

## Interactions

- Pan: drag empty space (Select tool) or space+drag or trackpad scroll. Zoom: ctrl/cmd+scroll or pinch; zoom toward cursor.
- Paste a URL (clipboard text that parses as http/https URL): create a link card at the viewport center or last pointer position, then fetch preview.
- Paste other text: create a note with that text.
- Paste or drop an image/video/file: upload to `assets/`, create a `file` node at drop/pointer point.
- Double-click empty space: new note, in edit mode.
- Note tool: click to place a note. Group tool: drag a rectangle to make a group, label in edit mode. File tool: opens a file picker.
- Click selects. Shift-click adds/removes from selection. Drag on empty space with Select tool and Shift: marquee select. *(builder's call: marquee vs pan default — pan on plain drag, marquee on shift+drag)*
- Drag moves selected nodes. Dragging a group also moves nodes whose rect is fully inside the group at drag start.
- Resize: drag the bottom-right handle of a selected node.
- Connect: hover a node to show four side handles; drag from a handle to another node to make an edge. Double-click an edge to edit its label.
- Double-click a note to edit raw markdown in a textarea; click outside or Esc to finish. Double-click a group label to rename.
- Delete/Backspace removes selected nodes (and their edges) and selected edges.
- Undo/redo: cmd+z / cmd+shift+z, snapshot-based history.
- Link card: click the title or the open icon to open the URL in a new tab.
- File card: images and videos render inline (video with controls). Other files show name and icon; click opens in a new tab.

## Link previews

- Server route fetches the URL and parses Open Graph / Twitter / `<title>` meta tags. No third-party service.
- On failure, the card shows the URL hostname and the full URL.
- Fetch only http/https. Timeout ~5 s. Limit response size.

## Left to the builder

- Component and state structure, rendering approach (DOM nodes with CSS transforms is fine), markdown renderer choice (e.g. `react-markdown` + `remark-gfm`), edge routing (straight or bezier), visual style within the mockups.
