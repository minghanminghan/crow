import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid, customAlphabet } from "nanoid";
import type { CanvasDoc, CanvasSummary } from "./canvas";

const ID = /^[a-z0-9-]+$/;
const suffix = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 4);

export const dataDir = () => path.resolve(process.env.DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data"));
const assetsDir = () => path.join(dataDir(), "assets");

function canvasPath(id: string) {
  if (!ID.test(id)) throw new Error(`invalid canvas id: ${id}`);
  return path.join(dataDir(), `${id}.canvas`);
}

export function resolveDataPath(rel: string): string | null {
  const full = path.resolve(dataDir(), rel);
  return full.startsWith(dataDir() + path.sep) ? full : null;
}

export function slug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "canvas"
  );
}

export async function listCanvases(): Promise<CanvasSummary[]> {
  await fs.mkdir(dataDir(), { recursive: true });
  const files = (await fs.readdir(dataDir())).filter((f) => f.endsWith(".canvas"));
  const out = await Promise.all(
    files.map(async (f) => {
      const id = f.slice(0, -".canvas".length);
      const full = path.join(dataDir(), f);
      const { mtimeMs } = await fs.stat(full);
      try {
        const doc = JSON.parse(await fs.readFile(full, "utf8")) as CanvasDoc;
        return { id, name: doc.name || id, items: doc.nodes?.length ?? 0, mtime: mtimeMs };
      } catch {
        return { id, name: id, items: 0, mtime: mtimeMs };
      }
    }),
  );
  return out.sort((a, b) => b.mtime - a.mtime);
}

const version = (raw: string) => createHash("sha1").update(raw).digest("hex").slice(0, 16);

export class Conflict extends Error {}

export async function loadCanvas(id: string): Promise<{ doc: CanvasDoc; version: string } | null> {
  if (!ID.test(id)) return null;
  try {
    const raw = await fs.readFile(canvasPath(id), "utf8");
    const doc = JSON.parse(raw);
    return { doc: { ...doc, nodes: doc.nodes ?? [], edges: doc.edges ?? [] }, version: version(raw) };
  } catch {
    return null;
  }
}

export async function readCanvas(id: string) {
  return (await loadCanvas(id))?.doc ?? null;
}

/** Writes atomically. With `base`, throws Conflict if the file changed since that version. Returns the new version. */
export async function writeCanvas(id: string, doc: CanvasDoc, base?: string) {
  await fs.mkdir(dataDir(), { recursive: true });
  const file = canvasPath(id);
  if (base) {
    const cur = await fs.readFile(file, "utf8").catch(() => null);
    if (cur !== null && version(cur) !== base) throw new Conflict();
  }
  const raw = JSON.stringify(doc, null, "\t");
  const tmp = `${file}.${suffix()}.tmp`;
  await fs.writeFile(tmp, raw);
  await fs.rename(tmp, file);
  return version(raw);
}

export async function createCanvas(name: string) {
  const id = `${slug(name)}-${suffix()}`;
  await writeCanvas(id, { name, nodes: [], edges: [] });
  return id;
}

export async function renameCanvas(id: string, name: string) {
  const doc = await readCanvas(id);
  if (doc) await writeCanvas(id, { ...doc, name });
}

export async function deleteCanvas(id: string) {
  await fs.rm(canvasPath(id), { force: true });
}

export async function saveAsset(file: File): Promise<string> {
  await fs.mkdir(assetsDir(), { recursive: true });
  const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80) || "file";
  const name = `${nanoid(8)}-${safe}`;
  await fs.writeFile(path.join(assetsDir(), name), Buffer.from(await file.arrayBuffer()));
  return `assets/${name}`;
}
