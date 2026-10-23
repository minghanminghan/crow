import fs from "node:fs/promises";
import path from "node:path";
import { resolveDataPath } from "@/lib/store";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

export async function GET(_: Request, ctx: RouteContext<"/files/[...path]">) {
  const { path: parts } = await ctx.params;
  const full = resolveDataPath(parts.map(decodeURIComponent).join("/"));
  if (!full) return new Response("not found", { status: 404 });
  try {
    const body = await fs.readFile(full);
    const type = TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream";
    return new Response(body, { headers: { "content-type": type } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
