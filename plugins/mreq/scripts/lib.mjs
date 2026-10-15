// Shared helpers for mreq scripts. Node >= 20, no dependencies, cross-platform (Windows and Linux).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const MARKER = path.join(".mreq", "config.json");
// A project driven by the other workflow plugin of this marketplace keeps its own files in the same
// places; mreq stays out of it.
export const OTHER_MARKER = path.join(".mflow", "config.json");

/** Where the requirement set lives, relative to the project root. Fixed: every skill names these paths. */
export const PATHS = {
  content: "mreq",
  project: "mreq/project",
  status: "mreq/project/STATUS.md",
  vision: "mreq/project/vision.md",
  followups: "mreq/project/followups.md",
  source: "mreq/source",
  discuss: "mreq/discuss",
  hotspot: "mreq/hotspot",
  ui: "mreq/ui",
  theme: "mreq/ui/theme",
  themeReadme: "mreq/ui/theme/README.md",
  data: "mreq/ui/data",
  designSystem: "mreq/ui/design-system.md",
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

/** Walk up from `start` until a folder containing .mreq/config.json is found. */
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

/** Whether a relative path stays inside the project root, on any platform. */
export function insideProject(rel) {
  const p = String(rel).trim().replaceAll("\\", "/");
  if (path.posix.isAbsolute(p) || path.win32.isAbsolute(p) || /^[A-Za-z]:/.test(p)) return false;
  const n = path.posix.normalize(p);
  return n !== ".." && !n.startsWith("../");
}

/**
 * Whether `target` (relative to root or absolute; it need not exist yet) really lies inside root once
 * symlinks and junctions are followed. A cloned repository can carry links, so a path that reads as
 * inside may lead out: the nearest entry that exists, a link included, must resolve inside root, and a
 * dangling link, which a write would follow to create its target, counts as outside.
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

/**
 * Project settings: .mreq/config.json over the defaults. Throws when the file exists but cannot be
 * read, is not valid JSON or a setting has the wrong type, or when .mreq or mreq/ leads outside the
 * project through a link: scripts write there, so they stop rather than guess.
 */
export function loadConfig(root) {
  const defaults = { version: 1, statusLogEntriesInContext: 2 };
  const label = MARKER.split(path.sep).join("/");
  const stop = (what) => new Error(`${what}; fix it by hand, mreq stops until it does`);
  for (const dir of [".mreq", PATHS.content]) {
    if (!realInside(root, dir)) throw stop(`${dir} leads outside the project through a link`);
  }
  let user;
  try {
    user = readJsonFile(path.join(root, MARKER), { allowEmpty: true, label }) ?? {};
  } catch (err) {
    throw stop(err.message);
  }
  if ("statusLogEntriesInContext" in user && !Number.isInteger(user.statusLogEntriesInContext)) {
    throw stop(`${label}: "statusLogEntriesInContext" must be a whole number`);
  }
  return { ...defaults, ...user };
}

/** Run a program with an argument list (no shell); return stdout or null on any failure. Never throws. */
export function run(file, args, cwd, timeout = 8000) {
  try {
    return execFileSync(file, args, {
      cwd,
      timeout,
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
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
 * valid JSON or is not an object: a broken file must never pass for a missing one.
 */
export function readJsonFile(file, { allowEmpty = false, label = file } = {}) {
  const text = readTextFile(file, label);
  return text === null ? null : parseJsonObject(text, label, { allowEmpty });
}

/**
 * Write a file whole or not at all: write a temp file beside it, then rename it over the target, so
 * an interrupted write never leaves half a file.
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

/** Compare dotted versions by number: negative when `a` is older than `b`, 0 when equal, positive when newer. */
export function compareVersions(a, b) {
  const [x, y] = [a, b].map((v) => String(v).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0));
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

export function truncate(text, max) {
  if (!text || text.length <= max) return text || "";
  return text.slice(0, max) + "\n…(truncated)";
}

export const toPosix = (p) => p.split(path.sep).join("/");
export const today = () => new Date().toISOString().slice(0, 10);
