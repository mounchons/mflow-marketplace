#!/usr/bin/env node
// The UI kit's status and revision, kept in mreq/ui/theme/README.md as two lines of their own:
//   Status: draft | approved <YYYY-MM-DD>
//   Revision: <n>
// and a log under `## บันทึกการแก้ไข`. Every change to those lines goes through this script, so they read
// the same every time.
//
//   node theme-status.mjs status                     -> JSON: status, approvedOn, revision, missing kit files
//   node theme-status.mjs init                       -> create the README from the template (never overwrites)
//   node theme-status.mjs approve                    -> Status: approved <today>, plus a log line
//   node theme-status.mjs bump --note "<what, why>"  -> Revision + 1 and a log line; the status stays
//   node theme-status.mjs contracts                  -> copy the component contracts, the responsive rules and
//                                                       the access-data shapes into mreq/ui/contracts/, so the
//                                                       requirement set carries them for a builder without mreq
// `--date YYYY-MM-DD` overrides today (tests). Exit 1 with a message on stderr when the command cannot run.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PATHS, findRoot, loadConfig, readTextFile, today, writeFileAtomic } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(here, "..", "skills", "theme", "assets", "theme-readme.md");
const REFERENCES = path.join(here, "..", "skills", "theme", "references");
/** The references a builder needs beside the kit; links to the other references become plain names. */
export const CONTRACTS = ["component-contracts.md", "responsive.md", "access-data.md"];
const CONTRACTS_DIR = `${PATHS.ui}/contracts`;
const LOG_HEADING = "## บันทึกการแก้ไข";
const STATUS_RE = /^Status:[ \t]*(draft|approved)(?:[ \t]+(\d{4}-\d{2}-\d{2}))?[ \t]*\r?$/m;
const REVISION_RE = /^Revision:[ \t]*(\d+)[ \t]*\r?$/m;

/** Files the kit is not complete without, relative to the project root. dashboard.html is optional. */
export const REQUIRED = [
  ...["README.md", "tokens.css", "app.css", "shell.js", "datatable.js", "datepicker.js", "index.html", "list.html", "form.html"]
    .map((f) => `${PATHS.theme}/${f}`),
  PATHS.designSystem,
  ...CONTRACTS.map((f) => `${CONTRACTS_DIR}/${f}`),
  `${PATHS.data}/users.json`,
  `${PATHS.data}/roles.json`,
  ".claude/rules/ui.md",
];

/** The kit's state; `exists: false` when the README is not there yet. Throws on an unreadable README. */
export function status(root) {
  const file = path.join(root, PATHS.themeReadme);
  const text = readTextFile(file, PATHS.themeReadme);
  const missing = REQUIRED.filter((rel) => !fs.existsSync(path.join(root, rel)));
  if (text === null) return { file: PATHS.themeReadme, exists: false, status: null, approvedOn: null, revision: null, missing, problems: [] };
  const s = STATUS_RE.exec(text);
  const r = REVISION_RE.exec(text);
  const problems = [];
  if (!s) problems.push("no `Status: draft` or `Status: approved <YYYY-MM-DD>` line");
  if (s && s[1] === "approved" && !s[2]) problems.push("approved without a date");
  if (!r) problems.push("no `Revision: <n>` line");
  if (!text.includes(LOG_HEADING)) problems.push(`no \`${LOG_HEADING}\` section`);
  return {
    file: PATHS.themeReadme,
    exists: true,
    status: s ? s[1] : null,
    approvedOn: s?.[2] || null,
    revision: r ? Number(r[1]) : null,
    missing,
    problems,
  };
}

/** Append one line at the end of the log section, keeping the file's line endings. */
function addLog(text, line) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === LOG_HEADING);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^#{1,2}\s/.test(lines[i])) { end = i; break; }
  while (end > start + 1 && !lines[end - 1].trim()) end--;
  lines.splice(end, 0, line);
  return lines.join(eol);
}

function edit(root, change) {
  const file = path.join(root, PATHS.themeReadme);
  const before = status(root);
  if (!before.exists) throw new Error(`${PATHS.themeReadme} does not exist yet: run \`theme-status.mjs init\` first`);
  if (before.problems.length) throw new Error(`${PATHS.themeReadme}: ${before.problems.join("; ")}; fix it by hand first`);
  const text = readTextFile(file, PATHS.themeReadme);
  writeFileAtomic(file, change(text, before));
  return status(root);
}

function init(root, date) {
  const file = path.join(root, PATHS.themeReadme);
  if (fs.existsSync(file)) return { created: false, ...status(root) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, fs.readFileSync(TEMPLATE, "utf8").replaceAll("{{DATE}}", date), { flag: "wx" });
  return { created: true, ...status(root) };
}

/**
 * Copy the contracts into mreq/ui/contracts/. They belong to the plugin, not to the project (the project's
 * own choices are in design-system.md), so a copy that differs is replaced: the kit is built or changed to
 * the plugin's contracts in the same run. `changed` lists the files whose text is new.
 */
function copyContracts(root) {
  const pluginVersion = JSON.parse(fs.readFileSync(path.join(here, "..", ".claude-plugin", "plugin.json"), "utf8")).version;
  const changed = [];
  for (const name of CONTRACTS) {
    const source = fs.readFileSync(path.join(REFERENCES, name), "utf8");
    const body = source.replace(/\[([^\]]+)\]\(([^)\s#]+)(#[^)]*)?\)/g, (link, text, target) =>
      /^https?:/.test(target) || CONTRACTS.includes(path.posix.basename(target)) ? link : `\`${text}\``);
    const text = `<!-- Copied by /mreq:theme from the mreq plugin ${pluginVersion}: the contract the kit in ../theme/ is built to,\n` +
      "     and the reference a builder rebuilds each component from. Do not edit here; the project's own choices are in ../design-system.md. -->\n\n" + body;
    const dest = path.join(root, CONTRACTS_DIR, name);
    if (fs.existsSync(dest) && fs.readFileSync(dest, "utf8") === text) continue;
    writeFileAtomic(dest, text);
    changed.push(`${CONTRACTS_DIR}/${name}`);
  }
  return { dir: CONTRACTS_DIR, files: CONTRACTS.map((f) => `${CONTRACTS_DIR}/${f}`), changed };
}

function approve(root, date) {
  return edit(root, (text, s) => addLog(
    text.replace(STATUS_RE, (m) => `Status: approved ${date}${m.endsWith("\r") ? "\r" : ""}`),
    `- rev ${s.revision} (${date}): อนุมัติแล้ว`,
  ));
}

function bump(root, date, note) {
  if (!note || !note.trim()) throw new Error("bump: give --note \"<what changed and why>\"");
  return edit(root, (text, s) => addLog(
    text.replace(REVISION_RE, (m) => `Revision: ${s.revision + 1}${m.endsWith("\r") ? "\r" : ""}`),
    `- rev ${s.revision + 1} (${date}): ${note.trim().replace(/\s+/g, " ")}`,
  ));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const date = opt("--date") || today();
  try {
    const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
    if (!root) throw new Error("not an mreq project (no .mreq/config.json above this folder): run /mreq:init first");
    loadConfig(root);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must be YYYY-MM-DD");
    const cmd = argv[0];
    let out;
    if (cmd === "status") out = status(root);
    else if (cmd === "init") out = init(root, date);
    else if (cmd === "approve") out = approve(root, date);
    else if (cmd === "bump") out = bump(root, date, opt("--note"));
    else if (cmd === "contracts") out = copyContracts(root);
    else throw new Error("usage: theme-status.mjs status | init | approve | bump --note \"<what, why>\" | contracts [--date YYYY-MM-DD]");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
