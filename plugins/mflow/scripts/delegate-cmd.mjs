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

const fail = (msg) => { process.stderr.write(msg + "\n"); process.exit(1); };
if (!["analyze", "review", "code"].includes(mode)) fail("--mode must be analyze, review or code");
if (!opt("--brief") || !opt("--out")) fail("--brief <path> and --out <path> are both needed");
if (mode === "code" && !opt("--worktree")) fail("--mode code needs --worktree <dir>");

const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()) || process.cwd();
let tools;
try {
  tools = loadConfig(root).tools;
} catch (err) {
  fail(err.message);
}

// Absolute paths, so templates work even when a tool changes directory (worktrees), quoted by each
// shell's own rule. Single quotes keep $, backticks and spaces literal in both Bash and PowerShell,
// where double quotes would expand $name, `cmd` or $(cmd). Bash cannot escape a quote inside single
// quotes, so it closes, adds "'" and reopens; PowerShell doubles it, and also reads the curly quotes
// U+2018 to U+201B as single quotes.
const PWSH_QUOTES = new RegExp(`['${String.fromCharCode(0x2018, 0x2019, 0x201a, 0x201b)}]`, "g");
const QUOTE = {
  bash: (s) => `'${s.replaceAll("'", `'"'"'`)}'`,
  pwsh: (s) => `'${s.replace(PWSH_QUOTES, (q) => q + q)}'`,
  plain: (s) => s, // instructions a person follows, never run by a shell
};
const pathsFor = (name) => ({
  brief: path.resolve(root, opt("--brief")),
  out: path.resolve(root, opt("--out").replaceAll("{tool}", name)),
  worktree: opt("--worktree") ? path.resolve(root, opt("--worktree")) : null,
});
const fill = (t, name, shell) =>
  t.replace(/\{(brief|out|worktree)\}/g, (m, k) => (pathsFor(name)[k] === null ? m : QUOTE[shell](pathsFor(name)[k])));

function render(name, def) {
  const out = pathsFor(name).out;
  if (def.manual) {
    return { tool: name, verified: !!def.verified, out, manual: fill(def.manual, name, "plain"), notes: def.notes };
  }
  const m = def[mode];
  if (!m) return { tool: name, supported: false, notes: `${name} has no '${mode}' template` };
  return {
    tool: name, verified: !!def.verified, out,
    bash: m.bash && fill(m.bash, name, "bash"), pwsh: m.pwsh && fill(m.pwsh, name, "pwsh"), notes: def.notes,
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
