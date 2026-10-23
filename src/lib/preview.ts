import type { Preview } from "./canvas";

const MAX_BYTES = 512 * 1024;

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();

function meta(html: string, keys: string[]): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (!key || !keys.includes(key)) continue;
    const content = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const value = content?.[1] ?? content?.[2];
    if (value) return decode(value);
  }
}

export function parsePreview(html: string, url: string): Preview {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const tag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const title = meta(html, ["og:title", "twitter:title"]) ?? (tag ? decode(tag) : undefined);
  const img = meta(html, ["og:image", "og:image:url", "twitter:image"]);
  let image: string | undefined;
  try {
    image = img ? new URL(img, url).href : undefined;
  } catch {}
  return { title: title || undefined, image, site: meta(html, ["og:site_name"]) ?? host };
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function fetchPreview(url: string): Promise<Preview> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {};
  }
  const fallback = { site: parsed.hostname.replace(/^www\./, "") };
  if (!/^https?:$/.test(parsed.protocol)) return fallback;
  try {
    const res = await fetch(parsed, {
      signal: AbortSignal.timeout(5000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; whiteboard-preview)", accept: "text/html" },
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return fallback;
    return parsePreview(await readCapped(res), res.url || url);
  } catch {
    return fallback;
  }
}
