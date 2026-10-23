"use client";

import Link from "next/link";
import { type DragEvent, type MouseEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { saveCanvasAction } from "@/app/actions";
import {
  type CanvasDoc,
  type CanvasNode,
  type Preview,
  type Side,
  type TextNode,
  fileKind,
  newId,
} from "@/lib/canvas";
import EdgeLayer from "./EdgeLayer";
import NodeView from "./NodeView";
import Toolbar, { type Tool } from "./Toolbar";
import { type Point, type Rect, anchor, contains, intersects, nearestSides, normalize } from "./geometry";
import { useHistory } from "./useHistory";

type View = { x: number; y: number; zoom: number };
type Drag =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { kind: "move"; sx: number; sy: number; start: Map<string, Point>; moved: boolean }
  | { kind: "resize"; id: string; sx: number; sy: number; w: number; h: number; moved: boolean }
  | { kind: "connect"; from: string; side: Side }
  | { kind: "marquee"; start: Point }
  | { kind: "group"; start: Point };
type Ghost = { rect: Rect } | { from: Point; to: Point } | null;
type ClientPoint = { clientX: number; clientY: number };

const URL_RE = /^https?:\/\/\S+$/;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

function initialView(nodes: CanvasNode[]): View {
  if (!nodes.length) return { x: 0, y: 0, zoom: 1 };
  return { x: 80 - Math.min(...nodes.map((n) => n.x)), y: 80 - Math.min(...nodes.map((n) => n.y)), zoom: 1 };
}

/** Nodes that move with `ids`: groups carry everything fully inside them, recursively. */
function movingSet(nodes: CanvasNode[], ids: Set<string>) {
  const out = new Set(ids);
  for (let grew = true; grew; ) {
    grew = false;
    for (const g of nodes)
      if (g.type === "group" && out.has(g.id))
        for (const n of nodes)
          if (!out.has(n.id) && contains(g, n)) {
            out.add(n.id);
            grew = true;
          }
  }
  return out;
}

async function imageSize(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const width = clamp(img.naturalWidth, 120, 320);
    return { width, height: Math.round((width * img.naturalHeight) / img.naturalWidth) };
  } catch {
    return { width: 320, height: 240 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Board({ id, initial }: { id: string; initial: CanvasDoc }) {
  const { doc, get, set, undo, redo, checkpoint } = useHistory(initial);
  const [view, setViewState] = useState(() => initialView(initial.nodes));
  const viewRef = useRef(view);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [ghost, setGhost] = useState<Ghost>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [renaming, setRenaming] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointer = useRef<Point | null>(null);
  const space = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastDoc = useRef(initial);

  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);

  const toWorld = useCallback(({ clientX, clientY }: ClientPoint): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
  }, []);

  const viewportCenter = () => {
    const r = canvasRef.current!.getBoundingClientRect();
    return toWorld({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
  };

  // --- autosave ---
  const save = useCallback(() => {
    saveTimer.current = undefined;
    saveCanvasAction(id, get()).then(
      () => setStatus((s) => (saveTimer.current ? s : "saved")),
      () => setStatus("error"),
    );
  }, [id, get]);

  useEffect(() => {
    if (doc === lastDoc.current) return;
    lastDoc.current = doc;
    setStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 500);
  }, [doc, save]);

  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        save();
      }
    },
    [save],
  );

  // --- doc edits ---
  const patchNode = (nid: string, patch: Partial<CanvasNode>, record = false) =>
    set((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === nid ? ({ ...n, ...patch } as CanvasNode) : n)) }), {
      record,
    });

  const addNode = (node: CanvasNode, edit = false) => {
    set((d) => ({ ...d, nodes: [...d.nodes, node] }));
    setSelected(new Set([node.id]));
    setEditing(edit ? node.id : null);
  };

  const addNote = (at: Point, text = "") => {
    const node: TextNode = { id: newId(), type: "text", text, x: Math.round(at.x), y: Math.round(at.y), width: 260, height: 140 };
    addNode(node, !text);
  };

  const addLink = (url: string, at: Point) => {
    const nid = newId();
    addNode({ id: nid, type: "link", url, x: Math.round(at.x), y: Math.round(at.y), width: 300, height: 240 });
    fetch(`/api/preview?url=${encodeURIComponent(url)}`)
      .then((r) => r.json() as Promise<Preview>)
      .then((p) => patchNode(nid, p.image ? p : { ...p, height: 96 }))
      .catch(() => patchNode(nid, { height: 96 }));
  };

  const addFiles = async (files: File[], at: Point) => {
    for (const [i, file] of files.entries()) {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/assets", { method: "POST", body });
      if (!res.ok) continue;
      const { path } = (await res.json()) as { path: string };
      const kind = fileKind(path);
      const size =
        kind === "image" ? await imageSize(file) : kind === "video" ? { width: 400, height: 260 } : { width: 260, height: 64 };
      const x = Math.round(at.x + i * 24);
      const y = Math.round(at.y + i * 24);
      addNode({ id: newId(), type: "file", file: path, x, y, ...size });
    }
  };

  const deleteSelected = () => {
    set((d) => {
      const gone = new Set(d.nodes.filter((n) => selected.has(n.id)).map((n) => n.id));
      return {
        ...d,
        nodes: d.nodes.filter((n) => !gone.has(n.id)),
        edges: d.edges.filter((e) => !selected.has(e.id) && !gone.has(e.fromNode) && !gone.has(e.toNode)),
      };
    });
    setSelected(new Set());
  };

  const startEdit = (eid: string) => {
    checkpoint();
    setEditing(eid);
  };

  const endEdit = () => {
    const d = get();
    const n = d.nodes.find((n) => n.id === editing);
    if (n?.type === "text" && !n.text.trim()) set({ ...d, nodes: d.nodes.filter((x) => x.id !== n.id) }, { record: false });
    setEditing(null);
  };

  // --- pointer input ---
  const startPan = (e: ClientPoint) => {
    const v = viewRef.current;
    drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false };
  };

  const onCanvasDown = (e: PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && space.current)) return startPan(e);
    if (e.button !== 0) return;
    const p = toWorld(e);
    if (tool === "note") {
      addNote(p);
      return setTool("select");
    }
    if (tool === "group") {
      drag.current = { kind: "group", start: p };
      return;
    }
    if (e.shiftKey) {
      drag.current = { kind: "marquee", start: p };
      return;
    }
    startPan(e);
  };

  const onNodeDown = (e: PointerEvent, nid: string) => {
    if (e.button !== 0 || (e.target as Element).closest("[data-nodrag]")) return;
    e.stopPropagation();
    if (space.current) return startPan(e);
    let sel = selected;
    if (e.shiftKey) {
      sel = new Set(selected);
      if (sel.has(nid)) {
        sel.delete(nid);
        return setSelected(sel);
      }
      sel.add(nid);
    } else if (!selected.has(nid)) sel = new Set([nid]);
    setSelected(sel);
    if (editing && editing !== nid) endEdit();
    const nodes = get().nodes;
    const ids = movingSet(nodes, sel);
    const start = new Map(nodes.filter((n) => ids.has(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]));
    drag.current = { kind: "move", sx: e.clientX, sy: e.clientY, start, moved: false };
  };

  const onEdgeDown = (e: PointerEvent, eid: string) => {
    if ((e.target as Element).closest("[data-nodrag]")) return;
    e.stopPropagation();
    if (!e.shiftKey) return setSelected(new Set([eid]));
    const sel = new Set(selected);
    if (sel.has(eid)) sel.delete(eid);
    else sel.add(eid);
    setSelected(sel);
  };

  const onResizeDown = (e: PointerEvent, nid: string) => {
    const n = get().nodes.find((n) => n.id === nid)!;
    drag.current = { kind: "resize", id: nid, sx: e.clientX, sy: e.clientY, w: n.width, h: n.height, moved: false };
  };

  const onHandleDown = (e: PointerEvent, nid: string, side: Side) => {
    if (e.button !== 0) return;
    drag.current = { kind: "connect", from: nid, side };
  };

  const finish = (e: ClientPoint) => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d) return;
    const p = toWorld(e);
    const nodes = get().nodes;
    if (d.kind === "pan" && !d.moved) {
      if (editing) endEdit();
      setSelected(new Set());
    } else if (d.kind === "connect") {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-node-id]");
      const target = nodes.find((n) => n.id === el?.getAttribute("data-node-id"));
      const from = nodes.find((n) => n.id === d.from);
      if (target && from && target.id !== from.id) {
        const toSide = nearestSides(from, target)[1];
        set((doc) => ({
          ...doc,
          edges: [...doc.edges, { id: newId(), fromNode: from.id, fromSide: d.side, toNode: target.id, toSide }],
        }));
      }
    } else if (d.kind === "marquee") {
      const r = normalize(d.start, p);
      setSelected(new Set(nodes.filter((n) => intersects(r, n)).map((n) => n.id)));
    } else if (d.kind === "group") {
      let r = normalize(d.start, p);
      if (r.width < 80 || r.height < 60) r = { ...d.start, width: 400, height: 300 };
      const rounded = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
      addNode({ id: newId(), type: "group", label: "", ...rounded }, true);
      setTool("select");
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (canvasRef.current?.contains(e.target as Node)) pointer.current = toWorld(e);
    const d = drag.current;
    if (!d) return;
    if (e.buttons === 0) return finish(e);
    const z = viewRef.current.zoom;
    const dx = e.clientX - ("sx" in d ? d.sx : 0);
    const dy = e.clientY - ("sy" in d ? d.sy : 0);
    const far = Math.abs(dx) + Math.abs(dy) > 3;
    switch (d.kind) {
      case "pan":
        if (far) d.moved = true;
        if (d.moved) setView({ ...viewRef.current, x: d.vx + dx, y: d.vy + dy });
        break;
      case "move":
        if (!d.moved && !far) break;
        if (!d.moved) checkpoint();
        d.moved = true;
        set(
          (doc) => ({
            ...doc,
            nodes: doc.nodes.map((n) => {
              const s = d.start.get(n.id);
              return s ? { ...n, x: Math.round(s.x + dx / z), y: Math.round(s.y + dy / z) } : n;
            }),
          }),
          { record: false },
        );
        break;
      case "resize":
        if (!d.moved) checkpoint();
        d.moved = true;
        patchNode(d.id, { width: Math.max(80, Math.round(d.w + dx / z)), height: Math.max(40, Math.round(d.h + dy / z)) });
        break;
      case "connect": {
        const from = get().nodes.find((n) => n.id === d.from);
        if (from) setGhost({ from: anchor(from, d.side), to: toWorld(e) });
        break;
      }
      case "marquee":
      case "group":
        setGhost({ rect: normalize(d.start, toWorld(e)) });
        break;
    }
  };

  const onDoubleClick = (e: MouseEvent) => {
    const t = e.target as Element;
    if (t.closest("[data-nodrag]") || t.closest("[data-edge-id]")) return;
    const n = get().nodes.find((n) => n.id === t.closest("[data-node-id]")?.getAttribute("data-node-id"));
    if (n?.type === "text") return startEdit(n.id);
    if (n?.type === "group" && t.closest("[data-group-label]")) return startEdit(n.id);
    if (n && n.type !== "group") return;
    addNote(toWorld(e));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const at = toWorld(e);
    const files = [...e.dataTransfer.files];
    if (files.length) return void addFiles(files, at);
    const uris = e.dataTransfer.getData("text/uri-list").split(/\r?\n/);
    const url = [...uris, e.dataTransfer.getData("text/plain")].map((s) => s.trim()).find((s) => URL_RE.test(s));
    if (url) addLink(url, at);
  };

  // --- wheel: pan, ctrl/cmd or pinch to zoom ---
  useEffect(() => {
    const el = canvasRef.current!;
    function onWheel(e: WheelEvent) {
      const zooming = e.ctrlKey || e.metaKey;
      const scroller = (e.target as Element).closest?.("[data-scroll]");
      if (!zooming && scroller && scroller.scrollHeight > scroller.clientHeight) return;
      e.preventDefault();
      const v = viewRef.current;
      if (!zooming) return setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const zoom = clamp(v.zoom * Math.exp(-clamp(e.deltaY, -50, 50) * 0.01), 0.1, 4);
      setView({ zoom, x: sx - ((sx - v.x) * zoom) / v.zoom, y: sy - ((sy - v.y) * zoom) / v.zoom });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView]);

  const resetZoom = () => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    const sx = r.width / 2;
    const sy = r.height / 2;
    setView({ zoom: 1, x: sx - (sx - v.x) / v.zoom, y: sy - (sy - v.y) / v.zoom });
  };

  // --- keyboard + paste (re-bound each render so handlers see current state) ---
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === " ") {
        space.current = true;
        e.preventDefault();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selected.size) deleteSelected();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        setSelected(new Set());
      } else if (e.key === "Escape") {
        setSelected(new Set());
        setTool("select");
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === " ") space.current = false;
    }
    function onPaste(e: ClipboardEvent) {
      if (isTyping(e.target) || isTyping(document.activeElement)) return;
      const at = pointer.current ?? viewportCenter();
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        return void addFiles(files, at);
      }
      const text = e.clipboardData?.getData("text/plain").trim();
      if (!text) return;
      e.preventDefault();
      if (URL_RE.test(text)) addLink(text, at);
      else addNote(at, text);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("paste", onPaste);
    };
  });

  const groups = doc.nodes.filter((n) => n.type === "group").sort((a, b) => b.width * b.height - a.width * a.height);
  const others = doc.nodes.filter((n) => n.type !== "group");
  const nodeView = (n: CanvasNode) => (
    <NodeView
      key={n.id}
      node={n}
      selected={selected.has(n.id)}
      editing={editing === n.id}
      onPointerDown={onNodeDown}
      onHandleDown={onHandleDown}
      onResizeDown={onResizeDown}
      onChange={(nid, patch) => patchNode(nid, patch)}
      onEditEnd={endEdit}
    />
  );

  return (
    <div className="flex h-screen flex-col select-none" onPointerMove={onPointerMove} onPointerUp={finish}>
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-4 text-sm">
        <Link href="/" className="text-stone-500 hover:text-stone-900" title="All canvases">
          ←
        </Link>
        {renaming ? (
          <input
            autoFocus
            className="rounded px-1 font-medium outline-1 outline-blue-500"
            defaultValue={doc.name ?? id}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== doc.name) set({ ...get(), name });
              setRenaming(false);
            }}
            onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && e.currentTarget.blur()}
          />
        ) : (
          <button className="font-medium hover:text-stone-600" onClick={() => setRenaming(true)} title="Rename">
            {doc.name ?? id}
          </button>
        )}
        <span className={`ml-auto ${status === "error" ? "text-red-600" : "text-stone-400"}`}>
          {status === "saving" ? "saving…" : status === "error" ? "save failed" : "saved ✓"}
        </span>
      </header>
      <div className="relative min-h-0 flex-1">
        <div
          ref={canvasRef}
          className={`absolute inset-0 overflow-hidden ${tool === "select" ? "cursor-default" : "cursor-crosshair"}`}
          style={{
            backgroundImage: "radial-gradient(#d6d3d1 1px, transparent 1px)",
            backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
          onPointerDown={onCanvasDown}
          onDoubleClick={onDoubleClick}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
          >
            {groups.map(nodeView)}
            <EdgeLayer
              nodes={doc.nodes}
              edges={doc.edges}
              selected={selected}
              editing={editing}
              ghost={ghost && "from" in ghost ? ghost : null}
              onSelect={onEdgeDown}
              onEdit={startEdit}
              onLabel={(eid, label) =>
                set(
                  (d) => ({ ...d, edges: d.edges.map((x) => (x.id === eid ? { ...x, label: label || undefined } : x)) }),
                  { record: false },
                )
              }
              onEditEnd={() => setEditing(null)}
            />
            {others.map(nodeView)}
            {ghost && "rect" in ghost && (
              <div
                className="pointer-events-none absolute rounded border border-dashed border-blue-500 bg-blue-500/5"
                style={{ left: ghost.rect.x, top: ghost.rect.y, width: ghost.rect.width, height: ghost.rect.height }}
              />
            )}
          </div>
        </div>
        <Toolbar
          tool={tool}
          zoom={view.zoom}
          onTool={setTool}
          onResetZoom={resetZoom}
          onFiles={(files) => addFiles(files, viewportCenter())}
        />
      </div>
    </div>
  );
}
