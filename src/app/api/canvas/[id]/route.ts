import type { CanvasDoc } from "@/lib/canvas";
import { writeCanvas } from "@/lib/store";

export async function PUT(request: Request, ctx: RouteContext<"/api/canvas/[id]">) {
  const { id } = await ctx.params;
  try {
    await writeCanvas(id, (await request.json()) as CanvasDoc);
    return new Response(null, { status: 204 });
  } catch {
    return new Response("bad request", { status: 400 });
  }
}
