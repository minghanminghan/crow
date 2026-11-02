"use client";

import { useEffect, useRef, useState } from "react";

/** Add a row here when a new command ships. */
const HELP: { title: string; items: [keys: string, action: string][] }[] = [
  {
    title: "Notes",
    items: [
      ["Double-click canvas", "New note"],
      ["Double-click note", "Edit note"],
      ["Esc", "Stop editing"],
      ["⌘B / ⌘I", "Bold / italic"],
      ["⌘K", "Link"],
      ["Enter on a - [ ] line", "Next checkbox"],
      ["Click checkbox", "Check it off"],
      ["Paste link or image", "New note at cursor"],
    ],
  },
  {
    title: "Resize",
    items: [
      ["Drag corner", "Resize and scale text"],
      ["⇧ + drag corner", "Keep shape"],
      ["⌥ + drag corner", "Keep text size"],
    ],
  },
  {
    title: "Canvas",
    items: [
      ["Drag canvas / scroll", "Pan"],
      ["Space + drag", "Pan over notes"],
      ["⌘ + scroll / pinch", "Zoom"],
      ["⇧ + drag canvas", "Box select"],
      ["⇧ + click", "Add to selection"],
      ["Drag side dot to note", "Connect"],
    ],
  },
  {
    title: "Edit",
    items: [
      ["⌘Z / ⌘⇧Z", "Undo / redo"],
      ["Delete", "Remove selected"],
    ],
  },
];

export default function Help() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        className={`flex h-6 w-6 items-center justify-center rounded-full border border-stone-300 text-xs text-stone-500 hover:text-stone-900 ${open ? "bg-stone-100" : ""}`}
        onClick={() => setOpen(!open)}
        title="Help"
      >
        ?
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-72 space-y-3 rounded-lg border border-stone-200 bg-white p-3 shadow-lg">
          {HELP.map((g) => (
            <div key={g.title}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">{g.title}</div>
              {g.items.map(([keys, action]) => (
                <div key={keys} className="flex justify-between gap-3 py-0.5">
                  <span className="text-stone-500">{keys}</span>
                  <span>{action}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
