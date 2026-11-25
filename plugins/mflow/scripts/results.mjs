#!/usr/bin/env node
// What a test, review or E2E run by another tool left uncommitted, and the command that has Claude Code
// commit it. Codex's and Antigravity's sandboxes keep .git read-only (checked 2026-11-25 with codex-cli 0.172
// and agy 1.5.16 on Windows: `index.lock: Permission denied`), so their runs of $mflow-test, $mflow-review and
// $mflow-e2e write the record and cannot commit it. The command runs Claude Code headless on Sonnet with only
// git status, diff, log, add and commit allowed; it has to run outside the tool's sandbox, which Codex asks
// the user to approve. Claude Code's session briefing lists the same files as a last check.
//
//   node results.mjs uncommitted                                   files under docs/reviews/ and STATUS.md git shows as changed
//   node results.mjs command --tool <codex|antigravity|opencode> --kind <test|review|e2e>
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot } from "./lib.mjs";

export const KINDS = ["test", "review", "e2e"];
export const TOOLS = ["codex", "antigravity", "opencode"];
// What a run writes: its record or report, the review list, STATUS.md; an E2E run also its test files.
const RESULT = /^(docs\/reviews\/.+|STATUS\.md)$/;
export const ALLOWED = ["Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git add:*)", "Bash(git commit:*)"];

/** The changed or new files a run of another tool leaves: path, git status code, and the tool its record names. */
export function uncommitted(root) {
  const r = spawnSync("git", ["-c", "core.quotePath=false", "status", "--porcelain=v1", "-z", "-uall", "--", "docs/reviews", "STATUS.md"], { cwd: root, encoding: "utf8", timeout: 15_000 });
  if (r.status !== 0) return [];
  const out = [];
  for (const item of (r.stdout || "").split("\0")) {
    if (item.length < 4) continue;
    const file = item.slice(3);
    if (!RESULT.test(file)) continue;
    let by = null;
    if (/^docs\/reviews\/(tests|code)\/[^/]+\.md$/.test(file)) {
      try {
        const head = fs.readFileSync(path.join(root, file), "utf8").slice(0, 2000);
        by = (/^(?:By|Reviewer):\s*([a-z]+)/im.exec(head)?.[1] || null)?.toLowerCase() || null;
      } catch { /* deleted or unreadable */ }
    }
    out.push({ file, status: item.slice(0, 2).trim() || "?", by });
  }
  return out;
}

/** The prompt and the command line (the same text in PowerShell and sh) that has Claude Code on Sonnet commit a run's files. */
export function command({ tool, kind }) {
  if (!TOOLS.includes(tool)) throw new Error(`--tool must be one of ${TOOLS.join(", ")}`);
  if (!KINDS.includes(kind)) throw new Error(`--kind must be one of ${KINDS.join(", ")}`);
  const what = kind === "e2e" ? "the E2E test files it changed and the files under docs/reviews/ and STATUS.md" : "the files under docs/reviews/ and STATUS.md";
  // No backticks, dollar signs or double quotes: the same text has to pass through PowerShell and sh unchanged.
  const prompt =
    `Commit what the ${tool} ${kind} run left uncommitted in this folder: ${what} that git status shows as changed or new, ` +
    "each added by name and never with git add -A, in one commit whose message names the run, its record or report file and its result. " +
    "Leave every other file as it is, and do not push. Reply with the commit hash and the files committed.";
  const line = `claude -p "${prompt}" --model sonnet --allowedTools ${ALLOWED.map((a) => `"${a}"`).join(" ")}`;
  return {
    tool,
    kind,
    prompt,
    command: line,
    where: "Run it from the repository root, outside the tool's sandbox (Codex asks the user to approve that).",
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()) || process.cwd();
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (flag) => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    let out;
    if (cmd === "uncommitted") out = { files: uncommitted(root) };
    else if (cmd === "command") out = command({ tool: opt("--tool"), kind: opt("--kind") });
    else throw new Error("usage: results.mjs uncommitted | command --tool <codex|antigravity|opencode> --kind <test|review|e2e>");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
