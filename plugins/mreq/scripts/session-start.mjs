#!/usr/bin/env node
// SessionStart hook (startup / resume / clear / compact).
// Injects a compact "where are we" briefing of the requirement set, so every session starts from the
// same state. Silent (exit 0, no output) in folders that were not set up with /mreq:init.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OTHER_MARKER, PATHS, compareVersions, findRoot, loadConfig, readJsonFile, readText, readStdinJson, truncate } from "./lib.mjs";
import { NOT_STARTED, list as listDiscussions } from "./discuss.mjs";
import { status as themeStatus } from "./theme-status.mjs";

const input = readStdinJson();
const root = findRoot(path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || "."));
if (!root) process.exit(0);

const parts = [];
let cfg = null;
try {
  cfg = loadConfig(root);
} catch (err) {
  parts.push(`## mreq config unreadable\n- ${err.message}\n- Discussion docs and the UI kit are left out of this briefing until it parses.`);
}
if (fs.existsSync(path.join(root, OTHER_MARKER))) {
  parts.push("## Two workflow plugins\n- This project also has .mflow/config.json. mreq commands stay out of a project the other plugin drives; decide which one this project uses → /mreq:help check setup");
}

// 1. STATUS.md: the "## Now" section plus the newest log entries.
const statusText = readText(path.join(root, PATHS.status));
if (statusText) {
  const now = /##\s*Now\s*\n([\s\S]*?)(?=\n##\s|$)/i.exec(statusText);
  const logBody = /##\s*Log[^\n]*\n([\s\S]*)$/i.exec(statusText);
  const entries = logBody ? logBody[1].split(/\n(?=###\s)/).filter((e) => e.trim().startsWith("###")) : [];
  parts.push(`## ${PATHS.status}: Now\n` + (now ? now[1].trim() : "(no '## Now' section)"));
  if (entries.length) {
    parts.push(`## ${PATHS.status}: latest log\n` + entries.slice(0, cfg?.statusLogEntriesInContext ?? 2).join("\n").trim());
  }
} else {
  parts.push(`## ${PATHS.status}\n(missing: rerun /mreq:init to create it)`);
}

if (cfg) {
  // 2. Discussion docs waiting for the user, and the agenda (advice, never pending work).
  try {
    const { docs, agenda } = listDiscussions(root);
    const drafts = docs.filter((d) => d.status === "draft");
    if (drafts.length) {
      const describe = (d) => {
        const open = d.openDecisions.length + d.pendingNotes.length + d.placeholderLines.length +
          d.decisionProblems.length + d.missingSections.length + d.emptySections.length + d.missingMetadata.length;
        return `${d.id}-${d.slug} (rev ${d.revision}, ${d.readyToApprove ? "ready to approve" : `${open} open item(s)`})`;
      };
      parts.push(`## Discussion docs waiting for the user\n- ${drafts.slice(0, 5).map(describe).join(", ")} → /mreq:discuss <NN>`);
    }
    if (agenda) {
      const names = (rows) => rows.slice(0, 4).map((t) => t.slug).join(", ") + (rows.length > 4 ? ", …" : "");
      const notStarted = agenda.topics.filter((t) => t.status === NOT_STARTED);
      const revisit = agenda.topics.filter((t) => t.review && t.status.startsWith("อนุมัติแล้ว"));
      const lines = [];
      if (notStarted.length) lines.push(`- ${notStarted.length} recommended topic(s) not started: ${names(notStarted)} → /mreq:discuss <slug>, or skip in ${agenda.file}`);
      if (revisit.length) lines.push(`- ${revisit.length} approved topic(s) newer input may change: ${names(revisit)} → a new doc with /mreq:discuss <slug>`);
      if (lines.length) parts.push("## Discussion agenda (optional)\n" + lines.join("\n"));
    }
  } catch (err) {
    parts.push(`## Discussion docs\n- could not be read: ${String(err.message).slice(0, 200)}`);
  }

  // 3. The UI kit.
  try {
    const kit = themeStatus(root);
    let line;
    if (!kit.exists) line = "- not built yet → /mreq:theme";
    else if (kit.problems.length) line = `- ${kit.file}: ${kit.problems.join("; ")} → fix by hand, then /mreq:theme`;
    else {
      const state = kit.status === "approved" ? `approved ${kit.approvedOn}` : "draft";
      const missing = kit.missing.length ? `; ${kit.missing.length} kit file(s) missing (${kit.missing.slice(0, 3).join(", ")})` : "";
      const next = kit.status === "approved" ? "/mreq:theme update <what> to change it" : "/mreq:theme open to look, /mreq:theme approve when it matches";
      line = `- ${state}, revision ${kit.revision}${missing} → ${next}`;
    }
    parts.push("## UI kit (mreq/ui/theme)\n" + line);
  } catch (err) {
    parts.push(`## UI kit\n- could not be read: ${String(err.message).slice(0, 200)}`);
  }
}

// An mreq upgrade: the project's templates came from an older plugin version.
try {
  const pluginVersion = JSON.parse(readText(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".claude-plugin", "plugin.json"))).version;
  const offered = readJsonFile(path.join(root, ".mreq", "templates.json"))?.pluginVersion;
  if (!offered || compareVersions(offered, pluginVersion) < 0) {
    parts.push(`## mreq upgrade\n- mreq ${pluginVersion} has templates newer than this project's (${offered ? `from ${offered}` : "no record"}) → /mreq:init offers only the changed ones`);
  }
} catch { /* unreadable record: /mreq:help check setup reports it */ }

parts.push(
  "## Session ritual\n" +
    `Work from the state above. Before ending a session that changed requirements or the kit, update ${PATHS.status}: ` +
    "rewrite '## Now' and add one log entry (Did / Decided / Next).",
);

/** Fit the briefing into `max` characters by shortening the longest parts first, so the short ones arrive whole. */
function fit(sections, max) {
  const NOTE = "\n…(shortened to fit the briefing; the file has the rest)";
  const size = () => sections.reduce((n, p) => n + p.length + 2, -2);
  const shortened = new Set();
  while (size() > max) {
    let i = -1;
    sections.forEach((p, k) => {
      if (!shortened.has(k) && p.length > 400 && (i < 0 || p.length > sections[i].length)) i = k;
    });
    if (i < 0) break;
    sections[i] = sections[i].slice(0, Math.max(400, sections[i].length - (size() - max) - NOTE.length)) + NOTE;
    shortened.add(i);
  }
  return truncate(sections.join("\n\n"), max);
}

const HEADER = "# mreq briefing\n\n";
const context = HEADER + fit(parts, 9000 - HEADER.length);
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }));
