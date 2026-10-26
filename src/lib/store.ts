import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
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

/** Cross-process lock (the app and CLI processes share it), so check-then-write can't interleave. */
async function locked<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const lock = `${file}.lock`;
  for (;;) {
    try {
      await fs.writeFile(lock, String(process.pid), { flag: "wx" });
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      // a lock this old was left by a crashed writer
      const mtime = await fs.stat(lock).then((s) => s.mtimeMs, () => Date.now());
      if (Date.now() - mtime > 2000) await fs.rm(lock, { force: true });
      await sleep(2 + Math.random() * 8);
    }
  }
  try {
    return await fn();
  } finally {
    await fs.rm(lock, { force: true });
  }
}

/** Writes atomically. With `base`, throws Conflict if the file changed since that version. Returns the new version. */
export async function writeCanvas(id: string, doc: CanvasDoc, base?: string) {
  await fs.mkdir(dataDir(), { recursive: true });
  const file = canvasPath(id);
  return locked(file, async () => {
    if (base) {
      const cur = await fs.readFile(file, "utf8").catch(() => null);
      if (cur !== null && version(cur) !== base) throw new Conflict();
    }
    const raw = JSON.stringify(doc, null, "\t");
    const tmp = `${file}.${suffix()}.tmp`;
    await fs.writeFile(tmp, raw);
    await fs.rename(tmp, file);
    return version(raw);
  });
}

export async function createCanvas(name: string) {
  const id = `${slug(name)}-${suffix()}`;
  await writeCanvas(id, { name, nodes: [], edges: [] });
  return id;
}

/**
 * Load-modify-save with the version check, retrying if someone else saved in between.
 * `fn` edits the doc in place or returns a new one. Returns the new version, or null if the canvas is missing.
 */
export async function updateCanvas(id: string, fn: (doc: CanvasDoc) => CanvasDoc | void | Promise<CanvasDoc | void>) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const loaded = await loadCanvas(id);
    if (!loaded) return null;
    const next = (await fn(loaded.doc)) ?? loaded.doc;
    try {
      return await writeCanvas(id, next, loaded.version);
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      await sleep(Math.random() * 10 * (attempt + 1));
    }
  }
  throw new Conflict("canvas kept changing, try again");
}

export async function renameCanvas(id: string, name: string) {
  await updateCanvas(id, (doc) => ({ ...doc, name }));
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
