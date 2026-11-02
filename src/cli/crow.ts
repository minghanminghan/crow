import { readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { CanvasDoc, CanvasSummary } from "../lib/canvas";
import { type Op, OpError, find, view } from "../lib/ops";
import { VERSION, VERSION_HEADER } from "../lib/version";
import { ApiError, api, call, serverUrl } from "./http";

const HELP = `crow — read and edit boards on the crow server ($CROW_URL). Output is JSON.

  crow ls                                   list boards
  crow new <name>                           create a board
  crow rename <board> <name>
  crow delete-board <board>
  crow show <board> [--short] [--includes <text>] [--links <node>] [--type text|file]
  crow add <board> <text|-> [--near <node>] [--x --y --width --height --color]
  crow edit <board> <node> [--text <text|-> | --append <text|->] [--color] [--x --y | --dx --dy] [--width --height]
  crow edit <board> <arrow> [--label] [--from <node>] [--to <node>]
  crow arrow <board> <from> <to> [--label]  (alias: link)
  crow rm <board> <id...>                   delete nodes (and their arrows) or arrows
  crow batch <board>                        apply ops from stdin, all or nothing
  crow config                               show the server url
  crow upgrade                              replace this CLI with the server's version

Ids can be shortened to any unique prefix. "-" reads text from stdin.
New notes go right of --near (default: the last note), below anything in the way.
--append adds a line to a note without overwriting other writers. An empty --label or --color clears it.

batch reads a JSON array or one JSON op per line. "$N" refers to the id made by op N:
  {"op":"add","text":"a"}
  {"op":"add","text":"b","near":"$0"}
  {"op":"arrow","from":"$0","to":"$1","label":"then"}
  {"op":"edit","id":"$1","dy":40,"append":"more"}
  {"op":"rm","ids":["$0"]}`;

const NUMBERS = ["x", "y", "dx", "dy", "width", "height"];
const STRINGS = ["color", "text", "append", "label", "from", "to", "near", "includes", "links", "type"];

class Fail extends Error {}
const fail = (msg: string): never => {
  throw new Fail(msg);
};

// parseArgs rejects "--dy -20", so glue negative values onto their flag
const argv = process.argv
  .slice(2)
  .reduce<string[]>(
    (out, a) =>
      /^-\d/.test(a) && /^--\w+$/.test(out.at(-1) ?? "") ? [...out.slice(0, -1), `${out.at(-1)}=${a}`] : [...out, a],
    [],
  );

function parse() {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        short: { type: "boolean" },
        ...Object.fromEntries([...NUMBERS, ...STRINGS].map((k) => [k, { type: "string" as const }])),
      },
    });
  } catch (e) {
    console.error(JSON.stringify({ error: (e as Error).message }));
    process.exit(1);
  }
}

const { values: opt, positionals: args } = parse();

const stdin = () => readFileSync(0, "utf8");
const text = (s: string) => (s === "-" ? stdin().trimEnd() : s);
const need = (i: number, name: string) => args[i] ?? fail(`missing <${name}>\n\n${HELP}`);

/** The given flags, numbers parsed, "-" text read from stdin. */
function flags(keys: string[]) {
  const out: Record<string, string | number> = {};
  for (const k of keys) {
    const v = (opt as Record<string, unknown>)[k];
    if (typeof v !== "string") continue;
    if (!NUMBERS.includes(k)) out[k] = k === "text" || k === "append" ? text(v) : v;
    else if (Number.isFinite(Number(v))) out[k] = Number(v);
    else fail(`--${k} must be a number`);
  }
  return out;
}

async function boardId(ref: string) {
  return find(await api<CanvasSummary[]>("/api/canvas"), ref)?.id ?? fail(`no board "${ref}"`);
}

const applyOps = async (id: string, ops: Op[]) => api<object[]>(`/api/canvas/${id}/ops`, "POST", ops);

function readOps(): Op[] {
  const raw = stdin().trim();
  try {
    return raw.startsWith("[") ? JSON.parse(raw) : raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch (e) {
    return fail(`bad batch JSON: ${(e as Error).message}`);
  }
}

async function one(op: Op) {
  const [result] = await applyOps(await boardId(need(1, "board")), [op]);
  return result;
}

/** Downloads the server's CLI bundle and swaps it in for the running file. */
async function upgrade() {
  const file = realpathSync(process.argv[1]);
  if (!readFileSync(file, "utf8").startsWith("#!/usr/bin/env node")) fail(`cannot upgrade ${file}: not a built crow bundle`);
  const res = await call("/cli/crow.mjs");
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()), { mode: 0o755 });
  renameSync(tmp, file);
  return { file, from: VERSION, to: res.headers.get(VERSION_HEADER) ?? "unknown" };
}

async function run(): Promise<unknown> {
  const [cmd] = args;
  switch (cmd) {
    case "ls":
      return api("/api/canvas");
    case "new":
      return api("/api/canvas", "POST", { name: need(1, "name") });
    case "rename":
      return api(`/api/canvas/${await boardId(need(1, "board"))}`, "PUT", { name: need(2, "name") });
    case "delete-board":
      return api(`/api/canvas/${await boardId(need(1, "board"))}`, "DELETE");
    case "show": {
      const id = await boardId(need(1, "board"));
      return { id, ...view(await api<CanvasDoc>(`/api/canvas/${id}`), { short: opt.short, ...flags(["includes", "links", "type"]) }) };
    }
    case "add":
      return one({ op: "add", text: text(need(2, "text")), ...flags(["near", "x", "y", "width", "height", "color"]) });
    case "edit":
      return one({ op: "edit", id: need(2, "node or arrow"), ...flags([...NUMBERS, "text", "append", "color", "label", "from", "to"]) });
    case "arrow":
    case "link":
      return one({ op: "arrow", from: need(2, "from"), to: need(3, "to"), ...flags(["label"]) });
    case "rm":
      return one({ op: "rm", ids: args.slice(2) });
    case "batch":
      return applyOps(await boardId(need(1, "board")), readOps());
    case "config":
      return { url: serverUrl() };
    case "upgrade":
      return upgrade();
    default:
      console.log(HELP);
      return undefined;
  }
}

run().then(
  (out) => out !== undefined && console.log(JSON.stringify(out, null, 2)),
  (e) => {
    console.error(JSON.stringify({ error: e instanceof Fail || e instanceof OpError || e instanceof ApiError ? e.message : String(e) }));
    process.exit(1);
  },
);
