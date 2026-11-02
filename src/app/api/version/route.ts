import { VERSION } from "@/lib/version";

export function GET() {
  return Response.json({ version: VERSION });
}
