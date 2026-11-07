#!/usr/bin/env node
// A copy of the plugin inside the project, for Claude Code on the web (claude.ai/code), which installs no
// plugins: neither those of the user's machine nor those `.claude/settings.json` names. What the web session
// does load is what the repository holds under `.claude/`. A folder `.claude/skills/mflow/` holding
// `.claude-plugin/plugin.json` loads as the plugin itself on a machine (`mflow@skills-dir`, with its skills,
// agents and hooks, `${CLAUDE_PLUGIN_ROOT}` pointing at it), and a machine that has mflow installed keeps the
// installed one and leaves the copy unloaded. On the web this route is not yet proven: the first web session
// is its test (/mflow:help answering, with an mflow briefing at the start).
//
// The copy carries `.mflow-vendor.json` (the version and a hash per file). A folder of that name without it
// is the project's own and is never touched. `plan` shows what `write` would create, update or remove;
// `status` says whether the copy matches this plugin.
//
//   node vendor.mjs plan | write | status
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, readJsonFile, realInside, writeFileAtomic } from "./lib.mjs";

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEST = ".claude/skills/mflow";
const MARK = ".mflow-vendor.json";
// Folders copied whole, and files at the plugin's top. The README stays out: the copy is for loading, not reading.
const DIRS = [".claude-plugin", "agents", "hooks", "packs", "scripts", "skills", "templates"];
const FILES = ["compat.json"];

const toPosix = (p) => String(p).split(path.sep).join("/");
const hash = (buf) => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
const pluginVersion = () => JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8")).version;

function pluginFiles() {
  const out = {};
  const walk = (dir, base) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = `${base}/${e.name}`;
      if (e.isDirectory()) walk(path.join(dir, e.name), rel);
      else if (e.isFile()) out[rel] = hash(fs.readFileSync(path.join(dir, e.name)));
    }
  };
  for (const top of DIRS) if (fs.existsSync(path.join(PLUGIN_ROOT, top))) walk(path.join(PLUGIN_ROOT, top), top);
  for (const file of FILES) if (fs.existsSync(path.join(PLUGIN_ROOT, file))) out[file] = hash(fs.readFileSync(path.join(PLUGIN_ROOT, file)));
  return out;
}

export function vendorStatus(root) {
  const dest = path.join(root, DEST);
  if (!fs.existsSync(dest)) return { present: false };
  let mark = null;
  try { mark = readJsonFile(path.join(dest, MARK)); } catch { /* a broken marker counts as foreign */ }
  if (!mark || mark.plugin !== "mflow") return { present: true, foreign: true };
  const version = pluginVersion();
  return { present: true, foreign: false, version: mark.version, pluginVersion: version, current: mark.version === version && JSON.stringify(mark.files) === JSON.stringify(pluginFiles()) };
}

/** A name from the marker may be removed only when it is a file a copy can hold, inside the copy once links are followed. */
export function removable(dest, rel) {
  if (typeof rel !== "string" || !rel || path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return false;
  const parts = rel.split(/[\\/]/);
  if (parts.some((s) => s === ".." || s === "." || s === "")) return false;
  const ok = (parts.length >= 2 && DIRS.includes(parts[0])) || (parts.length === 1 && FILES.includes(parts[0]));
  if (!ok) return false;
  const target = path.resolve(dest, rel);
  const inside = path.relative(dest, target);
  return !inside.startsWith("..") && !path.isAbsolute(inside) && realInside(dest, target);
}

export function vendorPlan(root) {
  const dest = path.join(root, DEST);
  if (path.resolve(dest) === path.resolve(PLUGIN_ROOT)) return { self: true, note: "this plugin runs from the project's copy; refresh it from an installed mflow" };
  const st = vendorStatus(root);
  if (st.foreign) return { foreign: true, note: `${DEST}/ exists without ${MARK}: it is the project's own folder and stays as it is` };
  const want = pluginFiles();
  let have = {};
  if (st.present) {
    try { have = readJsonFile(path.join(dest, MARK))?.files ?? {}; } catch { have = {}; }
  }
  const plan = { dest: DEST, version: pluginVersion(), create: [], update: [], remove: [], unchanged: [], ignored: [] };
  for (const [rel, h] of Object.entries(want)) {
    if (!(rel in have) || !fs.existsSync(path.join(dest, rel))) plan.create.push(rel);
    else if (have[rel] !== h) plan.update.push(rel);
    else plan.unchanged.push(rel);
  }
  for (const rel of Object.keys(have)) {
    if (rel in want) continue;
    (removable(dest, rel) ? plan.remove : plan.ignored).push(rel);
  }
  return plan;
}

export function vendorWrite(root) {
  const plan = vendorPlan(root);
  if (plan.self || plan.foreign) return plan;
  const dest = path.join(root, DEST);
  const targets = [...plan.create, ...plan.update, ...plan.remove, MARK].map((rel) => path.join(dest, rel));
  const outside = targets.filter((t) => !realInside(root, t));
  if (outside.length) throw new Error(`these would be written outside the project through a link: ${outside.map((f) => toPosix(path.relative(root, f))).join(", ")}`);
  for (const rel of [...plan.create, ...plan.update]) {
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(PLUGIN_ROOT, rel), target);
  }
  for (const rel of plan.remove) {
    if (!removable(dest, rel)) continue;
    try { fs.rmSync(path.join(dest, rel), { force: true }); } catch { /* a folder of that name: left as it is */ }
  }
  writeFileAtomic(path.join(dest, MARK), JSON.stringify({ plugin: "mflow", version: plan.version, files: pluginFiles() }, null, 2) + "\n");
  return { ...plan, written: true };
}

function main() {
  const cmd = process.argv[2] ?? "status";
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const out = (o, code = 0) => { process.stdout.write(JSON.stringify(o, null, 2) + "\n"); process.exit(code); };
  if (!root) return out({ error: "no .mflow/config.json here or above; run /mflow:init first" }, 2);
  const short = (p) => (Array.isArray(p.unchanged) ? { ...p, unchanged: p.unchanged.length } : p);
  try {
    if (cmd === "status") return out(vendorStatus(root));
    if (cmd === "plan") return out(short(vendorPlan(root)));
    if (cmd === "write") return out(short(vendorWrite(root)));
    return out({ error: "usage: vendor.mjs plan | write | status" }, 2);
  } catch (err) {
    return out({ error: err.message }, 2);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
