#!/usr/bin/env node
// SessionStart hook (startup / resume / clear / compact).
// Injects a compact "where are we" briefing so every session starts from the same state.
// Silent (exit 0, no output) in repos that were not initialised with /mflow:init.
import fs from "node:fs";
import path from "node:path";
import {
  readStdinJson, findRoot, loadConfig, run, runJson, readText,
  sessionStateFile, frontmatter, truncate, gitStatus,
} from "./lib.mjs";
import { scan as scanSources } from "./source-index.mjs";
import { list as listDiscussions, reportDiscussId, NOT_STARTED } from "./discuss.mjs";
import { status as applySubagentStatus } from "./apply-subagent.mjs";

const input = readStdinJson();
// The folder Claude Code was opened in; it may sit below the mflow root. Only its
// .claude/settings*.json apply to the session, which the apply-subagent check needs to know.
const projectDir = path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || ".");
const root = findRoot(projectDir);
if (!root) process.exit(0);
// A broken config.json leaves every folder setting unknown: the sections that need one are left out
// and the briefing says why, rather than reading guessed folders.
let cfg = null;
let configError = null;
try {
  cfg = loadConfig(root);
} catch (err) {
  configError = err.message;
}

// Remember when this session started, for the Stop guard, with the commit and the uncommitted changes
// it started from, so the guard can tell files deleted, renamed or committed during the session from
// ones that were already that way. A compaction keeps the same session_id: keep the original record
// so edits made before the compaction still count and the grace period does not restart.
try {
  const stateFile = sessionStateFile(input.session_id);
  let state = null;
  if (input.source === "compact") {
    try { state = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { /* no earlier record */ }
  }
  if (!state || state.root !== root) {
    const git = gitStatus(root);
    state = {
      root,
      startedAt: Date.now(),
      lastBlockAt: 0,
      head: git ? run("git rev-parse HEAD", root, 8000)?.trim() || null : null,
      dirty: git ? git.entries.map((e) => e.key) : null,
    };
  }
  state.projectDir = projectDir; // read by apply-subagent.mjs, which the Bash tool runs without CLAUDE_PROJECT_DIR
  fs.writeFileSync(stateFile, JSON.stringify(state));
} catch { /* best effort */ }

const parts = [];
if (configError) {
  parts.push(
    `## mflow config unreadable\n- ${configError}\n` +
      "- Hotspots, source documents, the AI inbox and discussion docs are left out of this briefing until it parses.",
  );
}

// 1. STATUS.md: the "## Now" section plus the newest log entries.
const status = readText(path.join(root, "STATUS.md"));
if (status) {
  const now = /##\s*Now\s*\n([\s\S]*?)(?=\n##\s|$)/i.exec(status);
  const logBody = /##\s*Log[^\n]*\n([\s\S]*)$/i.exec(status);
  const entries = logBody ? logBody[1].split(/\n(?=###\s)/).filter((e) => e.trim().startsWith("###")) : [];
  parts.push("## STATUS.md: Now\n" + (now ? now[1].trim() : "(no '## Now' section)"));
  if (entries.length) {
    parts.push("## STATUS.md: latest log\n" + entries.slice(0, cfg?.statusLogEntriesInContext ?? 2).join("\n").trim());
  }
} else {
  parts.push("## STATUS.md\n(missing: create it from the mflow template before working)");
}

// 2. Active OpenSpec changes (what WILL be true), and the apply subagent.
// The apply guidance hands tasks to mflow:dev only when this briefing says it is on. Off is the
// default and needs no line; a permission rule that blocks a switched-on agent is reported.
let subagent = "";
try {
  const sa = applySubagentStatus(root, projectDir);
  if (sa.state === "on") {
    subagent = `\n- apply subagent mflow:dev is ON (${sa.source} setting): /opsx:apply hands each task to it → /mflow:subagent off to stop`;
  } else if (sa.switchedOn && sa.blockedBy) {
    subagent = `\n- apply subagent mflow:dev is switched on but a Claude Code permission rule blocks it (${sa.blockedBy.map((b) => b.file).join(", ")}): /opsx:apply implements tasks itself`;
  }
} catch { /* setting unreadable: the guard denies the agent, say nothing */ }
const os = runJson("openspec list --json", root, 10000);
if (os && Array.isArray(os.changes)) {
  const active = os.changes.filter((c) => c.status !== "complete" && c.status !== "archived");
  parts.push(
    "## OpenSpec changes in flight\n" +
      (active.length
        ? active.map((c) => `- ${c.name} (${c.completedTasks ?? "?"}/${c.totalTasks ?? "?"} tasks)`).join("\n")
        : "- none") +
      subagent,
  );
} else {
  parts.push("## OpenSpec\n- CLI unavailable or not initialised (run `openspec --version`)" + subagent);
}

// 3. Backlog.md: tasks in progress, and hotspot frontiers.
const bl = runJson("backlog task list --json", root, 10000);
const tasks = bl && Array.isArray(bl.tasks) ? bl.tasks : null;
if (tasks) {
  const doing = tasks.filter((t) => /in progress/i.test(t.status || ""));
  parts.push(
    "## Backlog: In Progress\n" +
      (doing.length ? doing.map((t) => `- ${t.id} ${t.title} [${(t.labels || []).join(", ")}]`).join("\n") : "- none"),
  );
} else {
  parts.push("## Backlog.md\n- CLI unavailable or not initialised (run `backlog --version`)");
}

if (cfg) {
  // 4. Hotspots that are still being charted.
  const hsDir = path.join(root, cfg.hotspotsDir);
  let hotspotLines = [];
  try {
    for (const slug of fs.readdirSync(hsDir)) {
      const map = readText(path.join(hsDir, slug, "map.md"));
      if (!map) continue;
      const fm = frontmatter(map);
      if ((fm.status || "active") !== "active") continue;
      let frontier = "?";
      if (tasks) {
        frontier = tasks.filter(
          (t) => (t.labels || []).includes(`hs-${slug}`) && /to do/i.test(t.status || "") && t.isReady !== false,
        ).length;
      }
      hotspotLines.push(`- ${slug}: ${fm.destination || "(no destination)"}; frontier tickets: ${frontier}`);
    }
  } catch { /* no hotspots dir yet */ }
  if (hotspotLines.length) parts.push("## Active hotspots (/mflow:hotspot <slug>)\n" + hotspotLines.join("\n"));

  // 5. Customer documents not yet processed, and AI-inbox items not yet assessed.
  const pending = [];
  try {
    const src = scanSources(root);
    if (src.new.length) pending.push(`- ${src.new.length} new source doc(s) not processed: ${src.new.slice(0, 5).join(", ")} → /mflow:capture`);
    if (src.changed.length) pending.push(`- ${src.changed.length} source doc(s) changed since processed: ${src.changed.slice(0, 5).map((c) => c.file).join(", ")} → /mflow:capture`);
  } catch (err) {
    // A missing source folder or registry scans as empty, so this is a registry that cannot be trusted.
    // Listing every file as new would send Claude to /mflow:capture, which would write over it.
    pending.push(`- source registry unreadable, so new and changed documents are unknown: ${err.message}. Repair it before /mflow:capture`);
  }
  try {
    const inboxDir = path.join(root, cfg.inboxDir || "docs/ai-inbox");
    const open = fs.readdirSync(inboxDir).filter((f) => f.endsWith(".md") && f !== "README.md" && !f.endsWith(".assessment.md"))
      .filter((f) => {
        const fm = frontmatter(readText(path.join(inboxDir, f)));
        // Reports answering a discussion doc are listed with that doc below, since /mflow:discuss handles them.
        return (fm.status || "new") === "new" && !reportDiscussId(f, fm);
      });
    if (open.length) pending.push(`- ${open.length} AI-inbox item(s) not assessed: ${open.slice(0, 5).join(", ")} → /mflow:assess`);
  } catch { /* no inbox yet */ }
  let discussions = null;
  try {
    discussions = listDiscussions(root);
    const drafts = discussions.docs.filter((d) => d.status === "draft");
    if (drafts.length) {
      const describe = (d) => {
        const open = d.openDecisions.length + d.pendingNotes.length + d.placeholderLines.length +
          d.decisionProblems.length + d.missingSections.length + d.emptySections.length + d.missingMetadata.length;
        const ai = d.pendingReports.length ? `, ${d.pendingReports.length} AI report(s) to fold in` : "";
        return `${d.id}-${d.slug} (rev ${d.revision}, ${d.readyToApprove ? "ready to approve" : `${open} open item(s)`}${ai})`;
      };
      pending.push(`- ${drafts.length} discussion doc(s) waiting for the user's review: ${drafts.slice(0, 5).map(describe).join(", ")} → /mflow:discuss <NN>`);
    }
    // Reports for a doc that is no longer a draft, or that does not exist, are listed too, so none is lost.
    const draftIds = new Set(drafts.map((d) => Number(d.id)));
    const inboxDir = path.join(root, cfg.inboxDir || "docs/ai-inbox");
    const stray = fs.readdirSync(inboxDir)
      .filter((f) => f.endsWith(".md") && f !== "README.md" && !f.endsWith(".assessment.md"))
      .map((f) => ({ f, fm: frontmatter(readText(path.join(inboxDir, f))) }))
      .map(({ f, fm }) => ({ f, status: fm.status || "new", of: reportDiscussId(f, fm) }))
      .filter((r) => r.of && r.status === "new" && !draftIds.has(Number(r.of.id)));
    if (stray.length) {
      pending.push(`- ${stray.length} AI report(s) for a discussion doc that is not a draft: ${stray.slice(0, 5).map((r) => `${r.f} → /mflow:discuss ${r.of.id}`).join(", ")}`);
    }
  } catch { /* no discussions or inbox yet */ }
  if (pending.length) parts.push("## Waiting to be processed\n" + pending.join("\n"));

  // The discussion agenda is advice: shown as an optional suggestion, never as pending work.
  if (discussions?.agenda) {
    const { file, topics } = discussions.agenda;
    const names = (list) => list.slice(0, 3).map((t) => t.slug).join(", ") + (list.length > 3 ? ", …" : "");
    const notStarted = topics.filter((t) => t.status === NOT_STARTED);
    const revisit = topics.filter((t) => t.review && t.status.startsWith("อนุมัติแล้ว"));
    const lines = [];
    if (notStarted.length) lines.push(`- ${notStarted.length} recommended topic(s) not started: ${names(notStarted)} → /mflow:discuss <slug>, or skip in ${file}`);
    if (revisit.length) lines.push(`- ${revisit.length} approved topic(s) a newer source may change: ${names(revisit)} → a new doc with /mflow:discuss <slug>`);
    if (lines.length) parts.push("## Discussion agenda (optional)\n" + lines.join("\n"));
  }
}

parts.push(
  "## Session ritual\n" +
    "Work from the state above. Before ending a session that changed code or decisions, " +
    "update STATUS.md: rewrite '## Now' and add one log entry (Did / Decided / Next).",
);

/**
 * Fit the briefing into `max` characters by shortening the longest parts first, so the short ones
 * (what is waiting, the agenda, the ritual) always arrive whole. A shortened part says so. Cutting the
 * joined text from the end, as before, dropped exactly those.
 */
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
  return truncate(sections.join("\n\n"), max); // only when the short parts alone are too long
}

const HEADER = "# mflow briefing\n\n";
const context = HEADER + fit(parts, 9000 - HEADER.length);
process.stdout.write(
  JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }),
);
