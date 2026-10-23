import { fetchPreview } from "@/lib/preview";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") ?? "";
  return Response.json(await fetchPreview(url));
}
