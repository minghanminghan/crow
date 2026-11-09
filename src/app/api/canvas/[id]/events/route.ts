import { type FSWatcher, mkdirSync, watch } from "node:fs";
import { connection } from "next/server";
import { onShutdown } from "@/lib/shutdown";
import { dataDir } from "@/lib/store";

/** Server-sent events: pushes "change" whenever this canvas file is rewritten (by the app or the CLI). */
export async function GET(request: Request, ctx: RouteContext<"/api/canvas/[id]/events">) {
  await connection();
  const { id } = await ctx.params;
  const name = `${id}.canvas`;
  let watcher: FSWatcher | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let offShutdown: () => void = () => {};
  const stop = () => {
    clearTimeout(timer);
    watcher?.close();
    offShutdown();
  };
  const stream = new ReadableStream({
    start(c) {
      mkdirSync(dataDir(), { recursive: true });
      // watch the dir, not the file: atomic writes replace the file's inode
      watcher = watch(dataDir(), (_, file) => {
        if (file !== name) return;
        clearTimeout(timer);
        timer = setTimeout(() => c.enqueue(new TextEncoder().encode("data: change\n\n")), 50);
      });
      const end = () => {
        stop();
        try {
          c.close();
        } catch {}
      };
      request.signal.addEventListener("abort", end);
      offShutdown = onShutdown(end);
    },
    cancel: stop,
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
