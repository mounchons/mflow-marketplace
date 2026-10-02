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
// Claude Code reads .claude/settings*.json only from the folder it was opened in, never from a
// parent, so both files are those of that folder; a session opened below the project root is warned.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, readText, sessionStateFile } from "./lib.mjs";

export const AGENT = "mflow:dev";
export const RULE = `Agent(${AGENT})`;
// Rules that switch the agent off: this one, the older Task(...) spelling, or a deny of every subagent.
const OFF = new Set([RULE, `Task(${AGENT})`, "Agent", "Task"]);

/**
 * The folder Claude Code was opened in. Hooks get CLAUDE_PROJECT_DIR; the Bash tool does not, so the
 * SessionStart hook records it in the session state, found through CLAUDE_CODE_SESSION_ID.
 */
export function projectDir() {
  if (process.env.CLAUDE_PROJECT_DIR) return { dir: path.resolve(process.env.CLAUDE_PROJECT_DIR), known: true };
  const id = process.env.CLAUDE_CODE_SESSION_ID;
  if (id) {
    try {
      const state = JSON.parse(fs.readFileSync(sessionStateFile(id), "utf8"));
      if (state.projectDir) return { dir: path.resolve(state.projectDir), known: true };
    } catch { /* no record: not an mflow session, or an older hook */ }
  }
  // Unknown: assume the project root, the normal place to open Claude Code. The Bash tool's cwd
  // drifts into subfolders during a session, so it says nothing about where the session was opened.
  return { dir: findRoot(process.cwd()) || process.cwd(), known: false };
}

const samePath = (a, b) => {
  const norm = (p) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  return norm(a) === norm(b);
};
const toPosix = (p) => p.replace(/\\/g, "/");

function scopes(dir) {
  const home = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  return [
    { scope: "user", file: path.join(home, "settings.json") },
    { scope: "shared", file: path.join(dir, ".claude", "settings.json") },
    { scope: "local", file: path.join(dir, ".claude", "settings.local.json") },
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

function denials(dir, scopeNames, warnings) {
  const found = [];
  for (const { scope, file } of scopes(dir).filter((s) => scopeNames.includes(s.scope))) {
    try {
      const rules = denyRules(readSettings(file));
      if (rules.length) found.push({ scope, file, rules });
    } catch (err) {
      warnings.push(err.message);
    }
  }
  return found;
}

/** State of the session opened in `dir` (default: the project root). */
export function status(root, dir = root) {
  const warnings = [];
  const deniedBy = denials(dir, ["user", "shared", "local"], warnings);
  const result = { state: deniedBy.length ? "off" : "on", deniedBy, projectDir: dir };
  if (!samePath(dir, root)) {
    const rel = toPosix(path.relative(root, dir)) || dir;
    result.openedBelowRoot = rel;
    warnings.push(`Claude Code was opened in ${rel}, not at the project root: it reads permission rules only from ${rel}/.claude/, so on and off here apply only to sessions opened in ${rel}. Open Claude Code at the project root to switch it for the whole project.`);
    const rootDenied = denials(root, ["shared", "local"], warnings);
    if (rootDenied.length) {
      result.rootDeniedBy = rootDenied;
      warnings.push(`the project root switches it off (${rootDenied.map((d) => d.file).join(", ")}), but that rule does not reach a session opened in ${rel}`);
    }
  }
  result.guidance = guidancePresent(root);
  if (!result.guidance) {
    warnings.push(`openspec/config.yaml has no apply guidance naming ${AGENT}: /opsx:apply will not hand tasks to it even when on (see the mflow manual, projects initialised before 0.16)`);
  }
  result.warnings = warnings;
  return result;
}

function ensureGitignored(root, dir) {
  const file = path.join(root, ".gitignore");
  const rel = toPosix(path.relative(root, dir));
  const entry = (rel && !rel.startsWith("..") ? rel + "/" : "") + ".claude/settings.local.json";
  const text = readText(file) ?? "";
  if (text.split(/\r?\n/).some((l) => l.trim() === entry)) return null;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  fs.writeFileSync(file, text + (text && !text.endsWith("\n") ? eol : "") + entry + eol);
  return entry;
}

/** Add or remove the rule in the settings of the folder Claude Code was opened in. */
export function set(root, on, shared, dir = root) {
  const target = scopes(dir).find((s) => s.scope === (shared ? "shared" : "local"));
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

  let gitignored = null;
  if (changed) {
    fs.mkdirSync(path.dirname(target.file), { recursive: true });
    fs.writeFileSync(target.file, JSON.stringify(settings, null, 2) + "\n");
    if (!shared && !existed) gitignored = ensureGitignored(root, dir);
  }

  const result = { ...status(root, dir), changed, file: toPosix(path.relative(root, target.file)) };
  if (gitignored) result.gitignored = gitignored;
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
  const { dir, known } = projectDir();
  const root = findRoot(dir) || dir;
  try {
    let out;
    if (cmd === "status" || !cmd) out = status(root, dir);
    else if (cmd === "on" || cmd === "off") out = set(root, cmd === "on", shared, dir);
    else throw new Error("usage: apply-subagent.mjs status | on [--shared] | off [--shared]");
    if (!known) {
      out.warnings.push("the folder Claude Code was opened in is unknown (no record from the mflow SessionStart hook in this session): assumed the project root");
    }
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
