import fs from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import { VERSION, VERSION_HEADER } from "@/lib/version";

/** The CLI bundle built by esbuild, for `crow upgrade` and first installs. */
export async function GET() {
  await connection();
  const headers = { [VERSION_HEADER]: VERSION };
  const file = await fs.readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), "dist", "crow.mjs")).catch(() => null);
  if (!file) return Response.json({ error: "CLI bundle not built; run pnpm build" }, { status: 404, headers });
  return new Response(new Uint8Array(file), { headers: { ...headers, "Content-Type": "text/javascript; charset=utf-8" } });
}
