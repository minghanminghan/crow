# Research Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local, single-user Next.js app for research canvases saved as JSON Canvas files.

**Architecture:** Next.js App Router. Server code reads/writes `data/*.canvas` and `data/assets/*` via server actions and route handlers. The canvas is a client component built from scratch: DOM nodes positioned in a CSS-transformed world layer, edges in an SVG layer, all state in one reducer-like hook with snapshot undo.

**Tech Stack:** Next.js (latest), React, TypeScript, Tailwind v4, pnpm, `react-markdown` + `remark-gfm`, `nanoid`.

**Spec:** `docs/superpowers/specs/2026-10-23-research-canvas-design.md`

## Global Constraints

- Next.js, TypeScript, Tailwind, pnpm.
- No whiteboard/diagram library (no tldraw, Excalidraw, React Flow).
- Files are JSON Canvas 1.0. Unknown fields are preserved on save.
- Data dir: `process.env.DATA_DIR ?? path.join(process.cwd(), "data")`. Assets in `<data>/assets/`.
- Project CLAUDE.md: minimal comments, minimal tests ("none wherever possible"). Verification is typecheck, build, and a browser smoke test instead of unit tests.
- Not a git repo, and the user did not ask for commits: no commit steps.

## Review Focus

- Path traversal: canvas ids and asset paths from the URL must not escape the data dir. Ids match `/^[a-z0-9-]+$/`; asset paths are resolved and checked to start with the assets dir.
- Malformed or non-JSON `.canvas` file in `data/`: home page still lists the others; the bad one shows its id with 0 items.
- Link preview on a page with no OG tags, a non-HTML URL, or a timeout: card falls back to hostname + URL, no crash.
- Typing in a note textarea or group label: Delete/Backspace, cmd+z, and paste must not trigger canvas shortcuts.
- Group drag moves only nodes fully inside at drag start; nested groups move too; edges follow.

Each is checked in the Task 5 smoke test.

---

## File Structure

```
src/lib/canvas.ts          JSON Canvas types + helpers (shared client/server)
src/lib/store.ts           server-only fs: list/read/write/create/rename/delete, saveAsset
src/lib/preview.ts         server-only: fetchPreview(url)
src/app/actions.ts         server actions wrapping store
src/app/page.tsx           home
src/app/HomeGrid.tsx       client: new/rename/delete
src/app/c/[id]/page.tsx    loads canvas, renders Board
src/app/api/preview/route.ts   GET ?url= -> Preview
src/app/api/assets/route.ts    POST multipart file -> { path }
src/app/files/[...path]/route.ts  GET serves <data>/<path>
src/components/board/Board.tsx    state, viewport, input, autosave
src/components/board/NodeView.tsx renders one node by type
src/components/board/EdgeLayer.tsx SVG edges + labels
src/components/board/Toolbar.tsx  bottom toolbar
src/components/board/geometry.ts  anchors, rect math, screen<->world
src/components/board/useHistory.ts snapshot undo/redo
```

### Task 1: Scaffold

**Files:** project root (Next.js scaffold), `.gitignore` adds `/data`.

- [ ] **Step 1:** Run `pnpm create next-app@latest` with TypeScript, Tailwind, App Router, `src/`, `@/*` alias in the scratchpad, then copy into the project root without overwriting `README.md`, `CLAUDE.md`, `TODO.md`, `docs/`.
- [ ] **Step 2:** `pnpm add react-markdown remark-gfm nanoid`.
- [ ] **Step 3:** Run `pnpm build`. Expected: build succeeds.

### Task 2: Data layer

**Files:** Create `src/lib/canvas.ts`, `src/lib/store.ts`, `src/lib/preview.ts`, `src/app/actions.ts`, `src/app/api/preview/route.ts`, `src/app/api/assets/route.ts`, `src/app/files/[...path]/route.ts`.

**Interfaces (produces):**
- `canvas.ts`:
  - `type Side = "top" | "right" | "bottom" | "left"`
  - `type BaseNode = { id: string; x: number; y: number; width: number; height: number; color?: string; [k: string]: unknown }`
  - `type TextNode = BaseNode & { type: "text"; text: string }`
  - `type LinkNode = BaseNode & { type: "link"; url: string; title?: string; image?: string; site?: string }`
  - `type FileNode = BaseNode & { type: "file"; file: string }`
  - `type GroupNode = BaseNode & { type: "group"; label?: string }`
  - `type CanvasNode = TextNode | LinkNode | FileNode | GroupNode`
  - `type CanvasEdge = { id: string; fromNode: string; toNode: string; fromSide?: Side; toSide?: Side; label?: string; [k: string]: unknown }`
  - `type CanvasDoc = { nodes: CanvasNode[]; edges: CanvasEdge[]; name?: string; [k: string]: unknown }`
  - `type CanvasSummary = { id: string; name: string; items: number; mtime: number }`
  - `type Preview = { title?: string; image?: string; site?: string }`
  - `newId(): string` (nanoid 16)
  - `fileKind(path: string): "image" | "video" | "other"` by extension.
- `store.ts` (`import "server-only"` not required; keep plain):
  - `listCanvases(): Promise<CanvasSummary[]>` sorted by mtime desc; bad JSON → `items: 0`, name = id.
  - `readCanvas(id): Promise<CanvasDoc | null>`
  - `writeCanvas(id, doc): Promise<void>`
  - `createCanvas(name): Promise<string>` id = slug(name) + "-" + 4 random `[a-z0-9]`.
  - `renameCanvas(id, name)`, `deleteCanvas(id)`
  - `saveAsset(file: File): Promise<string>` returns `assets/<nanoid8>-<sanitized name>`.
  - `resolveDataPath(rel: string): string | null` null if it escapes the data dir.
  - Ids validated against `/^[a-z0-9-]+$/`; invalid → throw / null.
- `preview.ts`: `fetchPreview(url: string): Promise<Preview>` — http/https only, 5 s `AbortSignal.timeout`, read at most 512 KB, parse `og:title`/`twitter:title`/`<title>`, `og:image`/`twitter:image` (resolved against url), `og:site_name` else hostname; decode basic HTML entities. Any error → `{ site: hostname }`.
- `actions.ts` (`"use server"`): `createCanvasAction(name) -> id`, `renameCanvasAction(id, name)`, `deleteCanvasAction(id)`, `saveCanvasAction(id, doc)`; mutating home actions call `revalidatePath("/")`.
- Routes: `GET /api/preview?url=` → `Preview` JSON. `POST /api/assets` (form field `file`) → `{ path }`. `GET /files/<rel>` → file bytes with content type by extension, 404 if missing/escaping.

- [ ] **Step 1:** Implement the files above.
- [ ] **Step 2:** `pnpm tsc --noEmit`. Expected: no errors.
- [ ] **Step 3:** `pnpm dev`, then `curl 'localhost:3000/api/preview?url=https://arxiv.org/abs/2112.01488'`. Expected: JSON with a `title`. `curl localhost:3000/files/../package.json` → 404.

### Task 3: Home page

**Files:** Create `src/app/page.tsx`, `src/app/HomeGrid.tsx`; edit `src/app/layout.tsx` (title "whiteboard"), `src/app/globals.css`.

- Consumes: `listCanvases`, the three home actions.
- Server page renders header ("whiteboard", "+ New canvas") and grid via `HomeGrid` (client).
- New: `prompt("Canvas name")` → create → `router.push("/c/" + id)`.
- Card: name, "N items", "edited <relative time>". Right-click opens a small menu: Rename (`prompt`), Delete (`confirm`).
- Empty state: "No canvases yet."
- `export const dynamic = "force-dynamic"`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** In the browser: create "RAG research" → lands on `/c/rag-research-xxxx`; back on home the card shows; rename and delete work.

### Task 4: Canvas board

**Files:** Create `src/app/c/[id]/page.tsx` and everything under `src/components/board/`.

**Interfaces:**
- `page.tsx`: reads canvas (404 via `notFound()` if null), renders `<Board id doc />`.
- `geometry.ts`: `type Rect = {x,y,width,height}`; `anchor(r: Rect, side: Side): {x,y}`; `nearestSides(a: Rect, b: Rect): [Side, Side]`; `contains(outer: Rect, inner: Rect): boolean`; `intersects(a, b): boolean`.
- `useHistory.ts`: `useHistory(initial: CanvasDoc)` → `{ doc, set(next, opts?: { record?: boolean }), undo(), redo(), checkpoint() }`. `set` with `record: false` updates without a snapshot (used during drags); `checkpoint()` pushes the pre-drag snapshot. Cap 100 entries.
- `Board.tsx` state: `doc` (history), `view = { x, y, zoom }` (screen = world * zoom + offset), `selected: Set<string>` (node ids and edge ids), `tool: "select" | "note" | "group"`, `editing: string | null`, `pending connection`, `save status`.

**Behavior (from spec):**
- Pan: plain drag on empty space, space+drag, or wheel scroll. Zoom: ctrl/cmd+wheel / pinch, toward cursor, clamp 0.1–4.
- Shift+drag on empty space: marquee select (intersecting nodes).
- Double-click empty space → text node 260×140 in edit mode. Note tool: click places one, then tool returns to select. Group tool: drag a rect (min 80×60), label in edit mode.
- Paste (window listener, ignored when target is input/textarea): files → upload each via `/api/assets`, create file node (image 320×240, video 400×260, other 260×80); http(s) URL text → link node 300×240 at last pointer world position, then fetch `/api/preview` and patch the node; other text → text node.
- Drop files onto canvas → same as pasted files, at drop point.
- File tool: hidden `<input type=file multiple>`; nodes placed at viewport center.
- Click selects; shift-click toggles. Drag moves all selected. Dragging a group also moves nodes fully contained at drag start (recursive via containment of the start rects).
- Resize handle bottom-right on selected nodes; min 80×40.
- Hover shows four side handles; drag from one to another node → edge with `fromSide` = handle side, `toSide` = nearest side of target. Preview line while dragging.
- Edges: SVG cubic bezier between anchors, arrowhead at `toNode`, label at midpoint. Click edge selects (wide invisible hit path). Double-click edge → inline label input.
- Double-click note → textarea editing raw markdown; Esc or blur finishes. Double-click group label → input.
- Delete/Backspace removes selected nodes, their edges, and selected edges. cmd+z / cmd+shift+z undo/redo. Esc clears selection. All ignored while typing.
- Render order: groups first (sorted by area desc), then others; edges SVG between groups and other nodes.
- Text node renders `react-markdown` + `remark-gfm` with simple `.md` styles. Link node: image (if any), title, site, open-in-new-tab icon; whole card body draggable, title is the link. File node: `<img>` / `<video controls>` from `/files/<file>`, other → 📄 name linking to `/files/<file>`.
- Autosave: on any `doc` change after mount, debounce 500 ms → `saveCanvasAction`. Status: "saving…" then "saved ✓"; on error "save failed".
- Top bar: "←" link home, canvas name (click → input → rename action), status. Toolbar: Select, Note, Group, File, zoom % (click resets to 100%).

- [ ] **Step 1:** Implement `geometry.ts`, `useHistory.ts`.
- [ ] **Step 2:** Implement `NodeView.tsx`, `EdgeLayer.tsx`, `Toolbar.tsx`.
- [ ] **Step 3:** Implement `Board.tsx` and the page.
- [ ] **Step 4:** `pnpm tsc --noEmit && pnpm lint`. Expected: no errors.

### Task 5: Verify

- [ ] **Step 1:** `pnpm build`. Expected: success.
- [ ] **Step 2:** Browser smoke test (Playwright) on `pnpm dev`: create canvas; double-click → type `## Concerns\n- latency?` → renders heading + bullet; paste an arxiv URL → card gets title; make a group around the card, drag the group → card moves; connect note → card, label the edge; upload an image; delete a node; undo restores it; reload → everything persists; the `.canvas` file is valid JSON with `nodes`/`edges`.
- [ ] **Step 3:** Review Focus checks: put `{bad` in `data/broken.canvas` → home still loads; preview of `https://example.com/file.pdf` → fallback card; Backspace while editing a note does not delete the node.
