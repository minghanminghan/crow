import { connection } from "next/server";
import type { CanvasDoc } from "@/lib/canvas";
import { Conflict, loadCanvas, writeCanvas } from "@/lib/store";

export async function GET(_: Request, ctx: RouteContext<"/api/canvas/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const loaded = await loadCanvas(id);
  if (!loaded) return new Response("not found", { status: 404 });
  return Response.json(loaded.doc, { headers: { "x-version": loaded.version } });
}

export async function PUT(request: Request, ctx: RouteContext<"/api/canvas/[id]">) {
  const { id } = await ctx.params;
  try {
    const doc = (await request.json()) as CanvasDoc;
    const version = await writeCanvas(id, doc, request.headers.get("x-version") ?? undefined);
    return new Response(null, { status: 204, headers: { "x-version": version } });
  } catch (e) {
    return new Response(e instanceof Conflict ? "conflict" : "bad request", { status: e instanceof Conflict ? 409 : 400 });
  }
}
