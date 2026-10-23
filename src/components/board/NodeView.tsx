"use client";

import type { PointerEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type CanvasNode, type Side, fileKind } from "@/lib/canvas";

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

function Body({ node, editing, onChange, onEditEnd }: Props) {
  const card = "h-full w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm";
  switch (node.type) {
    case "text":
      return editing ? (
        <textarea
          data-nodrag
          data-scroll
          autoFocus
          className={`${card} resize-none select-text p-3 font-mono text-sm outline-none`}
          value={node.text}
          onChange={(e) => onChange(node.id, { text: e.target.value })}
          onBlur={onEditEnd}
          onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
        />
      ) : (
        <div data-scroll className={`${card} md overflow-auto p-3 text-sm`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{ a: (p) => <a href={p.href} target="_blank" rel="noreferrer" data-nodrag>{p.children}</a> }}
          >
            {node.text}
          </ReactMarkdown>
        </div>
      );
    case "link":
      return (
        <div className={`${card} flex flex-col`}>
          {node.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={node.image} alt="" draggable={false} className="min-h-0 flex-1 bg-stone-100 object-cover" />
          )}
          <div className="shrink-0 p-3">
            <a
              data-nodrag
              href={node.url}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-2 text-sm font-medium hover:underline"
            >
              {node.title ?? node.url}
            </a>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-stone-500">
              <span className="truncate">{node.site ?? host(node.url)}</span>
              <a data-nodrag href={node.url} target="_blank" rel="noreferrer" title="Open" className="hover:text-stone-900">
                ↗
              </a>
            </div>
          </div>
        </div>
      );
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
    case "group":
      return (
        <>
          <div className="h-full w-full rounded-xl border-2 border-stone-300 bg-stone-200/30" />
          <div data-group-label className="absolute -top-7 left-1 max-w-full truncate text-sm font-medium text-stone-600">
            {editing ? (
              <input
                data-nodrag
                autoFocus
                className="rounded bg-white px-1 outline-1 outline-blue-500"
                value={node.label ?? ""}
                onChange={(e) => onChange(node.id, { label: e.target.value })}
                onBlur={onEditEnd}
                onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && e.currentTarget.blur()}
              />
            ) : (
              node.label || "Group"
            )}
          </div>
        </>
      );
  }
}

export default function NodeView(props: Props) {
  const { node, selected, onPointerDown, onHandleDown, onResizeDown } = props;
  const ring = node.type === "group" ? "rounded-xl" : "rounded-lg";
  return (
    <div
      data-node-id={node.id}
      className={`group/node absolute ${ring} ${selected ? "ring-2 ring-blue-500" : ""}`}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      onPointerDown={(e) => onPointerDown(e, node.id)}
    >
      <Body {...props} />
      {SIDES.map(({ side, cls }) => (
        <div
          key={side}
          className={`absolute ${cls} h-3 w-3 cursor-crosshair rounded-full border-2 border-blue-500 bg-white opacity-0 group-hover/node:opacity-100`}
          onPointerDown={(e) => {
            e.stopPropagation();
            onHandleDown(e, node.id, side);
          }}
        />
      ))}
      {selected && (
        <div
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border-2 border-blue-500 bg-white"
          onPointerDown={(e) => {
            e.stopPropagation();
            onResizeDown(e, node.id);
          }}
        />
      )}
    </div>
  );
}
