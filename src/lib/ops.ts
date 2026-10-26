import { intersects } from "../components/board/geometry";
import { type CanvasDoc, type CanvasEdge, type CanvasNode, type TextNode, newId } from "./canvas";
import { fetchPreview } from "./preview";
import { Conflict, updateCanvas } from "./store";

type NodeFields = { text?: string; append?: string; color?: string; x?: number; y?: number; width?: number; height?: number };
type ArrowFields = { label?: string; from?: string; to?: string };

/** Board edits as data. Refs are ids, unique id prefixes, or "$N" for the id made by op N of the same batch. */
export type Op =
  | ({ op: "add"; text: string; near?: string } & NodeFields)
  | ({ op: "edit"; id: string; dx?: number; dy?: number } & NodeFields & ArrowFields)
  | ({ op: "arrow"; from: string; to: string; label?: string })
  | { op: "rm"; ids: string[] };

export type Filter = { short?: boolean; includes?: string; links?: string; type?: string };

export class OpError extends Error {}
const fail = (msg: string): never => {
  throw new OpError(msg);
};

const URL_IN_TEXT = /https?:\/\/[^\s<>()]+/;
const GAP = 40;
const NODE_KEYS = ["text", "append", "color", "x", "y", "dx", "dy", "width", "height"];
const ARROW_KEYS = ["label", "from", "to"];

export function find<T extends { id: string }>(items: T[], ref: string) {
  const exact = items.find((i) => i.id === ref);
  if (exact) return exact;
  const hits = items.filter((i) => i.id.startsWith(ref));
  if (hits.length > 1) fail(`"${ref}" matches ${hits.length} ids`);
  return hits[0];
}

const node = (doc: CanvasDoc, ref: string) => find(doc.nodes, ref) ?? fail(`no node "${ref}"`);
const num = (v: unknown, k: string) =>
  v === undefined ? undefined : typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fail(`${k} must be a number`);

async function setText(n: TextNode, value: string) {
  n.text = value;
  const url = value.match(URL_IN_TEXT)?.[0];
  if (!url) delete n.preview;
  else if (n.preview?.url !== url) n.preview = { url, ...(await fetchPreview(url).catch(() => ({}))) };
}

/** Right of `near` (default: the last node), stepping down past anything in the way. */
function place(doc: CanvasDoc, near: CanvasNode | undefined, width: number, height: number) {
  if (!near) return { x: 0, y: 0 };
  const spot = { x: near.x + near.width + GAP, y: near.y, width, height };
  for (let hit; (hit = doc.nodes.filter((n) => intersects(spot, n))).length; )
    spot.y = Math.max(...hit.map((n) => n.y + n.height)) + GAP;
  return { x: spot.x, y: spot.y };
}

async function apply(doc: CanvasDoc, op: Op, ref: (r: string) => string): Promise<object> {
  switch (op.op) {
    case "add": {
      if (typeof op.text !== "string") fail("add needs text");
      const width = num(op.width, "width") ?? 260;
      const height = num(op.height, "height") ?? 140;
      const spot = place(doc, op.near ? node(doc, ref(op.near)) : doc.nodes.at(-1), width, height);
      const n: TextNode = {
        id: newId(),
        type: "text",
        text: "",
        x: num(op.x, "x") ?? spot.x,
        y: num(op.y, "y") ?? spot.y,
        width,
        height,
        ...(op.color && { color: op.color }),
      };
      await setText(n, op.text);
      doc.nodes.push(n);
      return n;
    }
    case "edit": {
      const id = ref(op.id);
      const hit = find([...doc.nodes, ...doc.edges], id) ?? fail(`no node or arrow "${id}"`);
      const keys = Object.keys(op).filter((k) => k !== "op" && k !== "id");
      if ("fromNode" in hit) {
        const e = hit as CanvasEdge;
        const bad = keys.filter((k) => !ARROW_KEYS.includes(k));
        if (bad.length) fail(`an arrow can't take ${bad.join(", ")}`);
        if (op.from !== undefined || op.to !== undefined) {
          if (op.from !== undefined) e.fromNode = node(doc, ref(op.from)).id;
          if (op.to !== undefined) e.toNode = node(doc, ref(op.to)).id;
          if (e.fromNode === e.toNode) fail("an arrow needs two different nodes");
          delete e.fromSide;
          delete e.toSide;
        }
        if (op.label !== undefined) e.label = op.label || undefined;
        return e;
      }
      const n = hit as CanvasNode;
      const bad = keys.filter((k) => !NODE_KEYS.includes(k));
      if (bad.length) fail(`a node can't take ${bad.join(", ")}`);
      if (op.text !== undefined || op.append !== undefined) {
        if (n.type !== "text") fail("only text nodes have text");
        if (op.text !== undefined && op.append !== undefined) fail("use text or append, not both");
        // append reads the note at save time, so concurrent appends don't overwrite each other
        const t = (n as TextNode).text;
        await setText(n as TextNode, op.text ?? (t && !t.endsWith("\n") ? `${t}\n${op.append}` : t + op.append));
      }
      if (op.color !== undefined) n.color = op.color || undefined;
      n.x = (num(op.x, "x") ?? n.x) + (num(op.dx, "dx") ?? 0);
      n.y = (num(op.y, "y") ?? n.y) + (num(op.dy, "dy") ?? 0);
      n.width = num(op.width, "width") ?? n.width;
      n.height = num(op.height, "height") ?? n.height;
      return n;
    }
    case "arrow": {
      const from = node(doc, ref(op.from));
      const to = node(doc, ref(op.to));
      if (from.id === to.id) fail("an arrow needs two different nodes");
      const edge: CanvasEdge = { id: newId(), fromNode: from.id, toNode: to.id, ...(op.label && { label: op.label }) };
      doc.edges.push(edge);
      return edge;
    }
    case "rm": {
      if (!op.ids?.length) fail("rm needs ids");
      const all = [...doc.nodes, ...doc.edges];
      const gone = new Set(op.ids.map((r) => (find(all, ref(r)) ?? fail(`no node or arrow "${ref(r)}"`)).id));
      doc.nodes = doc.nodes.filter((n) => !gone.has(n.id));
      doc.edges = doc.edges.filter((e) => !gone.has(e.id) && !gone.has(e.fromNode) && !gone.has(e.toNode));
      return { deleted: [...gone] };
    }
    default:
      return fail(`unknown op "${(op as { op: unknown }).op}"`);
  }
}

/** Applies all ops in one load + save, or none if any fails. */
export async function applyOps(id: string, ops: Op[]) {
  let results: object[] = [];
  const ref = (r: string) => {
    const m = /^\$(\d+)$/.exec(r);
    if (!m) return r;
    const made = results[Number(m[1])];
    return made && "id" in made ? (made.id as string) : fail(`${r} has no id`);
  };
  const saved = await updateCanvas(id, async (doc) => {
    results = [];
    for (const op of ops) results.push(await apply(doc, op, ref));
  }).catch((e) => (e instanceof Conflict ? fail(e.message) : Promise.reject(e)));
  return saved === null ? fail(`no board "${id}"`) : results;
}

/** Filters a board; arrows are kept when both ends are kept. */
export function view(doc: CanvasDoc, f: Filter) {
  let nodes = doc.nodes;
  if (f.type) {
    if (f.type !== "text" && f.type !== "file") fail("type must be text or file");
    nodes = nodes.filter((n) => n.type === f.type);
  }
  const body = (n: CanvasNode) => (n.type === "text" ? n.text : n.file);
  if (f.includes) {
    const q = f.includes.toLowerCase();
    nodes = nodes.filter((n) => body(n).toLowerCase().includes(q));
  }
  if (f.links) {
    const id = node(doc, f.links).id;
    const near = new Set([id]);
    for (const e of doc.edges) {
      if (e.fromNode === id) near.add(e.toNode);
      if (e.toNode === id) near.add(e.fromNode);
    }
    nodes = nodes.filter((n) => near.has(n.id));
  }
  const keep = new Set(nodes.map((n) => n.id));
  const edges = doc.edges.filter((e) => keep.has(e.fromNode) && keep.has(e.toNode));
  if (!f.short) return { ...doc, nodes, edges };
  return {
    name: doc.name,
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, text: body(n).split("\n")[0].slice(0, 80) })),
    edges: edges.map((e) => ({ id: e.id, from: e.fromNode, to: e.toNode, ...(e.label && { label: e.label }) })),
  };
}
