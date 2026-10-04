#!/usr/bin/env node
// Switch the apply subagent (mflow:dev) on or off. It is OFF until switched on.
// State lives in .mflow/, at the project root, so it holds wherever Claude Code is opened:
//   .mflow/local.json   {"applySubagent": {"enabled": true|false}}   this machine, gitignored (default)
//   .mflow/config.json  same key                                       the whole team (--shared)
// The local value wins over the shared one; neither set = off. The PreToolUse hook
// (subagent-guard.mjs) denies Agent(mflow:dev) whenever it is off, and the SessionStart briefing
// tells Claude when it is on, which is what the apply guidance in openspec/config.yaml reads.
//
//   node apply-subagent.mjs status
//   node apply-subagent.mjs on  [--shared]
//   node apply-subagent.mjs off [--shared]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, readJsonFile, readText, sessionStateFile, writeFileAtomic, MARKER } from "./lib.mjs";

export const AGENT = "mflow:dev";
export const LOCAL = path.join(".mflow", "local.json");
// Claude Code permission rules that block the agent whatever mflow says: this one, the older
// Task(...) spelling, or a deny of every subagent.
const BLOCKING = new Set([`Agent(${AGENT})`, `Task(${AGENT})`, "Agent", "Task"]);

const toPosix = (p) => p.replace(/\\/g, "/");

/**
 * Parsed JSON object, {} when the file is missing. Throws when it exists but cannot be read, is not
 * a JSON object, or is empty (unless `allowEmpty`), so the guard denies instead of reading it as off.
 */
function readJson(file, opts) {
  try {
    return readJsonFile(file, opts) ?? {};
  } catch (err) {
    throw new Error(`${err.message}; fix it by hand, nothing was written`);
  }
}

function flag(json) {
  const v = json?.applySubagent?.enabled;
  return typeof v === "boolean" ? v : undefined;
}

/** On or off for this project, and which file decided it. Throws on an unreadable file. */
export function resolve(root) {
  const local = flag(readJson(path.join(root, LOCAL)));
  if (local !== undefined) return { enabled: local, source: "local" };
  const shared = flag(readJson(path.join(root, MARKER)));
  if (shared !== undefined) return { enabled: shared, source: "shared" };
  return { enabled: false, source: "default" };
}

/**
 * The folder Claude Code was opened in, for the permission-rule check only: Claude Code reads
 * .claude/settings*.json from that folder. Hooks get CLAUDE_PROJECT_DIR; the Bash tool does not,
 * so the SessionStart hook records it in the session state, found through CLAUDE_CODE_SESSION_ID.
 */
export function projectDir(root) {
  if (process.env.CLAUDE_PROJECT_DIR) return path.resolve(process.env.CLAUDE_PROJECT_DIR);
  const id = process.env.CLAUDE_CODE_SESSION_ID;
  if (id) {
    try {
      const state = JSON.parse(fs.readFileSync(sessionStateFile(id), "utf8"));
      if (state.projectDir) return path.resolve(state.projectDir);
    } catch { /* no record */ }
  }
  return root;
}

/** Permission rules in the user's and the opened folder's settings that block the agent. */
function blockingRules(dir, warnings) {
  const home = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const files = [
    path.join(home, "settings.json"),
    path.join(dir, ".claude", "settings.json"),
    path.join(dir, ".claude", "settings.local.json"),
  ];
  const found = [];
  for (const file of files) {
    try {
      // Not mflow files: an empty settings file just holds no rules.
      const deny = readJson(file, { allowEmpty: true })?.permissions?.deny;
      const rules = Array.isArray(deny) ? deny.filter((r) => BLOCKING.has(String(r).trim())) : [];
      if (rules.length) found.push({ file, rules });
    } catch (err) {
      warnings.push(err.message);
    }
  }
  return found;
}

function guidancePresent(root) {
  for (const name of ["config.yaml", "config.yml"]) {
    const text = readText(path.join(root, "openspec", name));
    if (text !== null) return text.includes(AGENT);
  }
  return false;
}

export function status(root, dir = root) {
  const warnings = [];
  const { enabled, source } = resolve(root);
  // state is what the session gets; switchedOn is what the project asked for.
  const result = { state: enabled ? "on" : "off", source, switchedOn: enabled };
  const blockedBy = blockingRules(dir, warnings);
  if (blockedBy.length) {
    result.blockedBy = blockedBy;
    if (enabled) {
      result.state = "off";
      warnings.push(`switched on, but a Claude Code permission rule blocks ${AGENT}: ${blockedBy.map((b) => `${b.file} (${b.rules.join(", ")})`).join("; ")}. Remove it by hand.`);
    }
  }
  result.guidance = guidancePresent(root);
  if (enabled && !result.guidance) {
    warnings.push(`openspec/config.yaml has no apply guidance naming ${AGENT}: /opsx:apply will not hand tasks to it (see the mflow manual, projects initialised before 0.16)`);
  }
  result.warnings = warnings;
  return result;
}

function ensureGitignored(root, entry) {
  const file = path.join(root, ".gitignore");
  const text = readText(file) ?? "";
  if (text.split(/\r?\n/).some((l) => l.trim() === entry)) return null;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  fs.writeFileSync(file, text + (text && !text.endsWith("\n") ? eol : "") + entry + eol);
  return entry;
}

export function set(root, on, shared, dir = root) {
  const file = path.join(root, shared ? MARKER : LOCAL);
  const existed = fs.existsSync(file);
  // An empty file has nothing to keep, so it is written over; any other unreadable file stops here.
  const json = readJson(file, { allowEmpty: true });
  let changed = false;
  if (flag(json) !== on) {
    json.applySubagent = { ...(json.applySubagent || {}), enabled: on };
    writeFileAtomic(file, JSON.stringify(json, null, 2) + "\n");
    changed = true;
  }
  const gitignored = !shared && !existed ? ensureGitignored(root, toPosix(LOCAL)) : null;

  const result = { ...status(root, dir), changed, file: toPosix(path.relative(root, file)) };
  if (gitignored) result.gitignored = gitignored;
  if (shared && result.source === "local") {
    result.warnings.push(`${toPosix(LOCAL)} on this machine still says ${result.state}; it overrides the team setting here. Run without --shared to change it.`);
  }
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const cmd = args.find((a) => !a.startsWith("--"));
  const shared = args.includes("--shared");
  try {
    const start = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const root = findRoot(start);
    if (!root) throw new Error("not an mflow project (no .mflow/config.json here or above): run /mflow:init first");
    const dir = projectDir(root);
    let out;
    if (cmd === "status" || !cmd) out = status(root, dir);
    else if (cmd === "on" || cmd === "off") out = set(root, cmd === "on", shared, dir);
    else throw new Error("usage: apply-subagent.mjs status | on [--shared] | off [--shared]");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
