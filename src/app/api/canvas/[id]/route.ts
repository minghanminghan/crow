import { connection } from "next/server";
import { type Change, applyChanges } from "@/lib/diff";
import { deleteCanvas, loadCanvas, renameCanvas, updateCanvas } from "@/lib/store";

export async function GET(_: Request, ctx: RouteContext<"/api/canvas/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const loaded = await loadCanvas(id);
  if (!loaded) return new Response("not found", { status: 404 });
  return Response.json(loaded.doc, { headers: { "x-version": loaded.version } });
}

const isChange = (c: unknown): c is Change =>
  typeof c === "object" &&
  c !== null &&
  ["node", "edge", "meta"].includes((c as Change).kind) &&
  typeof (c as Change).id === "string";

/** Applies a client's per-object changes on top of whatever is on disk now. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/canvas/[id]">) {
  const { id } = await ctx.params;
  const changes: unknown = await request.json().catch(() => null);
  if (!Array.isArray(changes) || !changes.every(isChange)) return new Response("bad request", { status: 400 });
  try {
    const version = await updateCanvas(id, (doc) => applyChanges(doc, changes, "after"));
    if (!version) return new Response("not found", { status: 404 });
    return new Response(null, { status: 204, headers: { "x-version": version } });
  } catch {
    return new Response("save failed", { status: 500 });
  }
}

export async function PUT(request: Request, ctx: RouteContext<"/api/canvas/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (typeof body?.name !== "string" || !body.name) return Response.json({ error: "missing name" }, { status: 400 });
  if (!(await loadCanvas(id))) return Response.json({ error: `no board "${id}"` }, { status: 404 });
  await renameCanvas(id, body.name);
  return Response.json({ id, name: body.name });
}

export async function DELETE(_: Request, ctx: RouteContext<"/api/canvas/[id]">) {
  const { id } = await ctx.params;
  if (!(await loadCanvas(id))) return Response.json({ error: `no board "${id}"` }, { status: 404 });
  await deleteCanvas(id);
  return Response.json({ deleted: id });
}
