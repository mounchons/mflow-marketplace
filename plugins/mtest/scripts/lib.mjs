// Shared helpers for mtest scripts. Node >= 20, no dependencies, cross-platform (Windows and Linux).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = path.join(".mtest", "config.json");
// A project driven by the workflow plugin of this marketplace already has its own test and review
// commands and records; mtest stays out of it.
export const OTHER_MARKER = path.join(".mflow", "config.json");

/** Where mtest keeps its files, relative to the project root. Fixed: every skill names these paths. */
export const PATHS = {
  content: "mtest",
  status: "mtest/STATUS.md",
  flows: "mtest/flows",
  runs: "mtest/runs",
  reviews: "mtest/reviews",
  settings: ".mtest",
  logs: ".mtest/logs",
  tmp: ".mtest/tmp",
  openRun: ".mtest/run-open.json",
  vendor: ".claude/skills/mtest",
};

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function pluginVersion() {
  return JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8")).version;
}

export const PART_KINDS = ["build", "unit", "integration", "check", "e2e"];
export const RESULT_TYPES = ["trx", "junit", "playwright-json", "vitest-json", "jest-json", "exit"];

export const DEFAULTS = {
  version: 1,
  defaultBranch: null,
  testRoots: ["tests", "test", "src", "web", "e2e", "app", "packages"],
  e2eMaxWorkers: 4,
  partMinutes: 8,
  systemActors: ["system", "ai", "worker", "job", "scheduler", "ระบบ", "-", "—"],
  wholeSuiteOn: [
    "**/*.csproj", "**/*.sln", "**/*.slnx", "**/Directory.*.props", "**/Directory.*.targets", "**/global.json",
    "**/package.json", "**/package-lock.json", "**/pnpm-lock.yaml", "**/yarn.lock",
    "**/pyproject.toml", "**/requirements*.txt", "**/go.mod", "**/go.sum", "**/pom.xml", "**/build.gradle*",
    "**/Migrations/**", "**/migrations/**", "**/Program.cs", "**/Startup.cs",
    "**/playwright.config.*", "**/vitest.config.*", "**/jest.config.*", "**/conftest.py",
    ".mtest/config.json",
  ],
  docsOnly: ["**/*.md", "docs/**", "mtest/**", "**/*.txt", "**/*.png", "**/*.jpg", "**/*.svg", ".claude/**"],
  parts: [],
};

/** Read all of stdin (hook input JSON). Returns {} when empty or invalid. */
export function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Walk up from `start` until a folder containing .mtest/config.json is found. */
export function findRoot(start) {
  let dir = path.resolve(start || process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(dir, MARKER))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Whether `target` (relative to root or absolute; it need not exist yet) really lies inside root once
 * symlinks and junctions are followed. A cloned repository can carry links, so a path that reads as
 * inside may lead out: the nearest entry that exists must resolve inside root, and a dangling link,
 * which a write would follow to create its target, counts as outside.
 */
export function realInside(root, target) {
  let realRoot;
  try { realRoot = fs.realpathSync(root); } catch { return false; }
  let at = path.resolve(root, target);
  for (;;) {
    try { fs.lstatSync(at); break; } catch { /* not there: look at its parent */ }
    const up = path.dirname(at);
    if (up === at) return false;
    at = up;
  }
  let real;
  try { real = fs.realpathSync(at); } catch { return false; }
  const rel = path.relative(realRoot, real);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel));
}

/** Problems with a config object, as sentences; empty when it is usable. */
export function configProblems(cfg) {
  const out = [];
  if (!Number.isInteger(cfg.e2eMaxWorkers) || cfg.e2eMaxWorkers < 1) out.push(`"e2eMaxWorkers" must be a whole number of at least 1`);
  if (!Number.isFinite(cfg.partMinutes) || cfg.partMinutes <= 0) out.push(`"partMinutes" must be a positive number`);
  if (cfg.defaultBranch !== null && typeof cfg.defaultBranch !== "string") out.push(`"defaultBranch" must be a branch name or null`);
  for (const key of ["testRoots", "systemActors", "wholeSuiteOn", "docsOnly"]) {
    if (!Array.isArray(cfg[key]) || cfg[key].some((x) => typeof x !== "string")) out.push(`"${key}" must be a list of strings`);
  }
  if (!Array.isArray(cfg.parts)) {
    out.push(`"parts" must be a list`);
    return out;
  }
  const names = new Set();
  cfg.parts.forEach((p, i) => {
    const at = `parts[${i}]`;
    if (!isObject(p)) return out.push(`${at} must be an object`);
    if (typeof p.name !== "string" || !/^[A-Za-z0-9][\w.-]*$/.test(p.name)) out.push(`${at}.name must be a short name (letters, digits, . _ -)`);
    else if (names.has(p.name)) out.push(`${at}.name "${p.name}" is used twice`);
    else names.add(p.name);
    if (typeof p.command !== "string" || !p.command.trim()) out.push(`${at}.command must be a command line`);
    if (!PART_KINDS.includes(p.kind)) out.push(`${at}.kind must be one of ${PART_KINDS.join(", ")}`);
    const results = p.results ?? "exit";
    if (!RESULT_TYPES.includes(results)) out.push(`${at}.results must be one of ${RESULT_TYPES.join(", ")}`);
    if (p.cwd !== undefined && (typeof p.cwd !== "string" || !insideProject(p.cwd))) out.push(`${at}.cwd must be a folder inside the project`);
    if (p.requires !== undefined && (!Array.isArray(p.requires) || p.requires.some((x) => typeof x !== "string"))) out.push(`${at}.requires must be a list of strings`);
    if (p.timeoutMin !== undefined && !(Number.isFinite(p.timeoutMin) && p.timeoutMin > 0)) out.push(`${at}.timeoutMin must be a positive number`);
    if (p.paths !== undefined && (!Array.isArray(p.paths) || p.paths.some((x) => typeof x !== "string"))) out.push(`${at}.paths must be a list of globs`);
  });
  if (cfg.parts.filter((p) => p?.kind === "build").length > 1) out.push(`at most one part may have kind "build"`);
  return out;
}

/**
 * Project settings: .mtest/config.json over the defaults. Throws when the file cannot be read, is not
 * valid JSON, a setting has the wrong type, or .mtest or mtest/ leads outside the project through a
 * link: scripts write there, so they stop rather than guess.
 */
export function loadConfig(root) {
  const label = toPosix(MARKER);
  const stop = (what) => new Error(`${what}; fix it by hand, mtest stops until it does`);
  for (const dir of [PATHS.settings, PATHS.content]) {
    if (!realInside(root, dir)) throw stop(`${dir} leads outside the project through a link`);
  }
  let user;
  try {
    user = readJsonFile(path.join(root, MARKER), { allowEmpty: true, label }) ?? {};
  } catch (err) {
    throw stop(err.message);
  }
  const cfg = { ...DEFAULTS, ...user };
  const problems = configProblems(cfg);
  if (problems.length) throw stop(`${label}: ${problems.join("; ")}`);
  return cfg;
}

/** Whether a relative path stays inside the project root, on any platform. */
export function insideProject(rel) {
  const p = String(rel).trim().replaceAll("\\", "/");
  if (path.posix.isAbsolute(p) || path.win32.isAbsolute(p) || /^[A-Za-z]:/.test(p)) return false;
  const n = path.posix.normalize(p);
  return n !== ".." && !n.startsWith("../");
}

/** Run a program with an argument list (no shell); return stdout or null on any failure. Never throws. */
export function exec(file, args, cwd, timeout = 8000) {
  try {
    return execFileSync(file, args, {
      cwd,
      timeout,
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

export const git = (root, ...args) => exec("git", args, root)?.trim() ?? null;

/** The branch reviews and `since` compare against: the config's, else origin's HEAD, else main or master. */
export function defaultBranch(root, cfg) {
  if (cfg?.defaultBranch) return cfg.defaultBranch;
  const remote = git(root, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD");
  if (remote) return remote.replace(/^origin\//, "");
  for (const b of ["main", "master"]) if (git(root, "rev-parse", "--verify", "--quiet", b)) return b;
  return null;
}

export function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Text of a file, null when it does not exist; any other failure throws. A UTF-8 BOM is dropped. */
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

/** A file holding one JSON object; null when missing. Throws when it exists but is broken. */
export function readJsonFile(file, { allowEmpty = false, label = file } = {}) {
  const text = readTextFile(file, label);
  return text === null ? null : parseJsonObject(text, label, { allowEmpty });
}

/** Write a file whole or not at all: a temp file beside it, renamed over the target. */
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

/** Minimal frontmatter reader: {key: value} for simple `key: value` lines. */
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

/** Compare dotted versions by number: negative when `a` is older than `b`. */
export function compareVersions(a, b) {
  const [x, y] = [a, b].map((v) => String(v).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0));
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

/** A glob (`**`, `*`, `?`) as a RegExp over forward-slash paths; a pattern without `/` matches a basename anywhere. */
export function globToRegExp(glob) {
  let g = glob.replaceAll("\\", "/");
  if (!g.includes("/")) g = `**/${g}`;
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        i++;
        if (g[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}

export const matchesAny = (file, globs) => globs.some((g) => globToRegExp(g).test(toPosix(file)));

/** Every file under `dir` relative to `root`, skipping build output, dependencies and VCS folders. */
export function walkFiles(root, dir, { skip = SKIP_DIRS, limit = 50000 } = {}) {
  const out = [];
  const stack = [path.join(root, dir)];
  while (stack.length && out.length < limit) {
    const at = stack.pop();
    let entries;
    try { entries = fs.readdirSync(at, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = path.join(at, e.name);
      if (e.isDirectory()) {
        if (!skip.has(e.name.toLowerCase())) stack.push(full);
      } else out.push(toPosix(path.relative(root, full)));
    }
  }
  return out.sort();
}

export const SKIP_DIRS = new Set([
  "node_modules", "bin", "obj", "dist", "build", "out", ".git", ".vs", ".idea", "coverage", "testresults",
  "playwright-report", "test-results", ".next", ".nuxt", ".venv", "venv", "__pycache__", "target", ".mtest", "storage-data",
]);

/** Files that look like tests by their path or name, in any of the common stacks. */
export function isTestFile(rel) {
  const p = toPosix(rel);
  const base = p.split("/").pop();
  if (!/\.(cs|fs|vb|ts|tsx|js|jsx|mjs|cjs|py|go|java|kt|php|rb|rs|swift)$/i.test(base)) return false;
  if (/(^|\/)(tests?|specs?|e2e|__tests__|integrationtests?|unittests?)(\/|$)/i.test(p)) return true;
  if (/\.(test|spec|e2e)\.[a-z]+$/i.test(base)) return true;
  if (/(Tests?|Specs?)\.(cs|fs|vb|java|kt|php)$/.test(base)) return true;
  return /^test_.*\.py$|_test\.(py|go)$/i.test(base);
}

export function truncate(text, max) {
  if (!text || text.length <= max) return text || "";
  return text.slice(0, max) + "\n…(truncated)";
}

export const toPosix = (p) => String(p).split(path.sep).join("/").replaceAll("\\", "/");
export const today = () => new Date().toISOString().slice(0, 10);

/** Seconds as `1h 2m`, `3m 4s` or `5s`. */
export function duration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** `Key: value` header lines at the top of a record, up to the first blank line or table. */
export function recordHeader(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("|") || line.startsWith("#")) break;
    const m = /^([A-Za-z][A-Za-z ]*):\s*(.*)$/.exec(line);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}
