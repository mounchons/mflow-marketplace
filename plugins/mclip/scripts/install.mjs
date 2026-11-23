#!/usr/bin/env node
// Copies the tutorial recorder into a project: templates/TutorialRecorder -> <project>/tools/TutorialRecorder, and the
// example scenario -> <project>/scenarios/example.yaml when that folder has no example yet. Stamps
// tools/TutorialRecorder/.mclip-version with the plugin version it came from.
//
//   node install.mjs [--project <dir>] [--update] [--dry-run]
//
// A first install refuses a tools/TutorialRecorder that mclip did not put there (no .mclip-version). A rerun without
// --update changes nothing and lists the tool files that differ from this plugin's; --update rewrites those. Files the
// project owns are never overwritten: its settings, secrets, stack script and compose override, and its scenarios.
// Exit codes: 0 done (or nothing to do), 2 refused or wrong arguments.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = path.join(PLUGIN, "templates", "TutorialRecorder");
const EXAMPLE = path.join(PLUGIN, "templates", "scenarios", "example.yaml");
const VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
const STAMP = ".mclip-version";

/** Paths (relative, forward slashes) the project owns once they exist: copied on a first install only, never updated. */
const OWNED = new Set(["tutorial.settings.json"]);
/** Paths that never come from the template at all (the project writes them). */
const NEVER = [/^tutorial\.secrets\.json$/, /^stack\/reset\.ps1$/, /^stack\/docker-compose\.tutorial\.yml$/, /^(bin|obj|Output)\//, /^tts\/\.venv\//, /^tts\/keys\.json$/];

function parse(argv) {
  const opts = { project: process.env.CLAUDE_PROJECT_DIR || process.cwd(), update: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project") opts.project = argv[++i];
    else if (a === "--update") opts.update = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!opts.project) throw new Error("--project needs a folder");
  return opts;
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}

const same = (a, b) => fs.existsSync(b) && Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) === 0;

export function install({ project, update = false, dryRun = false }) {
  const root = path.resolve(project);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return { code: 2, lines: [`not a folder: ${root}`] };
  const target = path.join(root, "tools", "TutorialRecorder");
  const stamp = path.join(target, STAMP);
  const lines = [];
  const installed = fs.existsSync(stamp) ? fs.readFileSync(stamp, "utf8").trim() : null;
  if (fs.existsSync(target) && !installed) {
    return { code: 2, lines: [`${path.relative(root, target)} exists and was not installed by mclip (no ${STAMP}): move it aside or merge by hand`] };
  }

  const files = walk(TEMPLATE).filter((f) => !NEVER.some((re) => re.test(f)));
  const added = [], changed = [], kept = [];
  for (const rel of files) {
    const from = path.join(TEMPLATE, rel), to = path.join(target, rel);
    if (!fs.existsSync(to)) added.push(rel);
    else if (OWNED.has(rel)) kept.push(rel);
    else if (!same(from, to)) changed.push(rel);
  }

  if (installed && !update) {
    lines.push(`mclip recorder ${installed} is installed in ${path.relative(root, target)}; this plugin is ${VERSION}`);
    if (added.length || changed.length) {
      lines.push(`differs from this plugin: ${[...added.map((f) => `+${f}`), ...changed].join(", ")}`);
      lines.push("rerun with --update to take them (settings, secrets, the stack script and scenarios are kept)");
    } else lines.push("nothing differs");
    return { code: 0, lines, added, changed, kept };
  }

  const write = [...added, ...changed];
  const example = path.join(root, "scenarios", "example.yaml");
  const addExample = !installed && !fs.existsSync(example);
  if (!dryRun) {
    for (const rel of write) {
      const to = path.join(target, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(TEMPLATE, rel), to);
    }
    fs.writeFileSync(stamp, VERSION + "\n");
    if (addExample) {
      fs.mkdirSync(path.dirname(example), { recursive: true });
      fs.copyFileSync(EXAMPLE, example);
    }
  }
  const verb = dryRun ? "would " : "";
  lines.push(`${verb}${installed ? `update the recorder ${installed} -> ${VERSION}` : `install the recorder ${VERSION}`} in ${path.relative(root, target)}`);
  if (added.length) lines.push(`${verb}add: ${added.join(", ")}`);
  if (changed.length) lines.push(`${verb}replace: ${changed.join(", ")}`);
  if (kept.length) lines.push(`kept (the project's): ${kept.join(", ")}`);
  if (addExample) lines.push(`${verb}add: scenarios/example.yaml`);
  if (!installed) lines.push("next: tutorial.secrets.json from the example, stack/reset.ps1 from stack/reset.example.ps1, then dotnet build");
  return { code: 0, lines, added, changed, kept };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result;
  try { result = install(parse(process.argv.slice(2))); }
  catch (e) { result = { code: 2, lines: [e.message] }; }
  for (const l of result.lines) (result.code === 0 ? console.log : console.error)(l);
  process.exit(result.code);
}
