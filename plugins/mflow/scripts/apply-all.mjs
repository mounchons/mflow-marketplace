#!/usr/bin/env node
// The state of one /mflow:apply-all run, which builds every change waiting in openspec/changes/ one after the other:
// a branch from main, apply (which archives and commits), test and review with fix rounds, a merge into main, the next
// change. The run is written after every step, so a run whose context was compacted, or whose session restarted, goes
// on from the first step that is not finished.
//
// While a run is open its file sits inside .git (.git/mflow/apply-all.md): it follows no branch, and a line added to
// it never makes the tree dirty, which would turn a test run into one "with uncommitted changes" that nothing can
// reuse. `finish` moves it to docs/reviews/apply-all/<date>-<HHMM>.md.
//
// Steps of a change, in order: apply, test, review, merge. `round` on test or review counts one fix round there, and
// is refused past --rounds. A step `stopped` stops the run: the changes after it may build on it.
//
// `gate` is what the merge waits for, read from the files rather than from what the run remembers: on the change's
// branch, a clean tree, the change archived, its row under ## Done in docs/reviews/pending.md, a passing whole-suite
// or since record, and an approving report, with only documents committed after that record and that report.
//
//   node apply-all.mjs start [<change> ...] [--rounds <n>]                 -> JSON { file, rounds, queue, branch, commit }
//   node apply-all.mjs log <step> <state> --target <change> [--note <text>] -> JSON { event, roundsLeft }
//   node apply-all.mjs status                                              -> JSON { open, next, stopped, changes, ... }
//   node apply-all.mjs gate <change>                                       -> JSON { ready, why, test, review }
//   node apply-all.mjs finish [--result done|stopped]                      -> JSON { file, result }
//
// Names given to `start` set which changes run and in what order; with none, every folder under openspec/changes/
// except archive, the oldest first by the commit that added it. NIGHT_NOW (an ISO time) stands in for the clock in tests.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, readText, writeFileAtomic } from "./lib.mjs";
import { args, cell, git, local, localDay, localTime, now, parse } from "./night.mjs";
import { FILE as PENDING, isDoc, parse as parsePending, readRecord } from "./pending.mjs";

export const DIR = "docs/reviews/apply-all";
export const TESTS_DIR = "docs/reviews/tests";
export const STEPS = ["apply", "test", "review", "merge"];
export const STATES = ["started", "round", "done", "skipped", "stopped"];
const FIX_STEPS = ["test", "review"];
const FINISHED = new Set(["done", "skipped"]);

export const branchOf = (change) => `change/${change}`;

function runFile(root) {
  const rel = git(root, "rev-parse", "--git-path", "mflow/apply-all.md");
  if (!rel) throw new Error("this folder is not a git repository");
  return path.resolve(root, rel);
}

/** The changes to build: the names given, or every active one, the oldest first. */
export function queueOf(root, names = []) {
  const dir = path.join(root, "openspec", "changes");
  let active = [];
  try {
    active = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== "archive").map((e) => e.name);
  } catch { /* no openspec/changes */ }
  for (const n of names) if (!active.includes(n)) throw new Error(`no change named "${n}" in openspec/changes/`);
  const added = (n) => Number((git(root, "log", "--reverse", "--format=%ct", "--", `openspec/changes/${n}`) ?? "").split("\n")[0]) || Infinity;
  const queue = names.length ? [...new Set(names)] : active.map((n) => [added(n), n]).sort(([a, x], [b, y]) => a - b || x.localeCompare(y)).map(([, n]) => n);
  const unready = queue.filter((n) => !fs.existsSync(path.join(dir, n, "tasks.md")));
  if (unready.length) throw new Error(`not proposed to the end (no tasks.md): ${unready.join(", ")}; finish them with /opsx:propose, or name only the ones that are ready`);
  return queue;
}

/** What the run file says now: each change's steps and rounds, and where to go on. */
export function summary(file) {
  const text = readText(file);
  const { head, events } = parse(text);
  const queue = (/^Queue: (.*)$/m.exec(text)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const rounds = Number(head.rounds) || 3;
  const changes = queue.map((change) => {
    const steps = Object.fromEntries(STEPS.map((s) => [s, "open"]));
    const spent = { test: 0, review: 0 };
    let stopped = null;
    for (const e of events) {
      if (e.target !== change || !STEPS.includes(e.step)) continue;
      if (e.state === "round") { spent[e.step] += 1; continue; }
      steps[e.step] = e.state;
      if (e.state === "stopped") stopped = { change, step: e.step, note: e.note };
    }
    const state = stopped ? "stopped" : steps.merge === "done" ? "done" : "open";
    return { change, branch: branchOf(change), state, steps, rounds: spent, stopped };
  });
  const stopped = changes.find((c) => c.state === "stopped")?.stopped ?? null;
  const current = stopped ? null : changes.find((c) => c.state === "open") ?? null;
  const step = current ? STEPS.find((s) => !FINISHED.has(current.steps[s])) : null;
  return {
    open: true,
    started: head.started ?? null,
    rounds,
    queue,
    next: current ? { change: current.change, branch: current.branch, step, roundsLeft: FIX_STEPS.includes(step) ? Math.max(0, rounds - current.rounds[step]) : null } : null,
    stopped,
    merged: changes.filter((c) => c.state === "done").map((c) => c.change),
    changes,
  };
}

function start(root, opts) {
  const file = runFile(root);
  if (fs.existsSync(file)) {
    const s = summary(file);
    const err = new Error(`an apply-all run is open (next: ${s.next ? `${s.next.step} of ${s.next.change}` : "finish"}); go on from it, or end it with \`apply-all.mjs finish --result stopped\``);
    err.json = { next: s.next, stopped: s.stopped };
    throw err;
  }
  if (/^(1|true|yes|on)$/i.test(process.env.CLAUDE_CODE_REMOTE ?? "")) throw new Error("/mflow:apply-all merges into main on this machine and pushes nothing, so it runs only in a terminal session, not on the web");
  const rounds = opts.rounds === undefined ? 3 : opts.rounds === true ? NaN : Number(opts.rounds);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new Error(`--rounds takes a whole number from 1 to 10, not "${opts.rounds}"`);
  const branch = git(root, "rev-parse", "--abbrev-ref", "HEAD");
  if (branch === null) throw new Error("this folder is not a git repository with a commit");
  if (branch !== "main") {
    const err = new Error(`the checkout is on ${branch}: each change branches from main, so merge what this branch holds or switch to main first`);
    err.json = { branch };
    throw err;
  }
  const dirty = git(root, "-c", "core.quotePath=false", "status", "--porcelain");
  if (dirty) {
    const err = new Error("the tree has uncommitted changes: commit them or put them away first, because this run never commits the user's own work");
    err.json = { files: dirty.split("\n").map((l) => l.trim()) };
    throw err;
  }
  const queue = queueOf(root, opts._);
  if (!queue.length) throw new Error("nothing to build: openspec/changes/ holds no change; propose them first with /opsx:propose");
  const at = now();
  const commit = git(root, "rev-parse", "HEAD");
  writeFileAtomic(file, [
    `# Apply-all run ${local(at)}`,
    "",
    `Started: ${at.toISOString()} (${local(at)})`,
    `Rounds: ${rounds}`,
    `Branch: ${branch}`,
    `Commit: ${commit}`,
    `Queue: ${queue.join(", ")}`,
    "",
    `Written by /mflow:apply-all after every step. Steps of each change: ${STEPS.join(", ")}.`,
    "",
    "| Time | Step | Target | State | Note |",
    "|---|---|---|---|---|",
    "",
  ].join("\n"));
  return { file: path.relative(root, file).replaceAll("\\", "/"), rounds, queue, branch, commit };
}

function log(root, step, state, opts) {
  const file = runFile(root);
  if (!fs.existsSync(file)) throw new Error("no apply-all run is open; start one with `apply-all.mjs start`");
  if (!STEPS.includes(step)) throw new Error(`step "${step}" is not one of ${STEPS.join(", ")}`);
  if (!STATES.includes(state)) throw new Error(`state "${state}" is not one of ${STATES.join(", ")}`);
  const s = summary(file);
  const change = s.changes.find((c) => c.change === opts.target);
  if (!change) throw new Error(`--target names a change of this run: ${s.queue.join(", ")}`);
  let roundsLeft = null;
  if (state === "round") {
    if (!FIX_STEPS.includes(step)) throw new Error(`a fix round belongs to ${FIX_STEPS.join(" or ")}, not ${step}`);
    roundsLeft = s.rounds - change.rounds[step] - 1;
    if (roundsLeft < 0) throw new Error(`no rounds left for ${step} of ${change.change} (${s.rounds} spent): log the step stopped`);
  }
  if (FINISHED.has(state)) {
    const earlier = STEPS.slice(0, STEPS.indexOf(step)).find((e) => !FINISHED.has(change.steps[e]));
    if (earlier) throw new Error(`${earlier} of ${change.change} is not finished, so ${step} cannot be`);
  }
  const at = now();
  const text = readText(file).replace(/\s*$/, "\n");
  writeFileAtomic(file, `${text}| ${localTime(at)} | ${step} | ${cell(opts.target)} | ${state} | ${cell(opts.note)} |\n`);
  return { event: { time: localTime(at), step, target: opts.target, state, note: opts.note ?? "" }, roundsLeft };
}

const onlyDocumentsSince = (root, commit) => {
  const out = git(root, "-c", "core.quotePath=false", "diff", "--name-only", commit, "HEAD");
  return out !== null && out.split("\n").filter(Boolean).every(isDoc);
};

/** The newest passing whole-suite or since record that HEAD is proven by: only documents committed after it. */
function provingRecord(root) {
  let names = [];
  try {
    names = fs.readdirSync(path.join(root, TESTS_DIR)).filter((f) => f.endsWith(".md")).sort().reverse().slice(0, 30);
  } catch { return null; }
  for (const name of names) {
    const rel = `${TESTS_DIR}/${name}`;
    const rec = readRecord(readText(path.join(root, rel)) ?? "");
    if (!rec.commit || rec.result !== "pass" || rec.uncommitted) continue;
    if (!(rec.scope === "whole suite" || /^since\s+[0-9a-f]{7,64}$/.test(rec.scope))) continue;
    if (git(root, "merge-base", "--is-ancestor", rec.commit, "HEAD") === null) continue;
    if (onlyDocumentsSince(root, rec.commit)) return rel;
  }
  return null;
}

/** The commit a review report read: `Reviewed: <target> at <commit>`, or the end of `Reviewed: <change> <base>..<end>`. */
export function reviewedCommit(text) {
  const line = /^Reviewed:\s*(.+?)\s*$/m.exec(text ?? "")?.[1];
  if (!line || /with uncommitted changes/.test(line)) return null;
  return / at ([0-9a-f]{7,64})\b/.exec(line)?.[1] ?? /\.\.([0-9a-f]{7,64})\b/.exec(line)?.[1] ?? null;
}

/** Whether this change may be merged, and every reason it may not. */
export function gate(root, change) {
  if (!change) throw new Error("gate: name the change");
  const why = [];
  const branch = git(root, "rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== branchOf(change)) why.push(`the checkout is on ${branch}, not ${branchOf(change)}`);
  if (git(root, "status", "--porcelain")) why.push("the tree has uncommitted changes");
  if (fs.existsSync(path.join(root, "openspec", "changes", change))) why.push(`openspec/changes/${change} is not archived`);
  const list = readText(path.join(root, PENDING));
  const row = list === null ? null : parsePending(list).doneRows.find((r) => r.change === change);
  if (!row) why.push(`${change} is not under ## Done in ${PENDING}: its Test or Review is still open`);
  const test = provingRecord(root);
  if (!test) why.push(`no passing whole-suite or since record in ${TESTS_DIR} proves this commit (only documents may be committed after it)`);
  if (row && /^\s*approve\b/i.test(row.review)) {
    const report = row.review.replace(/^\s*approve\s+/i, "").trim();
    const commit = reviewedCommit(readText(path.join(root, report)));
    if (!commit) why.push(`${report} names no commit on a Reviewed: line`);
    else if (!onlyDocumentsSince(root, commit)) why.push(`code changed after the review at ${commit.slice(0, 7)}: review what came after it first`);
  } else if (row && !/^\s*not needed\b/i.test(row.review)) {
    why.push(`its Review is "${row.review}"`);
  }
  return { change, ready: why.length === 0, why, test, review: row?.review ?? null };
}

function finish(root, opts) {
  const file = runFile(root);
  if (!fs.existsSync(file)) throw new Error("no apply-all run is open");
  const result = opts.result ?? "done";
  if (!["done", "stopped"].includes(result)) throw new Error(`--result is done or stopped, not "${result}"`);
  const at = now();
  const text = readText(file).replace(/\s*$/, "\n");
  const startedAt = new Date(parse(text).head.started?.split(" ")[0] ?? at);
  const stem = `${localDay(startedAt)}-${localTime(startedAt).replace(":", "")}`;
  let target = path.join(root, DIR, `${stem}.md`);
  for (let n = 2; fs.existsSync(target); n++) target = path.join(root, DIR, `${stem}-${n}.md`);
  writeFileAtomic(target, `${text}\nFinished: ${at.toISOString()} (${result}) ${local(at)}\n`);
  fs.rmSync(file);
  return { file: path.relative(root, target).replaceAll("\\", "/"), result };
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const out = (o, code = 0) => { process.stdout.write(JSON.stringify(o, null, 2) + "\n"); process.exit(code); };
  try {
    if (!root) throw new Error("no .mflow/config.json here or above; run /mflow:init first");
    const opts = args(rest);
    if (cmd === "start") return out(start(root, opts));
    if (cmd === "log") return out(log(root, opts._[0], opts._[1], opts));
    if (cmd === "gate") return out(gate(root, opts._[0]));
    if (cmd === "finish") return out(finish(root, opts));
    if (cmd === "status") {
      const file = runFile(root);
      return out(fs.existsSync(file) ? { ...summary(file), file: path.relative(root, file).replaceAll("\\", "/") } : { open: false });
    }
    throw new Error("usage: apply-all.mjs start [<change> ...] [--rounds <n>] | log <step> <state> --target <change> [--note <text>] | status | gate <change> | finish [--result done|stopped]");
  } catch (err) {
    out({ error: err.message, ...(err.json ?? {}) }, 1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
