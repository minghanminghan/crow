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

export async function readCanvas(id: string): Promise<CanvasDoc | null> {
  if (!ID.test(id)) return null;
  try {
    const doc = JSON.parse(await fs.readFile(canvasPath(id), "utf8"));
    return { ...doc, nodes: doc.nodes ?? [], edges: doc.edges ?? [] };
  } catch {
    return null;
  }
}

export async function writeCanvas(id: string, doc: CanvasDoc) {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(canvasPath(id), JSON.stringify(doc, null, "\t"));
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
