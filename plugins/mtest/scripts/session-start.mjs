#!/usr/bin/env node
// SessionStart hook (startup / resume / clear / compact).
// Injects a compact briefing of the project's test state: the newest test run and whether HEAD moved
// since, an unfinished run, flow coverage gaps, what is still unreviewed, parts never verified, and a
// stale cloud copy of the plugin. Silent (exit 0, no output) in folders not set up with /mtest:init.
import fs from "node:fs";
import path from "node:path";
import { OTHER_MARKER, PATHS, compareVersions, findRoot, git, loadConfig, pluginVersion, readJsonFile, readStdinJson, readText, truncate } from "./lib.mjs";
import { checkAll, summaryLine } from "./flows.mjs";
import { listRecords, verifiedParts } from "./run.mjs";
import { reviewSince } from "./reviews.mjs";
import { vendorStatus } from "./vendor.mjs";

const input = readStdinJson();
const root = findRoot(path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || "."));
if (!root) process.exit(0);

const parts = [];
const safe = (title, fn) => {
  try {
    const text = fn();
    if (text) parts.push(`## ${title}\n${text}`);
  } catch (err) {
    parts.push(`## ${title}\n- could not be read: ${String(err.message).slice(0, 200)}`);
  }
};

let cfg = null;
try {
  cfg = loadConfig(root);
} catch (err) {
  parts.push(`## mtest config unreadable\n- ${err.message}`);
}
if (fs.existsSync(path.join(root, OTHER_MARKER))) {
  parts.push("## Two plugins\n- This project also has .mflow/config.json: mflow has its own test and review commands; use those, and remove .mtest/ when it is not needed.");
}

safe(`${PATHS.status}: Now`, () => {
  const text = readText(path.join(root, PATHS.status));
  if (!text) return `(missing: rerun /mtest:init to create it)`;
  const now = /##\s*Now\s*\n([\s\S]*?)(?=\n##\s|$)/i.exec(text);
  return now ? now[1].trim() : "(no '## Now' section)";
});

if (cfg) {
  safe("Test runs (mtest/runs)", () => {
    const lines = [];
    const open = readJsonFile(path.join(root, PATHS.openRun));
    if (open) lines.push(`- unfinished run started ${open.startedAt} (${open.scopeLabel}, ${open.parts.length} part(s) done): finish it with run.mjs finish, or abort it`);
    const recs = listRecords(root);
    const head = git(root, "rev-parse", "HEAD");
    const describe = (r) => {
      let moved = "";
      if (head && r.commit && r.commit !== "none") {
        const n = r.commit === head ? 0 : Number(git(root, "rev-list", "--count", `${r.commit}..HEAD`) ?? NaN);
        moved = r.commit === head ? ", at HEAD" : Number.isFinite(n) ? `, ${n} commit(s) behind HEAD` : ", not an ancestor of HEAD";
      }
      return `${r.result || "?"} — ${r.scope} at ${r.commit?.slice(0, 7) ?? "?"}${r.dirty ? " with uncommitted changes" : ""}, ${r.duration}${moved} (${r.file})`;
    };
    if (!recs.length) lines.push("- no run recorded yet → /mtest:test");
    else {
      lines.push(`- newest: ${describe(recs[0])}`);
      const whole = recs.find((r) => r.scope === "whole suite" || r.scope.startsWith("since "));
      if (whole && whole !== recs[0]) lines.push(`- newest whole suite: ${describe(whole)}`);
      if (whole && whole.result === "fail") lines.push(`- failing: ${whole.failures.slice(0, 3).join(" | ") || "see the record"} → fix, commit, then /mtest:test since`);
    }
    const verified = verifiedParts(root, cfg, recs);
    const unverified = cfg.parts.filter((p) => !verified.has(p.name)).map((p) => p.name);
    if (unverified.length) lines.push(`- parts no record shows passing yet (unverified): ${unverified.join(", ")}`);
    if (!cfg.parts.length) lines.push("- no test parts in .mtest/config.json → /mtest:init");
    return lines.join("\n");
  });

  safe("Flows (mtest/flows)", () => {
    const r = checkAll(root, cfg);
    if (!r.flows.length) return "- no flow doc yet → /mtest:flow to map the flows and their cases";
    const lines = [`- ${r.totals.flows} flow(s), ${r.totals.casesWithTest}/${r.totals.cases - r.totals.e2ePending} case(s) with a test${r.totals.e2ePending ? `, ${r.totals.e2ePending} E2E case(s) on request` : ""}`];
    for (const f of r.flows.filter((x) => !x.ok).slice(0, 5)) lines.push(`- ${summaryLine(f)} → /mtest:flow ${f.flow}`);
    return lines.join("\n");
  });

  safe("Reviews (mtest/reviews)", () => {
    const s = reviewSince(root, cfg);
    if (!s.base) return null;
    const last = s.lastReview ? `newest: ${s.lastReview.verdict || "?"} (${s.lastReview.file}); ` : "";
    return `- ${last}${s.commits.length} commit(s) since ${s.why}${s.commits.length ? " → /mtest:review since" : ""}`;
  });

  safe("Cloud copy (.claude/skills/mtest)", () => {
    const v = vendorStatus(root);
    if (!v.present || v.foreign || v.current) return null;
    return `- the copy is mtest ${v.version}, this plugin is ${v.pluginVersion} → node vendor.mjs write (shown by /mtest:init)`;
  });
}

try {
  const offered = readJsonFile(path.join(root, ".mtest", "templates.json"))?.pluginVersion;
  const version = pluginVersion();
  if (!offered || compareVersions(offered, version) < 0) {
    parts.push(`## mtest upgrade\n- mtest ${version} has templates newer than this project's (${offered ? `from ${offered}` : "no record"}) → /mtest:init offers only the changed ones`);
  }
} catch { /* unreadable record: the doctor reports it */ }

parts.push("## Ritual\nRun tests through the parts in .mtest/config.json, one at a time in the foreground; reuse a record at the same commit instead of running again. E2E only when the user calls it. Before ending a session that changed tests or flows, update mtest/STATUS.md '## Now'.");

const context = "# mtest briefing\n\n" + truncate(parts.join("\n\n"), 7000);
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }));
