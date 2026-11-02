import { VERSION, VERSION_HEADER, compareVersions } from "../lib/version";

const PROD_URL = "https://crow.andrewminghanjiang.com";

export class ApiError extends Error {}

let warned = false;

/** CROW_URL, else the prod server. */
export const serverUrl = () => (process.env.CROW_URL || PROD_URL).replace(/\/+$/, "");

function checkServerVersion(server: string | null) {
  if (!server || compareVersions(VERSION, server) !== "compatible" || warned) return;
  warned = true;
  process.stderr.write(`crow: cli ${VERSION} differs from server ${server}. Run: crow upgrade\n`);
}

/** Calls `path` on the server with the version header. Throws ApiError with the server's message on failure. */
export async function call(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set(VERSION_HEADER, VERSION);
  if (init.body) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(serverUrl() + path, { ...init, headers });
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    throw new ApiError(`cannot reach crow at ${serverUrl()} (${cause?.code ?? cause?.message ?? (e as Error).message}). Check CROW_URL`);
  }
  checkServerVersion(res.headers.get(VERSION_HEADER));
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error ?? `server returned ${res.status} ${res.statusText}`);
  }
  return res;
}

export async function api<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const res = await call(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });
  return (await res.json()) as T;
}
