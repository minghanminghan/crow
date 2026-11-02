# Deploy crow to the mini PC (CROW-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run crow on the mini PC like sparrow: push to `main` → test → semantic-release → self-hosted deploy, with the CLI talking to the server over HTTP.

**Architecture:** Copy sparrow's GitHub config, workflows, and `deploy/` (from `~/Desktop/personal/productivity`), renamed to crow. Crow stores boards as files, so there is no DB and no migrations: backup = tarball of `/var/lib/crow`. The CLI stops importing `store`; it calls new JSON API routes and checks an `X-Crow-Version` header like sparrow.

**Tech Stack:** Next.js 16 (`proxy.ts`), pnpm, esbuild (CLI bundle), vitest, semantic-release, systemd, Caddy, GitHub Actions self-hosted runner.

**Spec:** sparrow tickets SPAR-14, SPAR-15 and `~/Desktop/personal/productivity/docs/superpowers/specs/2026-10-24-hosting-design.md`. Sparrow's files are the reference implementation; "copy X" means copy it from `~/Desktop/personal/productivity/X` and rename sparrow → crow.

## Global Constraints

- Repo: `https://github.com/minghanminghan/crow` (public, empty). Workflow deploys only on push to `main`, never `pull_request`.
- URL `https://crow.andrewminghanjiang.com`, service on `127.0.0.1:3418` (default `PORT`).
- Paths: data `/var/lib/crow` (`DATA_DIR`), backups `/var/backups/crow`, releases `/opt/crow/releases`, current `/opt/crow/current`.
- Users: `crow` (service), `crow-runner` (runner, label `crow`). Sudoers: `systemctl start crow-predeploy`, `systemctl restart crow` only.
- Backups: nightly + before each deploy. Delete older than 7 days, always keep newest 3. Keep last 3 release dirs.
- Node 24+. Conventional commits; squash-merge PRs; PR title is the commit message.
- Version header `X-Crow-Version` (crow already uses `x-version` for canvas versions — do not reuse it).
- CLI: `CROW_URL` env, else `https://crow.andrewminghanjiang.com`. Output stays JSON; errors stay `{"error": "..."}` on stderr, exit 1.

## Review Focus

- CLI pointed at a dead/wrong URL → one clear `{"error":"cannot reach crow at <url> ... Check CROW_URL"}`, not a stack trace. (Task 4 manual check.)
- CLI on a different major version → server answers 426; CLI says `Run: crow upgrade`. Browsers (no header) are never blocked. (Task 3 test.)
- `crow add <board> -` / `batch` still read stdin on the client, not the server. (Task 4 manual check.)
- Op errors (bad id prefix, ambiguous prefix) come back as HTTP 400 with the same message the local CLI printed. (Task 3 test.)
- Health check must read `/api/version`'s `version`, which equals the release tag because deploy runs `pnpm pkg set version` before build. (Task 5.)

---

### Task 1: Repo scaffolding, CI, and GitHub settings

**Files:**
- Create: `.github/actions/setup/action.yml`, `.github/workflows/pr.yml`, `.github/workflows/release.yml`, `.releaserc.json` (copy)
- Modify: `package.json` (scripts, devDeps), `CLAUDE.md` (add sparrow's `### Commits` section verbatim)

- [ ] **Step 1:** Copy the four files. In `release.yml` set `runs-on: crow` and keep everything else.
- [ ] **Step 2:** `package.json`: add `"typecheck": "tsc --noEmit"`; set `"build": "next build && pnpm build:cli"`. `pnpm add -D semantic-release @semantic-release/commit-analyzer @semantic-release/release-notes-generator @semantic-release/github conventional-changelog-conventionalcommits`.
- [ ] **Step 3:** Run `pnpm typecheck && pnpm test && pnpm build`. Expected: all pass, `dist/crow.mjs` exists.
- [ ] **Step 4:** Commit `ci: add test, release, and deploy workflows`. `git remote add origin git@github.com:minghanminghan/crow.git && git push -u origin main`.
- [ ] **Step 5:** Mirror sparrow's settings with `gh api` (values read from sparrow on 2026-11-01):
  - repo: `allow_squash_merge=true`, `allow_merge_commit=false`, `allow_rebase_merge=false`, `delete_branch_on_merge=true`, `squash_merge_commit_title=PR_TITLE`, `squash_merge_commit_message=PR_BODY`
  - `actions/permissions/workflow`: `default_workflow_permissions=read`, `can_approve_pull_request_reviews=false`
  - `actions/permissions/fork-pr-contributor-approval`: `approval_policy=all_external_contributors`
  - branch protection on `main`: required checks `title`, `test`; `enforce_admins=true`
  - ruleset "protect main" on `refs/heads/main`: `deletion`, `non_fast_forward`, `pull_request` (squash only, 0 approvals), `required_status_checks` (copy JSON from `gh api repos/minghanminghan/sparrow/rulesets/25848644`)
- [ ] **Step 6:** Verify: `gh api repos/minghanminghan/crow/rulesets` lists "protect main". The push run shows `test` green, `release` green (no release yet: existing commits are not conventional), `deploy` skipped.

From here on, all changes go through PRs with conventional titles.

### Task 2: Mini PC deploy files

**Files:** Create under `deploy/` (copy and rename): `setup.sh`, `runner.sh`, `deploy.sh`, `caddy/` (verbatim, fix the usage example), `crow.service`, `crow-backup.service`, `crow-backup.timer`, `crow-predeploy.service`; create `deploy/backup.sh`.

- [ ] **Step 1:** `crow.service`: `Environment=DATA_DIR=/var/lib/crow`, `ReadWritePaths=/var/lib/crow`, default port `3418`. Keep sparrow's hardening. Note `/api/preview` fetches the web, so do not add `PrivateNetwork`.
- [ ] **Step 2:** `backup.sh [--backup-only]`: `tar -czf /var/backups/crow/crow-<UTC timestamp>.tar.gz -C /var/lib/crow .`; without `--backup-only`, delete `crow-*.tar.gz` older than 7 days but never the newest 3. Both backup units run it as user `crow` (`ExecStart=/opt/crow/<current|next>/deploy/backup.sh`); predeploy runs only `--backup-only` (no migrate step).
- [ ] **Step 3:** `setup.sh`: users `crow`/`crow-runner`, dirs, sudoers, units, `caddy/setup.sh crow 127.0.0.1:$PORT`. Drop sparrow's "move laptop DB" text; print Task 5's data copy steps instead.
- [ ] **Step 4:** `runner.sh`: `REPO_URL` default `https://github.com/minghanminghan/crow`, `--labels crow`, user `crow-runner`.
- [ ] **Step 5:** `deploy.sh`: `OPT=/opt/crow`, units `crow-predeploy`/`crow`. Rest unchanged.
- [ ] **Step 6:** `bash -n deploy/*.sh deploy/caddy/setup.sh` and `rg -i sparrow deploy` → no output.
- [ ] **Step 7:** PR `ci: add mini PC deploy scripts`.

### Task 3: Server: version, CLI bundle, and JSON API

**Files:**
- Create: `src/lib/version.ts`, `src/proxy.ts`, `src/app/api/version/route.ts`, `src/app/cli/crow.mjs/route.ts`, `src/app/api/canvas/route.ts`, `src/app/api/canvas/[id]/ops/route.ts`
- Modify: `src/app/api/canvas/[id]/route.ts` (add `DELETE`, `PUT` for rename)
- Test: `src/lib/lib.test.ts`

**Interfaces:**
- Produces: `VERSION: string`, `VERSION_HEADER = "X-Crow-Version"`, `compareVersions(a, b): "same" | "compatible" | "incompatible"` in `src/lib/version.ts` (copy sparrow `src/core/version.ts`).
- Produces routes (errors: `{ error: string }` JSON, 400 for `OpError`/bad input, 404 for unknown board):
  - `GET /api/version` → `{ version }`
  - `GET /cli/crow.mjs` → `dist/crow.mjs` bytes, `X-Crow-Version` header (copy sparrow `src/app/cli/sparrow.js/route.ts`)
  - `GET /api/canvas` → `CanvasSummary[]`; `POST /api/canvas {name}` → `{ id }`
  - `GET /api/canvas/[id]` → doc (unchanged); `PUT /api/canvas/[id] {name}` → `{ id, name }`; `DELETE /api/canvas/[id]` → `{ deleted: id }`
  - `POST /api/canvas/[id]/ops` body `Op[]` → `applyOps` results
- `src/proxy.ts`: copy sparrow's minus the dev/prod rewrite. Requests with an incompatible `X-Crow-Version` get 426 `{ error: "client version X is incompatible with server version Y. Run: crow upgrade" }`; every `/api/*` response gets the header.

- [ ] **Step 1: Failing tests** in `src/lib/lib.test.ts`:

```ts
describe("compareVersions", () => {
  it("matches majors", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe("same");
    expect(compareVersions("1.2.3", "1.9.0")).toBe("compatible");
    expect(compareVersions("1.2.3", "2.0.0")).toBe("incompatible");
  });
});

describe("ops route", () => {
  it("returns 400 with the op error", async () => {
    process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "crow-"));
    const id = await createCanvas("t");
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify([{ op: "rm", ids: ["nope"] }]) }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nope/);
  });
});
```

- [ ] **Step 2:** `pnpm test` → FAIL (modules missing).
- [ ] **Step 3:** Implement the files above. Route handlers call the existing `store`/`ops` functions; no new storage logic.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS. `pnpm dev`, then `curl -si localhost:3000/api/version -H 'X-Crow-Version: 99.0.0'` → `426`; without the header → `200 {"version":"0.1.0"}`.
- [ ] **Step 5:** PR `feat: add version check and board JSON API`.

### Task 4: CLI over HTTP

**Files:**
- Create: `src/cli/http.ts`
- Modify: `src/cli/crow.ts`

**Interfaces:**
- Consumes: Task 3 routes and `src/lib/version.ts`.
- Produces in `src/cli/http.ts`: `serverUrl(): string` (`CROW_URL` trimmed of trailing `/`, else prod URL); `api<T>(path: string, init?: RequestInit): Promise<T>` — sends `X-Crow-Version`, throws `Fail`-style errors with the server's `error` text, warns once on stderr for a minor/patch mismatch (`crow: cli X differs from server Y. Run: crow upgrade`), and on network failure throws `cannot reach crow at <url> (<code>). Check CROW_URL`.

- [ ] **Step 1:** Rewrite `crow.ts` commands on top of `api`: `boardId` uses `GET /api/canvas` + `find`; `show` fetches the doc and runs `view` locally; `add/edit/arrow/rm/batch` POST ops; `new/rename/delete-board` use their routes. No import of `../lib/store` remains (`rg "lib/store" src/cli` → nothing).
- [ ] **Step 2:** Add `crow config` → `{ url }` and `crow upgrade` (copy sparrow `cmdUpgrade`; require the file to end in `.mjs`; download `/cli/crow.mjs`). Update `HELP` header to `crow — read and edit boards on the crow server ($CROW_URL). Output is JSON.` and list both commands.
- [ ] **Step 3:** Verify against `pnpm dev` with `CROW_URL=http://localhost:3000`: `crow new t`, `echo hi | crow add t -`, `crow show t --short`, `crow batch t < ops.jsonl`, `crow rename t t2`, `crow delete-board t2` all work and the open browser board updates live. `CROW_URL=http://localhost:1 pnpm crow ls` → single JSON error line, exit 1.
- [ ] **Step 4:** PR `feat: crow CLI talks to the server over HTTP`.

### Task 5: First deploy (Andrew runs these on the mini PC)

- [ ] **Step 1:** `git clone https://github.com/minghanminghan/crow && cd crow && sudo deploy/setup.sh`
- [ ] **Step 2:** `sudo RUNNER_TOKEN=$(gh api -X POST repos/minghanminghan/crow/actions/runners/registration-token -q .token) deploy/runner.sh`. Check: `gh api repos/minghanminghan/crow/actions/runners -q '.runners[].status'` → `online`.
- [ ] **Step 3:** Re-run the `deploy` job of the latest release run (Task 4's, `v1.1.0`). Expected log ends `deployed 1.1.0`; `curl -s https://crow.andrewminghanjiang.com/api/version` → `{"version":"1.1.0"}`.
- [ ] **Step 4:** Move laptop boards:
  - laptop: `tar -czf /tmp/crow-data.tar.gz -C ~/Desktop/personal/whiteboard/data . && scp /tmp/crow-data.tar.gz <minipc>:/tmp/`
  - mini PC: `sudo systemctl stop crow && sudo tar -xzf /tmp/crow-data.tar.gz -C /var/lib/crow && sudo chown -R crow:crow /var/lib/crow && sudo systemctl start crow`
- [ ] **Step 5:** Install the CLI on the laptop: `curl -fsSL https://crow.andrewminghanjiang.com/cli/crow.mjs -o ~/.local/bin/crow && chmod +x ~/.local/bin/crow && crow ls` → your boards. `sudo systemctl start crow-backup && ls /var/backups/crow` → one tarball.
- [ ] **Step 6:** Close CROW-1: `sparrow move CROW-1 done` (or the equivalent sparrow command).

## Calls made by Claude (check these)

- Port `3418`, URL `crow.andrewminghanjiang.com`, separate `crow-runner` user.
- Bash `tar` backup instead of a Node backup script; no migrations.
- Skipped sparrow's `--env dev|prod` and `scripts/dev.sh`; use `CROW_URL=http://localhost:3000` for local dev.
- Web UI keeps its server actions; only the CLI moves to the new routes.
- Deploy files merge (Task 2, `ci:`, no release) before the first `feat:`, so every release tag contains `deploy/`. Task 3 releases `v1.0.0`, Task 4 `v1.1.0`.
