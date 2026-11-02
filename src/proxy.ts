import { type NextRequest, NextResponse } from "next/server";
import { VERSION, VERSION_HEADER, compareVersions } from "@/lib/version";

/** Rejects API calls from CLIs on a different major version. No header (browsers, curl) is allowed. */
export function proxy(req: NextRequest) {
  const client = req.headers.get(VERSION_HEADER);
  const headers = { [VERSION_HEADER]: VERSION };
  if (client && req.nextUrl.pathname !== "/api/version" && compareVersions(client, VERSION) === "incompatible") {
    const error = `client version ${client} is incompatible with server version ${VERSION}. Run: crow upgrade`;
    return Response.json({ error }, { status: 426, headers });
  }
  return NextResponse.next({ headers });
}

export const config = { matcher: "/api/:path*" };
