import { OpError, applyOps } from "@/lib/ops";

/** Applies CLI ops (see `crow batch`) all or nothing. */
export async function POST(request: Request, ctx: RouteContext<"/api/canvas/[id]/ops">) {
  const { id } = await ctx.params;
  const ops = await request.json().catch(() => null);
  if (!Array.isArray(ops)) return Response.json({ error: "expected a JSON array of ops" }, { status: 400 });
  try {
    return Response.json(await applyOps(id, ops));
  } catch (e) {
    if (e instanceof OpError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
