#!/usr/bin/env node
// Stop hook (fires each time Claude finishes a turn).
// If files changed since STATUS.md was last written, ask Claude to write the handoff entry.
// Throttled: not in the first `graceMinutes` of a session, then at most once per `repeatMinutes`.
// Never loops: respects stop_hook_active.
import fs from "node:fs";
import path from "node:path";
import { readStdinJson, findRoot, loadConfig, run, mtimeMs, sessionStateFile } from "./lib.mjs";

const input = readStdinJson();
if (input.stop_hook_active) process.exit(0);

const root = findRoot(process.env.CLAUDE_PROJECT_DIR || input.cwd);
if (!root) process.exit(0);
const guard = loadConfig(root).stopGuard;
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

// Porcelain paths are relative to the git top level, which sits above `root` when .mflow lives in a
// monorepo subfolder; `-- .` limits the list to this project. core.quotePath=false keeps Thai file
// names as text instead of octal escapes.
const top = run("git rev-parse --show-toplevel", root, 8000)?.trim();
const porcelain = top && run("git -c core.quotePath=false status --porcelain -uall -- .", root, 8000);
if (!porcelain) process.exit(0); // not a git repo, git missing, or nothing changed

const ignored = (p) =>
  p === "STATUS.md" || p.startsWith(".mflow/") || p.startsWith(".claude/") || p.startsWith(".agents/");

const changedThisSession = porcelain
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    let p = line.slice(3).trim();
    if (p.includes(" -> ")) p = p.split(" -> ")[1];
    const abs = path.join(top, p.replace(/^"|"$/g, ""));
    return { abs, rel: path.relative(root, abs).split(path.sep).join("/") };
  })
  .filter((f) => !ignored(f.rel))
  .filter((f) => mtimeMs(f.abs) > since)
  .map((f) => f.rel);

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
