"use client";

import { useRef } from "react";

export type Tool = "select" | "note" | "group";

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "↖ Select" },
  { id: "note", label: "✎ Note" },
  { id: "group", label: "▢ Group" },
];

type Props = {
  tool: Tool;
  zoom: number;
  onTool: (t: Tool) => void;
  onResetZoom: () => void;
  onFiles: (files: File[]) => void;
};

export default function Toolbar({ tool, zoom, onTool, onResetZoom, onFiles }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const btn = "rounded-md px-3 py-1.5 text-sm hover:bg-stone-100";
  return (
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-stone-200 bg-white p-1 shadow-md">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          onClick={() => onTool(t.id)}
          className={`${btn} ${tool === t.id ? "bg-stone-900 text-white hover:bg-stone-800" : ""}`}
        >
          {t.label}
        </button>
      ))}
      <button className={btn} onClick={() => input.current?.click()}>
        ⬆ File
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <button className={`${btn} w-16 tabular-nums text-stone-500`} onClick={onResetZoom} title="Reset zoom">
        {Math.round(zoom * 100)}%
      </button>
    </div>
  );
}
