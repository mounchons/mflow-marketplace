#!/usr/bin/env node
// A copy of the plugin inside the project, for Claude Code on the web (claude.ai/code), which installs
// no plugins: a folder `.claude/skills/mtest/` holding `.claude-plugin/plugin.json` loads there as the
// plugin itself, with its skills and hooks, and `${CLAUDE_PLUGIN_ROOT}` points at it. On a machine that
// has mtest installed, the installed plugin keeps the name and the copy is not loaded twice.
//
// The copy carries `.mtest-vendor.json` (the version and a hash per file). A folder of that name without
// it is the project's own and is never touched. `plan` shows what `write` would create, update or
// remove; `status` says whether the copy matches this plugin.
//
// Usage: node vendor.mjs plan | write | status
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PATHS, PLUGIN_ROOT, findRoot, pluginVersion, readJsonFile, realInside, toPosix, writeFileAtomic } from "./lib.mjs";

const MARK = ".mtest-vendor.json";
const INCLUDE = [".claude-plugin", "hooks", "scripts", "skills", "templates"];

const hash = (buf) => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);

function pluginFiles() {
  const out = {};
  const walk = (dir, base) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = `${base}/${e.name}`;
      if (e.isDirectory()) walk(path.join(dir, e.name), rel);
      else out[rel] = hash(fs.readFileSync(path.join(dir, e.name)));
    }
  };
  for (const top of INCLUDE) if (fs.existsSync(path.join(PLUGIN_ROOT, top))) walk(path.join(PLUGIN_ROOT, top), top);
  return out;
}

export function vendorStatus(root) {
  const dest = path.join(root, PATHS.vendor);
  if (!fs.existsSync(dest)) return { present: false };
  let mark = null;
  try { mark = readJsonFile(path.join(dest, MARK)); } catch { /* broken marker: treated as foreign */ }
  if (!mark || mark.plugin !== "mtest") return { present: true, foreign: true };
  const version = pluginVersion();
  return { present: true, foreign: false, version: mark.version, pluginVersion: version, current: mark.version === version && JSON.stringify(mark.files) === JSON.stringify(pluginFiles()) };
}

export function vendorPlan(root) {
  const dest = path.join(root, PATHS.vendor);
  if (path.resolve(dest) === path.resolve(PLUGIN_ROOT)) return { self: true, note: "this plugin runs from the project's copy; update it from an installed mtest" };
  const st = vendorStatus(root);
  if (st.foreign) return { foreign: true, note: `${PATHS.vendor}/ exists without ${MARK}: it is the project's own folder and stays as it is` };
  const want = pluginFiles();
  let have = {};
  if (st.present) {
    try { have = readJsonFile(path.join(dest, MARK))?.files ?? {}; } catch { have = {}; }
  }
  const plan = { dest: PATHS.vendor, version: pluginVersion(), create: [], update: [], remove: [], unchanged: [] };
  for (const [rel, h] of Object.entries(want)) {
    if (!(rel in have) || !fs.existsSync(path.join(dest, rel))) plan.create.push(rel);
    else if (have[rel] !== h) plan.update.push(rel);
    else plan.unchanged.push(rel);
  }
  for (const rel of Object.keys(have)) if (!(rel in want)) plan.remove.push(rel);
  return plan;
}

export function vendorWrite(root) {
  const plan = vendorPlan(root);
  if (plan.self || plan.foreign) return plan;
  const dest = path.join(root, PATHS.vendor);
  const targets = [...plan.create, ...plan.update, ...plan.remove, MARK].map((rel) => path.join(dest, rel));
  const outside = targets.filter((t) => !realInside(root, t));
  if (outside.length) throw new Error(`these would be written outside the project through a link: ${outside.map((f) => toPosix(path.relative(root, f))).join(", ")}`);
  for (const rel of [...plan.create, ...plan.update]) {
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(PLUGIN_ROOT, rel), target);
  }
  for (const rel of plan.remove) fs.rmSync(path.join(dest, rel), { force: true });
  writeFileAtomic(path.join(dest, MARK), JSON.stringify({ plugin: "mtest", version: plan.version, files: pluginFiles() }, null, 2) + "\n");
  return { ...plan, written: true };
}

function main() {
  const cmd = process.argv[2] ?? "status";
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (!root) {
    process.stderr.write("no .mtest/config.json here or above: run /mtest:init first\n");
    process.exit(2);
  }
  const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + "\n");
  try {
    if (cmd === "status") return out(vendorStatus(root));
    if (cmd === "plan") {
      const p = vendorPlan(root);
      return out(p.unchanged ? { ...p, unchanged: p.unchanged.length } : p);
    }
    if (cmd === "write") {
      const p = vendorWrite(root);
      return out(p.unchanged ? { ...p, unchanged: p.unchanged.length } : p);
    }
    process.stderr.write("usage: vendor.mjs plan | write | status\n");
    process.exit(2);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
