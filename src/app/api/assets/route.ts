import { saveAsset } from "@/lib/store";

export async function POST(request: Request) {
  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) return Response.json({ error: "missing file" }, { status: 400 });
  return Response.json({ path: await saveAsset(file) });
}
