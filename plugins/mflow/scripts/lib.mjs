// Shared helpers for mflow scripts. Node >= 18, no dependencies, cross-platform.
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const MARKER = path.join(".mflow", "config.json");

/** Read all of stdin (hook input JSON). Returns {} when empty or invalid. */
export function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Walk up from `start` until a folder containing .mflow/config.json is found. */
export function findRoot(start) {
  let dir = path.resolve(start || process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(dir, MARKER))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Command templates for other AI tools, per mode and shell.
 * Placeholders: {brief} brief file, {out} report file, {worktree} worktree dir.
 * Projects override or add tools under "tools" in .mflow/config.json.
 * `verified` = checked against the tool's documentation when this plugin version was written;
 * flags change between releases, so unverified entries tell the user to check --help.
 */
// $OutputEncoding: text piped INTO a native command. [Console]::OutputEncoding: how PowerShell decodes
// a native command's OUTPUT. Both must be UTF-8, or Thai text becomes '?' or mojibake (PS 5.1 and 7).
const PWSH_UTF8 = "$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); ";
// The brief travels by stdin or as an attached file, never as a command-line argument:
// PS 5.1 strips embedded quotes from arguments, and npm .cmd shims cut them at the first newline.
// Plain ASCII without quotes or $ so the same text is safe in bash and PowerShell.
const ASK = "\"Follow the mflow brief provided with this message. Your final message is the report in the format of its Output section.\"";
export const DEFAULT_TOOLS = {
  codex: {
    verified: true,
    notes: "Checked against codex-cli 0.156.1. Read-only sandbox for analyze/review; -o saves the final message. Code mode uses the workspace-write sandbox (--full-auto no longer exists); steps that need network, such as a NuGet restore, may be blocked, see --approve-for-me in `codex exec --help`. Interactive: run `codex`, then ask it to read the brief.",
    analyze: {
      bash: "codex exec -s read-only -o {out} - < {brief}",
      pwsh: PWSH_UTF8 + "Get-Content {brief} -Raw -Encoding utf8 | codex exec -s read-only -o {out} -",
    },
    review: {
      bash: "codex exec -s read-only -o {out} - < {brief}",
      pwsh: PWSH_UTF8 + "Get-Content {brief} -Raw -Encoding utf8 | codex exec -s read-only -o {out} -",
    },
    code: {
      bash: "codex exec -s workspace-write -C {worktree} -o {out} - < {brief}",
      pwsh: PWSH_UTF8 + "Get-Content {brief} -Raw -Encoding utf8 | codex exec -s workspace-write -C {worktree} -o {out} -",
    },
  },
  opencode: {
    verified: false,
    notes: "Not run against a real install. Uses `opencode run` with the brief attached by -f (flags from the online CLI docs); the `plan` agent is meant for read-only work. Check `opencode run --help` for your version.",
    analyze: {
      bash: `opencode run --agent plan ${ASK} -f {brief} > {out}`,
      pwsh: PWSH_UTF8 + `opencode run --agent plan ${ASK} -f {brief} | Out-File -Encoding utf8 {out}`,
    },
    review: {
      bash: `opencode run --agent plan ${ASK} -f {brief} > {out}`,
      pwsh: PWSH_UTF8 + `opencode run --agent plan ${ASK} -f {brief} | Out-File -Encoding utf8 {out}`,
    },
    code: {
      bash: `cd {worktree} && opencode run ${ASK} -f {brief} > {out}`,
      pwsh: PWSH_UTF8 + `Push-Location {worktree}; opencode run ${ASK} -f {brief} | Out-File -Encoding utf8 {out}; Pop-Location`,
    },
  },
  gemini: {
    verified: false,
    notes: "Checked against gemini-cli 0.19.1 source, not run end to end: piped stdin is prepended to the -p prompt. -p is marked deprecated, but the positional prompt fails with piped stdin when gemini's sandbox is on. Check `gemini --help` for sandbox/approval flags before code mode.",
    analyze: {
      bash: `gemini -p ${ASK} < {brief} > {out}`,
      pwsh: PWSH_UTF8 + `Get-Content {brief} -Raw -Encoding utf8 | gemini -p ${ASK} | Out-File -Encoding utf8 {out}`,
    },
    review: {
      bash: `gemini -p ${ASK} < {brief} > {out}`,
      pwsh: PWSH_UTF8 + `Get-Content {brief} -Raw -Encoding utf8 | gemini -p ${ASK} | Out-File -Encoding utf8 {out}`,
    },
  },
  chat: {
    verified: true,
    notes: "Any chat UI without repo access (ChatGPT, Gemini web, Claude.ai).",
    manual:
      "Paste the brief, attach the files listed under 'Attach these files' (or the context pack), then save the answer as {out}.",
  },
};

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Project settings: .mflow/config.json over the defaults, or the defaults alone when the file is
 * missing or empty. Throws when it exists but cannot be read, is not valid JSON, or a setting has the
 * wrong type: every folder could then be wrong, so callers stop or say so instead of guessing.
 */
export function loadConfig(root) {
  const defaults = {
    version: 1,
    hotspotsDir: "docs/hotspots",
    sourceDir: "docs/source",
    inboxDir: "docs/ai-inbox",
    discussDir: "docs/discuss",
    statusLogEntriesInContext: 2,
    stopGuard: { enabled: true, graceMinutes: 10, repeatMinutes: 30 },
    // The apply subagent (mflow:dev) is off until switched on; .mflow/local.json overrides per machine.
    applySubagent: { enabled: false },
  };
  const label = MARKER.split(path.sep).join("/");
  const stop = (what) => new Error(`${what}; fix it by hand, mflow stops until it does`);
  let user;
  try {
    user = readJsonFile(path.join(root, MARKER), { allowEmpty: true, label }) ?? {};
  } catch (err) {
    throw stop(err.message);
  }
  const wrong = (key, want) => { throw stop(`${label}: "${key}" must be ${want}`); };
  for (const key of ["hotspotsDir", "sourceDir", "inboxDir", "discussDir"]) {
    if (key in user && (typeof user[key] !== "string" || !user[key].trim())) wrong(key, "a folder path");
  }
  if ("statusLogEntriesInContext" in user && !Number.isInteger(user.statusLogEntriesInContext)) {
    wrong("statusLogEntriesInContext", "a whole number");
  }
  if ("stopGuard" in user && typeof user.stopGuard !== "boolean" && !isObject(user.stopGuard)) {
    wrong("stopGuard", "true, false or an object");
  }
  for (const key of ["applySubagent", "tools"]) if (key in user && !isObject(user[key])) wrong(key, "an object");
  const sg = typeof user.stopGuard === "boolean" ? { enabled: user.stopGuard } : user.stopGuard || {};
  return {
    ...defaults,
    ...user,
    stopGuard: { ...defaults.stopGuard, ...sg },
    applySubagent: { ...defaults.applySubagent, ...(user.applySubagent || {}) },
    tools: { ...DEFAULT_TOOLS, ...(user.tools || {}) },
  };
}

/** Run a shell command; return stdout string or null on any failure. Never throws. */
export function run(cmd, cwd, timeout = 8000) {
  try {
    return execSync(cmd, {
      cwd,
      timeout,
      shell: true,
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, OPENSPEC_TELEMETRY: "0", NO_COLOR: "1", FORCE_COLOR: "0" },
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

export function runJson(cmd, cwd, timeout) {
  const out = run(cmd, cwd, timeout);
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

export function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * Text of a file, null when it does not exist. Unlike readText, any other failure throws, so a file
 * that exists but cannot be read never passes for a missing one. A UTF-8 BOM, which Windows Notepad
 * adds, is dropped. `label` names the file in messages (default: its path).
 */
export function readTextFile(file, label = file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`${label} could not be read (${err.code || err.message})`);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** One JSON object from text; throws when the text is empty (unless `allowEmpty`: null), not JSON or not an object. */
export function parseJsonObject(text, label, { allowEmpty = false } = {}) {
  if (!text.trim()) {
    if (allowEmpty) return null;
    throw new Error(`${label} is empty`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    const hint = /^<{7}(?: |$)/m.test(text) ? ", it still has git merge conflict markers" : "";
    throw new Error(`${label} is not valid JSON (${err.message}${hint})`);
  }
  if (!isObject(json)) throw new Error(`${label} does not hold a JSON object`);
  return json;
}

/**
 * Parse a file that holds one JSON object. Returns null when the file does not exist (with
 * `allowEmpty`, also when it is empty). Throws when it exists but cannot be read, is empty, is not
 * valid JSON or is not an object: a broken file must never pass for a missing one, or the next write
 * replaces it.
 */
export function readJsonFile(file, { allowEmpty = false, label = file } = {}) {
  const text = readTextFile(file, label);
  return text === null ? null : parseJsonObject(text, label, { allowEmpty });
}

/**
 * Run `fn` while holding `<file>.lock`, so two sessions never read, change and write the same file at
 * once (the second would drop what the first added). Waits up to `waitMs` for another holder; a lock
 * older than `staleMs` was left by a process that died, and is taken over.
 */
export function withFileLock(file, fn, { waitMs = 5000, staleMs = 30_000 } = {}) {
  const lock = `${file}.lock`;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      fs.closeSync(fs.openSync(lock, "wx"));
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const since = mtimeMs(lock); // 0: released meanwhile, try again
      if (since && Date.now() - since > staleMs) fs.rmSync(lock, { force: true });
      else if (Date.now() > until) throw new Error(`${path.basename(file)} is in use by another session; try again`);
      else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

/**
 * Write a file whole or not at all: write a temp file beside it, then rename it over the target, so
 * an interrupted write never leaves half a file. The temp name starts with a dot, which the source
 * scan skips.
 */
export function writeFileAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

export function mtimeMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/** Per-session scratch state lives in the OS temp dir, so nothing needs gitignoring. */
export function sessionStateFile(sessionId) {
  const dir = path.join(os.tmpdir(), "mflow-sessions");
  fs.mkdirSync(dir, { recursive: true });
  const safe = String(sessionId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(dir, `${safe}.json`);
}

/** Minimal frontmatter reader: returns {key: value} for simple `key: value` lines. */
export function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text || "");
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

export function truncate(text, max) {
  if (!text || text.length <= max) return text || "";
  return text.slice(0, max) + "\n…(truncated)";
}
