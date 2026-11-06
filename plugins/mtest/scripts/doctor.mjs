#!/usr/bin/env node
// Read-only health check of an mtest project. Each check reports ok, warn or fail with the fix.
//
// Usage: node doctor.mjs [--root <dir>]
import fs from "node:fs";
import path from "node:path";
import { MARKER, OTHER_MARKER, PATHS, defaultBranch, findRoot, git, loadConfig, readText, toPosix } from "./lib.mjs";
import { checkAll } from "./flows.mjs";
import { configWorkers, verifiedParts } from "./run.mjs";
import { vendorStatus } from "./vendor.mjs";

const args = process.argv.slice(2);
const i = args.indexOf("--root");
const start = i >= 0 ? args[i + 1] : process.env.CLAUDE_PROJECT_DIR || process.cwd();
const root = findRoot(start) ?? path.resolve(start);
const checks = [];
const add = (id, status, detail, fix = null) => checks.push({ id, status, detail, fix });
const marker = toPosix(MARKER);

if (!fs.existsSync(path.join(root, MARKER))) {
  add("marker", "fail", `${marker} not found`, "/mtest:init");
} else {
  if (fs.existsSync(path.join(root, OTHER_MARKER))) add("other-plugin", "fail", "the project also has .mflow/config.json; mflow has its own test and review commands", "use mflow's commands, or remove .mtest/ and mtest/");
  let cfg = null;
  try {
    cfg = loadConfig(root);
    add("config", "ok", `${marker} parses`);
  } catch (err) {
    add("config", "fail", err.message, "fix the file by hand");
  }

  const agents = readText(path.join(root, "AGENTS.md"));
  if (!agents) add("agents-md", "fail", "AGENTS.md is missing", "/mtest:init");
  else if (!/^## Testing \(mtest\)/m.test(agents)) add("agents-md", "warn", "AGENTS.md has no `## Testing (mtest)` section", "/mtest:init merges it from .mtest/suggested/AGENTS.md");
  else add("agents-md", "ok", "AGENTS.md has the testing section");
  const claude = readText(path.join(root, "CLAUDE.md"));
  if (!claude) add("claude-md", "warn", "CLAUDE.md is missing", "/mtest:init creates it");
  else if (!/^@AGENTS\.md/m.test(claude)) add("claude-md", "warn", "CLAUDE.md does not import AGENTS.md (`@AGENTS.md`)", "add `@AGENTS.md` as its first line");
  else add("claude-md", "ok", "CLAUDE.md imports AGENTS.md");

  for (const dir of [PATHS.flows, PATHS.runs, PATHS.reviews]) {
    if (!fs.existsSync(path.join(root, dir))) add(`folder:${dir}`, "warn", `${dir}/ is missing`, "/mtest:init");
  }
  const ignore = readText(path.join(root, ".mtest", ".gitignore")) ?? "";
  if (!/^logs\/?$/m.test(ignore) || !/^tmp\/?$/m.test(ignore)) add("gitignore", "warn", ".mtest/.gitignore does not keep logs/ and tmp/ out of git", "/mtest:init");

  if (cfg) {
    if (!cfg.parts.length) add("parts", "fail", "no test parts in .mtest/config.json", "/mtest:init finds and verifies them");
    else {
      add("parts", "ok", `${cfg.parts.length} part(s): ${cfg.parts.map((p) => `${p.name} (${p.kind})`).join(", ")}`);
      const verified = verifiedParts(root, cfg);
      const unverified = cfg.parts.filter((p) => !verified.has(p.name)).map((p) => p.name);
      if (unverified.length) add("unverified", "warn", `no record in mtest/runs shows these passing yet: ${unverified.join(", ")}`, "/mtest:test (or /mtest:e2e for E2E parts)");
      for (const p of cfg.parts.filter((x) => x.kind === "e2e")) {
        const w = configWorkers(path.join(root, p.cwd ?? "."));
        if (w !== null && w > cfg.e2eMaxWorkers) add(`e2e-workers:${p.name}`, "warn", `its Playwright config sets workers: ${w}, above e2eMaxWorkers ${cfg.e2eMaxWorkers}`, "run.mjs adds --workers within the cap; lower it in the config too");
      }
    }
    if (git(root, "rev-parse", "--is-inside-work-tree") !== "true") add("git", "warn", "not a git repository: records cannot be tied to a commit", "git init");
    else if (!defaultBranch(root, cfg)) add("default-branch", "warn", "no default branch found (no origin HEAD, no main or master)", 'set "defaultBranch" in .mtest/config.json');
    try {
      const flows = checkAll(root, cfg);
      if (flows.flows.length && !flows.ok) add("flows", "warn", `${flows.totals.flowsWithGaps} flow(s) with gaps`, "/mtest:flow <flow> write");
      else if (flows.flows.length) add("flows", "ok", `${flows.totals.flows} flow(s), every case has a test`);
      for (const f of flows.flows) for (const p of f.problems) add(`flow:${f.flow}`, "fail", p, `fix ${f.file}`);
    } catch (err) {
      add("flows", "warn", `could not be checked: ${err.message}`);
    }
    const v = vendorStatus(root);
    if (v.present && !v.foreign && !v.current) add("cloud-copy", "warn", `.claude/skills/mtest is mtest ${v.version}, the plugin is ${v.pluginVersion}`, "node vendor.mjs write");
    if (v.present && v.foreign) add("cloud-copy", "warn", ".claude/skills/mtest exists but is not an mtest copy; it is left alone", "rename it if a cloud copy is wanted");
    if (fs.existsSync(path.join(root, PATHS.openRun))) add("open-run", "warn", "a test run was started and never finished", "node run.mjs finish, or node run.mjs abort");
  }
}

const worst = checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "warn") ? "warn" : "ok";
process.stdout.write(JSON.stringify({ root, status: worst, checks }, null, 2) + "\n");
