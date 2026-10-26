"use client";

import { type KeyboardEvent, type MouseEvent, type PointerEvent, useLayoutEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type CanvasNode, type Side, type LinkPreview, type TextNode, fileKind } from "@/lib/canvas";

const SIDES: { side: Side; cls: string }[] = [
  { side: "top", cls: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2" },
  { side: "right", cls: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2" },
  { side: "bottom", cls: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" },
  { side: "left", cls: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2" },
];

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const fileName = (file: string) => (file.split("/").pop() ?? file).replace(/^[\w-]{8}-/, "");
const fileUrl = (file: string) => `/files/${file.split("/").map(encodeURIComponent).join("/")}`;

type Props = {
  node: CanvasNode;
  selected: boolean;
  editing: boolean;
  onPointerDown: (e: PointerEvent, id: string) => void;
  onHandleDown: (e: PointerEvent, id: string, side: Side) => void;
  onResizeDown: (e: PointerEvent, id: string) => void;
  onChange: (id: string, patch: Partial<CanvasNode>) => void;
  onEditEnd: () => void;
};

/** Handles don't take focus, so a blank note being edited isn't ended (and removed) by grabbing one. */
const keepFocus = (e: MouseEvent) => e.preventDefault();

/** Cmd/Ctrl+K like Obsidian: wraps the selection as `[text]()`, or a selected URL as `[](url)`. */
function insertLink(e: KeyboardEvent<HTMLTextAreaElement>) {
  const el = e.currentTarget;
  const { selectionStart: s, selectionEnd: end } = el;
  const sel = el.value.slice(s, end);
  const isUrl = /^https?:\/\/\S+$/.test(sel);
  e.preventDefault();
  document.execCommand("insertText", false, isUrl ? `[](${sel})` : `[${sel}]()`);
  const caret = isUrl || !sel ? s + 1 : s + sel.length + 3;
  el.setSelectionRange(caret, caret);
}

const card = "h-full w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm";

function PreviewCard({ preview: p, onDismiss }: { preview: LinkPreview; onDismiss: () => void }) {
  return (
    <div className={`relative shrink-0 border-b border-stone-200 bg-stone-50 ${p.small ? "flex gap-3 p-3 pr-7" : ""}`}>
      {p.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.image}
          alt=""
          draggable={false}
          className={`bg-stone-100 object-cover ${p.small ? "h-16 w-16 shrink-0 rounded" : "aspect-[1.91/1] w-full"}`}
        />
      )}
      <div className={p.small ? "min-w-0 flex-1" : "p-3 pr-7"}>
        <a data-nodrag href={p.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm font-medium hover:underline">
          {p.title ?? p.url}
        </a>
        {p.description && <div className="mt-0.5 line-clamp-2 text-xs text-stone-500">{p.description}</div>}
        <div className="mt-1 truncate text-xs text-stone-400">{p.site ?? host(p.url)}</div>
      </div>
      <button
        data-nodrag
        title="Remove preview"
        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-xs text-stone-500 shadow-sm hover:text-stone-900"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}

/** A markdown note; grows taller when its text or link preview no longer fits. */
function Note({ node, editing, onChange, onEditEnd }: Props & { node: TextNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef({ text: node.text, preview: node.preview });
  useLayoutEffect(() => {
    if (last.current.text === node.text && last.current.preview === node.preview) return;
    last.current = { text: node.text, preview: node.preview };
    const el = ref.current!;
    const over = [...el.children].reduce((sum, c) => sum + Math.max(c.scrollHeight, (c as HTMLElement).offsetHeight), 0) - el.clientHeight;
    if (over > 0) onChange(node.id, { height: node.height + over });
  });
  const p = node.preview;
  const dismiss = (url: string) => {
    const shown = (ref.current!.firstElementChild as HTMLElement).offsetHeight;
    onChange(node.id, { preview: { url, hidden: true }, height: Math.max(40, node.height - shown) });
  };
  return (
    <div ref={ref} className={`${card} flex flex-col`}>
      {p && !p.hidden && (p.title || p.image) && (
        <PreviewCard preview={p} onDismiss={() => dismiss(p.url)} />
      )}
      {editing ? (
        <textarea
          data-body
          data-nodrag
          autoFocus
          className="min-h-0 flex-1 resize-none select-text p-3 text-sm outline-none"
          value={node.text}
          onChange={(e) => onChange(node.id, { text: e.target.value })}
          onBlur={onEditEnd}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.blur();
            else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") insertLink(e);
          }}
        />
      ) : (
        <div data-body data-scroll className="md min-h-0 flex-1 overflow-auto p-3 text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{ a: (p) => <a href={p.href} target="_blank" rel="noreferrer" data-nodrag>{p.children}</a> }}
          >
            {node.text}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function Body(props: Props) {
  const { node } = props;
  switch (node.type) {
    case "text":
      return <Note {...props} node={node} />;
    case "file": {
      const kind = fileKind(node.file);
      if (kind === "image")
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(node.file)} alt="" draggable={false} className={`${card} object-contain`} />
        );
      if (kind === "video")
        return (
          <div className={`${card} flex flex-col bg-stone-900`}>
            <div className="truncate px-2 py-1 text-xs text-stone-300">▶ {fileName(node.file)}</div>
            <video data-nodrag src={fileUrl(node.file)} controls className="min-h-0 w-full flex-1" />
          </div>
        );
      return (
        <div className={`${card} flex items-center gap-2 px-3`}>
          <span className="text-xl">📄</span>
          <a
            data-nodrag
            href={fileUrl(node.file)}
            target="_blank"
            rel="noreferrer"
            className="truncate text-sm font-medium hover:underline"
          >
            {fileName(node.file)}
          </a>
        </div>
      );
    }
  }
}

export default function NodeView(props: Props) {
  const { node, selected, onPointerDown, onHandleDown, onResizeDown } = props;
  return (
    <div
      data-node-id={node.id}
      className={`group/node absolute rounded-lg ${selected ? "ring-2 ring-blue-500" : ""}`}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      onPointerDown={(e) => onPointerDown(e, node.id)}
    >
      <Body {...props} />
      {SIDES.map(({ side, cls }) => (
        <div
          key={side}
          className={`absolute ${cls} flex h-7 w-7 cursor-crosshair items-center justify-center opacity-0 group-hover/node:opacity-100`}
          onMouseDown={keepFocus}
          onPointerDown={(e) => {
            e.stopPropagation();
            onHandleDown(e, node.id, side);
          }}
        >
          <div className="h-3 w-3 rounded-full border-2 border-blue-500 bg-white" />
        </div>
      ))}
      {selected && (
        <div
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border-2 border-blue-500 bg-white"
          onMouseDown={keepFocus}
          onPointerDown={(e) => {
            e.stopPropagation();
            onResizeDown(e, node.id);
          }}
        />
      )}
    </div>
  );
}
