#!/usr/bin/env node
// Registry of customer source documents (TOR, Excel, Word, review notes...).
// Machine record: .mflow/sources.json   Human view: <sourceDir>/INDEX.md (generated)
//
//   node source-index.mjs scan                       -> JSON: new / changed / unchanged / missing
//   node source-index.mjs mark <file...> [--status active|superseded|reference]
//        [--by <replacing file>] [--used-by <hs-slug|change|review>] [--note "..."] [--title "..."]
//   node source-index.mjs render                     -> regenerate INDEX.md
//   node source-index.mjs cache <file...>            -> JSON: where the text version of each file goes
//
// Text versions of .docx, .xlsx and .pdf files live at .mflow/cache/<project path>.<hash>.md. The path
// carries the file's project path and content hash, so two files with one name never share a cache,
// and an edited file gets a new path instead of the text of its old version (`exists` false: convert
// again). `cache` deletes conversions of earlier versions of the same file. Plain text needs none.
//
// A file counts as "processed" once it has been marked. Editing a file changes its hash,
// so it shows up as "changed" and must be re-read.
//
// sources.json is the record and INDEX.md a view that `render` rebuilds. A registry that exists but
// cannot be read, or holds something this version does not know, stops every command and is never
// written over: it may be the only copy of which file replaced which and what used it.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, loadConfig, parseJsonObject, readTextFile, withFileLock, writeFileAtomic } from "./lib.mjs";

export const STATUSES = ["active", "superseded", "reference"];
const OPTIONS = new Set(["status", "by", "used-by", "note", "title"]);
const DB = ".mflow/sources.json";
const CACHE = ".mflow/cache";
const PLAIN = /\.(md|txt|csv|json)$/i;
const SKIP = new Set(["INDEX.md", "README.md", ".gitkeep"]);

const toPosix = (p) => p.split(path.sep).join("/");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
const defaultRoot = () => findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()) || process.cwd();

/** Where the registry and the source folder of a project are. Throws when config.json is broken. */
function locate(root) {
  const { sourceDir } = loadConfig(root);
  return { root, sourceDir, absSource: path.join(root, sourceDir), dbFile: path.join(root, DB) };
}

/** The registry, and the exact text it came from (null while there is none) to detect a concurrent write. */
function loadDb(at) {
  try {
    const raw = readTextFile(at.dbFile, DB);
    if (raw === null) return { db: { version: 1, files: {} }, raw };
    const db = parseJsonObject(raw, DB);
    checkDb(db);
    return { db, raw };
  } catch (err) {
    throw new Error(`${err.message}; fix it by hand or restore the last good copy from git, nothing was written`);
  }
}

function checkDb(db) {
  const bad = (what) => { throw new Error(`${DB} ${what}`); };
  if (db.version !== undefined && db.version !== 1) bad(`has version ${JSON.stringify(db.version)}, which this mflow does not know (update the plugin)`);
  if (!db.files || typeof db.files !== "object" || Array.isArray(db.files)) bad('has no "files" object');
  for (const [rel, rec] of Object.entries(db.files)) {
    if (!rec || typeof rec !== "object" || Array.isArray(rec)) bad(`entry "${rel}" is not an object`);
    if (rec.status !== undefined && !STATUSES.includes(rec.status)) bad(`entry "${rel}" has status "${rec.status}" (expected ${STATUSES.join(", ")})`);
    if (rec.usedBy !== undefined && !Array.isArray(rec.usedBy)) bad(`entry "${rel}" has a usedBy that is not a list`);
  }
}

function listFiles(dir, absSource) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full, absSource));
    else if (!SKIP.has(e.name) || dir !== absSource) out.push(full);
  }
  return out;
}

export function scan(root = defaultRoot()) {
  const at = locate(root);
  const { db } = loadDb(at);
  const seen = new Set();
  const result = { sourceDir: at.sourceDir, new: [], changed: [], unchanged: [], missing: [] };
  for (const full of listFiles(at.absSource, at.absSource)) {
    const rel = toPosix(path.relative(root, full));
    seen.add(rel);
    const rec = db.files[rel];
    const hash = sha(full);
    if (!rec) result.new.push(rel);
    else if (rec.hash !== hash) result.changed.push({ file: rel, status: rec.status });
    else result.unchanged.push({ file: rel, status: rec.status });
  }
  for (const rel of Object.keys(db.files)) if (!seen.has(rel)) result.missing.push(rel);
  return result;
}

function render(at, db) {
  const rows = Object.entries(db.files).sort(([a], [b]) => a.localeCompare(b));
  const cell = (v) => String(v ?? "").replaceAll("|", "\\|");
  const lines = [
    "# Source documents",
    "",
    "<!-- Generated by mflow (scripts/source-index.mjs). Edit through /mflow:capture, not by hand.",
    "     Originals in this folder are never edited: a new version is a new file. -->",
    "",
    "| File | Title | Status | Replaced by | Used by | Processed | Note |",
    "|---|---|---|---|---|---|---|",
    ...rows.map(([f, r]) =>
      `| ${cell(f)} | ${cell(r.title)} | ${cell(r.status)} | ${cell(r.supersededBy)} | ${cell((r.usedBy || []).join(", "))} | ${cell(r.processedAt)} | ${cell(r.note)} |`),
    "",
  ];
  writeFileAtomic(path.join(at.absSource, "INDEX.md"), lines.join("\n"));
}

/** Project-relative POSIX path of a file named on the command line; refuses one outside the project. */
function inside(at, p, cmd = "mark") {
  const rel = path.relative(at.root, path.resolve(at.root, p));
  if (!rel || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`${cmd}: ${p} is outside the project, nothing was written`);
  }
  return toPosix(rel);
}

function cache(at, argv) {
  if (!argv.length) throw new Error("cache: give at least one file");
  return {
    files: argv.map((p) => {
      const rel = inside(at, p, "cache");
      const full = path.join(at.root, rel);
      if (!fs.existsSync(full)) throw new Error(`cache: not found: ${rel}`);
      if (PLAIN.test(rel)) return { file: rel, cache: null, note: "plain text: read the file itself" };
      const name = path.posix.basename(rel);
      const current = `${name}.${sha(full)}.md`;
      const dir = path.join(at.root, CACHE, path.posix.dirname(rel));
      // Conversions of earlier versions: the same name, then a different 16-hex hash.
      const removed = [];
      for (const other of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
        if (other !== current && other.startsWith(`${name}.`) && /^[0-9a-f]{16}\.md$/.test(other.slice(name.length + 1))) {
          fs.rmSync(path.join(dir, other));
          removed.push(toPosix(path.relative(at.root, path.join(dir, other))));
        }
      }
      const cachePath = path.join(dir, current);
      return {
        file: rel,
        cache: toPosix(path.relative(at.root, cachePath)),
        exists: fs.existsSync(cachePath),
        ...(removed.length ? { removed } : {}),
      };
    }),
  };
}

function mark(at, argv) {
  const files = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { files.push(inside(at, a)); continue; }
    const name = a.slice(2);
    const value = argv[++i];
    if (!OPTIONS.has(name)) throw new Error(`mark: unknown option --${name}, nothing was written`);
    if (value === undefined || value.startsWith("--")) throw new Error(`mark: --${name} needs a value, nothing was written`);
    opts[name] = value;
  }
  if (!files.length) throw new Error("mark: give at least one file");
  if (opts.status && !STATUSES.includes(opts.status)) {
    throw new Error(`mark: --status must be ${STATUSES.join(", ")}, not "${opts.status}"; nothing was written`);
  }
  const by = opts.by && inside(at, opts.by);
  // Two sessions marking at once would each write the registry they read, dropping the other's files.
  return withFileLock(at.dbFile, () => record(at, files, opts, by));
}

function record(at, files, opts, by) {
  const { db, raw } = loadDb(at);
  const today = new Date().toISOString().slice(0, 10);
  for (const rel of files) {
    const full = path.join(at.root, rel);
    if (!fs.existsSync(full)) throw new Error(`mark: not found: ${rel}`);
    const rec = db.files[rel] || { status: "active", usedBy: [] };
    rec.usedBy ??= [];
    rec.hash = sha(full);
    rec.processedAt = today;
    if (opts.status) rec.status = opts.status;
    if (by) {
      rec.status = "superseded";
      rec.supersededBy = by;
    }
    if (opts["used-by"] && !rec.usedBy.includes(opts["used-by"])) rec.usedBy.push(opts["used-by"]);
    if (opts.note) rec.note = opts.note;
    if (opts.title) rec.title = opts.title;
    db.files[rel] = rec;
  }
  // The lock keeps mflow out; this catches anything else that rewrote the file meanwhile (an editor, git).
  if (readTextFile(at.dbFile, DB) !== raw) {
    throw new Error(`${DB} changed while marking; run the command again, nothing was written`);
  }
  writeFileAtomic(at.dbFile, JSON.stringify(db, null, 2) + "\n");
  render(at, db);
  return { marked: files };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    const at = locate(defaultRoot());
    let out;
    if (cmd === "scan") out = scan(at.root);
    else if (cmd === "mark") out = mark(at, rest);
    else if (cmd === "render") { render(at, loadDb(at).db); out = { rendered: `${at.sourceDir}/INDEX.md` }; }
    else if (cmd === "cache") out = cache(at, rest);
    else throw new Error("usage: source-index.mjs scan | mark <file...> [options] | render | cache <file...>");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
