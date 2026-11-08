#!/usr/bin/env node
// PreToolUse hook on Bash and PowerShell: before a `git commit`, when the project has work that STATUS.md
// does not cover yet (files edited, added, deleted or renamed since STATUS.md was last written, or
// committed during the session without it; lib.mjs unloggedWork), deny the commit once and ask Claude to
// write the entry and put it in that same commit. The entry is written before the reply, never after it:
// until 0.38 a Stop hook asked after the answer, and the reply then ended on STATUS.md, not on the work.
// One deny per commit: a retry at the same HEAD passes, so the hook never loops; and at most one deny per
// `repeatMinutes` (statusGuard in .mflow/config.json, or stopGuard, its name before 0.39).
// Every way of letting the command through is silent; with MFLOW_DEBUG set it names its reason on stderr
// (the tests read it). A guard that crashed would block every shell command, so any error lets it through.
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { readStdinJson, findRoot, loadConfig, run, mtimeMs, sessionStateFile, gitStatus, unloggedWork } from "./lib.mjs";

const RETRY_MS = 10 * 60_000;
// mflow's branches for code only (fixes after a review, a night run's test fixes and E2E tests): their
// documents, STATUS.md among them, are committed on main, so a commit there is never asked for an entry.
export const CODE_ONLY = /^(?:fix\/.+-review|fix\/night-.+|e2e\/night-.+)$/;

/** True when one of the commands in a shell line is `git commit` (after `cd …`, `VAR=x`, `rtk`, `&`). */
export function commitsInCommand(command) {
  for (let segment of String(command).split(/&&|\|\||[;|\n]/)) {
    segment = segment
      .trim()
      .replace(/^[({]\s*/, "")
      .replace(/^(?:[A-Za-z_]\w*=\S*\s+)+/, "")
      .replace(/^(?:&\s*|rtk\s+|command\s+|time\s+)+/, "");
    if (/^git(?:\.exe)?(?:\s+(?:-C|-c|--git-dir|--work-tree)(?:\s+|=)\S+|\s+--[\w-]+(?:=\S+)?)*\s+commit(?=\s|$)/i.test(segment)) return true;
  }
  return false;
}

const pass = (why) => {
  if (process.env.MFLOW_DEBUG) process.stderr.write(`status-guard: ${why}\n`);
  process.exit(0);
};

function main() {
  const input = readStdinJson();
  const command = input?.tool_input?.command;
  if (typeof command !== "string" || !commitsInCommand(command)) pass("not a git commit");

  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || input.cwd);
  if (!root) pass("not an mflow project");
  let guard;
  try {
    guard = loadConfig(root).statusGuard;
  } catch {
    pass("config unreadable"); // the session briefing says so, and a reminder cannot help
  }
  if (!guard.enabled) pass("disabled");

  const stateFile = sessionStateFile(input.session_id);
  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    pass(`no session record at ${stateFile}`); // nothing to compare against
  }
  const statusMtime = mtimeMs(path.join(root, "STATUS.md"));
  if (!statusMtime) pass("no STATUS.md (the briefing asks for one)");

  const branch = run("git rev-parse --abbrev-ref HEAD", root, 8000)?.trim() || "";
  if (CODE_ONLY.test(branch)) pass(`${branch} holds code only; its documents are committed on main`);
  const nowMs = Date.now();
  const head = run("git rev-parse HEAD", root, 8000)?.trim() || "";
  if (state.lastBlockAt && state.blockedHead === head && nowMs - state.lastBlockAt < RETRY_MS) pass("asked once for this commit");
  if (state.lastBlockAt && nowMs - state.lastBlockAt < guard.repeatMinutes * 60_000) pass("asked recently");

  const git = gitStatus(root);
  if (!git) pass("git status unavailable (not a repo, git missing, or it timed out)");
  const { files } = unloggedWork(root, git, { since: statusMtime, head: state.head, baseline: state.dirty });
  if (files.length === 0) pass(`nothing since STATUS.md was written at ${new Date(statusMtime).toISOString()} (${git.entries.length} entries in git status)`);

  state.lastBlockAt = nowMs;
  state.blockedHead = head;
  try { fs.writeFileSync(stateFile, JSON.stringify(state)); } catch { /* best effort */ }

  const sample = files.slice(0, 5).join(", ") + (files.length > 5 ? ", …" : "");
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `mflow: ${files.length} file(s) changed since STATUS.md was last written (${sample}). ` +
          "Before this commit: rewrite the '## Now' section of STATUS.md (focus, next step, blocked on), replacing the current " +
          "block's text rather than adding a new block above the old ones, and add one entry at the top of '## Log' with " +
          "Did / Decided / Next, referencing Backlog task IDs and OpenSpec change names (or bring this session's entry up to " +
          "date if it is already there). Leave the older log entries as they are. Stage STATUS.md with this commit (name it " +
          "too when the commit lists its files) and run the commit again. Say nothing about it in the reply: the reply is " +
          "about the work.",
      },
    }),
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (err) {
    pass(`error: ${err?.message || err}`);
  }
}
