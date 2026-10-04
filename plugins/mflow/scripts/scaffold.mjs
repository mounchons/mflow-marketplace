#!/usr/bin/env node
// Copies plugin templates into a project. Never overwrites.
// When a file already exists, the template is written to .mflow/suggested/<path>
// so the agent can merge it by hand and show the diff.
//
// .mflow/templates.json records each template offered (a hash of the plugin's template text) and the
// plugin version that offered it. A rerun, such as /mflow:init after an upgrade, offers only the
// templates that changed since: one the user already merged, or chose to keep their own version of,
// is listed under `kept` and not offered again. A project set up before the record existed gets every
// differing template once, as before.
//
// Usage: node scaffold.mjs [--root <dir>] [--name <project name>] [--dry-run]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, writeFileAtomic } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const dryRun = args.includes("--dry-run");
const root = path.resolve(opt("--root", process.cwd()));
const projectName = opt("--name", path.basename(root));
const today = new Date().toISOString().slice(0, 10);

const here = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(here, "..", "templates");
const pluginVersion = JSON.parse(fs.readFileSync(path.join(here, "..", ".claude-plugin", "plugin.json"), "utf8")).version;
const recordFile = path.join(root, ".mflow", "templates.json");

function walk(dir, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

const fill = (text) => text.replaceAll("{{PROJECT_NAME}}", projectName).replaceAll("{{DATE}}", today);
// The raw template is hashed, before the date is filled in, so the same template hashes the same every day.
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);

let record;
try {
  record = readJsonFile(recordFile) ?? { schemaVersion: 1, files: {} };
} catch (err) {
  process.stderr.write(`${err.message}; fix or delete it by hand, nothing was written\n`);
  process.exit(1);
}
record.files ??= {};

const result = { root, dryRun, pluginVersion, created: [], suggested: [], kept: [], unchanged: [] };

for (const rel of walk(templatesDir)) {
  const key = rel.split(path.sep).join("/");
  const src = path.join(templatesDir, rel);
  const raw = fs.readFileSync(src, "utf8");
  const content = fill(raw);
  const dest = path.join(root, rel);

  if (fs.existsSync(dest)) {
    if (fs.readFileSync(dest, "utf8") === content) {
      result.unchanged.push(rel);
      record.files[key] = hash(raw);
      continue;
    }
    if (record.files[key] === hash(raw)) {
      result.kept.push(rel); // this template was offered before; the project's version stands
      continue;
    }
    const sug = path.join(root, ".mflow", "suggested", rel);
    result.suggested.push({ existing: rel, template: path.relative(root, sug) });
    record.files[key] = hash(raw);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(sug), { recursive: true });
      fs.writeFileSync(sug, content);
    }
    continue;
  }

  result.created.push(rel);
  record.files[key] = hash(raw);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
}

if (!dryRun) {
  writeFileAtomic(recordFile, JSON.stringify({ ...record, schemaVersion: 1, pluginVersion, updatedAt: today }, null, 2) + "\n");
}
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
