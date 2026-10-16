#!/usr/bin/env node
// PreToolUse hook on Bash and PowerShell: in an mflow project, deny a Playwright run that could start more
// browsers at once than the project allows (`e2eMaxWorkers` in .mflow/config.json, 2 by default).
// Playwright's default is half the CPU threads; on a 20-thread laptop ten browsers at once crashed the
// graphics driver and restarted the machine twice in a day. A run passes with `--workers=<n>`,
// `--workers <n>` or `-j <n>` within the cap; listing tests (`--list`), help and other subcommands pass.
//
// Only a Playwright command at the start of a command passes through this check (after `cd …`, `VAR=x`,
// `timeout <n>` and the like), so `grep "playwright test" AGENTS.md` is not a run. A package script that
// wraps Playwright, or Microsoft.Playwright under `dotnet test`, is not seen: mflow's skills call
// Playwright directly, and doctor asks for `workers` in the Playwright config for everything else.
//
// Fails open: outside an mflow project, or when the input or the settings cannot be read, the call
// passes. A guard that crashed would otherwise block every shell command.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, loadConfig, readStdinJson } from "./lib.mjs";

/** The Playwright test runs in a shell command, each with the arguments after `test`. */
export function playwrightRuns(command) {
  const runs = [];
  for (let segment of String(command).split(/&&|\|\||[;|\n]/)) {
    segment = segment.trim().replace(/^&\s*/, "");
    // Leading words that only set up the run: env assignments, timeout, time, env, nice.
    for (let before = ""; before !== segment; ) {
      before = segment;
      segment = segment
        .replace(/^[A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'[^']*'|\S*)\s+/, "")
        .replace(/^\$env:[A-Za-z_][A-Za-z0-9_]*\s*=\s*("[^"]*"|'[^']*'|\S+)\s*/i, "")
        .replace(/^(timeout|gtimeout)\s+(-\S+\s+)*\d+[smh]?\s+/, "")
        .replace(/^(time|env|nice|command)\s+/, "");
    }
    const m = /^(?:(?:npx|bunx)(?:\s+(?:--yes|-y))?\s+|(?:pnpm|yarn)\s+(?:exec\s+|dlx\s+)?)?(?:\S*[\\/])?playwright(?:\.cmd)?\s+test\b(.*)$/i.exec(segment);
    if (m) runs.push(m[1]);
  }
  return runs;
}

/** Why this run is refused, or null when it may go. */
export function refusal(args, cap) {
  if (/(^|\s)(--list|--help|-h)(\s|=|$)/.test(args)) return null;
  const m = /(?:^|\s)(?:--workers(?:=|\s+)|-j\s*)(\S+)/.exec(args);
  if (!m) return `This Playwright run sets no --workers, so it would start a browser per two CPU threads (10 on a 20-thread laptop); that many at once has crashed this machine's graphics driver.`;
  const n = Number(m[1].replace(/^["']|["']$/g, ""));
  if (!Number.isInteger(n) || n < 1) return `This Playwright run asks for --workers ${m[1]}; give a whole number of at most ${cap}.`;
  if (n > cap) return `This Playwright run asks for ${n} workers; the project allows at most ${cap} browsers at once.`;
  return null;
}

function main() {
  let input;
  try {
    input = readStdinJson();
  } catch {
    return;
  }
  const command = input?.tool_input?.command;
  if (typeof command !== "string" || !/playwright/i.test(command)) return;
  const runs = playwrightRuns(command);
  if (!runs.length) return;
  let cap;
  try {
    const root = findRoot(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
    if (!root) return;
    cap = loadConfig(root).e2eMaxWorkers;
  } catch {
    return;
  }
  const reason = runs.map((args) => refusal(args, cap)).find(Boolean);
  if (!reason) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `${reason} Run it again with --workers=${Math.min(2, cap)} (the cap is e2eMaxWorkers in .mflow/config.json, ${cap} here), and only when the user called /mflow:e2e or /mflow:test e2e.`,
    },
  }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
  process.exitCode = 0;
}
