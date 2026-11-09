#!/usr/bin/env node
// The state of one /mflow:apply-all run, which takes what the user approved in /mflow:discuss all the way to main:
// for each change of the plan a branch from main, propose, apply (which archives and commits), test and review with
// fix rounds, a merge into main, the next change. The run is written after every step, so a run whose context was
// compacted, or whose session restarted, goes on from the first step that is not finished.
//
// Only approved discussion documents go in: they hold the user's conclusions, which is what lets propose run with
// no one to ask. `candidates` lists them for the plan, and `start` refuses a change that names no approved document.
//
// While a run is open its file sits inside .git (.git/mflow/apply-all.md): it follows no branch, and a line added to
// it never makes the tree dirty, which would turn a test run into one "with uncommitted changes" that nothing can
// reuse. `finish` moves it to docs/reviews/apply-all/<date>-<HHMM>.md.
//
// Steps of a change, in order: propose, apply, test, review, merge. `round` on test or review counts one fix round
// there, and is refused past --rounds. A step `stopped` stops the run: the changes after it may build on it.
//
// `gate` is what the merge waits for, read from the files rather than from what the run remembers: on the change's
// branch, a clean tree, the change archived, its row under ## Done in docs/reviews/pending.md, a passing whole-suite
// or since record, and an approving report, with only documents committed after that record and that report.
//
//   node apply-all.mjs candidates                                          -> JSON { approved, notApproved, changes, branches }
//   node apply-all.mjs start <change>=<NN>[,<NN>...] ... [--rounds <n>]    -> JSON { file, rounds, queue, branch, commit }
//   node apply-all.mjs extend <change>=<NN>[,<NN>...] --after <change>     -> JSON { queue }   (a part a proposal split off)
//   node apply-all.mjs log <step> <state> --target <change> [--note <text>] -> JSON { event, roundsLeft }
//   node apply-all.mjs status                                              -> JSON { open, next, stopped, changes, ... }
//   node apply-all.mjs gate <change>                                       -> JSON { ready, why, test, review }
//   node apply-all.mjs finish [--result done|stopped]                      -> JSON { file, result }
//
// NIGHT_NOW (an ISO time) stands in for the clock in tests.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, frontmatter, loadConfig, readText, writeFileAtomic } from "./lib.mjs";
import { args, cell, git, local, localDay, localTime, now, parse } from "./night.mjs";
import { FILE as PENDING, NAME, parse as parsePending, readRecord } from "./pending.mjs";

export const DIR = "docs/reviews/apply-all";
export const TESTS_DIR = "docs/reviews/tests";
export const STEPS = ["propose", "apply", "test", "review", "merge"];
export const STATES = ["started", "round", "done", "skipped", "stopped"];
const FIX_STEPS = ["test", "review"];
const FINISHED = new Set(["done", "skipped"]);
const DOC_FILE = /^(\d{2,})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

export const branchOf = (change) => `change/${change}`;

function runFile(root) {
  const rel = git(root, "rev-parse", "--git-path", "mflow/apply-all.md");
  if (!rel) throw new Error("this folder is not a git repository");
  return path.resolve(root, rel);
}

function folders(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}
const CHANGES = (root) => path.join(root, "openspec", "changes");

/** What the run needs of the checkout before anything is planned or started. */
function preflight(root) {
  if (/^(1|true|yes|on)$/i.test(process.env.CLAUDE_CODE_REMOTE ?? "")) throw new Error("/mflow:apply-all merges into main on this machine and pushes nothing, so it runs only in a terminal session, not on the web");
  const branch = git(root, "rev-parse", "--abbrev-ref", "HEAD");
  if (branch === null) throw new Error("this folder is not a git repository with a commit");
  if (branch !== "main") {
    const err = new Error(`the checkout is on ${branch}: the approved documents must be on main and each change branches from it, so merge what this branch holds or switch to main first`);
    err.json = { branch };
    throw err;
  }
  const dirty = git(root, "-c", "core.quotePath=false", "status", "--porcelain");
  if (dirty) {
    const err = new Error("the tree has uncommitted changes: commit them or put them away first, because this run never commits the user's own work");
    err.json = { files: dirty.split("\n").map((l) => l.trim()) };
    throw err;
  }
  return branch;
}

/** Every discussion document on this checkout, by number. */
function discussions(root) {
  const dir = loadConfig(root).discussDir.replace(/\/+$/, "");
  let names = [];
  try {
    names = fs.readdirSync(path.join(root, dir));
  } catch { /* no discussions yet */ }
  return names.flatMap((name) => {
    const m = DOC_FILE.exec(name);
    if (!m) return [];
    const fm = frontmatter(readText(path.join(root, dir, name)) ?? "");
    const packs = String(fm.packs ?? "").replace(/[[\]]/g, "").split(",").map((s) => s.trim().split("@")[0]).filter(Boolean);
    return [{ id: m[1], slug: m[2], title: fm.title ?? "", status: fm.status ?? "", packs, file: `${dir}/${name}` }];
  }).sort((a, b) => Number(a.id) - Number(b.id));
}

/** What the plan is made from: approved documents, with the proposals that already cite each one. */
export function candidates(root) {
  preflight(root);
  const base = CHANGES(root);
  const active = folders(base).filter((n) => n !== "archive");
  const proposals = [
    ...active.map((name) => ({ name, text: readText(path.join(base, name, "proposal.md")) })),
    ...folders(path.join(base, "archive")).map((name) => ({ name: `archive/${name}`, text: readText(path.join(base, "archive", name, "proposal.md")) })),
  ].filter((p) => p.text !== null);
  const docs = discussions(root);
  const approved = docs.filter((d) => d.status === "approved").map((d) => ({
    ...d,
    builtBy: proposals.filter((p) => p.text.includes(path.basename(d.file)) || d.packs.some((n) => p.text.includes(`packs/${n}.md`))).map((p) => p.name),
  }));
  if (!approved.length) throw new Error("no approved discussion on main: settle the topics with /mflow:discuss and approve them first");
  const branches = (git(root, "for-each-ref", "--format=%(refname:short)", "refs/heads/change") ?? "").split("\n").filter(Boolean);
  return { approved, notApproved: docs.filter((d) => d.status === "draft").map(({ id, slug, title }) => ({ id, slug, title })), changes: active, branches };
}

/** One plan item, `<change>=<NN>[,<NN>...]`, checked against the approved documents and what is already built. */
function planItem(root, text, docs) {
  const m = /^([^=]+)=(\d+(?:,\d+)*)$/.exec(text);
  if (!m) throw new Error(`a plan item is <change>=<NN>[,<NN>...], not "${text}": every change comes from documents approved in /mflow:discuss`);
  const change = m[1];
  if (!NAME.test(change)) throw new Error(`not a change name (lowercase letters, digits and hyphens): ${change}`);
  const files = m[2].split(",").map((id) => {
    const doc = docs.find((d) => Number(d.id) === Number(id));
    if (!doc) throw new Error(`no discussion document ${id}`);
    if (doc.status !== "approved") throw new Error(`discussion ${id} (${doc.slug}) is ${doc.status || "without a status"}: settle it and approve it with /mflow:discuss first`);
    return doc.file;
  });
  if (folders(path.join(CHANGES(root), "archive")).some((f) => new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${change}$`).test(f))) throw new Error(`${change} is already built and archived: give the new work another name`);
  const folder = path.join(CHANGES(root), change);
  if (fs.existsSync(folder) && !fs.existsSync(path.join(folder, "tasks.md"))) throw new Error(`${change} is not proposed to the end (no tasks.md): finish it with /opsx:propose or remove the folder`);
  return { change, files };
}

const readDocs = (text) => Object.fromEntries((/^Docs: (.*)$/m.exec(text)?.[1] ?? "").split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
  const [change, files] = s.split("=");
  return [change, files.split(",")];
}));
const readQueue = (text) => (/^Queue: (.*)$/m.exec(text)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const queueLine = (queue) => `Queue: ${queue.join(", ")}`;
const docsLine = (docs) => `Docs: ${Object.entries(docs).map(([c, f]) => `${c}=${f.join(",")}`).join("; ")}`;

/** What the run file says now: each change's steps and rounds, and where to go on. */
export function summary(file) {
  const text = readText(file);
  const { head, events } = parse(text);
  const queue = readQueue(text);
  const docs = readDocs(text);
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
    return { change, branch: branchOf(change), docs: docs[change] ?? [], state, steps, rounds: spent, stopped };
  });
  const stopped = changes.find((c) => c.state === "stopped")?.stopped ?? null;
  const current = stopped ? null : changes.find((c) => c.state === "open") ?? null;
  const step = current ? STEPS.find((s) => !FINISHED.has(current.steps[s])) : null;
  return {
    open: true,
    started: head.started ?? null,
    rounds,
    queue,
    next: current ? { change: current.change, branch: current.branch, docs: current.docs, step, roundsLeft: FIX_STEPS.includes(step) ? Math.max(0, rounds - current.rounds[step]) : null } : null,
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
  const branch = preflight(root);
  const rounds = opts.rounds === undefined ? 3 : opts.rounds === true ? NaN : Number(opts.rounds);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new Error(`--rounds takes a whole number from 1 to 10, not "${opts.rounds}"`);
  if (!opts._.length) throw new Error("no plan: start takes <change>=<NN>[,<NN>...] for each change, from the approved discussions `candidates` lists");
  const all = discussions(root);
  const items = opts._.map((text) => planItem(root, text, all));
  const queue = items.map((i) => i.change);
  const twice = queue.find((c, i) => queue.indexOf(c) !== i);
  if (twice) throw new Error(`${twice} is in the plan twice`);
  const at = now();
  const commit = git(root, "rev-parse", "HEAD");
  writeFileAtomic(file, [
    `# Apply-all run ${local(at)}`,
    "",
    `Started: ${at.toISOString()} (${local(at)})`,
    `Rounds: ${rounds}`,
    `Branch: ${branch}`,
    `Commit: ${commit}`,
    queueLine(queue),
    docsLine(Object.fromEntries(items.map((i) => [i.change, i.files]))),
    "",
    `Written by /mflow:apply-all after every step. Steps of each change: ${STEPS.join(", ")}.`,
    "",
    "| Time | Step | Target | State | Note |",
    "|---|---|---|---|---|",
    "",
  ].join("\n"));
  return { file: path.relative(root, file).replaceAll("\\", "/"), rounds, queue, branch, commit };
}

/** A part a proposal split off (its Later changes), built right after the change named by --after. */
function extend(root, text_, opts) {
  const file = runFile(root);
  if (!fs.existsSync(file)) throw new Error("no apply-all run is open");
  const text = readText(file);
  const queue = readQueue(text);
  if (!queue.includes(opts.after)) throw new Error(`--after names a change of this run: ${queue.join(", ")}`);
  const item = planItem(root, text_ ?? "", discussions(root));
  if (queue.includes(item.change)) throw new Error(`${item.change} is already in the plan`);
  queue.splice(queue.indexOf(opts.after) + 1, 0, item.change);
  const docs = { ...readDocs(text), [item.change]: item.files };
  writeFileAtomic(file, text.replace(/^Queue: .*$/m, () => queueLine(queue)).replace(/^Docs: .*$/m, () => docsLine(docs)));
  return { queue };
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

// What may follow the proven commit: only the Markdown a run writes after its tests and review (records, reports,
// the list, STATUS.md, a ticked gate task, a task's note). Never a file that steers an AI, at any depth, because no
// test or review read it. --no-renames lists both sides of a move, so code moved into one of these folders is code.
const WRITTEN_AFTER_REVIEW = /^(?:docs\/reviews\/.*|docs\/status-log|STATUS|openspec\/changes\/archive\/.*|backlog\/tasks\/.*)\.md$/;
const STEERS_AN_AI = /(?:^|\/)(?:\.claude|\.agents|\.codex)\/|(?:^|\/)(?:CLAUDE|AGENTS|GEMINI)\.md$/i;
export const isDocument = (f) => WRITTEN_AFTER_REVIEW.test(f) && !STEERS_AN_AI.test(f);
const onlyDocumentsSince = (root, commit) => {
  const out = git(root, "-c", "core.quotePath=false", "diff", "--no-renames", "--name-only", commit, "HEAD");
  return out !== null && out.split("\n").filter(Boolean).every(isDocument);
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
  if (!NAME.test(change ?? "")) throw new Error("gate: name the change, in lowercase letters, digits and hyphens");
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
    if (cmd === "candidates") return out(candidates(root));
    if (cmd === "start") return out(start(root, opts));
    if (cmd === "extend") return out(extend(root, opts._[0], opts));
    if (cmd === "log") return out(log(root, opts._[0], opts._[1], opts));
    if (cmd === "gate") return out(gate(root, opts._[0]));
    if (cmd === "finish") return out(finish(root, opts));
    if (cmd === "status") {
      const file = runFile(root);
      return out(fs.existsSync(file) ? { ...summary(file), file: path.relative(root, file).replaceAll("\\", "/") } : { open: false });
    }
    throw new Error("usage: apply-all.mjs candidates | start <change>=<NN>[,<NN>...] ... [--rounds <n>] | extend <change>=<NN>[,<NN>...] --after <change> | log <step> <state> --target <change> [--note <text>] | status | gate <change> | finish [--result done|stopped]");
  } catch (err) {
    out({ error: err.message, ...(err.json ?? {}) }, 1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
