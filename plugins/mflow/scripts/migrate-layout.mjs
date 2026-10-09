#!/usr/bin/env node
// Moves an mflow project's documents from the layout before 0.20.0 into the grouped one. It changes
// nothing unless --apply is given, and it never commits.
//
//   node migrate-layout.mjs [--root <dir>]            -> JSON: the plan
//   node migrate-layout.mjs [--root <dir>] --apply    -> carries the plan out; the same JSON, applied: true
//
//   docs/discuss              -> docs/decisions/discuss         (setting discussDir)
//   docs/hotspots             -> docs/decisions/hotspots        (setting hotspotsDir)
//   docs/ai-inbox             -> docs/ai/inbox                  (setting inboxDir)
//   docs/analysis/AN-NNN      -> docs/ai/analysis/AN-NNN
//   docs/design/DS-NNN        -> docs/ai/design/DS-NNN
//   docs/challenge/CH-NNN     -> docs/ai/challenge/CH-NNN
//   docs/change-requests/CR-* -> docs/reviews/change-requests/CR-*
//
// docs/source, docs/ui, docs/reviews and docs/vision.md stay where they are; the source registry keys
// every customer file by its path. A folder setting the project changed by hand is kept. The last four
// folders have common names, so only the entries mflow writes there (named by their id) move, and
// anything else is left in place and listed.
//
// Every text file that names a moved path then gets the new one: AGENTS.md, STATUS.md, openspec/,
// backlog/, docs/, code comments (`// PROTOTYPE: … see docs/hotspots/INDEX.md`), and the briefs and
// consultation sessions in .mflow/. Customer files under the source folder are never edited: the
// registry records their hashes. Relative Markdown links are recomputed from the new places of both
// ends. A consultation that pinned a file which still matched its hash gets the new hash, so this
// rewrite does not read as a change by someone else.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, loadConfig, readJsonFile, realInside, run, writeFileAtomic } from "./lib.mjs";
import { fileHash } from "./source-index.mjs";

const FOLDERS = [
  { setting: "discussDir", from: "docs/discuss", to: "docs/decisions/discuss" },
  { setting: "hotspotsDir", from: "docs/hotspots", to: "docs/decisions/hotspots" },
  { setting: "inboxDir", from: "docs/ai-inbox", to: "docs/ai/inbox" },
];
const ENTRIES = [
  { from: "docs/analysis", to: "docs/ai/analysis", id: /^AN-\d{3,}$/ },
  { from: "docs/design", to: "docs/ai/design", id: /^DS-\d{3,}$/ },
  { from: "docs/challenge", to: "docs/ai/challenge", id: /^CH-\d{3,}$/ },
  { from: "docs/change-requests", to: "docs/reviews/change-requests", id: /^CR-\d{3,}/ },
];
const CONFIG = ".mflow/config.json";
const TEXT = /\.(md|mdx|markdown|txt|json|jsonc|ya?ml|toml|ini|cs|cshtml|razor|ts|tsx|js|jsx|mjs|cjs|vue|svelte|css|scss|html?|xml|sql|sh|ps1|py)$/i;
const NEVER = [/^\.mflow\/(cache|suggested)\//, /^\.mflow\/(config|local|sources)\.json$/, /(^|\/)(node_modules|bin|obj|dist|\.git)\//];
const MAX_BYTES = 2 * 1024 * 1024;
const LINKED = "it, or a folder above it, is a link that leads outside the project; not moved";

const posix = path.posix;
const toPosix = (p) => p.split(path.sep).join("/");
const trim = (p) => toPosix(String(p)).replace(/^\.\//, "").replace(/\/+$/, "");
const isDir = (root, rel) => { try { return fs.statSync(path.join(root, rel)).isDirectory(); } catch { return false; } };
const entries = (root, rel) => (isDir(root, rel) ? fs.readdirSync(path.join(root, rel)) : []);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** What moving this project to the 0.20 layout would do. `rewrites: false` skips reading the files. */
export function plan(root, { rewrites = true } = {}) {
  const cfg = loadConfig(root); // throws on a broken config or a linked .mflow, like every other script
  const raw = readJsonFile(path.join(root, CONFIG), { allowEmpty: true, label: CONFIG }) ?? {};
  const out = { root, layout: "current", moves: [], settings: [], kept: [], conflicts: [], rewrites: [], pins: [], emptied: [] };
  const pairs = []; // [old, new] path prefixes that text and links are rewritten by

  for (const f of FOLDERS) {
    // A project without the setting used the old default while that folder exists.
    const current = trim(raw[f.setting] ?? (isDir(root, f.from) ? f.from : f.to));
    if (current !== f.from) {
      if (current !== f.to) out.kept.push({ path: current, reason: `${f.setting} is set by hand` });
      else if (!isDir(root, f.from)) pairs.push([f.from, f.to]); // moved before: fix references left over
      continue;
    }
    if (!isDir(root, f.from)) {
      out.settings.push({ setting: f.setting, from: f.from, to: f.to });
      if (isDir(root, f.to)) pairs.push([f.from, f.to]);
      continue;
    }
    if (entries(root, f.to).length) {
      out.conflicts.push({ from: f.from, to: f.to, reason: `${f.to} already holds files; merge the two by hand, then run this again` });
      continue;
    }
    if (!realInside(root, f.from) || !realInside(root, f.to)) {
      out.conflicts.push({ from: f.from, to: f.to, reason: LINKED });
      continue;
    }
    out.moves.push({ from: f.from, to: f.to });
    out.settings.push({ setting: f.setting, from: f.from, to: f.to });
    pairs.push([f.from, f.to]);
  }

  for (const e of ENTRIES) {
    const names = entries(root, e.from);
    const ours = names.filter((n) => e.id.test(n));
    const others = names.filter((n) => !e.id.test(n));
    const clash = ours.filter((n) => fs.existsSync(path.join(root, e.to, n)));
    const linked = ours.filter((n) => !clash.includes(n) && (!realInside(root, `${e.from}/${n}`) || !realInside(root, `${e.to}/${n}`)));
    const moving = ours.filter((n) => !clash.includes(n) && !linked.includes(n));
    const already = entries(root, e.to).filter((n) => e.id.test(n) && !names.includes(n));
    for (const n of clash) out.conflicts.push({ from: `${e.from}/${n}`, to: `${e.to}/${n}`, reason: "both exist; keep one by hand, then run this again" });
    for (const n of linked) out.conflicts.push({ from: `${e.from}/${n}`, to: `${e.to}/${n}`, reason: LINKED });
    for (const n of moving) out.moves.push({ from: `${e.from}/${n}`, to: `${e.to}/${n}` });
    if (others.length && ours.length) out.kept.push({ path: e.from, reason: `not written by mflow: ${others.join(", ")}` });
    if (!others.length && !clash.length && !linked.length && (moving.length || already.length)) {
      pairs.push([e.from, e.to]);
      if (moving.length) out.emptied.push(e.from);
    } else {
      for (const n of [...moving, ...already]) pairs.push([`${e.from}/${n}`, `${e.to}/${n}`]);
    }
  }

  if (out.moves.length || out.settings.length) out.layout = "legacy";
  if (rewrites && pairs.length) {
    const mapPath = mapper(out.moves);
    const replace = prefixRewriter(pairs);
    const skipSource = new RegExp(`^${esc(trim(cfg.sourceDir))}/`);
    for (const file of textFiles(root)) {
      if (skipSource.test(file)) continue;
      let text;
      try {
        const full = path.join(root, file);
        // A link is never rewritten: writing would replace it, and its target may lie outside the project.
        if (fs.lstatSync(full).isSymbolicLink() || !realInside(root, file)) continue;
        if (fs.statSync(full).size > MAX_BYTES) continue;
        text = fs.readFileSync(full, "utf8");
      } catch { continue; }
      if (text.includes("\0")) continue;
      const to = mapPath(file);
      let changes = 0;
      let next = replace(text, () => changes++);
      if (/\.(md|mdx|markdown)$/i.test(file)) next = relink(next, file, to, mapPath, () => changes++);
      if (changes) out.rewrites.push({ file, ...(to !== file ? { to } : {}), changes, text: next });
    }
    out.pins = pinsToRehash(root, mapPath);
  }
  return out;
}

/** Old path → new path, by the moves (a folder carries everything under it). */
function mapper(moves) {
  const sorted = [...moves].sort((a, b) => b.from.length - a.from.length);
  return (p) => {
    const m = sorted.find((x) => p === x.from || p.startsWith(x.from + "/"));
    return m ? m.to + p.slice(m.from.length) : p;
  };
}

/**
 * Replaces each old path prefix with its new one, in one pass. A prefix counts only as a whole path
 * segment: not inside a longer name (docs/design-system), and not after a letter, dot or dash (mydocs/).
 */
function prefixRewriter(pairs) {
  const map = new Map(pairs);
  const alt = [...map.keys()].sort((a, b) => b.length - a.length).map(esc).join("|");
  const re = new RegExp(`(?<![\\w.-])(${alt})(?![\\w-])`, "g");
  return (text, count) => text.replace(re, (m) => (count(), map.get(m)));
}

/** Recomputes relative Markdown links whose file or target moved; root-relative docs/ paths are left to the prefixes. */
function relink(text, from, to, mapPath, count) {
  const dirFrom = posix.dirname(from);
  const dirTo = posix.dirname(to);
  return text.replace(/\]\(([^)\s]+)/g, (whole, target) => {
    const [, p, rest] = /^([^#?]*)(.*)$/.exec(target);
    if (!p || /^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith("/") || p.startsWith("<") || p.startsWith("docs/")) return whole;
    const oldTarget = posix.normalize(posix.join(dirFrom, p));
    if (oldTarget.startsWith("..")) return whole;
    const newTarget = mapPath(oldTarget);
    if (from === to && oldTarget === newTarget) return whole;
    let rel = posix.relative(dirTo, newTarget) || ".";
    if (p.endsWith("/") && !rel.endsWith("/")) rel += "/";
    if (p.startsWith("./") && !rel.startsWith(".")) rel = "./" + rel;
    if (rel === p) return whole;
    count();
    return `](${rel}${rest}`;
  });
}

/** Text files of the project: git's list (tracked and not ignored), plus the briefs and sessions git may ignore. */
function textFiles(root) {
  const listed = run("git -c core.quotePath=false ls-files -co --exclude-standard -z -- .", root, 15000);
  const files = new Set(listed !== null ? listed.split("\0").filter(Boolean) : walk(root, ""));
  for (const d of [".mflow/briefs", ".mflow/consultations"]) for (const f of walk(root, d)) files.add(f);
  return [...files].filter((f) => TEXT.test(f) && !NEVER.some((re) => re.test(f))).sort();
}

function walk(root, rel, out = []) {
  if (!isDir(root, rel) || out.length > 50000) return out;
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (/^(\.git|node_modules|bin|obj|dist)$/.test(e.name)) continue;
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(root, child, out);
    else out.push(child);
  }
  return out;
}

/** Consultation pins whose file still matches its recorded hash, so the moved, rewritten file can take a new one. */
function pinsToRehash(root, mapPath) {
  const pins = [];
  for (const id of entries(root, ".mflow/consultations")) {
    const file = `.mflow/consultations/${id}/session.json`;
    let s;
    try { s = JSON.parse(fs.readFileSync(path.join(root, file), "utf8")); } catch { continue; }
    for (const field of ["target", "from"]) {
      const pin = s?.snapshot?.[field];
      if (typeof pin?.path !== "string" || typeof pin.hash !== "string") continue;
      const rel = trim(pin.path);
      if (rel.startsWith("..") || path.isAbsolute(rel) || !fs.existsSync(path.join(root, rel)) || !realInside(root, rel)) continue;
      const to = mapPath(rel);
      if (to !== rel && fileHash(path.join(root, rel)) === pin.hash) pins.push({ session: file, field, path: to });
    }
  }
  return pins;
}

/** Carries a plan out: moves, then settings, then the rewritten files, then the pins. */
export function apply(root, p) {
  for (const m of p.moves) {
    const src = path.join(root, m.from);
    const dst = path.join(root, m.to);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (isDir(root, m.to)) fs.rmdirSync(dst); // empty: plan() reports a folder that holds files as a conflict
    fs.renameSync(src, dst);
  }
  for (const d of p.emptied) if (isDir(root, d) && !entries(root, d).length) fs.rmdirSync(path.join(root, d));
  if (p.settings.length) {
    const raw = readJsonFile(path.join(root, CONFIG), { allowEmpty: true, label: CONFIG }) ?? { version: 1 };
    for (const s of p.settings) raw[s.setting] = s.to;
    writeFileAtomic(path.join(root, CONFIG), JSON.stringify(raw, null, 2) + "\n");
  }
  for (const r of p.rewrites) writeFileAtomic(path.join(root, r.to ?? r.file), r.text);
  for (const pin of p.pins) {
    const file = path.join(root, pin.session);
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    s.snapshot[pin.field].path = pin.path;
    s.snapshot[pin.field].hash = fileHash(path.join(root, pin.path));
    writeFileAtomic(file, JSON.stringify(s, null, 2) + "\n");
  }
}

/** The plan as the user sees it: no file contents. */
export function report(p, applied) {
  const { rewrites, emptied, ...rest } = p;
  if (applied) rest.layout = p.conflicts.length ? "mixed" : "current";
  const next = applied
    ? "review `git status`, then `git add -A` and commit: git shows the moves as renames"
    : p.layout === "legacy" || rewrites.length
      ? "show this plan to the user; on a yes, run again with --apply"
      : null;
  return { ...rest, applied, rewrites: rewrites.map(({ text, ...r }) => r), next };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--root");
  const start = i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    const root = findRoot(start);
    if (!root) throw new Error("no .mflow/config.json here or above; run /mflow:init first");
    const p = plan(root);
    const doApply = args.includes("--apply");
    if (doApply) apply(root, p);
    process.stdout.write(JSON.stringify(report(p, doApply), null, 2) + "\n");
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
