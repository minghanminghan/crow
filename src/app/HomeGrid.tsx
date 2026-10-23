"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CanvasSummary } from "@/lib/canvas";
import { createCanvasAction, deleteCanvasAction, renameCanvasAction } from "./actions";

function ago(ms: number) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / 604800)}w ago`;
}

export default function HomeGrid({ canvases }: { canvases: CanvasSummary[] }) {
  const router = useRouter();
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  async function create() {
    const name = prompt("Canvas name")?.trim();
    if (name) router.push(`/c/${await createCanvasAction(name)}`);
  }

  async function rename(c: CanvasSummary) {
    const name = prompt("Rename canvas", c.name)?.trim();
    if (name) {
      await renameCanvasAction(c.id, name);
      router.refresh();
    }
  }

  async function remove(c: CanvasSummary) {
    if (confirm(`Delete "${c.name}"?`)) {
      await deleteCanvasAction(c.id);
      router.refresh();
    }
  }

  const current = canvases.find((c) => c.id === menu?.id);

  return (
    <>
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">whiteboard</h1>
        <button
          onClick={create}
          className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
        >
          + New canvas
        </button>
      </header>
      {canvases.length === 0 ? (
        <p className="text-stone-400">No canvases yet.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          {canvases.map((c) => (
            <Link
              key={c.id}
              href={`/c/${c.id}`}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ id: c.id, x: e.clientX, y: e.clientY });
              }}
              className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition hover:border-stone-400"
            >
              <div className="truncate font-medium">{c.name}</div>
              <div className="mt-6 text-sm text-stone-500">{c.items} items</div>
              <div className="text-sm text-stone-400">edited {ago(c.mtime)}</div>
            </Link>
          ))}
        </div>
      )}
      {menu && current && (
        <div
          className="fixed z-10 w-32 rounded-md border border-stone-200 bg-white py-1 text-sm shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          <button className="block w-full px-3 py-1 text-left hover:bg-stone-100" onClick={() => rename(current)}>
            Rename
          </button>
          <button
            className="block w-full px-3 py-1 text-left text-red-600 hover:bg-stone-100"
            onClick={() => remove(current)}
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
}
