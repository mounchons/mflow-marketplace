#!/usr/bin/env node
// SessionStart hook (startup / resume / clear / compact).
// Injects a compact "where are we" briefing so every session starts from the same state.
// Silent (exit 0, no output) in repos that were not initialised with /mflow:init.
import fs from "node:fs";
import path from "node:path";
import {
  readStdinJson, findRoot, loadConfig, runJson, readText,
  sessionStateFile, frontmatter, truncate,
} from "./lib.mjs";
import { scan as scanSources } from "./source-index.mjs";
import { list as listDiscussions } from "./discuss.mjs";

const input = readStdinJson();
const root = findRoot(process.env.CLAUDE_PROJECT_DIR || input.cwd);
if (!root) process.exit(0);
const cfg = loadConfig(root);

// Remember when this session started, for the Stop guard. A compaction keeps the same session_id:
// keep the original start so edits made before the compaction still count and the grace period
// does not restart.
try {
  const stateFile = sessionStateFile(input.session_id);
  let state = null;
  if (input.source === "compact") {
    try { state = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { /* no earlier record */ }
  }
  if (!state || state.root !== root) state = { root, startedAt: Date.now(), lastBlockAt: 0 };
  fs.writeFileSync(stateFile, JSON.stringify(state));
} catch { /* best effort */ }

const parts = [];

// 1. STATUS.md: the "## Now" section plus the newest log entries.
const status = readText(path.join(root, "STATUS.md"));
if (status) {
  const now = /##\s*Now\s*\n([\s\S]*?)(?=\n##\s|$)/i.exec(status);
  const logBody = /##\s*Log[^\n]*\n([\s\S]*)$/i.exec(status);
  const entries = logBody ? logBody[1].split(/\n(?=###\s)/).filter((e) => e.trim().startsWith("###")) : [];
  parts.push("## STATUS.md: Now\n" + (now ? now[1].trim() : "(no '## Now' section)"));
  if (entries.length) {
    parts.push("## STATUS.md: latest log\n" + entries.slice(0, cfg.statusLogEntriesInContext).join("\n").trim());
  }
} else {
  parts.push("## STATUS.md\n(missing: create it from the mflow template before working)");
}

// 2. Active OpenSpec changes (what WILL be true).
const os = runJson("openspec list --json", root, 10000);
if (os && Array.isArray(os.changes)) {
  const active = os.changes.filter((c) => c.status !== "complete" && c.status !== "archived");
  parts.push(
    "## OpenSpec changes in flight\n" +
      (active.length
        ? active.map((c) => `- ${c.name} (${c.completedTasks ?? "?"}/${c.totalTasks ?? "?"} tasks)`).join("\n")
        : "- none"),
  );
} else {
  parts.push("## OpenSpec\n- CLI unavailable or not initialised (run `openspec --version`)");
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
  const src = scanSources();
  if (src.new.length) pending.push(`- ${src.new.length} new source doc(s) not processed: ${src.new.slice(0, 5).join(", ")} → /mflow:source`);
  if (src.changed.length) pending.push(`- ${src.changed.length} source doc(s) changed since processed: ${src.changed.slice(0, 5).map((c) => c.file).join(", ")} → /mflow:source`);
} catch { /* no sources yet */ }
try {
  const inboxDir = path.join(root, cfg.inboxDir || "docs/ai-inbox");
  const open = fs.readdirSync(inboxDir).filter((f) => f.endsWith(".md") && f !== "README.md" && !f.endsWith(".assessment.md"))
    .filter((f) => (frontmatter(readText(path.join(inboxDir, f))).status || "new") === "new");
  if (open.length) pending.push(`- ${open.length} AI-inbox item(s) not assessed: ${open.slice(0, 5).join(", ")} → /mflow:assess`);
} catch { /* no inbox yet */ }
try {
  const drafts = listDiscussions(root).docs.filter((d) => d.status === "draft");
  if (drafts.length) {
    const describe = (d) => {
      const open = d.openDecisions.length + d.pendingNotes.length + d.placeholderLines.length;
      return `${d.id}-${d.slug} (rev ${d.revision}, ${d.readyToApprove ? "ready to approve" : `${open} open item(s)`})`;
    };
    pending.push(`- ${drafts.length} discussion doc(s) waiting for พี่ปู: ${drafts.slice(0, 5).map(describe).join(", ")} → /mflow:discuss <NN>`);
  }
} catch { /* no discussions yet */ }
if (pending.length) parts.push("## Waiting to be processed\n" + pending.join("\n"));

parts.push(
  "## Session ritual\n" +
    "Work from the state above. Before ending a session that changed code or decisions, " +
    "update STATUS.md: rewrite '## Now' and add one log entry (Did / Decided / Next).",
);

const context = truncate("# mflow briefing\n\n" + parts.join("\n\n"), 9000);
process.stdout.write(
  JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }),
);
