#!/usr/bin/env node
// What could be built next, for Claude to offer after a merge into main or when the user asks what to do next
// (0.61.0): the work a project already planned but has not finished, in one call, read only.
//
//   node next.mjs [--root <dir>]   -> JSON:
//     open      OpenSpec changes proposed and not archived yet, with their tasks done and in all
//     branches  feat/* branches not merged into main (work applied, waiting for its merge)
//     later     the "## Later changes" lines of the proposals, newest change first, with the change and date
//               they came from; "None…" lines, and lines that open with the name of a change that exists
//               (`laterBuilt` counts them), are left out. Whether another was built since is for Claude to
//               judge against `changes`, the names of every change there is
//     agenda    discussion topics not started yet, in the agenda's order
//     changes   every change name, open and archived, so a Later line already built can be recognised
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot } from "./lib.mjs";
import { agenda, NOT_STARTED } from "./discuss.mjs";

const LATER_MAX = 15;
// \b does not see the end of a Thai word, so the end is a space, a mark or the end of the line.
const NONE_RE = /^(none|nothing|no later|ไม่มี)(?=$|[\s.,:;(—-])/i;

/** The bullet lines under a proposal's `## Later changes` heading, up to the next heading. */
export function laterLines(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const at = lines.findIndex((l) => /^##\s+Later changes\b/i.test(l.trim()));
  if (at < 0) return [];
  const out = [];
  for (const line of lines.slice(at + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    // Top-level bullets only: an indented one is a detail of the line above it, not a change of its own.
    const m = /^[-*]\s+(.*\S)\s*$/.exec(line);
    if (!m || NONE_RE.test(m[1])) continue;
    out.push(m[1].length > 300 ? m[1].slice(0, 299) + "…" : m[1]);
  }
  return out;
}

function tasksOf(dir) {
  try {
    const text = fs.readFileSync(path.join(dir, "tasks.md"), "utf8");
    return { done: (text.match(/^\s*[-*]\s+\[[xX]\]/gm) || []).length, all: (text.match(/^\s*[-*]\s+\[[ xX]\]/gm) || []).length };
  } catch {
    return null;
  }
}

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 20_000 });
  return r.status === 0 ? r.stdout : null;
}

export function next(root) {
  const changesDir = path.join(root, "openspec", "changes");
  const dirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; } };
  const openNames = dirs(changesDir).filter((n) => n !== "archive");
  const archived = dirs(path.join(changesDir, "archive")).sort().reverse(); // YYYY-MM-DD-<name>, newest first
  const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };

  const open = openNames.map((name) => ({ name, tasks: tasksOf(path.join(changesDir, name)) }));
  const later = [];
  for (const name of openNames) for (const item of laterLines(read(path.join(changesDir, name, "proposal.md")))) later.push({ item, from: name, archived: null });
  for (const folder of archived) {
    const m = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(folder);
    for (const item of laterLines(read(path.join(changesDir, "archive", folder, "proposal.md")))) {
      later.push({ item, from: m ? m[2] : folder, archived: m ? m[1] : null });
    }
  }

  const main = git(["rev-parse", "--verify", "--quiet", "refs/heads/main"], root) !== null ? "main" : git(["rev-parse", "--verify", "--quiet", "refs/heads/master"], root) !== null ? "master" : null;
  const branches = main
    ? (git(["branch", "--format=%(refname:short)", "--no-merged", main, "--list", "feat/*"], root) || "").split("\n").map((s) => s.trim()).filter(Boolean)
    : [];

  let topics = [];
  try {
    topics = (agenda(root)?.topics || []).filter((t) => t.status === NOT_STARTED).map((t) => t.slug).slice(0, 5);
  } catch { /* no agenda, or one discuss.mjs cannot read: leave it out */ }

  // A Later line that opens with a change's name in backticks (`manage-departments`: …) is built once that change exists.
  const changes = [...openNames, ...archived.map((f) => f.replace(/^\d{4}-\d{2}-\d{2}-/, ""))];
  const notBuilt = later.filter((l) => {
    const named = /^`([a-z0-9][a-z0-9-]*)`/.exec(l.item)?.[1];
    return !(named && changes.includes(named));
  });
  return {
    open,
    branches,
    later: notBuilt.slice(0, LATER_MAX),
    laterTotal: notBuilt.length,
    laterBuilt: later.length - notBuilt.length,
    agenda: topics,
    changes,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--root");
  const start = i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    const root = findRoot(start);
    if (!root) throw new Error("no .mflow/config.json here or above; run /mflow:init first");
    process.stdout.write(JSON.stringify(next(root), null, 2) + "\n");
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
