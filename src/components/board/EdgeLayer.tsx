"use client";

import type { PointerEvent } from "react";
import type { CanvasEdge, CanvasNode } from "@/lib/canvas";
import { DIR, type Point, type Rect, anchor, nearestSides } from "./geometry";

function edgeGeometry(a: Rect, b: Rect, e: CanvasEdge) {
  const [fs, ts] = nearestSides(a, b);
  const from = e.fromSide ?? fs;
  const to = e.toSide ?? ts;
  const p1 = anchor(a, from);
  const p2 = anchor(b, to);
  const k = Math.max(40, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 3);
  const c1 = { x: p1.x + DIR[from].x * k, y: p1.y + DIR[from].y * k };
  const c2 = { x: p2.x + DIR[to].x * k, y: p2.y + DIR[to].y * k };
  return {
    d: `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`,
    mid: { x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8, y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8 },
    pts: [p1, c1, c2, p2],
  };
}

type Props = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selected: Set<string>;
  editing: string | null;
  ghost: { from: Point; to: Point } | null;
  onSelect: (e: PointerEvent, id: string) => void;
  onEdit: (id: string) => void;
  onLabel: (id: string, label: string) => void;
  onEditEnd: () => void;
};

export default function EdgeLayer({ nodes, edges, selected, editing, ghost, onSelect, onEdit, onLabel, onEditEnd }: Props) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const drawn = edges.flatMap((e) => {
    const a = byId.get(e.fromNode);
    const b = byId.get(e.toNode);
    return a && b ? [{ e, ...edgeGeometry(a, b, e) }] : [];
  });

  const pts = [...drawn.flatMap((d) => d.pts), ...(ghost ? [ghost.from, ghost.to] : [])];
  const pad = 40;
  const box = pts.length
    ? {
        x: Math.min(...pts.map((p) => p.x)) - pad,
        y: Math.min(...pts.map((p) => p.y)) - pad,
        w: Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)) + pad * 2,
        h: Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)) + pad * 2,
      }
    : { x: 0, y: 0, w: 1, h: 1 };

  return (
    <>
      <svg
        className="pointer-events-none absolute"
        style={{ left: box.x, top: box.y }}
        width={box.w}
        height={box.h}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      >
        <defs>
          {[
            ["arrow", "#78716c"],
            ["arrow-sel", "#3b82f6"],
          ].map(([id, color]) => (
            <marker
              key={id}
              id={id}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill={color} />
            </marker>
          ))}
        </defs>
        {drawn.map(({ e, d }) => {
          const sel = selected.has(e.id);
          const marker = `url(#${sel ? "arrow-sel" : "arrow"})`;
          return (
            <g key={e.id}>
              <path
                d={d}
                fill="none"
                stroke={sel ? "#3b82f6" : "#78716c"}
                strokeWidth={sel ? 2.5 : 1.75}
                markerEnd={e.toEnd === "none" ? undefined : marker}
                markerStart={e.fromEnd === "arrow" ? marker : undefined}
              />
              <path
                d={d}
                data-edge-id={e.id}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                pointerEvents="stroke"
                className="cursor-pointer"
                onPointerDown={(ev) => onSelect(ev, e.id)}
                onDoubleClick={() => onEdit(e.id)}
              />
            </g>
          );
        })}
        {ghost && (
          <path
            d={`M${ghost.from.x},${ghost.from.y} L${ghost.to.x},${ghost.to.y}`}
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}
      </svg>
      {drawn
        .filter(({ e }) => e.label || editing === e.id)
        .map(({ e, mid }) => (
          <div
            key={e.id}
            data-edge-id={e.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-stone-50 px-1 text-xs text-stone-600"
            style={{ left: mid.x, top: mid.y }}
            onPointerDown={(ev) => onSelect(ev, e.id)}
            onDoubleClick={() => onEdit(e.id)}
          >
            {editing === e.id ? (
              <input
                data-nodrag
                autoFocus
                className="w-32 bg-white px-1 outline-1 outline-blue-500"
                value={e.label ?? ""}
                onChange={(ev) => onLabel(e.id, ev.target.value)}
                onBlur={onEditEnd}
                onKeyDown={(ev) => (ev.key === "Enter" || ev.key === "Escape") && ev.currentTarget.blur()}
              />
            ) : (
              e.label
            )}
          </div>
        ))}
    </>
  );
}
