#!/usr/bin/env node
// Machine-level control for Orca automations that run the checks of several projects (0.62): which project and which
// agent each kind of check goes to, how many heavy jobs run at once on this machine, and how much of each agent's
// usage window is spent. It starts nothing itself: Orca's scheduler does, and each automation asks this script first
// (`ready` as the --precheck) and brackets the job with `begin` and `end`. The jobs themselves stay in checks.mjs.
//
//   node bots.mjs plan   [--home <dir>]                              print the `orca automations create` commands (runs none)
//   node bots.mjs usage  [--home <dir>]                              per agent: how much of its window is used, or unknown
//   node bots.mjs ready  --project <p> --kind sync|test|review|e2e|fix --as <agent> [--home <dir>]   exit 0 when a job can start now
//   node bots.mjs sync   --project <p> [--home <dir>]                 the sync job: merged changes into a batch, push, draft PR
//   node bots.mjs due    --kind <k> [--home <dir>]                   a bot's precheck: exit 0 when some project has a <k> job ready
//   node bots.mjs finished --kind <k> [--home <dir>]                 the <k> jobs that ended since the round before, with the model and effort that ran them
//   node bots.mjs dispatch --kind <k> [--home <dir>]                 a bot's round: start the automation of each project with a job ready
//   node bots.mjs cleanup                                            close the terminals of finished runs of mflow automations
//   node bots.mjs apply  [--home <dir>]                              create the automations bots.json asks for and Orca lacks (disabled)
//   node bots.mjs begin  --project <p> --kind <k> --as <agent> [--home <dir>]               take a slot and log the run
//   node bots.mjs end    --slot <id> [--result pass|fail|released|blocked] [--job <id>] [--note <text>] [--home <dir>]
//                                                                    give the slot back and write what ran: agent, model, effort, minutes, result
//   node bots.mjs report [--home <dir>]                              the finished jobs by agent, model, effort and kind
//   node bots.mjs claude-snapshot [--home <dir>]                     stdin: Claude Code's statusline JSON, kept for `usage`
//
// State lives outside every project, in <home> = --home or MFLOW_BOTS_HOME (no default: the folder is the user's choice):
//   bots.json (the config), slots.json (jobs running now), runs.jsonl (jobs started and ended), usage/claude.json (statusline).
//
// runs.jsonl is the one thing other tools read (a separate Tamra digest bot does); keep its lines as they are:
//   {"event":"begin","at","slot","tool","model","effort","project","kind"}
//   {"event":"end","at","slot","tool","model","effort","project","kind","minutes","result"[,"job"][,"note"]}
// result: pass | fail | released | blocked | unreported. This script knows nothing of who reads it.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checksConfig, HEAVY, KIND_GROUPS, parseDoc, publish, retireWorktrees, status, sync } from "./checks.mjs";

export const AGENTS = ["claude", "codex", "antigravity"];
// sync puts the changes merged into main that wait in pending.md into a checks batch and publishes it (branch checks/*
// and its draft pull request); the others take that batch's jobs.
export const BOT_KINDS = ["sync", "test", "review", "e2e", "fix"];
// The checks.route keys each bot kind takes jobs of (checks.mjs): a review bot also takes the review-merge job. sync has
// no route: it makes the jobs.
const ROUTE_KEYS = { sync: [], test: ["test"], review: ["review", "reviewMerge"], e2e: ["e2e"], fix: ["fix"] };
const E2E_AGENTS = ["claude", "codex"]; // the ones with an E2E browser guard (checks.mjs)
const WINDOW_MIN = 300; // the short usage window of Claude and Codex
const SNAPSHOT_FRESH_MIN = 30;
const SELF = fileURLToPath(import.meta.url);

export const DEFAULTS = { maxHeavy: 3, maxLight: 6, slotStaleMinutes: 120, usage: { stopAtPercent: 85, maxJobsPer5h: { claude: 12, codex: 12, antigravity: 12 } }, pollMinutes: 10 };

export function homeDir(opt) {
  const h = opt || process.env.MFLOW_BOTS_HOME;
  if (!h) throw new Error("bots: name the folder for machine-level state with --home <dir> or MFLOW_BOTS_HOME (outside every project)");
  return path.resolve(h);
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
const intIn = (v, d, lo, hi, name) => {
  const n = v ?? d;
  if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`bots.json: ${name} must be a whole number from ${lo} to ${hi}`);
  return n;
};

/** bots.json, checked: projects → kinds → one agent spec or a list of them ({agent, model?, effort?}). */
export function loadConfig(home) {
  const raw = readJson(path.join(home, "bots.json"));
  if (!raw || typeof raw !== "object") throw new Error(`bots: ${path.join(home, "bots.json")} is missing or not JSON`);
  const projects = {};
  for (const [name, p] of Object.entries(raw.projects || {})) {
    if (!p?.path || !path.isAbsolute(p.path)) throw new Error(`bots.json: project ${name} needs an absolute "path"`);
    const kinds = {};
    for (const [kind, spec] of Object.entries(p.kinds || {})) {
      if (!BOT_KINDS.includes(kind)) throw new Error(`bots.json: ${name}.kinds.${kind}: use ${BOT_KINDS.join(", ")}`);
      kinds[kind] = (Array.isArray(spec) ? spec : [spec]).map((s) => {
        if (!AGENTS.includes(s?.agent)) throw new Error(`bots.json: ${name}.${kind}: agent must be ${AGENTS.join(", ")}`);
        if (kind === "e2e" && !E2E_AGENTS.includes(s.agent)) throw new Error(`bots.json: ${name}.e2e: ${s.agent} has no browser guard; use ${E2E_AGENTS.join(" or ")}`);
        return { agent: s.agent, ...(s.model ? { model: String(s.model) } : {}), ...(s.effort ? { effort: String(s.effort) } : {}) };
      });
    }
    projects[name] = { path: path.resolve(p.path), kinds };
  }
  const u = raw.usage || {};
  const jobs = { ...DEFAULTS.usage.maxJobsPer5h, ...(u.maxJobsPer5h || {}) };
  for (const a of AGENTS) jobs[a] = intIn(jobs[a], 12, 1, 500, `usage.maxJobsPer5h.${a}`);
  return {
    maxHeavy: intIn(raw.maxHeavy, DEFAULTS.maxHeavy, 1, 24, "maxHeavy"),
    maxLight: intIn(raw.maxLight, DEFAULTS.maxLight, 1, 48, "maxLight"),
    slotStaleMinutes: intIn(raw.slotStaleMinutes, DEFAULTS.slotStaleMinutes, 5, 1440, "slotStaleMinutes"),
    pollMinutes: intIn(raw.pollMinutes, DEFAULTS.pollMinutes, 1, 120, "pollMinutes"),
    usage: { stopAtPercent: intIn(u.stopAtPercent, DEFAULTS.usage.stopAtPercent, 1, 100, "usage.stopAtPercent"), maxJobsPer5h: jobs },
    projects,
    bots: loadBots(raw.bots),
  };
}

/** The agent the bots' own rounds run on: they only run two commands, so a small model does. Absent: the bot's own agent. */
function loadBots(b) {
  if (!b) return null;
  if (!AGENTS.includes(b.agent)) throw new Error(`bots.json: bots.agent must be ${AGENTS.join(", ")}`);
  return { agent: b.agent, ...(b.model ? { model: String(b.model) } : {}), ...(b.effort ? { effort: String(b.effort) } : {}) };
}

// ---------- usage ----------
const toMs = (t) => (typeof t === "number" ? (t < 1e12 ? t * 1000 : t) : Date.parse(t));

function codexUsage(codexHome, now) {
  const dir = path.join(codexHome, "sessions");
  const files = [];
  const walk = (d) => {
    let ents = [];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith(".jsonl")) files.push({ f, t: fs.statSync(f).mtimeMs });
    }
  };
  walk(dir);
  files.sort((a, b) => b.t - a.t);
  let best = null;
  for (const { f } of files.slice(0, 6)) {
    const text = fs.readFileSync(f, "utf8");
    for (const line of text.split("\n")) {
      if (!line.includes('"rate_limits":{')) continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      const rl = o?.payload?.rate_limits;
      const at = Date.parse(o.timestamp);
      if (rl?.primary && Number.isFinite(at) && (!best || at > best.at)) best = { at, rl };
    }
    if (best) break; // newest file that has a reading; an older file cannot hold a newer one
  }
  if (!best) return { known: false, reason: "no rate_limits reading in the newest Codex sessions" };
  const win = (w) => (w ? { pct: w.used_percent, resetsAt: new Date(toMs(w.resets_at)).toISOString(), expired: toMs(w.resets_at) <= now } : null);
  return { known: true, source: "codex session log", readAt: new Date(best.at).toISOString(), plan: best.rl.plan_type ?? null, fiveHour: win(best.rl.primary), weekly: win(best.rl.secondary) };
}

function claudeUsage(home, now) {
  const s = readJson(path.join(home, "usage", "claude.json"));
  if (!s?.at) return { known: false, reason: "no statusline snapshot; add `node bots.mjs claude-snapshot` to the statusline (see plan)" };
  if (now - Date.parse(s.at) > SNAPSHOT_FRESH_MIN * 60_000) return { known: false, reason: `snapshot older than ${SNAPSHOT_FRESH_MIN} min (no Claude Code session is drawing its statusline)`, readAt: s.at };
  const win = (w) => (w ? { pct: w.pct, resetsAt: w.resetsAt, expired: toMs(w.resetsAt) <= now } : null);
  return { known: true, source: "claude statusline", readAt: s.at, fiveHour: win(s.fiveHour), weekly: win(s.weekly) };
}

export function runsInWindow(home, tool, now = Date.now()) {
  let n = 0;
  try {
    for (const line of fs.readFileSync(path.join(home, "runs.jsonl"), "utf8").split("\n")) {
      if (!line) continue;
      const r = JSON.parse(line);
      if (r.event !== "end" && r.tool === tool && now - Date.parse(r.at) < WINDOW_MIN * 60_000) n++; // starts only (a line from before 0.62 has no event)
    }
  } catch {}
  return n;
}

export function usage(home, { codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), now = Date.now() } = {}) {
  const out = {
    claude: claudeUsage(home, now),
    codex: codexUsage(codexHome, now),
    antigravity: { known: false, reason: "no local usage source; counted by jobs started" },
  };
  for (const a of AGENTS) out[a].jobsStartedLast5h = runsInWindow(home, a, now);
  return out;
}

/** May this agent start a job? A reading under the stop line decides; with no live reading the jobs counted decide. */
export function agentAllowed(cfg, u, tool) {
  const stop = cfg.usage.stopAtPercent;
  const live = [u[tool].fiveHour, u[tool].weekly].filter((w) => u[tool].known && w && !w.expired);
  const over = live.find((w) => w.pct >= stop);
  if (over) return { ok: false, reason: `${tool} is at ${over.pct}% of its window (stop at ${stop}%), resets ${over.resetsAt}` };
  if (!live.length) {
    const cap = cfg.usage.maxJobsPer5h[tool];
    if (u[tool].jobsStartedLast5h >= cap) return { ok: false, reason: `${tool} usage is unknown and ${u[tool].jobsStartedLast5h} jobs started in 5 h (cap ${cap})` };
  }
  return { ok: true, basis: live.length ? "reading" : "count" };
}

// ---------- slots (jobs running on this machine) ----------
function withLock(file, fn) {
  const lock = `${file}.lock`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let i = 0; ; i++) {
    try {
      fs.closeSync(fs.openSync(lock, "wx"));
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 30_000) fs.rmSync(lock, { force: true });
      } catch {}
      if (i > 200) throw new Error(`bots: could not lock ${file}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}
const slotsFile = (home) => path.join(home, "slots.json");
function liveSlots(home, cfg, now = Date.now()) {
  const all = readJson(slotsFile(home))?.slots || {};
  return Object.fromEntries(Object.entries(all).filter(([, s]) => now - Date.parse(s.at) < cfg.slotStaleMinutes * 60_000));
}
const isHeavy = (kind) => (KIND_GROUPS[kind] || []).some((k) => HEAVY.has(k));

function slotRoom(cfg, slots, project, kind) {
  const heavy = isHeavy(kind);
  const same = Object.values(slots).filter((s) => isHeavy(s.kind) === heavy);
  // One job at a time in a project, of any kind: checks.mjs runs one job at a time in a batch (they share its worktree),
  // so a second bot of the same project would start, take a slot and find no job. In parallel means across projects.
  const busy = Object.values(slots).find((s) => s.project === project);
  if (busy) return { ok: false, reason: `${project} already runs a ${busy.kind} job (${busy.tool}); one job at a time per project, they share the batch's worktree` };
  const cap = heavy ? cfg.maxHeavy : cfg.maxLight;
  if (same.length >= cap) return { ok: false, reason: `${same.length} ${heavy ? "heavy" : "light"} jobs run on this machine (cap ${cap})` };
  return { ok: true };
}

/** Changes merged into main that wait for a batch: what `checks.mjs sync` would add, without adding them. */
function syncReady(root) {
  try {
    if (!checksConfig(root).enabled) return { ok: false, reason: "checks is not enabled in this project (checks.mjs enable)" };
    const d = sync(root, { dryRun: true });
    const toMerge = mergeReady(root, { dryRun: true }).filter((m) => m.ready).map((m) => m.batch);
    if (d.added.length || toMerge.length) return { ok: true, changes: d.added, batch: d.batch, merge: toMerge };
    return { ok: false, reason: "no merged change waits for a checks batch, and no batch is ready to merge" };
  } catch (e) {
    return { ok: false, reason: `checks sync failed: ${String(e.message || e).split("\n")[0]}` };
  }
}

// ---------- the merge a bot may do (the user's answer 4 a, 2026-11-28) ----------
// A batch is merged by the sync bot only when every job is done and passed and its branch changed nothing but
// docs/reviews/** (records, reports, the checklist, pending.md). A fix an agent wrote, an E2E test an agent wrote, a
// blocked or failed job: the pull request waits for the user, as before.
const RESULT_OK = /\b(pass|approve)\s*$/i;

/** Whether one batch may be merged by a bot, and why not. `files` are the paths its branch changed since main. */
export function mergeDecision(batch, files) {
  if (batch.heldBy) return { ok: false, reason: `waits for ${batch.heldBy}` };
  if (!batch.jobs.length) return { ok: false, reason: "no jobs" };
  const notDone = batch.jobs.filter((j) => j.state !== "done");
  if (notDone.length) return { ok: false, reason: `${notDone.length} job(s) not done: ${notDone.slice(0, 5).map((j) => `${j.id} ${j.state}`).join(", ")}` };
  const bad = batch.jobs.filter((j) => !RESULT_OK.test(String(j.result || "")));
  if (bad.length) return { ok: false, reason: `not all passed: ${bad.slice(0, 5).map((j) => `${j.id} ${j.result || "no result"}`).join(", ")}` };
  const code = files.filter((f) => !/^docs\/reviews\//.test(f));
  if (code.length) return { ok: false, reason: `the branch changes more than results (${code.slice(0, 3).join(", ")}${code.length > 3 ? ", …" : ""}): the user merges it` };
  if (!batch.pr) return { ok: false, reason: "no pull request to merge" };
  return { ok: true };
}

const gh = (args, cwd) => {
  const script = process.env.MFLOW_GH_SCRIPT; // a stand-in for tests
  const r = script ? spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" }) : spawnSync("gh", args, { cwd, encoding: "utf8", timeout: 120_000 });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || String(r.error || "")).trim() };
};
const gitIn = (cwd, args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 60_000 });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
};

/** Each job's result names a record or report that must be in the same commit and say pass (Result:) or approve (Verdict:). */
export function recordsHold(root, sha, jobs) {
  for (const j of jobs) {
    const rel = /^(docs\/reviews\/\S+\.md)\b/.exec(String(j.result || ""))?.[1];
    if (!rel) return { ok: false, reason: `${j.id} names no record or report in docs/reviews/` };
    const f = gitIn(root, ["show", `${sha}:${rel}`]);
    if (!f.ok) return { ok: false, reason: `${j.id}: ${rel} is not in the commit` };
    if (!/^Result:\s*pass\b/im.test(f.out) && !/^Verdict:\s*approve\b/im.test(f.out)) return { ok: false, reason: `${j.id}: ${rel} says neither Result: pass nor Verdict: approve` };
  }
  return { ok: true };
}

/** Merge every batch of a project the rule allows; bring the local main up when its checkout is clean and on main. */
export function mergeReady(root, { dryRun = false } = {}) {
  let st;
  try {
    st = status(root);
  } catch (e) {
    return [{ merged: false, reason: String(e.message || e).split("\n")[0] }];
  }
  const out = [];
  for (const live of st.batches) {
    // Everything below is read from one commit, the one that would be merged: never from the worktree, where a file can
    // say anything until it is committed. Any git step that fails means no merge (fail closed).
    const sha = gitIn(root, ["rev-parse", "--verify", `${live.branch}^{commit}`]).out;
    const committed = /^[0-9a-f]{40}$/.test(sha) ? gitIn(root, ["show", `${sha}:${live.file}`]) : { ok: false };
    const diff = committed.ok ? gitIn(root, ["diff", "--name-only", `main...${sha}`]) : { ok: false };
    let d;
    if (!committed.ok || !diff.ok) d = { ok: false, reason: `cannot read ${live.branch} at a commit (git failed): no merge` };
    else {
      const b = { ...parseDoc(committed.out), name: live.name, heldBy: live.heldBy };
      d = mergeDecision(b, diff.out.split("\n").filter(Boolean));
      if (d.ok) d = recordsHold(root, sha, b.jobs);
    }
    if (!d.ok || dryRun) {
      out.push({ batch: live.name, merged: false, ready: d.ok, reason: d.reason || null });
      continue;
    }
    const b = live;
    // Merge what was checked, not what the checklist's PR line names (an agent on the branch can edit that line): find
    // the pull request from the branch, and merge it by number only while its head is still the commit just checked.
    const view = gh(["pr", "view", b.branch, "--json", "number,headRefName,baseRefName,headRefOid,state"], root);
    let pr = null;
    try {
      pr = JSON.parse(view.out);
    } catch {}
    const why = !view.ok || !pr ? `no pull request found for ${b.branch}: ${view.err}`
      : pr.headRefName !== b.branch ? `the pull request's head is ${pr.headRefName}, not ${b.branch}`
      : pr.baseRefName !== "main" ? `the pull request goes into ${pr.baseRefName}, not main`
      : pr.state !== "OPEN" ? `the pull request is ${pr.state}`
      : !/^[0-9a-f]{40}$/.test(sha) || pr.headRefOid !== sha ? `the pull request's head ${String(pr.headRefOid).slice(0, 7)} is not the checked commit ${sha.slice(0, 7)} (push it first)`
      : !Number.isInteger(pr.number) ? "the pull request has no number" : null;
    if (why) {
      out.push({ batch: b.name, merged: false, reason: why });
      continue;
    }
    const ready_ = gh(["pr", "ready", "--", String(pr.number)], root);
    const m = gh(["pr", "merge", "--merge", "--match-head-commit", sha, "--subject", `Merge checks ${b.name}: every job passed (merged by the mflow-sync bot)`, "--", String(pr.number)], root);
    if (!m.ok) {
      out.push({ batch: b.name, merged: false, reason: `gh pr merge failed: ${m.err || ready_.err}` });
      continue;
    }
    let local = "left as it is";
    const clean = !gitIn(root, ["status", "--porcelain"]).out && gitIn(root, ["branch", "--show-current"]).out === "main";
    if (clean && gitIn(root, ["fetch", "origin", "main"]).ok && gitIn(root, ["merge", "--ff-only", "origin/main"]).ok) local = "fast-forwarded to origin/main";
    else if (!clean) local = "left as it is: the checkout has changes or is not on main; pull when you are ready";
    out.push({ batch: b.name, merged: true, pr: pr.number, localMain: local, retired: local.startsWith("fast") ? retireWorktrees(root) : [] });
  }
  return out;
}

/** The sync bot's job: merge the batches the rule allows, then add the waiting changes to the open batch (or a new
 *  one), push it and open or update its draft PR. */
export function syncProject(home, { project }) {
  const p = loadConfig(home).projects[project];
  if (!p) throw new Error(`bots: project ${project} is not in bots.json`);
  const merged = mergeReady(p.path).filter((m) => m.merged);
  const s = sync(p.path);
  if (!s.added.length) return { merged, added: [], batch: s.batch, published: null, reason: merged.length ? null : "nothing waited" };
  const pub = publish(p.path, { batch: s.batch });
  return { merged, added: s.added, batch: s.batch, branch: s.branch, created: s.created, commit: s.commit, warnings: s.warnings, published: pub };
}

// ---------- Orca: the bots dispatch, the automations run ----------
// A bot in Orca's Bots list (one per kind) does not run a job itself: a bot runs in its own folder, where a project's
// mflow is not installed. It asks this script which project has a job ready and starts that project's automation, which
// runs in the project's checkout. The project automations are created disabled and never run on their own schedule.
// Every call below touches only automations named "mflow <kind> <project> <agent>" and their runs' terminals.
const NAME = /^mflow (sync|test|review|e2e|fix) (\S+) (claude|codex|antigravity)$/;
export const automationName = (kind, project, agent) => `mflow ${kind} ${project} ${agent}`;

function orca(args) {
  const script = process.env.MFLOW_ORCA_SCRIPT; // a stand-in for tests
  const r = script ? spawnSync(process.execPath, [script, ...args, "--json"], { encoding: "utf8" }) : spawnSync("orca", [...args, "--json"], { encoding: "utf8", timeout: 60_000 });
  let j = null;
  try {
    j = JSON.parse(r.stdout || "null");
  } catch {}
  if (r.status !== 0 || !j?.ok) throw new Error(`orca ${args.slice(0, 2).join(" ")} failed: ${j?.error?.message || (r.stderr || r.stdout || String(r.error || "")).trim().split("\n")[0]}`);
  return j.result;
}

/** The mflow automations in Orca, by name. */
export function mflowAutomations() {
  return orca(["automations", "list"]).automations.flatMap((a) => {
    const m = NAME.exec(a.name);
    return m ? [{ id: a.id, name: a.name, kind: m[1], project: m[2], agent: m[3], enabled: a.enabled }] : [];
  });
}

/** For each project with a `kind` bot: start its automation when a job is ready, caps and usage allowing. */
export function dispatch(home, { kind }, opts = {}) {
  if (!BOT_KINDS.includes(kind)) throw new Error(`dispatch: --kind must be ${BOT_KINDS.join(", ")}`);
  const cfg = loadConfig(home);
  const autos = mflowAutomations();
  const out = [];
  for (const [project, p] of Object.entries(cfg.projects)) {
    for (const s of p.kinds[kind] || []) {
      const r = ready(home, { project, kind, as: s.agent }, opts);
      if (!r.ok) {
        out.push({ project, agent: s.agent, started: false, reason: r.reason });
        continue;
      }
      const a = autos.find((x) => x.name === automationName(kind, project, s.agent));
      if (!a) {
        out.push({ project, agent: s.agent, started: false, reason: `no automation "${automationName(kind, project, s.agent)}": run bots.mjs apply` });
        continue;
      }
      const run = orca(["automations", "run", a.id]).run;
      out.push({ project, agent: s.agent, started: true, automation: a.id, run: run?.id || null, job: r.job || r.changes || null });
      break; // one job at a time per project: the next agent of this kind waits for the next round
    }
  }
  return { kind, started: out.filter((x) => x.started).length, projects: out };
}

/** A bot's precheck: does any project have a `kind` job that can start now? Reads only; starts nothing. */
export function due(home, { kind }, opts = {}) {
  const cfg = loadConfig(home);
  const ready_ = [];
  for (const [project, p] of Object.entries(cfg.projects)) for (const s of p.kinds[kind] || []) if (ready(home, { project, kind, as: s.agent }, opts).ok) ready_.push(`${project}/${s.agent}`);
  const done = finished(home, { kind }, opts).jobs.length;
  if (ready_.length || done) return { ok: true, ready: ready_, finished: done };
  return { ok: false, reason: `no project has a ${kind} job ready, and none finished since the last round` };
}

// ---------- what a round reports: the jobs of its kind that finished since the round before ----------
// No state is kept: a round covers the time from its previous scheduled minute to its own, so every job that ends
// falls in exactly one round's report. A round the machine slept through reports nothing for that stretch.

/** The scheduled minute of this kind's round at or before `now`, and the one before it, as times. */
export function roundWindow(cfg, kind, now = Date.now()) {
  const kinds = BOT_KINDS.filter((k) => Object.values(cfg.projects).some((p) => p.kinds[k]?.length));
  const minutes = staggered(Math.max(0, kinds.indexOf(kind)), cfg.pollMinutes).split(",").map(Number);
  const slot = (t) => {
    const d = new Date(t);
    d.setSeconds(0, 0);
    for (let k = 0; k < 24 * 60; k++, d.setMinutes(d.getMinutes() - 1)) if (minutes.includes(d.getMinutes())) return d.getTime();
    return d.getTime();
  };
  const to = slot(now);
  return { from: slot(to - 60_000), to };
}

const near = (t, from, to) => t >= from - 60_000 && t <= to + 60_000;
const top = (values) => [...values.reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
const filesSince = (dir, since) => {
  const out = [];
  const walk = (d) => {
    let ents = [];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith(".jsonl") && fs.statSync(f).mtimeMs >= since) out.push(f);
    }
  };
  walk(dir);
  return out;
};

/** The model and effort an agent really ran a job on, read from its own log; null when its log does not say. */
export function actualRun(tool, projectPath, from, to, { userHome = os.homedir(), codexHome = process.env.CODEX_HOME || path.join(userHome, ".codex") } = {}) {
  const under = (cwd) => String(cwd || "").replace(/\\/g, "/").toLowerCase().startsWith(fwd(projectPath).toLowerCase());
  if (tool === "codex") {
    const models = [];
    const efforts = [];
    for (const f of filesSince(path.join(codexHome, "sessions"), from - 60_000)) {
      for (const line of fs.readFileSync(f, "utf8").split("\n")) {
        if (!line.includes('"turn_context"')) continue;
        try {
          const o = JSON.parse(line);
          if (!near(Date.parse(o.timestamp), from, to) || !under(o.payload?.cwd)) continue;
          models.push(o.payload.model);
          efforts.push(o.payload.collaboration_mode?.settings?.reasoning_effort ?? o.payload.effort);
        } catch {}
      }
    }
    return models.length ? { model: top(models), effort: top(efforts.filter(Boolean)) } : null;
  }
  if (tool === "claude") {
    const dir = path.join(userHome, ".claude", "projects", path.resolve(projectPath).replace(/[^A-Za-z0-9]/g, "-"));
    const models = [];
    const efforts = [];
    for (const f of filesSince(dir, from - 60_000)) {
      for (const line of fs.readFileSync(f, "utf8").split("\n")) {
        const ts = /"timestamp":"([^"]+)"/.exec(line)?.[1];
        if (!ts || !near(Date.parse(ts), from, to)) continue;
        const m = /"model":"(claude-[a-z0-9-]+)"/.exec(line)?.[1];
        if (m) models.push(m);
        const e = /"effort":"([a-z]+)"/.exec(line)?.[1];
        if (e) efforts.push(e);
      }
    }
    return models.length ? { model: top(models), effort: top(efforts) } : null;
  }
  return null; // antigravity keeps no log a script can read
}

/** The jobs of a kind that ended in this round's window, each with what ran it: from the agent's log, else as asked. */
export function finished(home, { kind }, opts = {}) {
  const cfg = loadConfig(home);
  const w = roundWindow(cfg, kind, opts.now);
  const jobs = [];
  let text = "";
  try {
    text = fs.readFileSync(path.join(home, "runs.jsonl"), "utf8");
  } catch {}
  for (const line of text.split("\n")) {
    let r;
    try {
      r = line ? JSON.parse(line) : null;
    } catch {
      continue;
    }
    if (r?.event !== "end" || r.kind !== kind) continue;
    const at = Date.parse(r.at);
    if (!(at >= w.from && at < w.to)) continue;
    const began = at - (r.minutes || 0) * 60_000;
    const projectPath = cfg.projects[r.project]?.path;
    const real = projectPath && !opts.skipLogs ? actualRun(r.tool, projectPath, began, at, opts) : null;
    const model = real?.model || (r.model === "default" ? "default (not in the agent's log)" : `${r.model} (as asked)`);
    const effort = real?.effort || `${r.effort} (as asked)`;
    jobs.push({ project: r.project, job: r.job || "—", result: r.result, minutes: r.minutes, agent: r.tool, model, effort, line: `${r.project} ${r.job || "—"} (${kind}): ${r.result} · ${r.tool} · model ${model} · effort ${effort} · ${r.minutes} min` });
  }
  return { kind, from: new Date(w.from).toISOString(), to: new Date(w.to).toISOString(), jobs };
}

export const BOT_PURPOSE = {
  sync: "Puts the changes merged into main of each mflow project into a checks batch and opens its draft pull request; merges a batch whose every job passed and that changed only results.",
  test: "Starts the test jobs waiting in each mflow project's checks batch, on the agent and effort the project sets.",
  review: "Starts the review jobs waiting in each mflow project's checks batch, on the agent and effort the project sets.",
  e2e: "Starts the E2E jobs waiting in each mflow project's checks batch, on the agent and effort the project sets.",
  fix: "Starts the fix jobs that failed tests or reviews leave in each mflow project's checks batch.",
};

/** The bots to make in Orca's Bots list, one per kind in use, and the automation each runs on its schedule. */
function botPlan(home, cfg) {
  const kinds = BOT_KINDS.filter((k) => Object.values(cfg.projects).some((p) => p.kinds[k]?.length));
  return kinds.map((kind, i) => {
    const bot = `mflow-${kind}`;
    const self = `node ${pq(fwd(SELF))}`;
    const h = pq(fwd(home));
    const argv = [
      "automations", "create",
      "--name", `${bot} round`,
      "--bot", bot,
      "--trigger", `${staggered(i, cfg.pollMinutes)} * * * *`,
      "--precheck", `${self} due --home ${h} --kind ${kind}`,
      ...(cfg.bots ? ["--runs-in", "new", "--agent", cfg.bots.agent, ...(cfg.bots.model ? ["--model", cfg.bots.model] : []), ...(cfg.bots.effort ? ["--effort", cfg.bots.effort] : [])] : []),
      "--prompt", `First run: ${self} finished --home ${h} --kind ${kind} . If its jobs list is not empty, begin your reply with a section headed Finished and copy each job's line as it is, one per line (it says the result, the agent, the model and the effort that ran it, and the minutes). Then run: ${self} dispatch --home ${h} --kind ${kind} . Then run: ${self} cleanup --home ${h} . End with a section headed Started saying which project's automation you started for which job, or why none started. Do no job yourself and change no file.`,
    ];
    return { bot, purpose: BOT_PURPOSE[kind], create: "In Orca: Bots, + New bot, Start from scratch; name and purpose as given here; runs on this computer with Claude Code.", argv, command: renderArgv(argv) };
  });
}

/** Close the terminals of the runs of mflow automations that finished; a run still going, or any other terminal, stays. */
export function cleanup() {
  const finished = new Set();
  for (const a of mflowAutomations()) {
    const res = orca(["automations", "runs", "--id", a.id]);
    for (const r of res.runs || res) if (["completed", "failed", "skipped_precheck", "error", "cancelled"].includes(r.status) && r.terminalPtyId) finished.add(r.terminalPtyId);
  }
  const closed = [];
  for (const t of orca(["terminal", "list"]).terminals || []) {
    if (!finished.has(t.ptyId)) continue;
    orca(["terminal", "close", "--terminal", t.handle, "--tab"]);
    closed.push({ handle: t.handle, title: t.title || null });
  }
  return { closed };
}

/** The same settings as an edit of an automation that exists: no name, no bot, no session flag; no extra args clears them. */
export function editArgs(argv, id) {
  const out = ["automations", "edit", id];
  for (let i = 2; i < argv.length; i++) {
    if (["--name", "--bot"].includes(argv[i])) {
      i++;
      continue;
    }
    if (argv[i] === "--fresh-session") continue;
    out.push(argv[i]);
  }
  if (argv.includes("--provider") && !argv.some((t) => t.startsWith("--extra-agent-args="))) out.push("--extra-agent-args=");
  if (argv.includes("--bot") && !argv.includes("--agent")) out.push("--agent", "bot"); // back to the bot's own agent
  return out;
}

/**
 * Make Orca match bots.json: create what is missing, bring what exists up to date (agent's model and effort, prompt,
 * precheck, schedule), and remove the project automations bots.json no longer names (an agent changed, a project or a
 * kind dropped) when they are off. A bot's round is made once the user made the bot in Orca; it runs on its schedule.
 * Only automations named "mflow <kind> <project> <agent>" and "<bot> round" are touched.
 */
export function apply(home) {
  const cfg = loadConfig(home);
  const autos = mflowAutomations();
  const p = plan(home, cfg);
  const created = [];
  const updated = [];
  const removed = [];
  const kept = [];
  const wanted = new Set(p.automations.map((a) => automationName(a.kind, a.project, a.agent)));
  for (const a of p.automations) {
    const name = automationName(a.kind, a.project, a.agent);
    const have = autos.find((x) => x.name === name);
    if (have) {
      orca(editArgs(a.argv, have.id));
      updated.push(name);
    } else created.push({ name, id: orca(a.argv).automation?.id || null });
  }
  for (const x of autos) {
    if (wanted.has(x.name)) continue;
    if (x.enabled) kept.push({ name: x.name, why: "on: turn it off in Orca to let apply remove it" });
    else {
      orca(["automations", "remove", x.id]);
      removed.push(x.name);
    }
  }
  const bots = new Set((orca(["bot", "list"]).bots || []).map((b) => b.name));
  const all = orca(["automations", "list"]).automations;
  const missingBots = [];
  for (const b of p.bots) {
    if (!bots.has(b.bot)) {
      missingBots.push(b.bot);
      continue;
    }
    const round = all.find((x) => x.name === `${b.bot} round`);
    if (round) {
      orca(editArgs(b.argv, round.id));
      updated.push(`${b.bot} round`);
    } else created.push({ name: `${b.bot} round`, id: orca(b.argv).automation?.id || null });
  }
  return { created, updated, removed, kept, missingBots, warnings: p.warnings };
}

// ---------- is there a job? ----------
export function jobReady(root, kind, tool) {
  if (kind === "sync") return syncReady(root);
  let cfg, st;
  try {
    cfg = checksConfig(root);
    if (!cfg.enabled) return { ok: false, reason: "checks is not enabled in this project (checks.mjs enable)" };
    st = status(root);
  } catch (e) {
    return { ok: false, reason: `checks status failed: ${String(e.message || e).split("\n")[0]}` };
  }
  const kinds = new Set(KIND_GROUPS[kind]);
  const heavyRunning = st.batches.some((b) => b.jobs.some((j) => j.running && HEAVY.has(j.kind)));
  for (const b of st.batches) {
    if (b.heldBy || b.jobs.some((j) => j.running)) continue;
    const j = b.jobs.find((x) => x.ready && kinds.has(x.kind) && (x.agent === "any" || x.agent === tool));
    if (!j) continue;
    if (HEAVY.has(j.kind) && heavyRunning) continue;
    if (/^e2e/.test(j.kind) && !E2E_AGENTS.includes(tool)) continue;
    return { ok: true, batch: b.name, job: j.id, kind: j.kind };
  }
  return { ok: false, reason: `no ready ${kind} job for ${tool}` };
}

function target(cfg, project, kind, tool) {
  const p = cfg.projects[project];
  if (!p) throw new Error(`bots: project ${project} is not in bots.json`);
  if (!p.kinds[kind]?.some((s) => s.agent === tool)) throw new Error(`bots: ${project} sends ${kind} to ${(p.kinds[kind] || []).map((s) => s.agent).join(", ") || "no agent"}, not ${tool}`);
  return p;
}

export function ready(home, { project, kind, as: tool }, opts = {}) {
  const cfg = loadConfig(home);
  const p = target(cfg, project, kind, tool);
  const a = agentAllowed(cfg, usage(home, opts), tool);
  if (!a.ok) return a;
  const room = slotRoom(cfg, liveSlots(home, cfg), project, kind);
  if (!room.ok) return room;
  return jobReady(p.path, kind, tool);
}

/** What the automation was configured to call: the model and effort in bots.json, or "default" when it names none. This is
 *  the request, not a reading of what the agent used (the tools report that nowhere a script can read it). */
const asked = (cfg, project, kind, tool) => {
  const s = cfg.projects[project]?.kinds[kind]?.find((x) => x.agent === tool);
  return { model: s?.model ?? "default", effort: s?.effort ?? "default" };
};

export function begin(home, { project, kind, as: tool }, opts = {}) {
  const cfg = loadConfig(home);
  target(cfg, project, kind, tool);
  const a = agentAllowed(cfg, usage(home, opts), tool);
  if (!a.ok) return { ok: false, ...a };
  return withLock(slotsFile(home), () => {
    const slots = liveSlots(home, cfg);
    const room = slotRoom(cfg, slots, project, kind);
    if (!room.ok) return { ok: false, ...room };
    const id = `${project}/${kind}/${tool}/${process.pid}-${Date.now().toString(36)}`;
    const at = new Date().toISOString();
    const { model, effort } = asked(cfg, project, kind, tool);
    slots[id] = { project, kind, tool, at, model, effort };
    fs.writeFileSync(slotsFile(home), JSON.stringify({ slots }, null, 2) + "\n");
    fs.appendFileSync(path.join(home, "runs.jsonl"), JSON.stringify({ event: "begin", at, slot: id, tool, model, effort, project, kind }) + "\n");
    return { ok: true, slot: id };
  });
}

export const RESULTS = ["pass", "fail", "released", "blocked"];

/** Give the slot back and write what ran: agent, model, effort, minutes and the result, for `report`. */
export function end(home, { slot, result, job, note }) {
  if (!slot) throw new Error("end: --slot <id> is required");
  if (result && !RESULTS.includes(result)) throw new Error(`end: --result must be ${RESULTS.join(", ")}`);
  const cfg = loadConfig(home);
  return withLock(slotsFile(home), () => {
    const all = readJson(slotsFile(home))?.slots || {};
    const s = all[slot];
    delete all[slot];
    fs.writeFileSync(slotsFile(home), JSON.stringify({ slots: all }, null, 2) + "\n");
    if (!s) return { ended: false, slot };
    const now = new Date();
    const rec = {
      event: "end",
      at: now.toISOString(),
      slot,
      tool: s.tool,
      model: s.model ?? asked(cfg, s.project, s.kind, s.tool).model, // a slot taken before this was recorded: ask the config
      effort: s.effort ?? asked(cfg, s.project, s.kind, s.tool).effort,
      project: s.project,
      kind: s.kind,
      minutes: Math.round(((now - Date.parse(s.at)) / 60_000) * 10) / 10,
      result: result || "unreported",
      ...(job ? { job } : {}),
      ...(note ? { note: String(note).slice(0, 500) } : {}),
    };
    fs.appendFileSync(path.join(home, "runs.jsonl"), JSON.stringify(rec) + "\n");
    return { ended: true, ...rec };
  });
}

/** The finished jobs grouped by agent, model, effort and kind: how many, how they ended, how long they took. */
export function report(home) {
  const groups = new Map();
  try {
    for (const line of fs.readFileSync(path.join(home, "runs.jsonl"), "utf8").split("\n")) {
      if (!line) continue;
      const r = JSON.parse(line);
      if (r.event !== "end") continue;
      const key = [r.tool, r.model, r.effort, r.kind].join(" | ");
      const g = groups.get(key) || { tool: r.tool, model: r.model, effort: r.effort, kind: r.kind, jobs: 0, minutes: 0, results: {} };
      g.jobs++;
      g.minutes += r.minutes || 0;
      g.results[r.result] = (g.results[r.result] || 0) + 1;
      groups.set(key, g);
    }
  } catch {}
  return [...groups.values()].map((g) => ({ ...g, avgMinutes: Math.round((g.minutes / g.jobs) * 10) / 10, minutes: Math.round(g.minutes * 10) / 10 })).sort((a, b) => b.jobs - a.jobs);
}

/** Claude Code hands its statusline command a JSON on stdin; keep the rate limits so `usage` can read them. */
export function claudeSnapshot(home, text, now = Date.now()) {
  const j = JSON.parse(text);
  const w = (x) => (x && typeof x.used_percentage === "number" ? { pct: x.used_percentage, resetsAt: new Date(toMs(x.resets_at)).toISOString() } : null);
  const snap = { at: new Date(now).toISOString(), fiveHour: w(j.rate_limits?.five_hour), weekly: w(j.rate_limits?.seven_day) };
  if (!snap.fiveHour && !snap.weekly) return { written: false, reason: "no rate_limits in the statusline input (not a subscription session)" };
  fs.mkdirSync(path.join(home, "usage"), { recursive: true });
  fs.writeFileSync(path.join(home, "usage", "claude.json"), JSON.stringify(snap) + "\n");
  return { written: true };
}

// ---------- plan ----------
// Orca runs these through the shell of the machine (PowerShell here), where a backslash is no escape: paths go in with
// forward slashes, which Node takes on Windows, and the text of a command has no inner quotes or backticks.
const fwd = (p) => String(p).replace(/\\/g, "/");
const pq = (s) => (/^[\w./:@-]+$/.test(s) ? s : `'${String(s).replace(/'/g, "''")}'`);
const q = (s) => `"${String(s).replace(/(["$`])/g, "`$1")}"`;
export function extraArgs(s) {
  const out = [];
  if (s.model) out.push("--model", s.model);
  if (s.effort) out.push(s.agent === "codex" ? "-c" : "--effort", s.agent === "codex" ? `model_reasoning_effort=${s.effort}` : s.effort);
  return out.join(" ");
}

const CHECKS = path.join(path.dirname(SELF), "checks.mjs");

function promptFor(home, project, kind, s) {
  const self = `node ${pq(fwd(SELF))}`;
  const checks = `node ${pq(fwd(CHECKS))}`;
  const scope = `--home ${pq(fwd(home))} --project ${pq(project)} --kind ${kind} --as ${s.agent}`;
  const job =
    kind === "sync"
      ? `run ${self} sync --home ${pq(fwd(home))} --project ${pq(project)} and say which batch it merged (every job passed and only results changed), which changes it added to which batch, and the pull request it published. Change no file and merge nothing yourself; result pass when it did its work, fail when it failed.`
      : kind === "test"
      ? s.agent === "claude" ? "run /mflow:test-pr." : "use the mflow-test-pr skill."
      : `take the next ${kind} job of the open checks batch: run ${checks} next --as ${s.agent} --kind ${kind} here, work only in the dir it prints and as its how says, then run ${checks} done <the job> --batch <the batch> with the record or report the job wrote, then ${checks} publish --batch <the batch>. With no job, stop. Never merge a pull request and never work in this main checkout.`;
  return `First run: ${self} begin ${scope} . If it exits non-zero or prints ok false, stop and say its reason. Otherwise note its slot, then ${job} Whatever happens, last run: ${self} end --home ${pq(fwd(home))} --slot <the slot> --result <pass or fail or released or blocked> --job <the job id like T1 or none>`;
}

/** Where bots.json and the project's checks.route disagree: a job routed to an agent with no bot waits forever, and a bot
 *  for an agent the route never names gets no job. checks.route decides which agent a job is for; bots.json only runs it. */
export function routeWarnings(name, p) {
  let route;
  try {
    const c = checksConfig(p.path);
    if (!c.enabled) return [`${name}: checks is not enabled in ${p.path}, so no bot gets a job`];
    route = c.route;
  } catch (e) {
    return [`${name}: cannot read its checks config: ${String(e.message || e).split("\n")[0]}`];
  }
  const out = [];
  if (!p.kinds.sync?.length) out.push(`${name}: no sync bot, so merged changes reach a checks batch only when you run /mflow:checks`);
  for (const kind of BOT_KINDS) {
    if (kind === "sync") continue;
    const bots = (p.kinds[kind] || []).map((s) => s.agent);
    for (const key of ROUTE_KEYS[kind]) {
      const to = [route[key]].flat().filter(Boolean);
      if (to.includes("any")) {
        if (!bots.length) out.push(`${name}: ${key} jobs go to any agent but bots.json has no ${kind} bot, so they wait for you`);
        continue;
      }
      for (const a of to) if (!bots.includes(a)) out.push(`${name}: checks.route.${key} is ${a} but bots.json has no ${kind} bot for ${a}, so those jobs wait`);
    }
    const named = ROUTE_KEYS[kind].flatMap((k) => [route[k]].flat());
    if (!named.includes("any")) for (const a of bots) if (!named.includes(a)) out.push(`${name}: the ${kind} bot for ${a} gets no job: checks.route sends ${kind} to ${[...new Set(named)].join(", ")} (change it with checks.mjs assign or .mflow/config.json)`);
  }
  return out;
}

// Each automation runs in the checkout that is already there (--workspace-mode existing), not a new worktree per run:
// Orca leaves each run's worktree and branch behind, and the checks jobs run in the batch's own worktree anyway.

/** The minutes of the hour the i-th bot of a project wakes: every `poll` minutes, each bot of a project at its own offset
 *  (0, 2, 4…), so two bots of one project never wake in the same minute and race for its one job at a time. */
export function staggered(i, poll) {
  const off = (i * 2) % poll;
  const out = [];
  for (let m = off; m < 60; m += poll) out.push(m);
  return out.join(",");
}

/** An argv as one line for the shell Orca uses (PowerShell here): a value with a space or a quote goes in double quotes. */
function renderArgv(argv) {
  const one = (t) => {
    const m = /^(--extra-agent-args=)(.*)$/.exec(t);
    if (m) return `${m[1]}${q(m[2])}`;
    return /^[\w./:@=-]+$/.test(t) ? t : q(t);
  };
  return ["orca", ...argv.map(one)].join(" ");
}

export function plan(home, cfg) {
  const cmds = [];
  const warnings = Object.entries(cfg.projects).flatMap(([name, p]) => routeWarnings(name, p));
  for (const [name, p] of Object.entries(cfg.projects)) {
    let n = 0;
    for (const [kind, specs] of Object.entries(p.kinds)) {
      for (const s of specs) {
        const extra = extraArgs(s);
        const minutes = staggered(n++, cfg.pollMinutes);
        const precheck = `node ${pq(fwd(SELF))} ready --home ${pq(fwd(home))} --project ${pq(name)} --kind ${kind} --as ${s.agent}`;
        // One argv, two uses: apply hands it to orca with no shell; command is the same line to read or paste.
        const argv = [
          "automations", "create",
          "--name", automationName(kind, name, s.agent),
          "--trigger", `${minutes} * * * *`,
          "--provider", s.agent,
          "--workspace", `path:${fwd(p.path)}`, "--workspace-mode", "existing",
          ...(extra ? [`--extra-agent-args=${extra}`] : []),
          "--fresh-session",
          "--precheck", precheck,
          "--prompt", promptFor(home, name, kind, s),
          "--disabled",
        ];
        cmds.push({ project: name, kind, agent: s.agent, argv, command: renderArgv(argv) });
      }
    }
  }
  return {
    warnings,
    bots: botPlan(home, cfg),
    automations: cmds,
    note: "Each is created disabled and stays so: a bot in Orca's Bots list starts it (bots.mjs dispatch) when its project has a job. Each runs in the checkout already there (no new worktree per run); the checks jobs work in their batch's worktree.",
    statusline: `Add to ~/.claude/statusline.sh to give usage a Claude reading: printf '%s' "$input" | node ${pq(fwd(SELF))} claude-snapshot --home ${pq(fwd(home))} >/dev/null 2>&1`,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === SELF;
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (f) => {
    const i = rest.indexOf(f);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  try {
    const home = homeDir(opt("--home"));
    const sel = { project: opt("--project"), kind: opt("--kind"), as: opt("--as") };
    const need = () => {
      if (!sel.project || !BOT_KINDS.includes(sel.kind) || !AGENTS.includes(sel.as)) throw new Error(`${cmd}: --project <p> --kind ${BOT_KINDS.join("|")} --as ${AGENTS.join("|")} are required`);
    };
    let out;
    if (cmd === "plan") out = plan(home, loadConfig(home));
    else if (cmd === "usage") out = usage(home);
    else if (cmd === "ready") {
      need();
      out = ready(home, sel);
      if (!out.ok) {
        process.stderr.write(`${out.reason}\n`);
        process.exit(1);
      }
    } else if (cmd === "begin") {
      need();
      out = begin(home, sel);
      if (!out.ok) {
        process.stdout.write(JSON.stringify(out, null, 2) + "\n");
        process.exit(1);
      }
    } else if (cmd === "sync") {
      if (!sel.project) throw new Error("sync: --project <p> is required");
      out = syncProject(home, { project: sel.project });
    } else if (cmd === "due") {
      out = due(home, { kind: opt("--kind") });
      if (!out.ok) {
        process.stderr.write(`${out.reason}\n`);
        process.exit(1);
      }
    } else if (cmd === "finished") out = finished(home, { kind: opt("--kind") });
    else if (cmd === "dispatch") out = dispatch(home, { kind: opt("--kind") });
    else if (cmd === "cleanup") out = cleanup();
    else if (cmd === "apply") out = apply(home);
    else if (cmd === "end") out = end(home, { slot: opt("--slot"), result: opt("--result"), job: opt("--job"), note: opt("--note") });
    else if (cmd === "report") out = report(home);
    else if (cmd === "claude-snapshot") out = claudeSnapshot(home, fs.readFileSync(0, "utf8"));
    else throw new Error("usage: bots.mjs plan | usage | ready | begin | end | claude-snapshot (see the head of the file)");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
