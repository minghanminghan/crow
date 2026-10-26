import type { CanvasDoc, CanvasEdge, CanvasNode } from "./canvas";

/** One object's change. Nodes and edges use null for "absent"; meta is a top-level doc key like `name`. */
export type Change =
  | { kind: "node"; id: string; before: CanvasNode | null; after: CanvasNode | null }
  | { kind: "edge"; id: string; before: CanvasEdge | null; after: CanvasEdge | null }
  | { kind: "meta"; id: string; before?: unknown; after?: unknown };

export const changeKey = (c: Change) => `${c.kind}:${c.id}`;

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

function diffList(kind: "node" | "edge", a: (CanvasNode | CanvasEdge)[], b: (CanvasNode | CanvasEdge)[]) {
  const before = new Map(a.map((x) => [x.id, x]));
  const after = new Map(b.map((x) => [x.id, x]));
  const out: Change[] = [];
  for (const [id, x] of before) {
    const y = after.get(id) ?? null;
    if (!same(x, y)) out.push({ kind, id, before: x, after: y } as Change);
  }
  for (const [id, y] of after) if (!before.has(id)) out.push({ kind, id, before: null, after: y } as Change);
  return out;
}

export function diff(a: CanvasDoc, b: CanvasDoc): Change[] {
  const out = [...diffList("node", a.nodes, b.nodes), ...diffList("edge", a.edges, b.edges)];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k !== "nodes" && k !== "edges" && !same(a[k], b[k])) out.push({ kind: "meta", id: k, before: a[k], after: b[k] });
  }
  return out;
}

/**
 * Applies each change's `side` value. Updates only touch the properties that change modified,
 * so edits to different properties of one object both survive (per-property last-writer-wins).
 * Skips an update or delete whose object is already gone (someone else deleted it).
 * Drops arrows left pointing at missing nodes.
 */
export function applyChanges(doc: CanvasDoc, changes: Change[], side: "before" | "after"): CanvasDoc {
  const other = side === "after" ? "before" : "after";
  const out: CanvasDoc = { ...doc };
  const lists = { node: new Map(doc.nodes.map((n) => [n.id, n])), edge: new Map(doc.edges.map((e) => [e.id, e])) };
  for (const c of changes) {
    const v = c[side];
    if (c.kind === "meta") {
      if (v === undefined) delete out[c.id];
      else out[c.id] = v;
      continue;
    }
    const list = lists[c.kind] as Map<string, Record<string, unknown>>;
    const cur = list.get(c.id);
    const from = c[other] as Record<string, unknown> | null;
    const to = v as Record<string, unknown> | null;
    if (!cur && from) continue;
    if (!to) list.delete(c.id);
    else if (!cur || !from) list.set(c.id, to);
    else {
      const next = { ...cur };
      for (const k of new Set([...Object.keys(from), ...Object.keys(to)])) {
        if (same(from[k], to[k])) continue;
        if (to[k] === undefined) delete next[k];
        else next[k] = to[k];
      }
      list.set(c.id, next);
    }
  }
  out.nodes = [...lists.node.values()] as CanvasNode[];
  out.edges = ([...lists.edge.values()] as CanvasEdge[]).filter(
    (e) => lists.node.has(e.fromNode) && lists.node.has(e.toNode),
  );
  return out;
}
