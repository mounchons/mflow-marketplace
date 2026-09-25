#!/usr/bin/env node
// Copies plugin templates into a project. Never overwrites.
// When a file already exists, the template is written to .mflow/suggested/<path>
// so the agent can merge it by hand and show the diff.
//
// Usage: node scaffold.mjs [--root <dir>] [--name <project name>] [--dry-run]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const result = { root, dryRun, created: [], suggested: [], unchanged: [] };

for (const rel of walk(templatesDir)) {
  const src = path.join(templatesDir, rel);
  const content = fill(fs.readFileSync(src, "utf8"));
  const dest = path.join(root, rel);

  if (fs.existsSync(dest)) {
    if (fs.readFileSync(dest, "utf8") === content) {
      result.unchanged.push(rel);
      continue;
    }
    const sug = path.join(root, ".mflow", "suggested", rel);
    result.suggested.push({ existing: rel, template: path.relative(root, sug) });
    if (!dryRun) {
      fs.mkdirSync(path.dirname(sug), { recursive: true });
      fs.writeFileSync(sug, content);
    }
    continue;
  }

  result.created.push(rel);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
}

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
