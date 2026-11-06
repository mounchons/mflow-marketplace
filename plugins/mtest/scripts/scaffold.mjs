#!/usr/bin/env node
// Copies plugin templates into a project. Never overwrites.
// When a file already exists (AGENTS.md in a repository that has one), the template is written to
// .mtest/suggested/<path> so the agent can merge the missing sections by hand and show the diff.
//
// .mtest/templates.json records each template offered (a hash of the plugin's template text) and the
// plugin version that offered it. A rerun after an upgrade offers only the templates that changed since:
// one the user already merged, or chose to keep their own version of, is listed under `kept`.
//
// A project that already has .mflow/config.json is driven by the workflow plugin of this marketplace,
// which has its own test and review commands: nothing is written, and the run exits 1.
//
// Usage: node scaffold.mjs [--root <dir>] [--name <display name>] [--dry-run]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MARKER, OTHER_MARKER, PLUGIN_ROOT, pluginVersion, readJsonFile, realInside, toPosix, today, writeFileAtomic } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const dryRun = args.includes("--dry-run");
const root = path.resolve(opt("--root", process.cwd()));
const projectName = opt("--name", path.basename(root));
const date = today();

if (fs.existsSync(path.join(root, OTHER_MARKER))) {
  process.stderr.write(`${toPosix(OTHER_MARKER)} exists: this project is driven by the mflow workflow plugin, which has its own test, review and E2E commands; nothing was written\n`);
  process.exit(1);
}

const templatesDir = path.join(PLUGIN_ROOT, "templates");
const version = pluginVersion();
const recordFile = path.join(root, ".mtest", "templates.json");
const configFile = path.join(root, MARKER);

function walk(dir, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

const fill = (text) => text.replaceAll("{{PROJECT_NAME}}", projectName).replaceAll("{{DATE}}", date);
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

// A cloned repository can carry links, so every place this run may write is checked before the first write.
const templates = walk(templatesDir).map(toPosix);
const outside = [recordFile, configFile, ...templates.flatMap((rel) => [path.join(root, rel), path.join(root, ".mtest", "suggested", rel)])]
  .filter((file) => !realInside(root, file));
if (outside.length) {
  const shown = outside.map((f) => toPosix(path.relative(root, f)));
  process.stderr.write(`these would be written outside the project, through a link or a path that leaves it: ${shown.join(", ")}; nothing was written\n`);
  process.exit(1);
}

const result = { root, dryRun, pluginVersion: version, created: [], suggested: [], kept: [], unchanged: [] };

for (const rel of templates) {
  const raw = fs.readFileSync(path.join(templatesDir, rel), "utf8");
  const content = fill(raw);
  const dest = path.join(root, rel);

  if (fs.existsSync(dest)) {
    if (fs.readFileSync(dest, "utf8") === content) {
      result.unchanged.push(rel);
      record.files[rel] = hash(raw);
      continue;
    }
    if (record.files[rel] === hash(raw)) {
      result.kept.push(rel); // this template was offered before; the project's version stands
      continue;
    }
    const sug = path.join(root, ".mtest", "suggested", rel);
    result.suggested.push({ existing: rel, template: toPosix(path.relative(root, sug)) });
    record.files[rel] = hash(raw);
    if (!dryRun) writeFileAtomic(sug, content);
    continue;
  }

  result.created.push(rel);
  record.files[rel] = hash(raw);
  if (!dryRun) writeFileAtomic(dest, content);
}

// The marker every other script looks for; an existing one is the project's and stays as it is.
if (!fs.existsSync(configFile)) {
  result.created.push(toPosix(MARKER));
  const initial = { version: 1, defaultBranch: null, e2eMaxWorkers: 4, partMinutes: 8, parts: [] };
  if (!dryRun) writeFileAtomic(configFile, JSON.stringify(initial, null, 2) + "\n");
}
if (!dryRun) {
  writeFileAtomic(recordFile, JSON.stringify({ ...record, schemaVersion: 1, pluginVersion: version, updatedAt: date }, null, 2) + "\n");
}
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
