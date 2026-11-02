import { connection } from "next/server";
import { createCanvas, listCanvases } from "@/lib/store";

export async function GET() {
  await connection();
  return Response.json(await listCanvases());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.name !== "string" || !body.name) return Response.json({ error: "missing name" }, { status: 400 });
  return Response.json({ id: await createCanvas(body.name) });
}
