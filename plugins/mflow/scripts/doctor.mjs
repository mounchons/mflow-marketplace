#!/usr/bin/env node
// Read-only health check of an mflow project and the tools it relies on. It writes nothing.
//   node doctor.mjs   -> JSON: the plugin version, what it was tested with, and one entry per check:
//                        { id, status: ok | info | warn | fail, detail, fix? }
// fail: mflow cannot work as intended until it is fixed (a broken settings file, a missing tool).
// warn: it works, but something is out of date, untested or likely wrong. Every warn and fail has a fix.
// Tool versions are compared with compat.json, what this plugin version was tested with: a newer tool is
// not wrong, only untested. A tool whose JSON output mflow cannot read is reported here, where the
// briefing can only say "unavailable".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareVersions as cmp, findRoot, loadConfig, readJsonFile, readText, run } from "./lib.mjs";
import { fileHash, scan } from "./source-index.mjs";
import { list as listConsultations } from "./consult.mjs";
import { projectDir, status as subagentStatus } from "./apply-subagent.mjs";

const PLUGIN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = JSON.parse(fs.readFileSync(path.join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
const compat = JSON.parse(fs.readFileSync(path.join(PLUGIN, "compat.json"), "utf8"));
const today = new Date().toISOString().slice(0, 10);
const KNOWN_SETTINGS = ["version", "hotspotsDir", "sourceDir", "inboxDir", "discussDir", "statusLogEntriesInContext", "stopGuard", "applySubagent", "tools"];

const checks = [];
const add = (id, status, detail, fix) => checks.push({ id, status, detail, ...(fix ? { fix } : {}) });
const parts = (v) => String(v).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
const versionIn = (text) => /(\d+\.\d+\.\d+)/.exec(text || "")?.[1] || null;
const exists = (...p) => fs.existsSync(path.join(...p));

const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const cwd = root || process.cwd();

// Runtime and tools.
const node = process.versions.node;
const eol = compat.nodeEndOfLife[parts(node)[0]];
if (cmp(node, compat.minimum.node) < 0) add("node", "fail", `Node ${node}; mflow needs ${compat.minimum.node} or newer`, "Install Node 22 or 24 LTS");
else if (eol && today > eol) add("node", "warn", `Node ${node} works, but Node ${parts(node)[0]} reached end of life on ${eol}`, "Move to Node 22 or 24 LTS");
else add("node", "ok", `Node ${node}`);

const git = versionIn(run("git --version", cwd, 8000));
if (git) add("git", "ok", `git ${git}`);
else add("git", "warn", "git not found: the Stop hook and `discuss.mjs cited` work without it only in part", "Install git");

function tool(id, cmd, install) {
  const tested = compat.testedWith[id];
  const found = versionIn(run(`${cmd} --version`, cwd, 15000));
  if (!found) return add(id, "fail", `${cmd} not found`, install), null;
  if (cmp(found, compat.minimum[id]) < 0) return add(id, "fail", `${cmd} ${found} is older than the ${compat.minimum[id]} mflow needs`, install), found;
  const [f, t] = [parts(found), parts(tested)];
  if (f[0] === t[0] && f[1] === t[1]) add(id, "ok", `${cmd} ${found} (tested with ${tested})`);
  else if (cmp(found, tested) > 0) add(id, "warn", `${cmd} ${found} is newer than the ${tested} this mflow was tested with`, `Usually fine. If the briefing or a command misbehaves, compare \`${cmd} --help\` with the mflow skills, or install ${tested}`);
  else add(id, "warn", `${cmd} ${found} is older than the ${tested} this mflow was tested with`, install);
  return found;
}
const openspec = tool("openspec", "openspec", "npm i -g @fission-ai/openspec@latest");
const backlog = tool("backlog", "backlog", "npm i -g backlog.md");
const claude = versionIn(run("claude --version", cwd, 15000));
if (claude) {
  const tested = compat.testedWith["claude-code"];
  add("claude-code", cmp(claude, tested) === 0 ? "ok" : "info", `Claude Code ${claude} (tested with ${tested})`);
}

if (!root) {
  add("project", "fail", "no .mflow/config.json here or above", "Run /mflow:init in the project folder");
} else {
  projectChecks();
}

function projectChecks() {
  // Settings.
  let cfg = null;
  try {
    cfg = loadConfig(root);
    const raw = readJsonFile(path.join(root, ".mflow", "config.json"), { allowEmpty: true }) ?? {};
    const unknown = Object.keys(raw).filter((k) => !KNOWN_SETTINGS.includes(k));
    if (raw.version !== undefined && raw.version !== 1) add("config", "warn", `.mflow/config.json has version ${raw.version}; this mflow reads version 1`, "Update the plugin, or check the file by hand");
    else if (unknown.length) add("config", "warn", `.mflow/config.json has settings mflow does not use: ${unknown.join(", ")}`, `Check for a typo; the known ones are ${KNOWN_SETTINGS.join(", ")}`);
    else add("config", "ok", ".mflow/config.json reads");
  } catch (err) {
    add("config", "fail", err.message, "Fix .mflow/config.json by hand; look for a merge conflict or a stray comma");
  }
  if (cfg) {
    const missing = ["sourceDir", "hotspotsDir", "inboxDir", "discussDir"].filter((k) => !exists(root, cfg[k]));
    if (missing.length) add("folders", "warn", `folders from the settings do not exist: ${missing.map((k) => `${k} (${cfg[k]})`).join(", ")}`, "Run /mflow:init to create them, or fix the path in .mflow/config.json");
    else add("folders", "ok", "every configured folder exists");
    try {
      const s = scan(root);
      const todo = s.new.length + s.changed.length;
      add("sources", todo ? "info" : "ok", `source registry reads: ${s.unchanged.length} processed, ${s.new.length} new, ${s.changed.length} changed`, todo ? "/mflow:capture" : undefined);
    } catch (err) {
      add("sources", "fail", err.message, "Fix .mflow/sources.json by hand or restore it from git; never delete it");
    }
  }

  try {
    const sa = subagentStatus(root, projectDir(root));
    if (sa.warnings.length) add("subagent", "warn", sa.warnings.join(" "), "See /mflow:subagent status");
    else add("subagent", "ok", `apply subagent mflow:dev is ${sa.state} (${sa.source} setting)`);
  } catch (err) {
    add("subagent", "fail", err.message, "Fix .mflow/local.json or .mflow/config.json; until then mflow:dev is denied");
  }

  // Project files the skills and hooks read.
  const agents = readText(path.join(root, "AGENTS.md"));
  if (agents === null) add("agents", "fail", "AGENTS.md is missing", "Run /mflow:init");
  else {
    const gaps = [];
    if (!/^## Stack\b/m.test(agents) || /^Profile:\s*TODO\s*$/m.test(agents)) gaps.push("no stack profile in ## Stack");
    if (!/^## Who decides\b/m.test(agents)) gaps.push("no ## Who decides section (older template)");
    if (gaps.length) add("agents", "warn", `AGENTS.md: ${gaps.join("; ")}`, "Run /mflow:init: it keeps your text and merges the missing parts");
    else add("agents", "ok", "AGENTS.md has a stack profile and the current sections");
  }
  const status = readText(path.join(root, "STATUS.md"));
  if (status === null || !/^##\s*Now\b/m.test(status)) add("status", "warn", status === null ? "STATUS.md is missing" : "STATUS.md has no ## Now section", "Run /mflow:init, or add ## Now from the template");
  else add("status", "ok", "STATUS.md has ## Now");

  // JSON that the briefing reads from the CLIs.
  if (openspec) {
    if (!exists(root, "openspec")) add("openspec-project", "warn", "OpenSpec is not initialised in this project", "Run /mflow:init (step 4)");
    else {
      const list = parseJson(run("openspec list --json", root, 15000));
      if (list && Array.isArray(list.changes)) add("openspec-project", "ok", `openspec list --json reads: ${list.changes.length} change(s)`);
      else add("openspec-project", "warn", "openspec list --json gave output mflow cannot read, so the briefing shows OpenSpec as unavailable", `Compare openspec ${openspec} with the tested ${compat.testedWith.openspec}`);
      const yaml = readText(path.join(root, "openspec", "config.yaml")) ?? readText(path.join(root, "openspec", "config.yml"));
      if (yaml !== null && !yaml.includes("mflow:dev")) add("openspec-guidance", "warn", "openspec/config.yaml has no apply guidance naming mflow:dev (set up before 0.16)", "Run /mflow:init: it merges the guidance");
    }
  }
  if (backlog) {
    if (!exists(root, "backlog")) add("backlog-project", "warn", "Backlog.md is not initialised in this project", "Run /mflow:init (step 4)");
    else {
      const list = parseJson(run("backlog task list --json", root, 15000));
      if (list && Array.isArray(list.tasks)) add("backlog-project", "ok", `backlog task list --json reads: ${list.tasks.length} task(s)`);
      else add("backlog-project", "warn", "backlog task list --json gave output mflow cannot read, so the briefing shows Backlog as unavailable", `Compare backlog ${backlog} with the tested ${compat.testedWith.backlog}`);
    }
  }

  // Upgrades: which plugin version last offered its templates, and leftovers of older versions.
  let record = null;
  try { record = readJsonFile(path.join(root, ".mflow", "templates.json")); } catch { /* reported below as unknown */ }
  if (!record?.pluginVersion) add("templates", "info", "set up before mflow 0.18.0, which started recording the templates it offers", "The next /mflow:init offers the templates that differ, once");
  else if (cmp(record.pluginVersion, plugin) < 0) add("templates", "warn", `templates last offered by mflow ${record.pluginVersion}; this is ${plugin}`, "Run /mflow:init: it offers only the templates that changed");
  else add("templates", "ok", `templates offered by mflow ${record.pluginVersion}`);
  if (exists(root, ".mflow", "suggested")) add("suggested", "warn", ".mflow/suggested/ still holds templates to merge", "Finish /mflow:init step 3: merge each one, show the diff, then delete the folder");
  const cacheDir = path.join(root, ".mflow", "cache");
  const oldCache = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).filter((f) => f.endsWith(".md") && fs.statSync(path.join(cacheDir, f)).isFile()) : [];
  if (oldCache.length) add("cache", "warn", `${oldCache.length} text version(s) in the pre-0.17.2 layout .mflow/cache/<name>.md, no longer read`, "Delete them; capture and consult convert again under .mflow/cache/<path>.<hash>.md");

  // Consultations (optional): a session file that cannot be read hides nothing, but should be fixed.
  try {
    const sessions = listConsultations(root).sessions;
    if (sessions.length) add("consultations", "ok", `${sessions.length} consultation session(s) read`);
  } catch (err) {
    add("consultations", "warn", err.message, "Fix the session file by hand; until then its reports are listed with the waiting work");
  }

  // Golden data made from a customer file that has changed since: its expected values may be old.
  for (const meta of codeFiles(root, ".source.json").filter((f) => /(^|\/)Golden\/[^/]+\.source\.json$/i.test(f))) {
    let info;
    try { info = JSON.parse(readText(path.join(root, meta)) || ""); } catch { info = null; }
    const rel = typeof info?.source === "string" ? path.relative(root, path.resolve(root, info.source)) : "";
    if (!info?.source || !info?.sourceHash) {
      add("golden", "warn", `${meta} does not name its source and sourceHash`, "Regenerate it with /mflow:golden");
    } else if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
      add("golden", "warn", `${meta} names a source outside the project, which is not read`, "Regenerate it with /mflow:golden from a file under the source folder");
    } else if (!exists(root, info.source)) {
      add("golden", "warn", `${meta}: its source ${info.source} is gone`, "Find the file's new name (source-index.mjs scan) and regenerate with /mflow:golden");
    } else if (fileHash(path.join(root, info.source)) !== info.sourceHash) {
      add("golden", "warn", `${meta} was made from an older version of ${info.source}`, `Regenerate: /mflow:golden @${info.source} ${path.basename(meta, ".source.json")}`);
    } else add("golden", "ok", `${meta} matches the current ${info.source}`);
  }

  // Prototype mode that production could turn on (kits built before 0.17.1).
  const cs = codeFiles(root, ".cs");
  const flagged = cs.filter((f) => (readText(path.join(root, f)) || "").includes("Prototype:UseFakeData"));
  if (flagged.length) {
    const guarded = cs.some((f) => /IsEnvironment\(\s*"Prototype"\s*\)/.test(readText(path.join(root, f)) || ""));
    if (guarded) add("prototype-mode", "ok", "the prototype-mode flag has its startup check");
    else add("prototype-mode", "warn", `Prototype:UseFakeData is read (${flagged.slice(0, 3).join(", ")}) but no startup check refuses it outside Development or Prototype: production could turn on fake users`, "/mflow:theme update access");
  }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/** Project files with one extension, from git's list (tracked and not ignored) or a bounded walk. */
function codeFiles(dir, ext) {
  const listed = run("git ls-files -co --exclude-standard -z -- .", dir, 15000);
  if (listed !== null) return listed.split("\0").filter((f) => f.endsWith(ext));
  const out = [];
  const walk = (rel) => {
    if (out.length > 20000) return;
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (/^(\.git|node_modules|bin|obj|dist|\.mflow)$/.test(e.name)) continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(child);
      else if (child.endsWith(ext)) out.push(child);
    }
  };
  walk("");
  return out;
}

const summary = Object.fromEntries(["fail", "warn", "info", "ok"].map((s) => [s, checks.filter((c) => c.status === s).length]));
process.stdout.write(JSON.stringify({ plugin, testedWith: compat.testedWith, testedAt: compat.testedAt, root, summary, checks }, null, 2) + "\n");
