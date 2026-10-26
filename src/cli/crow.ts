import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { type Op, OpError, applyOps, find, view } from "../lib/ops";
import { createCanvas, dataDir, deleteCanvas, listCanvases, loadCanvas, renameCanvas } from "../lib/store";

const HELP = `crow — read and edit boards in ./data (or $DATA_DIR). Output is JSON.

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
  const files = await fs.readdir(dataDir()).catch(() => []);
  const ids = files.filter((f) => f.endsWith(".canvas")).map((f) => ({ id: f.slice(0, -".canvas".length) }));
  return find(ids, ref)?.id ?? fail(`no board "${ref}"`);
}

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

async function run(): Promise<unknown> {
  const [cmd] = args;
  switch (cmd) {
    case "ls":
      return listCanvases();
    case "new":
      return { id: await createCanvas(need(1, "name")) };
    case "rename": {
      const id = await boardId(need(1, "board"));
      await renameCanvas(id, need(2, "name"));
      return { id, name: args[2] };
    }
    case "delete-board": {
      const id = await boardId(need(1, "board"));
      await deleteCanvas(id);
      return { deleted: id };
    }
    case "show": {
      const id = await boardId(need(1, "board"));
      return { id, ...view((await loadCanvas(id))!.doc, { short: opt.short, ...flags(["includes", "links", "type"]) }) };
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
    default:
      console.log(HELP);
      return undefined;
  }
}

run().then(
  (out) => out !== undefined && console.log(JSON.stringify(out, null, 2)),
  (e) => {
    console.error(JSON.stringify({ error: e instanceof Fail || e instanceof OpError ? e.message : String(e) }));
    process.exit(1);
  },
);
