#!/usr/bin/env node
// Switch the apply subagent (mflow:dev) on or off for this project.
// Off = a Claude Code permission rule denying Agent(mflow:dev); the apply guidance in
// openspec/config.yaml then tells Claude to implement the tasks itself. No OpenSpec file changes.
//
//   node apply-subagent.mjs status
//   node apply-subagent.mjs on  [--shared]   -> remove the deny rule
//   node apply-subagent.mjs off [--shared]   -> add the deny rule
//
// Default scope is .claude/settings.local.json (this machine only); --shared writes
// .claude/settings.json (committed, the whole team). status also reads ~/.claude/settings.json.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, readText } from "./lib.mjs";

export const AGENT = "mflow:dev";
export const RULE = `Agent(${AGENT})`;
// Rules that switch the agent off: this one, the older Task(...) spelling, or a deny of every subagent.
const OFF = new Set([RULE, `Task(${AGENT})`, "Agent", "Task"]);

function scopes(root) {
  const home = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  return [
    { scope: "user", file: path.join(home, "settings.json") },
    { scope: "shared", file: path.join(root, ".claude", "settings.json") },
    { scope: "local", file: path.join(root, ".claude", "settings.local.json") },
  ];
}

/** Parsed settings, {} when the file is missing; throws when it exists but is not valid JSON. */
function readSettings(file) {
  const text = readText(file);
  if (text === null || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${file} is not valid JSON; fix it by hand, nothing was written`);
  }
}

function denyRules(settings) {
  const deny = settings?.permissions?.deny;
  return Array.isArray(deny) ? deny.filter((r) => OFF.has(String(r).trim())) : [];
}

function guidancePresent(root) {
  for (const name of ["config.yaml", "config.yml"]) {
    const text = readText(path.join(root, "openspec", name));
    if (text !== null) return text.includes(AGENT);
  }
  return false;
}

export function status(root) {
  const deniedBy = [];
  const warnings = [];
  for (const { scope, file } of scopes(root)) {
    try {
      const rules = denyRules(readSettings(file));
      if (rules.length) deniedBy.push({ scope, file, rules });
    } catch (err) {
      warnings.push(err.message);
    }
  }
  const guidance = guidancePresent(root);
  if (!guidance) {
    warnings.push(`openspec/config.yaml has no apply guidance naming ${AGENT}: /opsx:apply will not hand tasks to it even when on (see the mflow manual, projects initialised before 0.16)`);
  }
  return { state: deniedBy.length ? "off" : "on", deniedBy, guidance, warnings };
}

function ensureGitignored(root) {
  const file = path.join(root, ".gitignore");
  const entry = ".claude/settings.local.json";
  const text = readText(file) ?? "";
  if (text.split(/\r?\n/).some((l) => l.trim() === entry)) return false;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  fs.writeFileSync(file, text + (text && !text.endsWith("\n") ? eol : "") + entry + eol);
  return true;
}

export function set(root, on, shared) {
  const target = scopes(root).find((s) => s.scope === (shared ? "shared" : "local"));
  const existed = fs.existsSync(target.file);
  const settings = readSettings(target.file);
  const deny = Array.isArray(settings.permissions?.deny) ? settings.permissions.deny : [];
  let changed = false;

  if (on) {
    const kept = deny.filter((r) => String(r).trim() !== RULE && String(r).trim() !== `Task(${AGENT})`);
    if (kept.length !== deny.length) {
      changed = true;
      if (kept.length) settings.permissions.deny = kept;
      else delete settings.permissions.deny;
      if (settings.permissions && !Object.keys(settings.permissions).length) delete settings.permissions;
    }
  } else if (!deny.some((r) => String(r).trim() === RULE)) {
    changed = true;
    settings.permissions = { ...(settings.permissions || {}), deny: [...deny, RULE] };
  }

  let gitignored = false;
  if (changed) {
    fs.mkdirSync(path.dirname(target.file), { recursive: true });
    fs.writeFileSync(target.file, JSON.stringify(settings, null, 2) + "\n");
    if (!shared && !existed) gitignored = ensureGitignored(root);
  }

  const result = { ...status(root), changed, file: path.relative(root, target.file).replace(/\\/g, "/") };
  if (gitignored) result.gitignored = ".claude/settings.local.json";
  if (on && result.state === "off") {
    const fix = { shared: "run `on --shared`", local: "run `on`", user: "remove it by hand (applies to every project)" };
    for (const d of result.deniedBy) {
      const only = d.rules.every((r) => r === RULE || r === `Task(${AGENT})`);
      result.warnings.push(`still off: ${d.file} denies ${d.rules.join(", ")}; ${only ? fix[d.scope] : "it blocks every subagent; remove it by hand"}`);
    }
  }
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const cmd = args.find((a) => !a.startsWith("--"));
  const shared = args.includes("--shared");
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()) || process.cwd();
  try {
    let out;
    if (cmd === "status" || !cmd) out = status(root);
    else if (cmd === "on" || cmd === "off") out = set(root, cmd === "on", shared);
    else throw new Error("usage: apply-subagent.mjs status | on [--shared] | off [--shared]");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
