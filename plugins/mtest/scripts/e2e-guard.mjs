#!/usr/bin/env node
// PreToolUse hook on Bash and PowerShell: in an mtest project, deny a Playwright run that could start
// more browsers at once than the project allows (`e2eMaxWorkers` in .mtest/config.json, 4 by default).
// Playwright's default is half the CPU threads; on a 20-thread laptop ten browsers at once crashed the
// graphics driver and restarted the machine twice in a day.
//
// A run passes with `--workers=<n>`, `--workers <n>` or `-j <n>` within the cap, or without one when the
// Playwright config it uses sets `workers:` to a number within the cap (a project whose flows share one
// database sets `workers: 1`, and its plain `npx playwright test` must pass). The config is looked for
// in the folder the command `cd`s into, in `--config`/`-c`, in the project root and in the folders of the
// E2E parts of .mtest/config.json. Listing tests (`--list`) and help pass.
//
// Only a Playwright command at the start of a command segment is seen (after `cd …`, `VAR=x`, `timeout`
// and the like), so `grep "playwright test" AGENTS.md` is not a run. A package script that wraps
// Playwright is not seen; run.mjs applies the same cap to the E2E parts it runs.
//
// Fails open: outside an mtest project, or when the input or the settings cannot be read, the call
// passes. A guard that crashed would otherwise block every shell command.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, loadConfig, readStdinJson } from "./lib.mjs";
import { configWorkers, workersArg, workersInConfig } from "./run.mjs";

const unquote = (s) => s.replace(/^["']|["']$/g, "");

/** The Playwright test runs in a shell command: the arguments after `test`, and the folder it runs in. */
export function playwrightRuns(command, cwd) {
  const runs = [];
  let dir = cwd;
  for (let segment of String(command).split(/&&|\|\||[;|\n]/)) {
    segment = segment.trim().replace(/^&\s*/, "");
    const cd = /^(?:cd|pushd|Set-Location|sl)\s+(?:-Path\s+)?("[^"]+"|'[^']+'|\S+)\s*$/i.exec(segment);
    if (cd) {
      dir = path.resolve(dir, unquote(cd[1]));
      continue;
    }
    for (let before = ""; before !== segment; ) {
      before = segment;
      segment = segment
        .replace(/^[A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'[^']*'|\S*)\s+/, "")
        .replace(/^\$env:[A-Za-z_][A-Za-z0-9_]*\s*=\s*("[^"]*"|'[^']*'|\S+)\s*/i, "")
        .replace(/^(timeout|gtimeout)\s+(-\S+\s+)*\d+[smh]?\s+/, "")
        .replace(/^(time|env|nice|command)\s+/, "");
    }
    const m = /^(?:(?:npx|bunx|pnpm|yarn|npm)\b(?:\s+\S+)*?\s+)?(?:\S*[\\/])?playwright(?:\.cmd)?\s+test\b(.*)$/i.exec(segment);
    if (m) runs.push({ args: m[1], dir });
  }
  return runs;
}

/** The `workers:` of the config a run uses, or null when no config sets a plain number. */
function workersFromConfig(run, root, cfg) {
  const c = /(?:^|\s)(?:--config(?:=|\s+)|-c\s+)("[^"]+"|'[^']+'|\S+)/.exec(run.args);
  if (c) {
    const file = path.resolve(run.dir, unquote(c[1]));
    try {
      return workersInConfig(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }
  const dirs = [run.dir, root, ...cfg.parts.filter((p) => p.kind === "e2e").map((p) => path.join(root, p.cwd ?? "."))];
  for (const d of dirs) {
    const n = configWorkers(d);
    if (n !== null) return n;
  }
  return null;
}

/** Why this run is refused, or null when it may go. */
export function refusal(run, cap, fromConfig) {
  if (/(^|\s)(--list|--help|-h)(\s|=|$)/.test(run.args)) return null;
  const asked = workersArg(run.args);
  if (Number.isNaN(asked)) return `This Playwright run asks for a --workers value that is not a whole number; give one of at most ${cap}.`;
  if (asked !== null) return asked > cap ? `This Playwright run asks for ${asked} workers; the project allows at most ${cap} browsers at once.` : null;
  if (fromConfig !== null && fromConfig <= cap) return null;
  if (fromConfig !== null) return `The Playwright config sets workers: ${fromConfig}, above the project's cap of ${cap} browsers at once.`;
  return "This Playwright run sets no --workers and its config sets no plain number, so it would start a browser per two CPU threads (10 on a 20-thread laptop); that many at once has crashed a laptop's graphics driver.";
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
  let root;
  let cfg;
  try {
    root = findRoot(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
    if (!root) return;
    cfg = loadConfig(root);
  } catch {
    return;
  }
  const runs = playwrightRuns(command, input.cwd || root);
  if (!runs.length) return;
  const cap = cfg.e2eMaxWorkers;
  const reason = runs.map((r) => refusal(r, cap, workersFromConfig(r, root, cfg))).find(Boolean);
  if (!reason) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `${reason} Run it again with --workers=${cap} or fewer (the cap is e2eMaxWorkers in .mtest/config.json), and only when the user called /mtest:e2e or /mtest:test e2e.`,
    },
  }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
  process.exitCode = 0;
}
