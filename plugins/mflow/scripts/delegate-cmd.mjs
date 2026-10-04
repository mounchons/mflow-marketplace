#!/usr/bin/env node
// Render the command(s) to run a brief with another AI tool, from the tool registry.
//
//   node delegate-cmd.mjs --mode analyze|review|code --brief <path> --out <path, may contain {tool}>
//        [--tool <name>|any] [--worktree <dir>]
//
// --tool omitted or "any": commands for every registered tool that supports the mode.
// {tool} in --out is replaced by each tool's name, so several tools answering one brief
// write separate reports instead of overwriting one file.
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
  worktree: abs(opt("--worktree"), "<worktree>"),
};
const outFor = (name) => abs(opt("--out")?.replaceAll("{tool}", name), "<out>");
let tools;
try {
  tools = loadConfig(root).tools;
} catch (err) {
  process.stderr.write(err.message + "\n");
  process.exit(1);
}
const fill = (t, name) =>
  t.replace(/\{(brief|out|worktree)\}/g, (_, k) => (k === "out" ? outFor(name) : vars[k]));

function render(name, def) {
  if (def.manual) {
    return { tool: name, verified: !!def.verified, out: outFor(name), manual: fill(def.manual, name), notes: def.notes };
  }
  const m = def[mode];
  if (!m) return { tool: name, supported: false, notes: `${name} has no '${mode}' template` };
  return {
    tool: name, verified: !!def.verified, out: outFor(name),
    bash: m.bash && fill(m.bash, name), pwsh: m.pwsh && fill(m.pwsh, name), notes: def.notes,
  };
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
