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

export function loadConfig(root) {
  const defaults = {
    version: 1,
    hotspotsDir: "docs/hotspots",
    sourceDir: "docs/source",
    inboxDir: "docs/ai-inbox",
    statusLogEntriesInContext: 2,
    stopGuard: { enabled: true, graceMinutes: 10, repeatMinutes: 30 },
  };
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(path.join(root, MARKER), "utf8"));
  } catch { /* defaults */ }
  const sg = typeof user.stopGuard === "boolean" ? { enabled: user.stopGuard } : user.stopGuard || {};
  return {
    ...defaults,
    ...user,
    stopGuard: { ...defaults.stopGuard, ...sg },
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
