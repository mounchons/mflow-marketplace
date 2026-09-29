#!/usr/bin/env node
// Bundle files (or folders) into one Markdown file for AI tools that cannot open the repo.
//   node context-pack.mjs --out .mflow/briefs/<brief>.pack.md <path> [<path> ...]
// Text files only; binaries and config files that look like they hold secrets are listed as
// skipped. Warns above ~400 KB.
import fs from "node:fs";
import path from "node:path";
import { findRoot } from "./lib.mjs";

const args = process.argv.slice(2);
const oi = args.indexOf("--out");
if (oi < 0 || !args[oi + 1]) { process.stderr.write("usage: context-pack.mjs --out <file> <paths...>\n"); process.exit(1); }
const out = args[oi + 1];
const inputs = args.filter((_, i) => i !== oi && i !== oi + 1);
const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()) || process.cwd();
const TEXT = /\.(md|txt|cs|cshtml|razor|csproj|sln|slnx|json|ya?ml|xml|sql|css|scss|js|mjs|ts|tsx|jsx|html|py|vue|svelte|php|java|kt|go|rb|rs|dart|swift|config|props|targets|csv|editorconfig)$/i;
// Folders never packed, matched against the repo-relative path so "wwwroot/lib" works at any depth.
const IGNORE = /(^|\/)(bin|obj|node_modules|\.git|\.vs|dist|wwwroot\/lib)$/;
// Credentials must not travel to a chat UI. Only config-type files are checked:
// a `Password` property in a .cs ViewModel is code, not a secret.
const CONFIG = /\.(json|ya?ml|xml|config|props|targets)$/i;
const SECRET = [
  /\b(password|pwd)\s*=\s*[^;"'\s]+/i, // connection strings
  /"[^"]*(password|secret|api_?key|token)[^"]*"\s*:\s*"[^"]{6,}"/i, // JSON values
  /^\s*[\w.-]*(password|secret|api_?key|token)[\w.-]*\s*:\s*\S{6,}/im, // YAML values
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const rel = (full) => path.relative(root, full).split(path.sep).join("/");

const files = [];
const skipped = [];
function add(p) {
  const full = path.resolve(root, p);
  if (!fs.existsSync(full)) { skipped.push(`${p} (not found)`); return; }
  const st = fs.statSync(full);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(full)) {
      const child = path.join(full, e);
      if (!IGNORE.test(rel(child))) add(child);
    }
  } else if (!TEXT.test(full)) skipped.push(`${rel(full)} (binary or unknown type)`);
  else if (CONFIG.test(full) && SECRET.some((re) => re.test(fs.readFileSync(full, "utf8"))))
    skipped.push(`${rel(full)} (may contain secrets: attach a redacted copy by hand if the tool needs it)`);
  else files.push(rel(full));
}
inputs.forEach(add);

const parts = [`# Context pack\n\nFiles: ${files.length}. Each file is under its own heading with its repo path.\n`];
for (const f of files) {
  const ext = path.extname(f).slice(1) || "text";
  parts.push(`\n## ${f}\n\n\`\`\`\`${ext}\n${fs.readFileSync(path.join(root, f), "utf8")}\n\`\`\`\`\n`);
}
if (skipped.length) parts.push(`\n## Skipped\n\n${skipped.map((s) => `- ${s}`).join("\n")}\n`);
const text = parts.join("");
fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
fs.writeFileSync(path.resolve(root, out), text);
process.stdout.write(JSON.stringify({ out, files: files.length, skipped, kb: Math.round(Buffer.byteLength(text) / 1024),
  warning: Buffer.byteLength(text) > 400 * 1024 ? "Large pack: many chat tools truncate. Narrow the paths." : null }, null, 2) + "\n");
