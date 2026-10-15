#!/usr/bin/env node
// Copies plugin templates into a project. Never overwrites.
// When a file already exists, the template is written to .mreq/suggested/<path> so the agent can merge
// it by hand and show the diff.
//
// .mreq/templates.json records each template offered (a hash of the plugin's template text) and the
// plugin version that offered it. A rerun after an upgrade offers only the templates that changed since:
// one the user already merged, or chose to keep their own version of, is listed under `kept`.
//
// A project that already has .mflow/config.json is driven by the other workflow plugin, which writes
// the same agent files: nothing is written, and the run exits 1.
//
// Usage: node scaffold.mjs [--root <dir>] [--name <display name>] [--code-name <ProjectName>] [--dry-run]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MARKER, OTHER_MARKER, readJsonFile, realInside, toPosix, today, writeFileAtomic } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const dryRun = args.includes("--dry-run");
const root = path.resolve(opt("--root", process.cwd()));
const projectName = opt("--name", path.basename(root));
const codeName = opt("--code-name", "TODO");
const date = today();

if (codeName !== "TODO" && !/^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]*)?$/.test(codeName)) {
  process.stderr.write(`--code-name must be PascalCase ASCII (an optional Company.Product), got "${codeName}"; nothing was written\n`);
  process.exit(1);
}
if (fs.existsSync(path.join(root, OTHER_MARKER))) {
  process.stderr.write(`${toPosix(OTHER_MARKER)} exists: this project is driven by another workflow plugin that writes the same files; nothing was written\n`);
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(here, "..", "templates");
const pluginVersion = JSON.parse(fs.readFileSync(path.join(here, "..", ".claude-plugin", "plugin.json"), "utf8")).version;
const recordFile = path.join(root, ".mreq", "templates.json");
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

const fill = (text) => text
  .replaceAll("{{PROJECT_NAME}}", projectName)
  .replaceAll("{{CODE_NAME}}", codeName)
  .replaceAll("{{DATE}}", date);
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

// A cloned repository can carry links (mreq/ as a junction, AGENTS.md as a link to a file that does not
// exist yet), so every place this run may write is checked through them before the first write.
const templates = walk(templatesDir).map(toPosix);
const outside = [recordFile, configFile, ...templates.flatMap((rel) => [path.join(root, rel), path.join(root, ".mreq", "suggested", rel)])]
  .filter((file) => !realInside(root, file));
if (outside.length) {
  const shown = outside.map((f) => toPosix(path.relative(root, f)));
  process.stderr.write(`these would be written outside the project, through a link or a path that leaves it: ${shown.join(", ")}; nothing was written\n`);
  process.exit(1);
}

const result = { root, dryRun, pluginVersion, created: [], suggested: [], kept: [], unchanged: [] };

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
    const sug = path.join(root, ".mreq", "suggested", rel);
    result.suggested.push({ existing: rel, template: toPosix(path.relative(root, sug)) });
    record.files[rel] = hash(raw);
    if (!dryRun) writeFileAtomic(sug, content);
    continue;
  }

  result.created.push(rel);
  record.files[rel] = hash(raw);
  // Written beside and renamed into place, so a link at `dest` would be replaced, never followed.
  if (!dryRun) writeFileAtomic(dest, content);
}

// The marker that every other script looks for; an existing one is the project's and stays as it is.
if (!fs.existsSync(configFile)) {
  result.created.push(toPosix(MARKER));
  if (!dryRun) writeFileAtomic(configFile, JSON.stringify({ version: 1 }, null, 2) + "\n");
}
if (!dryRun) {
  writeFileAtomic(recordFile, JSON.stringify({ ...record, schemaVersion: 1, pluginVersion, updatedAt: date }, null, 2) + "\n");
}
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
