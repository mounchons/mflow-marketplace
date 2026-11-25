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
//   node checks.mjs next --as <tool> [--batch <b>] [--job <id>]   take the next job for that tool (pins the batch)
//   node checks.mjs done <job> [--batch <b>] [--record <path> | --report <path>] [--files <a,b>] [--note <text>]
//   node checks.mjs release <job> [--batch <b>] [--note <text>]   give a taken job back
//   node checks.mjs block <job> [--batch <b>] --note <text>  the job needs the user's decision
//   node checks.mjs assign <job[,job]> <tool|any> [--batch <b>]
//   node checks.mjs publish [--batch <b>]                    push the branches, open or update their draft pull requests
//   node checks.mjs close <batch> --note <text>              give up an open batch (its rows join the next one)
//
// Tools: claude, codex, antigravity, opencode, or any. E2E goes only to claude and codex, the tools with mflow's
// guard on the browsers a Playwright run opens. Nothing here merges into main or pushes main.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, loadConfig, readText, readJsonFile, withFileLock, writeFileAtomic, worktreeInfo, MARKER } from "./lib.mjs";
import { status as pendingStatus, range as pendingRange, readRecord, tickTest, tickReview, parse as parsePending, render as renderPending } from "./pending.mjs";
import { WORKTREES, includedFiles, ignoreWorktrees, list as listWorktrees } from "./worktree.mjs";

export const DIR = "docs/reviews/checks";
export const PREFIX = "checks/";
export const KINDS = ["test", "test-since", "review", "review-merge", "fix", "e2e-write", "e2e"];
export const HEAVY = new Set(["test", "test-since", "fix", "e2e-write", "e2e"]);
export const TOOLS = ["claude", "codex", "antigravity", "opencode"];
const E2E_TOOLS = ["claude", "codex"];
const E2E_KINDS = new Set(["e2e-write", "e2e"]);
export const DEFAULTS = { route: { test: "any", review: "claude", reviewMerge: "claude", fix: "claude", e2e: "claude" }, staleMinutes: 60, rounds: 3, jobsPerRun: 2, jobMinutes: 90 };
// A fix that changes a file of a screen sends every E2E run already passed round again.
const UI_FILE = /\.(cshtml|razor|tsx|jsx|vue|svelte|html|css|scss)$/i;
const E2E_TEST = (f) => /(^|\/)e2e\/.+\.[cm]?[jt]sx?$/.test(f);
const PENDING = "docs/reviews/pending.md";
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
    const list = Array.isArray(tool) ? tool : [tool];
    if (!list.length || !list.every((t) => ["any", ...TOOLS].includes(t))) throw new Error(`${MARKER}: checks.route.${kind} must be any or one of ${TOOLS.join(", ")}${kind === "review" ? ", or a list of them" : ""}`);
    // Several reviewers only for a review; every other kind has one tool.
    route[kind] = kind === "review" ? [...new Set(list)] : list[0];
  }
  if (!E2E_TOOLS.includes(route.e2e)) throw new Error(`${MARKER}: checks.route.e2e must be ${E2E_TOOLS.join(" or ")}: no other tool has mflow's guard on Playwright's browsers`);
  const staleMinutes = user?.staleMinutes ?? DEFAULTS.staleMinutes;
  if (!Number.isInteger(staleMinutes) || staleMinutes < 5) throw new Error(`${MARKER}: checks.staleMinutes must be a whole number of 5 or more`);
  const rounds = user?.rounds ?? DEFAULTS.rounds;
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 9) throw new Error(`${MARKER}: checks.rounds must be a whole number from 1 to 9`);
  const jobsPerRun = user?.jobsPerRun ?? DEFAULTS.jobsPerRun;
  if (!Number.isInteger(jobsPerRun) || jobsPerRun < 1 || jobsPerRun > 50) throw new Error(`${MARKER}: checks.jobsPerRun must be a whole number from 1 to 50`);
  const jobMinutes = user?.jobMinutes ?? DEFAULTS.jobMinutes;
  if (!Number.isInteger(jobMinutes) || jobMinutes < 5 || jobMinutes > 600) throw new Error(`${MARKER}: checks.jobMinutes must be a whole number from 5 to 600`);
  // checks.commands.<tool>: { bash, pwsh } with {brief} {out} {worktree}, in place of the tool registry's code mode.
  const commands = user?.commands ?? {};
  if (typeof commands !== "object" || Array.isArray(commands) || !Object.values(commands).every((c) => c && typeof c === "object" && (typeof c.bash === "string" || typeof c.pwsh === "string"))) throw new Error(`${MARKER}: checks.commands.<tool> must be an object with a bash or pwsh command`);
  return { enabled: user !== undefined, route, staleMinutes, rounds, jobsPerRun, jobMinutes, commands };
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

export function parseDoc(text) {
  const doc = { pinned: null, pinnedAt: null, pr: null, changes: [], suite: null, closed: null, jobs: [] };
  if (!text) return doc;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const head = (key) => lines.map((l) => new RegExp(`^${key}:\\s*(.*)$`).exec(l)?.[1]).find((v) => v !== undefined);
  const pin = /^([0-9a-f]{7,64})(?:\s+\((.+)\))?$/.exec((head("Pinned") || "").trim());
  if (pin) [doc.pinned, doc.pinnedAt] = [pin[1], pin[2] || null];
  if (!empty(head("PR"))) doc.pr = head("PR").trim();
  if (!empty(head("Suite"))) doc.suite = head("Suite").trim();
  if (!empty(head("Closed"))) doc.closed = head("Closed").trim();
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
    ...(doc.closed ? [`Closed: ${doc.closed}`] : []),
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

const job = (fields) => ({ size: null, waits: [], state: "open", result: null, ...fields });

/** One review, or with several reviewers one per tool (R1a, R1b) and the job that merges them (R1). */
function reviewJobs(id, change, size, agents, waits, mergeAgent) {
  if (agents.length === 1) return [job({ id, kind: "review", target: change, size, agent: agents[0], waits })];
  const subs = agents.map((a, i) => job({ id: `${id}${String.fromCharCode(97 + i)}`, kind: "review", target: change, size, agent: a, waits }));
  return [...subs, job({ id, kind: "review-merge", target: change, size, agent: mergeAgent, waits: subs.map((s) => s.id) })];
}

function addChangeJobs(doc, main, rows, route) {
  const tests = doc.jobs.filter((j) => j.kind === "test").map((j) => j.id);
  for (const row of rows) {
    if (doc.changes.includes(row.change)) continue;
    doc.changes.push(row.change);
    doc.jobs.push(...reviewJobs(nextId(doc.jobs, "R"), row.change, changeLines(main, row.change), route.review, tests, route.reviewMerge));
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

const batchKey = (ref) => {
  const m = /^(?:checks\/)?(.*)-(\d+)$/.exec(ref) || [null, ref, "0"];
  return [m[1], Number(m[2])];
};
const byBatch = (a, b) => {
  const [x, y] = [batchKey(a), batchKey(b)];
  return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1];
};

/** Every checks/* branch with its checklist (the worktree's working copy when it has one), merged or open. */
export function batches(root) {
  const info = mainInfo(root);
  const main = info.main;
  const refs = git(main, ["for-each-ref", "--format=%(refname:short)", "refs/heads/checks/"]).out.split(/\r?\n/).filter(Boolean).sort(byBatch);
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
    return { name, branch, file, dir: wt?.dir || null, merged, open: !merged && !doc.closed, ...doc };
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

/** The folder the runner keeps its briefs and the tools' output in: inside .git, so the worktree stays clean. */
export const runsDir = (root) => path.join(path.dirname(claimsFile(root)), "runs");

/** A runner still at work on a job keeps its claim fresh, so it never counts as given up. */
export function touch(root, batch, id) {
  const file = claimsFile(root);
  return withFileLock(file, () => {
    let all = {};
    try {
      all = JSON.parse(fs.readFileSync(file, "utf8")) || {};
    } catch { /* none */ }
    const c = all[`${batch}/${id}`];
    if (!c) return false;
    c.at = new Date().toISOString();
    writeClaims(file, all);
    return true;
  });
}

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
  // A change of a merged or closed batch whose row still waits (a failed suite, changes requested) joins the next one.
  const listed = new Set(all.filter((b) => b.open).flatMap((b) => b.changes));
  const fresh = st.rows.filter((r) => r.landed && (r.testOpen || r.reviewOpen) && !listed.has(r.change));
  let b = all.find((x) => x.open && !x.pinned) || null;
  const pinnedOpen = all.filter((x) => x.open && x.pinned).map((x) => x.name);
  if (!fresh.length || dryRun) return { added: dryRun ? fresh.map((r) => r.change) : [], batch: b?.name || null, dryRun, waitingInPinned: pinnedOpen };
  const warnings = [];
  let created = false;
  if (!b) {
    const date = today();
    const taken = Math.max(0, ...all.map((x) => (x.name.startsWith(`${date}-`) ? Number(x.name.slice(date.length + 1)) || 0 : 0)));
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

// Every wait must be done; a failed job never releases the jobs after it (the rules below rewire them instead).
const waitsMet = (j, jobs) => j.waits.every((id) => {
  const w = jobs.find((x) => x.id === id);
  // A fix starts from what failed; everything else needs what it waits on to have passed.
  return !w || w.state === "done" || (j.kind === "fix" && w.state === "failed");
});

const isSubReview = (j) => j.kind === "review" && /^R\d+[a-z]$/.test(j.id);
/** A review whose verdict is the change's: one reviewer's, the merged one, or a later round. */
const isVerdictJob = (j) => (j.kind === "review" && !isSubReview(j)) || j.kind === "review-merge";
const originOf = (j) => (j.kind === "fix" ? /^(\S+) round \d+$/.exec(j.target)?.[1] : j.id.split(".")[0]);
const verdictOf = (j) => /\b(approve|changes-requested|none)\s*(\(|$)/.exec(j.result || "")?.[1] || null;
const recordOf = (j) => /^(\S+\.md)\b/.exec(j.result || "")?.[1] || null;
const rangeOf = (j) => /\bfixed ([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})\b/.exec(j.result || "");

/** The newest review report of a review origin (R1, R1.2 …), for the next round to follow. */
const lastReport = (b, origin) => b.jobs.filter((x) => isVerdictJob(x) && x.id.split(".")[0] === origin && x.state !== "open").map(recordOf).filter(Boolean).pop() || null;

const HOW = {
  test: (j, dir) => j.id === "T0"
    ? `In ${dir}: the build, format and lint in their check-only form, openspec validate --specs --strict, and the "Every test once" count of /mflow:test for every project the parts split by filter; record it as a /mflow:test record with Scope: prepare`
    : j.target === "whole suite"
      ? `In ${dir}: /mflow:test, the whole suite`
      : `In ${dir}: /mflow:test ${j.target.replace(/^part /, "")}, that part only, with the build it needs`,
  "test-since": (j, dir, b) => `In ${dir}: /mflow:test since (base: ${b.suite?.split(" ")[0] || "the batch's whole-suite record"}), after ${j.waits.join(", ")}; record it`,
  review: (j, dir, b) => {
    if (isSubReview(j)) return `In ${dir}: /mflow:review pending ${j.target}, report only, as ${j.agent}: name the report docs/reviews/code/<date>-${j.target}-${j.agent}.md; leave section 4 (Fix) and the tick of pending.md out (${j.id.replace(/[a-z]$/, "")} merges the reports)`;
    if (j.id.includes(".") && j.size !== "full") {
      const r = j.size && /fix (\S+)/.exec(j.size)?.[1];
      return `In ${dir}: /mflow:review pending ${j.target} --short, report only: the diff ${r || "of the fixes"} after ${lastReport(b, originOf(j)) || "the last report"}, each of its findings marked fixed or still open, checks 3–7 on the changed lines; its test proof is the newest since record of this batch; leave section 4 (Fix) and the tick of pending.md out (checks.mjs done ticks it)`;
    }
    return `In ${dir}: /mflow:review pending ${j.target}, report only: leave section 4 (Fix) and the tick of pending.md out (checks.mjs done ticks it); the findings go to a fix job`;
  },
  "review-merge": (j, dir, b) => `In ${dir}: read the reports of ${j.waits.join(", ")} (${j.waits.map((w) => recordOf(b.jobs.find((x) => x.id === w) || {}) || "?").join(", ")}), check every finding against the code (the way /mflow:assess does), drop the ones that are not real with the reason, and write one report docs/reviews/code/<date>-${j.target}.md with Change: ${j.target}, Reviewer: the tools, and one verdict; report only, no tick`,
  fix: (j, dir, b) => {
    const origin = originOf(j);
    const src = b.jobs.find((x) => x.id === j.waits[0]);
    const what = origin === "tests" ? `the failing tests of ${recordOf(src || {}) || "the suite record"}`
      : origin.startsWith("E") ? `the E2E failures of ${recordOf(src || {}) || "its record"}: the screen breaks its spec (fix the code) or the test is wrong (fix the test)`
        : `the blockers and majors of ${recordOf(src || {}) || "its report"}, each with the test that proves it`;
    return `In ${dir}: fix ${what}. Never remove, skip or loosen a test to pass. Commit the code by name on this branch (message fix(checks): …), leave STATUS.md; a finding that needs the user's decision: block this job with the question`;
  },
  "e2e-write": (j, dir) => `In ${dir}: /mflow:e2e ${j.target}, write or update its E2E tests from its spec and run them; commit the test files with done --files`,
  e2e: (j, dir) => `In ${dir}: run the E2E tests of ${j.target} as /mflow:test e2e does, --workers at most e2eMaxWorkers, and write its record`,
};
const howOf = (j, dir, b) => HOW[j.kind]?.(j, dir, b) || null;

/**
 * The open batch a job id means. Two are often open at once (one pinned and worked on, one collecting merges), and
 * both have a T0 and an R1: without --batch, the one where the job is taken (claims), else the oldest where it is
 * still open.
 */
function findBatch(root, { batch, job: id, claims } = {}) {
  const open = batches(root).filter((b) => b.open);
  if (batch) {
    const b = open.find((x) => x.name === batch || x.branch === batch);
    if (!b) throw new Error(`no open batch ${batch}`);
    return b;
  }
  const holders = open.filter((b) => b.jobs.some((j) => j.id === id));
  if (!holders.length) throw new Error(`no open batch has job ${id}`);
  if (holders.length === 1) return holders[0];
  const taken = claims ? holders.filter((b) => claims[`${b.name}/${id}`]) : [];
  if (taken.length === 1) return taken[0];
  const waiting = holders.filter((b) => b.jobs.find((j) => j.id === id).state === "open");
  if (waiting.length) return waiting[0];
  throw new Error(`job ${id} is in ${holders.map((b) => b.name).join(" and ")}; name one with --batch`);
}
const liveClaims = (root) => readClaims(claimsFile(root), checksConfig(root).staleMinutes).live;

/** A batch waits while an older one is open (the user's answer 8 a): its fixes are not on main yet. */
const heldBy = (b, open) => {
  const i = open.findIndex((x) => x.name === b.name);
  return i > 0 ? open[0] : null;
};

export function status(root) {
  const cfg = checksConfig(root);
  const { live, stale } = readClaims(claimsFile(root), cfg.staleMinutes);
  const all = batches(root).filter((b) => b.open);
  const open = all.map((b) => ({
    ...b,
    heldBy: heldBy(b, all)?.name || null,
    jobs: b.jobs.map((j) => {
      const c = live[`${b.name}/${j.id}`];
      return { ...j, running: c ? { tool: c.tool, at: c.at } : null, ready: j.state === "open" && !c && waitsMet(j, b.jobs) && !heldBy(b, all), how: j.state === "open" && b.dir ? howOf(j, b.dir, b) : null };
    }),
  }));
  return { enabled: cfg.enabled, route: cfg.route, rounds: cfg.rounds, batches: open, stale: stale.map((s) => s.key) };
}

export function next(root, { as, batch, job: only } = {}) {
  if (!TOOLS.includes(as)) throw new Error(`next: --as must be one of ${TOOLS.join(", ")}`);
  const cfg = checksConfig(root);
  const main = mainInfo(root).main;
  const file = claimsFile(root);
  return withFileLock(file, () => {
    const { live, stale } = readClaims(file, cfg.staleMinutes);
    const heavyBusy = Object.values(live).find((c) => c.heavy);
    const all = batches(root).filter((b) => b.open);
    const open = batch ? all.filter((b) => b.name === batch || b.branch === batch) : all;
    const skipped = [];
    let busy = false;
    for (const b of open) {
      const older = heldBy(b, all);
      if (older) {
        skipped.push(`${b.name} waits until ${older.name} is merged or closed, so it starts with that batch's fixes`);
        continue;
      }
      // One job at a time in a batch: its jobs share one worktree, so two tools there would see each other's files.
      const running = Object.values(live).find((c) => c.job.startsWith(`${b.name}/`));
      if (running) {
        if (b.jobs.some((j) => j.state === "open" && (j.agent === "any" || j.agent === as))) busy = true;
        skipped.push(`${b.name} runs ${running.job.split("/")[1]} (${running.tool}); one job at a time in a batch`);
        continue;
      }
      for (const j of b.jobs) {
        if (j.state !== "open" || live[`${b.name}/${j.id}`]) continue;
        if (only && j.id !== only) continue;
        if (j.agent !== "any" && j.agent !== as) continue;
        if ((E2E_KINDS.has(j.kind) || (j.kind === "fix" && originOf(j)?.startsWith("E"))) && !E2E_TOOLS.includes(as)) continue;
        if (!waitsMet(j, b.jobs)) continue;
        if (HEAVY.has(j.kind) && heavyBusy) {
          busy = true;
          skipped.push(`${b.name}/${j.id} waits for the heavy lane (${heavyBusy.tool} runs ${heavyBusy.job})`);
          continue;
        }
        const dir = ensureWorktree(main, b);
        if (git(dir, ["status", "--porcelain"]).out) throw new Error(`${dir} has uncommitted changes; commit them (done) or drop them before the next job`);
        if (!b.pinned) {
          // Main as it is now: the older batch's merged fixes, and any merge since the last sync.
          const m = git(dir, ["merge", "--no-edit", "main"]);
          if (!m.ok) {
            git(dir, ["merge", "--abort"]);
            throw new Error(`git merge main into ${b.branch} failed: ${m.err}`);
          }
          b.pinned = git(dir, ["rev-parse", "HEAD"]).out;
          b.pinnedAt = stamp();
          writeFileAtomic(path.join(dir, b.file), renderDoc(b.name, b));
          commitIn(dir, [b.file], `checks: pin ${b.name} at ${b.pinned.slice(0, 7)}`);
        }
        live[`${b.name}/${j.id}`] = { tool: as, at: new Date().toISOString(), heavy: HEAVY.has(j.kind), job: `${b.name}/${j.id}` };
        writeClaims(file, live);
        return { batch: b.name, branch: b.branch, dir, file: b.file, pinned: b.pinned, job: j, how: howOf(j, dir, b), reclaimed: stale.some((s) => s.key === `${b.name}/${j.id}`) };
      }
    }
    return { job: null, busy, reason: skipped.length ? skipped.join("; ") : `no open job for ${as} is ready`, batches: open.map((b) => b.name) };
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
    const rel = recordOf(j);
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
  return { record: rel, result: pass ? "pass" : "fail" };
}

/** The commits of a fix: those after the newest commit this script made (every one starts with `checks:`). */
function fixRange(dir) {
  const log = git(dir, ["log", "--format=%H %s", "-200"]).out.split(/\r?\n/).filter(Boolean);
  const i = log.findIndex((l) => l.slice(41).startsWith("checks:"));
  if (i <= 0) return null;
  const to = log[0].slice(0, 40);
  const from = log[i].slice(0, 40);
  const files = git(dir, ["diff", "--name-only", from, to]).out.split(/\r?\n/).filter(Boolean);
  return { from, to, files };
}

/** The commit a record may differ from in documents only: the newest fix it holds, or the pinned commit. */
function recordBase(dir, b, commit) {
  const ends = b.jobs.filter((j) => j.kind === "fix" && j.state === "done").map((j) => rangeOf(j)?.[2]).filter(Boolean);
  for (const end of ends.reverse()) if (git(dir, ["merge-base", "--is-ancestor", end, commit]).ok) return end;
  return b.pinned;
}

function checkRecordCommit(dir, b, rec, rel) {
  if (!rec.commit) throw new Error(`${rel} has no Tested: … at <commit> line`);
  if (rec.uncommitted) throw new Error(`${rel} was run with uncommitted changes; commit first and run again`);
  const base = recordBase(dir, b, rec.commit);
  const changed = git(dir, ["diff", "--name-only", base, rec.commit]);
  if (!changed.ok) throw new Error(`${rel}: commit ${rec.commit} is not in this repository`);
  const code = changed.out.split(/\r?\n/).filter(Boolean).filter((f) => !ALLOWED_AFTER_PIN(f));
  if (code.length) throw new Error(`${rel} ran at ${rec.commit.slice(0, 7)}, which changes ${code.slice(0, 3).join(", ")} after ${base === b.pinned ? "the pinned commit" : "the last fix"}; run it on this batch's branch`);
}

/** Test of these rows points at this record, also over an older one (a row back from an earlier batch, a fix). */
function setTest(dir, rel, changes) {
  tickTest(dir, rel);
  const file = path.join(dir, PENDING);
  const text = readText(file);
  if (text === null) return;
  const list = parsePending(text);
  let changed = false;
  for (const r of list.rows) if (changes.includes(r.change) && r.test !== rel) [r.test, changed] = [rel, true];
  if (changed) writeFileAtomic(file, renderPending(text, list.rows, list.doneRows));
}

/**
 * The rules of the loop: what a finished job starts. Each origin (a review R<k>, the batch's tests, the E2E of one
 * screen E<k>) gets at most `rounds` fixes; past that, the job that would start one more is blocked for the user.
 */
function applyRules(b, j, cfg, { combined, fix, dir } = {}) {
  const filesOf = (f) => {
    const r = rangeOf(f);
    return r ? git(dir, ["diff", "--name-only", r[1], r[2]]).out.split(/\r?\n/).filter(Boolean) : [];
  };
  const added = [];
  const add = (fields) => {
    const x = job(fields);
    b.jobs.push(x);
    added.push(x.id);
    return x;
  };
  const fixesOf = (origin) => b.jobs.filter((x) => x.kind === "fix" && originOf(x) === origin).length;
  const addFix = (origin, waits, from) => {
    const round = fixesOf(origin) + 1;
    if (round > cfg.rounds) {
      from.state = "blocked";
      from.result = `${from.result || ""} (out of rounds: ${origin} still fails after ${cfg.rounds} fixes; the user decides)`.trim();
      return;
    }
    const agent = origin.startsWith("E") && !E2E_TOOLS.includes(cfg.route.fix) ? "claude" : cfg.route.fix;
    add({ id: nextId(b.jobs, "F"), kind: "fix", target: `${origin} round ${round}`, agent, waits });
  };
  const roundOf = (origin, kind) => b.jobs.filter((x) => x.kind === kind && x.id.split(".")[0] === origin).length + 1;
  const reviewRound = (origin, waits, full) => {
    const first = b.jobs.find((x) => x.id === origin);
    const range = [...b.jobs].reverse().find((x) => x.kind === "fix" && originOf(x) === origin && rangeOf(x));
    const r = range && rangeOf(range);
    const n = b.jobs.filter((x) => isVerdictJob(x) && x.id.split(".")[0] === origin).length + 1;
    add({ id: `${origin}.${n}`, kind: "review", target: first.target, size: full ? "full" : r ? `fix ${r[1].slice(0, 7)}..${r[2].slice(0, 7)}` : null, agent: first.agent, waits });
  };
  // The batch's tests passed: what waited on a failed run waits on this one; a review that said none goes again.
  const suitePassed = (by) => {
    for (const x of b.jobs) {
      if (x.state !== "open") continue;
      const failed = x.waits.filter((w) => ["failed", "blocked"].includes(b.jobs.find((y) => y.id === w)?.state));
      if (failed.length) x.waits = [...x.waits.filter((w) => !failed.includes(w)), by];
    }
    for (const x of b.jobs.filter((y) => isVerdictJob(y) && y.state === "done" && verdictOf(y) === "none")) {
      const origin = x.id.split(".")[0];
      if (b.jobs.some((y) => y.id.startsWith(`${origin}.`) && y.state === "open")) continue;
      reviewRound(origin, [by], true);
    }
  };

  if (isVerdictJob(j) && j.state === "done" && verdictOf(j) === "changes-requested") addFix(j.id.split(".")[0], [j.id], j);
  if (j.kind === "test" && j.target === "whole suite" && j.state === "failed") addFix("tests", [j.id], j);
  if (combined?.result === "fail") addFix("tests", b.jobs.filter((x) => x.kind === "test").map((x) => x.id), j);
  if (j.kind === "e2e" && j.state === "failed") addFix(j.id.split(".")[0], [j.id], j);
  if (j.kind === "fix" && j.state === "done") {
    const origin = originOf(j);
    if (origin.startsWith("E") && fix.files.every(E2E_TEST)) add({ id: `${origin}.${roundOf(origin, "e2e")}`, kind: "e2e", target: b.jobs.find((x) => x.id === origin).target, size: "1 screen", agent: b.jobs.find((x) => x.id === origin).agent, waits: [j.id] });
    else {
      // One open test-since covers every fix done before it is taken.
      const since = b.jobs.find((x) => x.kind === "test-since" && x.state === "open");
      if (since) since.waits.push(j.id);
      else add({ id: nextId(b.jobs, "S"), kind: "test-since", target: "after fixes", agent: cfg.route.test, waits: [j.id] });
    }
  }
  if (j.kind === "test-since") {
    const fixes = j.waits.map((w) => b.jobs.find((x) => x.id === w)).filter((x) => x?.kind === "fix");
    const origins = [...new Set(fixes.map(originOf))];
    if (j.state === "failed") for (const o of origins) addFix(o, [j.id], j);
    else if (j.state === "done") {
      for (const o of origins) {
        if (o === "tests") suitePassed(j.id);
        else if (o.startsWith("E")) {
          const first = b.jobs.find((x) => x.id === o);
          add({ id: `${o}.${roundOf(o, "e2e")}`, kind: "e2e", target: first.target, size: "1 screen", agent: first.agent, waits: [j.id] });
        } else reviewRound(o, [j.id], false);
      }
      // A fix that touched a screen's files: every E2E already passed runs again, once.
      const ui = fixes.some((f) => filesOf(f).some((x) => UI_FILE.test(x)));
      if (ui) {
        const screens = [...new Set(b.jobs.filter((x) => x.kind === "e2e").map((x) => x.id.split(".")[0]))];
        for (const o of screens) {
          // The screen's latest run passed (an open or failed one is on its way already).
          const latest = b.jobs.filter((x) => x.kind === "e2e" && x.id.split(".")[0] === o).pop();
          if (origins.includes(o) || latest.state !== "done") continue;
          add({ id: `${o}.${roundOf(o, "e2e")}`, kind: "e2e", target: latest.target, size: "1 screen", agent: latest.agent, waits: [j.id] });
        }
      }
    }
  }
  if (combined?.result === "pass" || (j.kind === "test" && j.target === "whole suite" && j.state === "done")) suitePassed(combined ? b.jobs.filter((x) => x.kind === "test").pop().id : j.id);
  return added;
}

export function done(root, id, { batch, record, report, files = [], note } = {}) {
  const cfg = checksConfig(root);
  const b = findBatch(root, { batch, job: id, claims: liveClaims(root) });
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
  let fix = null;
  let ticked = null;
  if (j.kind === "fix") {
    fix = fixRange(dir);
    if (!fix) throw new Error(`done ${id}: no fix commit on ${b.branch} after the last checks commit; commit the fix by name first`);
    if (git(dir, ["status", "--porcelain", "--untracked-files=no"]).out) throw new Error(`done ${id}: ${dir} has uncommitted changes; commit the whole fix first`);
    j.state = "done";
    j.result = `fixed ${fix.from.slice(0, 7)}..${fix.to.slice(0, 7)} (${fix.files.length} files)`;
  } else if (j.kind === "test" || j.kind === "test-since" || j.kind === "e2e") {
    if (!record) throw new Error(`done ${id}: name its record with --record`);
    const rel = inside(record);
    const rec = readRecord(readText(path.join(dir, rel)) || "");
    checkRecordCommit(dir, b, rec, rel);
    j.state = rec.result === "pass" ? "done" : "failed";
    j.result = `${rel} ${rec.result || "no result"}`;
    commitFiles.push(rel);
    // A passing whole-suite or since run: Test of the batch's rows points at it.
    if (j.kind !== "e2e" && rec.result === "pass" && (rec.scope === "whole suite" || /^since\s/.test(rec.scope))) {
      setTest(dir, rel, b.changes);
      commitFiles.push(PENDING);
    }
  } else if (j.kind === "review" || j.kind === "review-merge") {
    if (!report) throw new Error(`done ${id}: name its report with --report`);
    const rel = inside(report);
    const text = readText(path.join(dir, rel)) || "";
    const verdict = /^\W*verdict\W*:?\W*\s*(approve|changes-requested|none)/im.exec(text)?.[1]?.toLowerCase()
      || /\b(approve|changes-requested)\b/i.exec(text)?.[1]?.toLowerCase() || "see report";
    j.state = "done";
    j.result = `${rel} ${verdict}`;
    commitFiles.push(rel, PENDING);
    // Only this script writes Review: a reviewer that ticked pending.md itself is undone, so a sub-review never settles the row.
    git(dir, ["checkout", "HEAD", "--", PENDING]);
    if (isVerdictJob(j) && ["approve", "changes-requested", "none"].includes(verdict)) {
      try {
        ticked = tickReview(dir, j.target, { report: rel, verdict });
      } catch (err) {
        ticked = { error: err.message };
      }
    }
  } else {
    j.state = "done";
    j.result = note || (extra.length ? extra.join(", ") : "no test files changed");
  }
  if (note && j.kind !== "e2e-write") j.result += ` (${note})`;
  const combined = combine(b, dir);
  if (combined) {
    commitFiles.push(combined.record, PENDING);
    if (combined.result === "pass") setTest(dir, combined.record, b.changes);
  }
  const added = applyRules(b, j, cfg, { combined, fix, dir });
  writeFileAtomic(path.join(dir, b.file), renderDoc(b.name, b));
  const file = claimsFile(root);
  withFileLock(file, () => {
    const { live } = readClaims(file, cfg.staleMinutes);
    delete live[`${b.name}/${id}`];
    writeClaims(file, live);
  });
  const commit = commitIn(dir, commitFiles, `checks: ${id} ${j.kind} ${j.target} ${j.state} (${b.name})`);
  return { batch: b.name, job: j, combined, ticked, added, commit, left: b.jobs.filter((x) => x.state === "open").map((x) => x.id) };
}

function setJob(root, id, { batch, note }, change) {
  const cfg = checksConfig(root);
  const b = findBatch(root, { batch, job: id, claims: liveClaims(root) });
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

// Back to open: a job taken, or a blocked one once the user has answered.
export const release = (root, id, opts = {}) => setJob(root, id, opts, (j) => {
  const blocked = j.state === "blocked";
  if (blocked) j.state = "open";
  return blocked || Boolean(opts.note);
});
export function block(root, id, opts = {}) {
  if (!opts.note) throw new Error("block: say what the user must decide with --note");
  return setJob(root, id, opts, (j) => {
    j.state = "blocked";
    return true;
  });
}

/** Give jobs to a tool; a review given to several tools ("claude,codex") splits into one per tool and a merge. */
export function assign(root, ids, tool, { batch } = {}) {
  const tools = String(tool || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!tools.length || !tools.every((t) => ["any", ...TOOLS].includes(t))) throw new Error(`assign: the tool must be any or one of ${TOOLS.join(", ")}, or several of them for a review`);
  const list = String(ids || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) throw new Error("assign: name the jobs, e.g. assign T2 antigravity");
  const cfg = checksConfig(root);
  const b = findBatch(root, { batch, job: list[0] });
  for (const id of list) {
    const j = b.jobs.find((x) => x.id === id);
    if (!j) throw new Error(`${b.name} has no job ${id}`);
    if ((E2E_KINDS.has(j.kind) || (j.kind === "fix" && originOf(j)?.startsWith("E"))) && !tools.every((t) => E2E_TOOLS.includes(t))) throw new Error(`${id} is E2E: only ${E2E_TOOLS.join(" and ")} have mflow's guard on Playwright's browsers`);
    if (tools.length === 1) {
      j.agent = tools[0];
      continue;
    }
    if (j.kind !== "review" || isSubReview(j) || j.id.includes(".") || j.state !== "open") throw new Error(`${id}: only an open first review can go to several tools`);
    const at = b.jobs.indexOf(j);
    b.jobs.splice(at, 1, ...reviewJobs(j.id, j.target, j.size, [...new Set(tools)], j.waits, cfg.route.reviewMerge));
  }
  writeFileAtomic(path.join(b.dir, b.file), renderDoc(b.name, b));
  return { batch: b.name, assigned: list, tool: tools.join(","), jobs: b.jobs.map((j) => j.id), commit: commitIn(b.dir, [b.file], `checks: ${list.join(", ")} to ${tools.join(", ")} (${b.name})`) };
}

function gh(args, cwd) {
  const script = process.env.MFLOW_GH;
  const r = script
    ? spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", timeout: 60_000 })
    : spawnSync("gh", args, { cwd, encoding: "utf8", timeout: 60_000, shell: false });
  if (r.error) return { ok: false, out: "", err: r.error.code === "ENOENT" ? "gh is not installed" : r.error.message };
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

/** Push every open batch (or the one named) and open or update its draft pull request. */
export function publish(root, { batch } = {}) {
  const open = batches(root).filter((b) => b.open && b.dir);
  const picked = batch ? open.filter((x) => x.name === batch || x.branch === batch) : open;
  if (batch && !picked.length) throw new Error(`no open batch ${batch} with a worktree here`);
  return { batches: picked.map((b) => publishOne(b)) };
}

function publishOne(b) {
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

export function close(root, name, { note } = {}) {
  if (!note) throw new Error("close: say why with --note");
  const b = batches(root).find((x) => x.name === name || x.branch === name);
  if (!b || !b.open) throw new Error(`no open batch ${name}`);
  if (!b.dir) throw new Error(`${b.name} has no worktree on this machine`);
  b.closed = `${stamp()} ${note}`;
  writeFileAtomic(path.join(b.dir, b.file), renderDoc(b.name, b));
  const commit = commitIn(b.dir, [b.file], `checks: close ${b.name}`);
  let pr = null;
  if (b.pr && git(b.dir, ["remote", "get-url", "origin"]).ok) {
    git(b.dir, ["push", "-u", "origin", b.branch]);
    const r = gh(["pr", "close", b.pr, "--comment", `Closed: ${note}`], b.dir);
    pr = r.ok ? "closed" : `not closed: ${r.err}`;
  }
  return { batch: b.name, closed: b.closed, commit, pr, next: "its rows still waiting in pending.md join the next batch at the next sync" };
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
    else if (cmd === "next") out = next(root, { as: opt("--as"), batch: common.batch, job: opt("--job") });
    else if (cmd === "done") out = done(root, arg(0), { ...common, record: opt("--record"), report: opt("--report"), files: (opt("--files") || "").split(",").map((s) => s.trim()).filter(Boolean) });
    else if (cmd === "release") out = release(root, arg(0), common);
    else if (cmd === "block") out = block(root, arg(0), common);
    else if (cmd === "assign") out = assign(root, arg(0), arg(1), common);
    else if (cmd === "publish") out = publish(root, common);
    else if (cmd === "close") out = close(root, arg(0), common);
    else throw new Error("usage: checks.mjs enable | sync [--dry-run] | status | next --as <tool> | done <job> [--record|--report <path>] [--files a,b] | release <job> | block <job> --note <text> | assign <job[,job]> <tool|any> | publish [--batch <b>] | close <batch> --note <text>");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
