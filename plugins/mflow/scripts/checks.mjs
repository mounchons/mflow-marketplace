#!/usr/bin/env node
// Checks of merged changes, done by any agent one job at a time: the test, review and E2E of the changes merged
// into main and still waiting in docs/reviews/pending.md, split into jobs in a checklist that every tool reads.
// A batch is a branch `checks/<YYYY-MM-DD>-<n>` from main with its own worktree `.claude/worktrees/checks-<batch>`;
// its checklist `docs/reviews/checks/<batch>.md` lists the jobs, and a draft pull request from the branch to main
// carries the checklist, the test records, the review reports and the ticks of pending.md. The user merges it.
//
// A batch collects every change merged since the last one until a job is first taken: that pins it (`Pinned:`, the
// commit every test of the batch runs at), and a change merged after that goes into the next batch. Membership is
// read from pending.md, so a merge by hand or by another tool is picked up by the next `sync`.
//
// Jobs: `test` (one part of `- Test parts:` in AGENTS.md, with T0 for the build, format, lint, validate and the
// every-test-once count; or one whole-suite job when there are no parts), `review` (one change, report only),
// `e2e-write` and `e2e` (one screen each). Tests and E2E share the machine's database, ports, Docker and browsers,
// so a machine runs one of them at a time (the heavy lane); reviews run alongside. Reviews wait for the tests to
// finish; E2E waits for them to pass. A job taken is held outside git (<git common dir>/mflow/checks/claims.json),
// so taking one leaves the tree clean for the run; a claim older than `staleMinutes` can be taken again, because a
// session cut short by a usage limit never gives its job back. When the last test part is done, the parts are
// combined into one whole-suite record at the pinned commit, which ticks Test in pending.md.
//
//   node checks.mjs enable                                   add "checks" to .mflow/config.json (the project opts in)
//   node checks.mjs sync [--dry-run]                         put the merged changes no batch holds into the open batch
//   node checks.mjs status                                   JSON: the open batches, their jobs, who runs what
//   node checks.mjs next --as <tool> [--batch <b>]           take the next job for that tool (pins the batch)
//   node checks.mjs done <job> [--batch <b>] [--record <path> | --report <path>] [--files <a,b>] [--note <text>]
//   node checks.mjs release <job> [--batch <b>] [--note <text>]   give a taken job back
//   node checks.mjs block <job> [--batch <b>] --note <text>  the job needs the user's decision
//   node checks.mjs assign <job[,job]> <tool|any> [--batch <b>]
//   node checks.mjs publish [--batch <b>]                    push the branch, open or update the draft pull request
//
// Tools: claude, codex, antigravity, opencode, or any. E2E goes only to claude and codex, the tools with mflow's
// guard on the browsers a Playwright run opens. Nothing here merges into main or pushes main.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, loadConfig, readText, readJsonFile, withFileLock, writeFileAtomic, worktreeInfo, MARKER } from "./lib.mjs";
import { status as pendingStatus, range as pendingRange, readRecord, tickTest } from "./pending.mjs";
import { WORKTREES, includedFiles, ignoreWorktrees, list as listWorktrees } from "./worktree.mjs";

export const DIR = "docs/reviews/checks";
export const PREFIX = "checks/";
export const KINDS = ["test", "review", "e2e-write", "e2e"];
export const HEAVY = new Set(["test", "e2e-write", "e2e"]);
export const TOOLS = ["claude", "codex", "antigravity", "opencode"];
const E2E_TOOLS = ["claude", "codex"];
export const DEFAULTS = { route: { test: "any", review: "claude", e2e: "claude" }, staleMinutes: 60 };
const COLS = ["Job", "Kind", "Target", "Size", "Agent", "Waits", "State", "Result"];
const STATES = ["open", "done", "failed", "blocked"];
// What a test or E2E record's commit may add to the pinned commit: documents of the checks, and E2E test files.
const ALLOWED_AFTER_PIN = (f) => /^docs\/reviews\//.test(f) || /(^|\/)e2e\/.+\.[cm]?[jt]sx?$/.test(f);

function git(cwd, args, { input } = {}) {
  const r = spawnSync("git", ["-c", "core.quotePath=false", ...args], { cwd, encoding: "utf8", input, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
const must = (r, what) => {
  if (!r.ok) throw new Error(`${what}: ${r.err || "git failed"}`);
  return r.out;
};
const pad = (n) => String(n).padStart(2, "0");
const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = (d = new Date()) => `${today(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const cell = (v) => String(v ?? "").replace(/\|/g, "/").replace(/[\r\n]+/g, " ").trim() || "—";
const empty = (v) => !v || /^[—–-]*$/.test(String(v).trim());
const slash = (p) => String(p).replace(/\\/g, "/").replace(/^\.\//, "");

function mainInfo(root) {
  const info = worktreeInfo(root);
  if (!info) throw new Error("not a git repository");
  if (!info.main) throw new Error("the main checkout of this repository was not found");
  return info;
}

export function checksConfig(root) {
  const user = loadConfig(root).checks;
  if (user !== undefined && (typeof user !== "object" || user === null || Array.isArray(user))) throw new Error(`${MARKER}: "checks" must be an object`);
  const route = { ...DEFAULTS.route, ...(user?.route || {}) };
  for (const [kind, tool] of Object.entries(route)) {
    const one = Array.isArray(tool) ? tool[0] : tool;
    if (!["any", ...TOOLS].includes(one)) throw new Error(`${MARKER}: checks.route.${kind} must be any or one of ${TOOLS.join(", ")}`);
    route[kind] = one;
  }
  if (!E2E_TOOLS.includes(route.e2e)) throw new Error(`${MARKER}: checks.route.e2e must be ${E2E_TOOLS.join(" or ")}: no other tool has mflow's guard on Playwright's browsers`);
  const staleMinutes = user?.staleMinutes ?? DEFAULTS.staleMinutes;
  if (!Number.isInteger(staleMinutes) || staleMinutes < 5) throw new Error(`${MARKER}: checks.staleMinutes must be a whole number of 5 or more`);
  return { enabled: user !== undefined, route, staleMinutes };
}

export function enable(root) {
  const file = path.join(root, MARKER);
  const cfg = readJsonFile(file, { allowEmpty: true }) ?? {};
  if (cfg.checks) return { file: MARKER, enabled: true, changed: false };
  cfg.checks = {};
  writeFileAtomic(file, JSON.stringify(cfg, null, 2) + "\n");
  return { file: MARKER, enabled: true, changed: true };
}

// ---------- the checklist ----------

const HEAD_KEYS = ["Branch", "Pinned", "PR", "Changes", "Suite"];

export function parseDoc(text) {
  const doc = { pinned: null, pinnedAt: null, pr: null, changes: [], suite: null, jobs: [] };
  if (!text) return doc;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const head = (key) => lines.map((l) => new RegExp(`^${key}:\\s*(.*)$`).exec(l)?.[1]).find((v) => v !== undefined);
  const pin = /^([0-9a-f]{7,64})(?:\s+\((.+)\))?$/.exec((head("Pinned") || "").trim());
  if (pin) [doc.pinned, doc.pinnedAt] = [pin[1], pin[2] || null];
  if (!empty(head("PR"))) doc.pr = head("PR").trim();
  if (!empty(head("Suite"))) doc.suite = head("Suite").trim();
  doc.changes = empty(head("Changes")) ? [] : head("Changes").split(",").map((s) => s.trim()).filter(Boolean);
  const at = lines.findIndex((l) => /^\|\s*Job\s*\|/.test(l));
  if (at < 0) return doc;
  for (const line of lines.slice(at + 2)) {
    if (!line.trim().startsWith("|")) break;
    const c = line.trim().replace(/^\||\|$/g, "").split("|").map((s) => s.trim());
    const [id, kind, target, size, agent, waits, state, result] = c;
    if (!id) continue;
    doc.jobs.push({
      id, kind, target, size: empty(size) ? null : size, agent: empty(agent) ? "any" : agent,
      waits: empty(waits) ? [] : waits.split(/[\s,]+/).filter(Boolean),
      state: STATES.includes(state) ? state : "open", result: empty(result) ? null : result,
    });
  }
  return doc;
}

export function renderDoc(name, doc) {
  return [
    `# Checks ${name} · ตรวจชุด ${name}`,
    "",
    "<!-- Written by mflow (checks.mjs). Jobs run on this branch at the Pinned commit, one test or E2E job at a time per",
    "     machine; a job taken is held outside git, so its State says open until it is done. Change the Agent column by",
    "     asking Claude in words, or edit it here. Merging this branch's pull request into main brings the records, the",
    "     reports and the ticks of docs/reviews/pending.md with it. -->",
    "",
    `Branch: ${PREFIX}${name}`,
    `Pinned: ${doc.pinned ? `${doc.pinned}${doc.pinnedAt ? ` (${doc.pinnedAt})` : ""}` : "—"}`,
    `PR: ${doc.pr || "—"}`,
    `Changes: ${doc.changes.join(", ") || "—"}`,
    `Suite: ${doc.suite || "—"}`,
    "",
    `| ${COLS.join(" | ")} |`,
    `|${COLS.map(() => "---").join("|")}|`,
    ...doc.jobs.map((j) => `| ${[j.id, j.kind, j.target, j.size, j.agent, j.waits.join(" "), j.state, j.result].map(cell).join(" | ")} |`),
    "",
  ].join("\n");
}

/** The test parts AGENTS.md names under ## Commands (`- Test parts: <name>: <command>; …`), E2E parts left out. */
export function testParts(main) {
  const text = readText(path.join(main, "AGENTS.md")) || "";
  const line = /^- Test parts:\s*(.+)$/m.exec(text.replace(/\r\n/g, "\n"))?.[1];
  if (!line) return [];
  return line.split(";").map((p) => /^\s*`?([^:`]+?)`?\s*:/.exec(p)?.[1]?.trim()).filter((n) => n && !/e2e/i.test(n));
}

const nextId = (jobs, prefix) => {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  return `${prefix}${Math.max(0, ...jobs.map((j) => Number(re.exec(j.id)?.[1] ?? 0))) + 1}`;
};

function testJobs(main, route) {
  const parts = testParts(main);
  if (!parts.length) return [{ id: "T1", kind: "test", target: "whole suite", size: null, agent: route.test, waits: [], state: "open", result: null }];
  return [
    { id: "T0", kind: "test", target: "prepare: build, format, lint, validate, every test once", size: null, agent: route.test, waits: [], state: "open", result: null },
    ...parts.map((p, i) => ({ id: `T${i + 1}`, kind: "test", target: `part ${p}`, size: null, agent: route.test, waits: [], state: "open", result: null })),
  ];
}

function changeLines(main, change) {
  try {
    const r = pendingRange(main, change);
    const stat = git(main, ["diff", "--shortstat", r.base, r.end]).out;
    const n = [...stat.matchAll(/(\d+) (?:insertion|deletion)/g)].reduce((s, m) => s + Number(m[1]), 0);
    return `${n} lines`;
  } catch {
    return null;
  }
}

function addChangeJobs(doc, main, rows, route) {
  const tests = doc.jobs.filter((j) => j.kind === "test").map((j) => j.id);
  for (const row of rows) {
    if (doc.changes.includes(row.change)) continue;
    doc.changes.push(row.change);
    doc.jobs.push({ id: nextId(doc.jobs, "R"), kind: "review", target: row.change, size: changeLines(main, row.change), agent: route.review, waits: tests, state: "open", result: null });
    const screens = empty(row.screens) ? [] : row.screens.split(/[,;]/).map((s) => s.replace(/`/g, "").trim()).filter(Boolean);
    for (const screen of screens) {
      if (doc.jobs.some((j) => j.kind === "e2e-write" && j.target.toLowerCase() === screen.toLowerCase())) continue;
      const n = nextId(doc.jobs, "EW").slice(2);
      doc.jobs.push({ id: `EW${n}`, kind: "e2e-write", target: screen, size: "1 screen", agent: route.e2e, waits: tests, state: "open", result: null });
      doc.jobs.push({ id: `E${n}`, kind: "e2e", target: screen, size: "1 screen", agent: route.e2e, waits: [`EW${n}`], state: "open", result: null });
    }
  }
}

// ---------- batches ----------

/** Every checks/* branch with its checklist (the worktree's working copy when it has one), merged or open. */
export function batches(root) {
  const info = mainInfo(root);
  const main = info.main;
  const refs = git(main, ["for-each-ref", "--format=%(refname:short)", "refs/heads/checks/"]).out.split(/\r?\n/).filter(Boolean).sort();
  const wts = listWorktrees(root).worktrees;
  return refs.map((branch) => {
    const name = branch.slice(PREFIX.length);
    const file = `${DIR}/${name}.md`;
    const wt = wts.find((w) => w.branch === branch);
    const live = wt ? readText(path.join(wt.dir, file)) : null;
    const committed = git(main, ["show", `${branch}:${file}`]);
    const doc = parseDoc(live ?? (committed.ok ? committed.out : ""));
    // Merged: main holds the branch, or main has its checklist (a squash merge of the pull request).
    const merged = git(main, ["merge-base", "--is-ancestor", branch, "main"]).ok || git(main, ["cat-file", "-e", `main:${file}`]).ok;
    return { name, branch, file, dir: wt?.dir || null, merged, ...doc };
  });
}

const claimsFile = (root) => {
  const common = must(git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]), "git common dir");
  return path.join(common, "mflow", "checks", "claims.json");
};
function readClaims(file, staleMinutes) {
  let all = {};
  try {
    all = JSON.parse(fs.readFileSync(file, "utf8")) || {};
  } catch { /* none yet */ }
  const live = {};
  const stale = [];
  for (const [k, c] of Object.entries(all)) {
    if (Date.now() - Date.parse(c.at) > staleMinutes * 60_000) stale.push({ key: k, ...c });
    else live[k] = c;
  }
  return { live, stale };
}
const writeClaims = (file, claims) => writeFileAtomic(file, JSON.stringify(claims, null, 2) + "\n");

function commitIn(dir, files, message) {
  const rel = [...new Set(files.map(slash))].filter((f) => fs.existsSync(path.join(dir, f)));
  if (!rel.length) return null;
  must(git(dir, ["add", "--", ...rel]), "git add");
  if (git(dir, ["diff", "--cached", "--quiet"]).ok) return null;
  must(git(dir, ["commit", "-m", message, "--", ...rel]), "git commit");
  return git(dir, ["rev-parse", "HEAD"]).out;
}

function ensureWorktree(main, b) {
  if (b.dir) return b.dir;
  const dir = path.join(main, WORKTREES, `checks-${b.name}`);
  if (fs.existsSync(dir)) throw new Error(`folder already exists: ${dir}`);
  must(git(main, ["worktree", "add", dir, b.branch]), "git worktree add");
  copyIncluded(main, dir);
  return dir;
}
function copyIncluded(main, dir) {
  for (const rel of includedFiles(main)) {
    const to = path.join(dir, rel);
    if (fs.existsSync(to)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(main, rel), to);
  }
}

export function sync(root, { dryRun = false } = {}) {
  const info = mainInfo(root);
  const main = info.main;
  const cfg = checksConfig(main);
  if (git(main, ["branch", "--show-current"]).out !== "main") throw new Error(`the main checkout (${main}) is not on main; switch it back to main first`);
  const st = pendingStatus(main);
  const all = batches(root);
  const listed = new Set(all.flatMap((b) => b.changes));
  const fresh = st.rows.filter((r) => r.landed && (r.testOpen || r.reviewOpen) && !listed.has(r.change));
  let b = all.find((x) => !x.merged && !x.pinned) || null;
  const pinnedOpen = all.filter((x) => !x.merged && x.pinned).map((x) => x.name);
  if (!fresh.length || dryRun) return { added: dryRun ? fresh.map((r) => r.change) : [], batch: b?.name || null, dryRun, waitingInPinned: pinnedOpen };
  const warnings = [];
  let created = false;
  if (!b) {
    const date = today();
    const taken = all.filter((x) => x.name.startsWith(`${date}-`)).length;
    const name = `${date}-${taken + 1}`;
    if (ignoreWorktrees(main)) warnings.push(`${WORKTREES}/ added to .gitignore in the main checkout: commit it`);
    const dir = path.join(main, WORKTREES, `checks-${name}`);
    must(git(main, ["worktree", "add", "-b", `${PREFIX}${name}`, dir, "main"]), "git worktree add");
    copyIncluded(main, dir);
    b = { name, branch: `${PREFIX}${name}`, file: `${DIR}/${name}.md`, dir, merged: false, ...parseDoc(""), jobs: testJobs(main, cfg.route) };
    created = true;
  } else {
    b.dir = ensureWorktree(main, b);
    if (git(b.dir, ["status", "--porcelain"]).out) throw new Error(`${b.dir} has uncommitted changes; commit or drop them before adding to ${b.name}`);
    const m = git(b.dir, ["merge", "--no-edit", "main"]);
    if (!m.ok) {
      git(b.dir, ["merge", "--abort"]);
      throw new Error(`git merge main into ${b.branch} failed: ${m.err}`);
    }
  }
  addChangeJobs(b, main, fresh, cfg.route);
  writeFileAtomic(path.join(b.dir, b.file), renderDoc(b.name, b));
  const commit = commitIn(b.dir, [b.file], `checks: add ${fresh.map((r) => r.change).join(", ")} to ${b.name}`);
  return { added: fresh.map((r) => r.change), batch: b.name, branch: b.branch, dir: b.dir, created, commit, warnings, waitingInPinned: pinnedOpen };
}

// ---------- jobs ----------

const waitsMet = (job, jobs) => job.waits.every((id) => {
  const w = jobs.find((j) => j.id === id);
  if (!w) return true;
  return w.state === "done" || (job.kind === "review" && w.state === "failed");
});

const HOW = {
  test: (j, dir) => j.id === "T0"
    ? `In ${dir}: the build, format and lint in their check-only form, openspec validate --specs --strict, and the "Every test once" count of /mflow:test for every project the parts split by filter; record it as a /mflow:test record with Scope: prepare`
    : j.target === "whole suite"
      ? `In ${dir}: /mflow:test, the whole suite`
      : `In ${dir}: /mflow:test ${j.target.replace(/^part /, "")}, that part only, with the build it needs`,
  review: (j, dir) => `In ${dir}: /mflow:review pending ${j.target}, report only: leave its section 4 (Fix) out; the findings wait for the user or a fix job`,
  "e2e-write": (j, dir) => `In ${dir}: /mflow:e2e ${j.target}, write or update its E2E tests from its spec and run them; commit the test files with done --files`,
  e2e: (j, dir) => `In ${dir}: run the E2E tests of ${j.target} as /mflow:test e2e does, --workers at most e2eMaxWorkers, and write its record`,
};

function findBatch(root, { batch, job } = {}) {
  const open = batches(root).filter((b) => !b.merged);
  if (batch) {
    const b = open.find((x) => x.name === batch || x.branch === batch);
    if (!b) throw new Error(`no open batch ${batch}`);
    return b;
  }
  const holders = open.filter((b) => b.jobs.some((j) => j.id === job));
  if (holders.length === 1) return holders[0];
  if (!holders.length) throw new Error(`no open batch has job ${job}`);
  throw new Error(`job ${job} is in ${holders.map((b) => b.name).join(" and ")}; name one with --batch`);
}

export function status(root) {
  const cfg = checksConfig(root);
  const { live, stale } = readClaims(claimsFile(root), cfg.staleMinutes);
  const open = batches(root).filter((b) => !b.merged).map((b) => ({
    ...b,
    jobs: b.jobs.map((j) => {
      const c = live[`${b.name}/${j.id}`];
      return { ...j, running: c ? { tool: c.tool, at: c.at } : null, ready: j.state === "open" && !c && waitsMet(j, b.jobs) };
    }),
  }));
  return { enabled: cfg.enabled, route: cfg.route, batches: open, stale: stale.map((s) => s.key) };
}

export function next(root, { as, batch } = {}) {
  if (!TOOLS.includes(as)) throw new Error(`next: --as must be one of ${TOOLS.join(", ")}`);
  const cfg = checksConfig(root);
  const main = mainInfo(root).main;
  const file = claimsFile(root);
  return withFileLock(file, () => {
    const { live, stale } = readClaims(file, cfg.staleMinutes);
    const heavyBusy = Object.values(live).find((c) => c.heavy);
    let open = batches(root).filter((b) => !b.merged);
    if (batch) open = open.filter((b) => b.name === batch || b.branch === batch);
    const skipped = [];
    for (const b of open) {
      for (const j of b.jobs) {
        if (j.state !== "open" || live[`${b.name}/${j.id}`]) continue;
        if (j.agent !== "any" && j.agent !== as) continue;
        if ((j.kind === "e2e" || j.kind === "e2e-write") && !E2E_TOOLS.includes(as)) continue;
        if (!waitsMet(j, b.jobs)) continue;
        if (HEAVY.has(j.kind) && heavyBusy) {
          skipped.push(`${b.name}/${j.id} waits for the heavy lane (${heavyBusy.tool} runs ${heavyBusy.job})`);
          continue;
        }
        const dir = ensureWorktree(main, b);
        if (git(dir, ["status", "--porcelain"]).out) throw new Error(`${dir} has uncommitted changes; commit them (done) or drop them before the next job`);
        if (!b.pinned) {
          b.pinned = git(dir, ["rev-parse", "HEAD"]).out;
          b.pinnedAt = stamp();
          writeFileAtomic(path.join(dir, b.file), renderDoc(b.name, b));
          commitIn(dir, [b.file], `checks: pin ${b.name} at ${b.pinned.slice(0, 7)}`);
        }
        live[`${b.name}/${j.id}`] = { tool: as, at: new Date().toISOString(), heavy: HEAVY.has(j.kind), job: `${b.name}/${j.id}` };
        writeClaims(file, live);
        return { batch: b.name, branch: b.branch, dir, file: b.file, pinned: b.pinned, job: j, how: HOW[j.kind](j, dir), reclaimed: stale.some((s) => s.key === `${b.name}/${j.id}`) };
      }
    }
    return { job: null, reason: skipped.length ? skipped.join("; ") : `no open job for ${as} is ready`, batches: open.map((b) => b.name) };
  });
}

function nextRecordPath(dir, commit) {
  const base = `docs/reviews/tests/${today()}-${commit.slice(0, 7)}`;
  for (let n = 1; ; n++) {
    const rel = n === 1 ? `${base}.md` : `${base}-${n}.md`;
    if (!fs.existsSync(path.join(dir, rel))) return rel;
  }
}

/** Every test part done: one whole-suite record at the pinned commit, from the parts' records. */
function combine(b, dir) {
  const tests = b.jobs.filter((j) => j.kind === "test");
  if (!tests.some((j) => j.id === "T0") || b.suite || tests.some((j) => j.state !== "done" && j.state !== "failed")) return null;
  const parts = tests.map((j) => {
    const rel = /^(\S+\.md)\b/.exec(j.result || "")?.[1];
    const text = rel ? readText(path.join(dir, rel)) || "" : "";
    const rec = readRecord(text);
    return { job: j, rel, rec, duration: /^Duration:\s*(.+)$/m.exec(text)?.[1]?.trim() || "—", by: /^By:\s*(.+)$/m.exec(text)?.[1]?.trim() || "claude", failures: (/## Failures\s*\n([\s\S]*?)(\n## |\s*$)/.exec(text)?.[1] || "").trim() };
  });
  const pass = parts.every((p) => p.job.state === "done" && p.rec.result === "pass");
  const rel = nextRecordPath(dir, b.pinned);
  const failures = parts.filter((p) => p.failures && !/^none\b/i.test(p.failures)).map((p) => `${p.job.id} ${p.job.target}:\n${p.failures}`);
  const text = [
    `Tested: ${b.branch} at ${git(dir, ["rev-parse", b.pinned]).out}`,
    `By: ${[...new Set(parts.map((p) => p.by))].join(", ")} (checks ${b.name})`,
    "Scope: whole suite",
    `Changes: ${b.changes.join(", ") || "none"}`,
    `Result: ${pass ? "pass" : "fail"}`,
    `Duration: ${parts.map((p) => p.duration).join(" + ")}`,
    `Parts: ${parts.map((p) => `${p.job.id} ${p.rel || "no record"}`).join(", ")}`,
    "",
    "| Part | Command | Result | Duration |",
    "|---|---|---|---|",
    ...parts.map((p) => `| ${cell(`${p.job.id} ${p.job.target}`)} | ${cell(p.rel)} | ${cell(p.rec.result || "missing")} | ${cell(p.duration)} |`),
    "",
    "## Failures",
    failures.length ? failures.join("\n\n") : "none",
    "",
  ].join("\n");
  writeFileAtomic(path.join(dir, rel), text);
  b.suite = `${rel} ${pass ? "pass" : "fail"}`;
  const ticked = pass ? tickTest(dir, rel) : null;
  return { record: rel, result: pass ? "pass" : "fail", ticked };
}

function checkRecordCommit(dir, b, rec, rel) {
  if (!rec.commit) throw new Error(`${rel} has no Tested: … at <commit> line`);
  if (rec.uncommitted) throw new Error(`${rel} was run with uncommitted changes; commit first and run again`);
  const changed = git(dir, ["diff", "--name-only", b.pinned, rec.commit]);
  if (!changed.ok) throw new Error(`${rel}: commit ${rec.commit} is not in this repository`);
  const code = changed.out.split(/\r?\n/).filter(Boolean).filter((f) => !ALLOWED_AFTER_PIN(f));
  if (code.length) throw new Error(`${rel} ran at ${rec.commit.slice(0, 7)}, which changes ${code.slice(0, 3).join(", ")} after the pinned commit; run it on this batch's branch`);
}

export function done(root, id, { batch, record, report, files = [], note } = {}) {
  const cfg = checksConfig(root);
  const b = findBatch(root, { batch, job: id });
  const j = b.jobs.find((x) => x.id === id);
  if (!j) throw new Error(`${b.name} has no job ${id}`);
  if (j.state !== "open") throw new Error(`${b.name}/${id} is already ${j.state}`);
  const dir = b.dir;
  if (!dir) throw new Error(`${b.name} has no worktree on this machine`);
  const inside = (p) => {
    const rel = slash(path.isAbsolute(p) ? path.relative(dir, p) : p);
    if (rel.startsWith("../") || path.isAbsolute(rel)) throw new Error(`${p} is outside ${dir}`);
    if (!fs.existsSync(path.join(dir, rel))) throw new Error(`${rel} not found in ${dir}`);
    return rel;
  };
  const extra = files.map(inside);
  const commitFiles = [b.file, ...extra];
  if (j.kind === "test" || j.kind === "e2e") {
    if (!record) throw new Error(`done ${id}: name its record with --record`);
    const rel = inside(record);
    const rec = readRecord(readText(path.join(dir, rel)) || "");
    checkRecordCommit(dir, b, rec, rel);
    j.state = rec.result === "pass" ? "done" : "failed";
    j.result = `${rel} ${rec.result || "no result"}`;
    commitFiles.push(rel);
  } else if (j.kind === "review") {
    if (!report) throw new Error(`done ${id}: name its report with --report`);
    const rel = inside(report);
    const text = readText(path.join(dir, rel)) || "";
    const verdict = /^\W*verdict\W*:?\W*\s*(approve|changes-requested|none)/im.exec(text)?.[1]?.toLowerCase()
      || /\b(approve|changes-requested)\b/i.exec(text)?.[1]?.toLowerCase() || "see report";
    j.state = "done";
    j.result = `${rel} ${verdict}`;
    commitFiles.push(rel);
  } else {
    j.state = "done";
    j.result = note || (extra.length ? extra.join(", ") : "no test files changed");
  }
  if (note && j.kind !== "e2e-write") j.result += ` (${note})`;
  const combined = combine(b, dir);
  if (combined) commitFiles.push(combined.record, "docs/reviews/pending.md");
  if (j.kind === "test" && j.target === "whole suite" || j.kind === "review") commitFiles.push("docs/reviews/pending.md");
  writeFileAtomic(path.join(dir, b.file), renderDoc(b.name, b));
  const file = claimsFile(root);
  withFileLock(file, () => {
    const { live } = readClaims(file, cfg.staleMinutes);
    delete live[`${b.name}/${id}`];
    writeClaims(file, live);
  });
  const commit = commitIn(dir, commitFiles, `checks: ${id} ${j.kind} ${j.target} ${j.state} (${b.name})`);
  return { batch: b.name, job: j, combined, commit, left: b.jobs.filter((x) => x.state === "open").map((x) => x.id) };
}

function setJob(root, id, { batch, note }, change) {
  const cfg = checksConfig(root);
  const b = findBatch(root, { batch, job: id });
  const j = b.jobs.find((x) => x.id === id);
  if (!j) throw new Error(`${b.name} has no job ${id}`);
  const file = claimsFile(root);
  withFileLock(file, () => {
    const { live } = readClaims(file, cfg.staleMinutes);
    delete live[`${b.name}/${id}`];
    writeClaims(file, live);
  });
  if (!change(j)) return { batch: b.name, job: j, commit: null };
  if (note) j.result = note;
  writeFileAtomic(path.join(b.dir, b.file), renderDoc(b.name, b));
  return { batch: b.name, job: j, commit: commitIn(b.dir, [b.file], `checks: ${id} ${j.state} (${b.name})`) };
}

export const release = (root, id, opts = {}) => setJob(root, id, opts, () => Boolean(opts.note));
export function block(root, id, opts = {}) {
  if (!opts.note) throw new Error("block: say what the user must decide with --note");
  return setJob(root, id, opts, (j) => {
    j.state = "blocked";
    return true;
  });
}

export function assign(root, ids, tool, { batch } = {}) {
  if (!["any", ...TOOLS].includes(tool)) throw new Error(`assign: the tool must be any or one of ${TOOLS.join(", ")}`);
  const list = String(ids || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) throw new Error("assign: name the jobs, e.g. assign T2 antigravity");
  const b = findBatch(root, { batch, job: list[0] });
  for (const id of list) {
    const j = b.jobs.find((x) => x.id === id);
    if (!j) throw new Error(`${b.name} has no job ${id}`);
    if ((j.kind === "e2e" || j.kind === "e2e-write") && !E2E_TOOLS.includes(tool)) throw new Error(`${id} is E2E: only ${E2E_TOOLS.join(" and ")} have mflow's guard on Playwright's browsers`);
    j.agent = tool;
  }
  writeFileAtomic(path.join(b.dir, b.file), renderDoc(b.name, b));
  return { batch: b.name, assigned: list, tool, commit: commitIn(b.dir, [b.file], `checks: ${list.join(", ")} to ${tool} (${b.name})`) };
}

function gh(args, cwd) {
  const script = process.env.MFLOW_GH;
  const r = script
    ? spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", timeout: 60_000 })
    : spawnSync("gh", args, { cwd, encoding: "utf8", timeout: 60_000, shell: false });
  if (r.error) return { ok: false, out: "", err: r.error.code === "ENOENT" ? "gh is not installed" : r.error.message };
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

export function publish(root, { batch } = {}) {
  const open = batches(root).filter((b) => !b.merged);
  const b = batch ? open.find((x) => x.name === batch || x.branch === batch) : open[open.length - 1];
  if (!b) throw new Error(batch ? `no open batch ${batch}` : "no open batch");
  if (!b.dir) throw new Error(`${b.name} has no worktree on this machine`);
  if (!git(b.dir, ["remote", "get-url", "origin"]).ok) return { batch: b.name, pushed: false, pr: null, reason: "no origin remote: the checklist stays a file, without a pull request" };
  const push = () => git(b.dir, ["push", "-u", "origin", b.branch]);
  const first = push();
  if (!first.ok) return { batch: b.name, pushed: false, pr: b.pr, reason: `git push failed: ${first.err}` };
  const title = `checks: ${b.name} (${b.changes.length} change${b.changes.length === 1 ? "" : "s"})`;
  const body = (readText(path.join(b.dir, b.file)) || "").replace(/<!--[\s\S]*?-->\n*/, "");
  if (!b.pr) {
    const made = gh(["pr", "create", "--draft", "--base", "main", "--head", b.branch, "--title", title, "--body", body], b.dir);
    if (!made.ok) return { batch: b.name, pushed: true, pr: null, reason: `pull request not opened: ${made.err}` };
    b.pr = made.out.split(/\r?\n/).filter(Boolean).pop();
    writeFileAtomic(path.join(b.dir, b.file), renderDoc(b.name, b));
    commitIn(b.dir, [b.file], `checks: pull request of ${b.name}`);
    const again = push();
    return { batch: b.name, pushed: again.ok, pr: b.pr, created: true, reason: again.ok ? null : `git push failed: ${again.err}` };
  }
  const edit = gh(["pr", "edit", b.pr, "--title", title, "--body", body], b.dir);
  return { batch: b.name, pushed: true, pr: b.pr, created: false, reason: edit.ok ? null : `pull request not updated: ${edit.err}` };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()) || process.cwd();
  const [cmd, ...rest] = process.argv.slice(2);
  const arg = (i) => (rest[i] && !rest[i].startsWith("--") ? rest[i] : undefined);
  const opt = (flag) => {
    const i = rest.indexOf(flag);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  try {
    const common = { batch: opt("--batch"), note: opt("--note") };
    let out;
    if (cmd === "enable") out = enable(root);
    else if (cmd === "sync") out = sync(root, { dryRun: rest.includes("--dry-run") });
    else if (cmd === "status") out = status(root);
    else if (cmd === "next") out = next(root, { as: opt("--as"), batch: common.batch });
    else if (cmd === "done") out = done(root, arg(0), { ...common, record: opt("--record"), report: opt("--report"), files: (opt("--files") || "").split(",").map((s) => s.trim()).filter(Boolean) });
    else if (cmd === "release") out = release(root, arg(0), common);
    else if (cmd === "block") out = block(root, arg(0), common);
    else if (cmd === "assign") out = assign(root, arg(0), arg(1), common);
    else if (cmd === "publish") out = publish(root, common);
    else throw new Error("usage: checks.mjs enable | sync [--dry-run] | status | next --as <tool> | done <job> [--record|--report <path>] [--files a,b] | release <job> | block <job> --note <text> | assign <job[,job]> <tool|any> | publish [--batch <b>]");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
