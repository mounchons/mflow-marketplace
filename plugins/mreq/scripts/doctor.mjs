#!/usr/bin/env node
// Read-only health check of an mreq project. Prints JSON:
//   { root, checks: [{ id, level: "ok" | "warn" | "fail", message, fix }], summary: { ok, warn, fail } }
// Exit 0 whatever it finds: it is a report, and /mreq:help reads it. Nothing is written.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OTHER_MARKER, PATHS, compareVersions, findRoot, loadConfig, readJsonFile, readText } from "./lib.mjs";
import { list as listDiscussions } from "./discuss.mjs";
import { status as themeStatus } from "./theme-status.mjs";

const MIN_NODE = 20;
const checks = [];
const add = (id, level, message, fix = "") => checks.push({ id, level, message, fix });

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < MIN_NODE) add("node", "fail", `Node ${process.versions.node} is older than ${MIN_NODE}`, `install Node ${MIN_NODE} or newer`);
else add("node", "ok", `Node ${process.versions.node}`);

const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
if (!root) {
  add("marker", "fail", "no .mreq/config.json in this folder or above it", "/mreq:init");
} else {
  add("marker", "ok", ".mreq/config.json found");
  if (fs.existsSync(path.join(root, OTHER_MARKER))) {
    add("other-plugin", "fail", ".mflow/config.json exists too: another workflow plugin drives this project and writes the same files",
      "use one plugin per project: remove .mreq/ to keep the other one, or move the project's files to mreq/ and remove .mflow/");
  }
  let cfgOk = true;
  try {
    loadConfig(root);
  } catch (err) {
    cfgOk = false;
    add("config", "fail", err.message, "fix .mreq/config.json by hand (valid JSON object)");
  }

  const files = ["AGENTS.md", "CLAUDE.md", PATHS.status, PATHS.vision, PATHS.followups, `${PATHS.project}/README.md`, `${PATHS.discuss}/AGENDA.md`];
  const missing = files.filter((f) => !fs.existsSync(path.join(root, f)));
  if (missing.length) add("scaffold", "warn", `missing: ${missing.join(", ")}`, "/mreq:init (it never overwrites)");
  else add("scaffold", "ok", "project files present");

  const claude = readText(path.join(root, "CLAUDE.md"));
  if (claude !== null && !/^@AGENTS\.md\s*$/m.test(claude)) add("claude-import", "warn", "CLAUDE.md does not import AGENTS.md", "add the line `@AGENTS.md` at the top of CLAUDE.md");

  const agents = readText(path.join(root, "AGENTS.md"));
  if (agents !== null) {
    const sections = ["Requirements", "Stack", "Architecture", "Conventions"].filter((s) => !new RegExp(`^## ${s}\\s*$`, "m").test(agents));
    if (sections.length) add("agents-sections", "warn", `AGENTS.md lacks ## ${sections.join(", ## ")}`, "/mreq:init offers the template to merge");
    const name = /^Project name \(code\):[ \t]*(\S*)/m.exec(agents)?.[1];
    if (!name || name === "TODO") add("project-name", "warn", "AGENTS.md has no project name in code", "/mreq:discuss code-structure, or rerun /mreq:init");
    else if (!/^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]*)?$/.test(name)) add("project-name", "warn", `project name in code "${name}" is not PascalCase ASCII`, "/mreq:discuss code-structure");
    else add("project-name", "ok", `project name in code: ${name}`);
  }

  if (cfgOk) {
    try {
      const { docs, agenda } = listDiscussions(root);
      if (agenda?.warnings.length) {
        add("agenda", "warn", `AGENDA.md: ${agenda.warnings.map((w) => `line ${w.line} ${w.problem}`).join("; ")}`, "fix the rows by hand, then /mreq:discuss agenda");
      }
      const broken = docs.filter((d) => d.unclosedFenceLine !== null || d.missingMetadata.length);
      if (broken.length) add("discuss-docs", "warn", `discussion docs with a broken structure: ${broken.map((d) => d.file).join(", ")}`, "/mreq:discuss <NN> to repair");
    } catch (err) {
      add("discuss", "fail", `discussion docs could not be read: ${err.message}`, "fix the file it names");
    }
    try {
      const kit = themeStatus(root);
      if (!kit.exists) add("theme", "ok", "UI kit not built yet (/mreq:theme)");
      else if (kit.problems.length) add("theme", "fail", `${kit.file}: ${kit.problems.join("; ")}`, "restore the Status and Revision lines by hand");
      else if (kit.missing.length) add("theme", "warn", `UI kit files missing: ${kit.missing.join(", ")}`, "/mreq:theme update <the missing parts>");
      else add("theme", "ok", `UI kit ${kit.status}${kit.approvedOn ? ` ${kit.approvedOn}` : ""}, revision ${kit.revision}`);
    } catch (err) {
      add("theme", "fail", `UI kit README could not be read: ${err.message}`, "fix the file by hand");
    }
  }

  try {
    const pluginVersion = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".claude-plugin", "plugin.json"), "utf8")).version;
    const offered = readJsonFile(path.join(root, ".mreq", "templates.json"))?.pluginVersion;
    if (!offered || compareVersions(offered, pluginVersion) < 0) {
      add("templates", "warn", `templates from ${offered || "an unknown version"}, plugin is ${pluginVersion}`, "/mreq:init offers only the changed templates");
    } else add("templates", "ok", `templates from ${offered}`);
  } catch (err) {
    add("templates", "fail", `.mreq/templates.json could not be read: ${err.message}`, "fix or delete it, then /mreq:init");
  }
}

const summary = { ok: 0, warn: 0, fail: 0 };
for (const c of checks) summary[c.level]++;
process.stdout.write(JSON.stringify({ root, checks, summary }, null, 2) + "\n");
