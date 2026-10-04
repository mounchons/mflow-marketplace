#!/usr/bin/env node
// Stop hook (fires each time Claude finishes a turn).
// If files changed since STATUS.md was last written, ask Claude to write the handoff entry. Changed means
// edited, added, deleted or renamed, or committed during the session (SessionStart records the commit and
// the uncommitted changes it started from).
// Throttled: not in the first `graceMinutes` of a session, then at most once per `repeatMinutes`.
// Never loops: respects stop_hook_active.
import fs from "node:fs";
import path from "node:path";
import { readStdinJson, findRoot, loadConfig, run, mtimeMs, sessionStateFile, gitStatus } from "./lib.mjs";

const input = readStdinJson();
if (input.stop_hook_active) process.exit(0);

const root = findRoot(process.env.CLAUDE_PROJECT_DIR || input.cwd);
if (!root) process.exit(0);
let guard;
try {
  guard = loadConfig(root).stopGuard;
} catch {
  process.exit(0); // config.json is broken: the session briefing says so, and a reminder cannot help
}
if (!guard.enabled) process.exit(0);

const stateFile = sessionStateFile(input.session_id);
let state;
try {
  state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
} catch {
  process.exit(0); // no SessionStart record: nothing to compare against
}
const nowMs = Date.now();
if (nowMs - state.startedAt < guard.graceMinutes * 60_000) process.exit(0);
if (state.lastBlockAt && nowMs - state.lastBlockAt < guard.repeatMinutes * 60_000) process.exit(0);
const statusMtime = mtimeMs(path.join(root, "STATUS.md"));
const since = Math.max(state.startedAt, statusMtime);

// Paths are limited to this project (`-- .`), which may sit below the git top level in a monorepo.
const git = gitStatus(root);
if (!git) process.exit(0); // not a git repo, or git missing

const ignored = (p) =>
  p === "STATUS.md" || p.startsWith(".mflow/") || p.startsWith(".claude/") || p.startsWith(".agents/");
const changed = new Set();

// Uncommitted: an edit since `since` shows in the file's mtime. A deleted file has none, and a renamed
// one keeps its old mtime, so those count when the session did not start with them. A record from an
// older mflow has no baseline: they count then, which can ask once too often but never misses one.
const baseline = new Set(state.dirty || []);
for (const e of git.entries) {
  if (ignored(e.rel)) continue;
  if (mtimeMs(e.abs) > since || (/[DRC]/.test(e.code) && !baseline.has(e.key))) changed.add(e.rel);
}

// Committed during the session: they leave `git status`. Commit times have whole seconds, so a commit
// in the same second as `since` counts.
const head = /^[0-9a-f]{40,64}$/.test(state.head || "") && run("git rev-parse HEAD", root, 8000)?.trim();
if (head && head !== state.head) {
  const committedAt = Number(run("git log -1 --format=%ct", root, 8000)?.trim()) || 0;
  if (committedAt >= Math.floor(since / 1000)) {
    const names = run(`git -c core.quotePath=false diff --name-only -z ${state.head} HEAD -- .`, root, 8000) || "";
    for (const p of names.split("\0").filter(Boolean)) {
      const rel = path.relative(root, path.join(git.top, p)).split(path.sep).join("/");
      if (!ignored(rel)) changed.add(rel);
    }
  }
}

const changedThisSession = [...changed];
if (changedThisSession.length === 0) process.exit(0);

state.lastBlockAt = nowMs;
try { fs.writeFileSync(stateFile, JSON.stringify(state)); } catch { /* best effort */ }

const sample = changedThisSession.slice(0, 5).join(", ") + (changedThisSession.length > 5 ? ", …" : "");
process.stdout.write(
  JSON.stringify({
    decision: "block",
    reason:
      `mflow: ${changedThisSession.length} file(s) changed since STATUS.md was last updated (${sample}). ` +
      "Before stopping: rewrite the '## Now' section of STATUS.md (focus, next step, blocked on) and add one entry " +
      "at the top of '## Log' with Did / Decided / Next, referencing Backlog task IDs and OpenSpec change names. " +
      "Keep the log to the newest 10 entries; fold older ones into one summary line. Then stop.",
  }),
);
