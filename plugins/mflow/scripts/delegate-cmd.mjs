#!/usr/bin/env node
// Render the command(s) to run a brief with another AI tool, from the tool registry.
//
//   node delegate-cmd.mjs --mode analyze|review|code --brief <path> --out <path>
//        [--tool <name>|any] [--worktree <dir>]
//
// --tool omitted or "any": commands for every registered tool that supports the mode.
// Unknown tool: known=false, so the caller asks the user for the command and saves it
// under "tools" in .mflow/config.json.
import path from "node:path";
import { findRoot, loadConfig } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const mode = opt("--mode");
const tool = (opt("--tool", "any") || "any").toLowerCase();

if (!["analyze", "review", "code"].includes(mode)) {
  process.stderr.write("--mode must be analyze, review or code\n");
  process.exit(1);
}

const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()) || process.cwd();
// Absolute paths, quoted, so templates work even when a tool changes directory (worktrees).
const abs = (v, ph) => (v ? `"${path.resolve(root, v)}"` : ph);
const vars = {
  brief: abs(opt("--brief"), "<brief>"),
  out: abs(opt("--out"), "<out>"),
  worktree: abs(opt("--worktree"), "<worktree>"),
};
const tools = loadConfig(root).tools;
const fill = (t) => t.replace(/\{(brief|out|worktree)\}/g, (_, k) => vars[k]);

function render(name, def) {
  if (def.manual) return { tool: name, verified: !!def.verified, manual: fill(def.manual), notes: def.notes };
  const m = def[mode];
  if (!m) return { tool: name, supported: false, notes: `${name} has no '${mode}' template` };
  return { tool: name, verified: !!def.verified, bash: m.bash && fill(m.bash), pwsh: m.pwsh && fill(m.pwsh), notes: def.notes };
}

let result;
if (tool === "any") {
  result = {
    mode,
    tool: "any",
    commands: Object.entries(tools).map(([n, d]) => render(n, d)).filter((r) => r.supported !== false),
  };
} else if (tools[tool]) {
  result = { mode, tool, known: true, ...render(tool, tools[tool]) };
} else {
  result = {
    mode,
    tool,
    known: false,
    ask: `No template for '${tool}'. Ask for its non-interactive command (how to pass a prompt from a file, read-only option, how to save output), then add it to .mflow/config.json under tools.${tool}.${mode}.bash / .pwsh using {brief} {out} {worktree}.`,
  };
}
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
