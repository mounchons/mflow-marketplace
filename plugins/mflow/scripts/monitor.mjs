#!/usr/bin/env node
// /mflow:monitor: every piece of work in the project on one page, read-only (docs/mflow-factory-proposal.md §11,
// phase 1 of §10). The features of the story map in docs/vision.md with the discussion documents that cover each,
// every discussion document and agenda topic, the branches against main, the merges and latest commits on main, the
// changes in openspec/changes, the rows waiting in docs/reviews/pending.md, change requests, hotspots, the runs of
// /mflow:apply-all and /mflow:night, and the guide: what is left to do, by topic, in the order to do it, each with
// the command that does it (0.47).
//
// Read-only: it writes nothing in the tree and takes no git lock (GIT_OPTIONAL_LOCKS=0, so `git status` leaves the
// index alone). Its one file is the page, inside .git (`git rev-parse --git-path mflow/monitor.html`), so the tree
// stays clean for /mflow:apply-all, which refuses a dirty one. It never calls `apply-all.mjs candidates`, which
// refuses a checkout off main or with uncommitted files: the usual state while discussing.
//
// A feature is a numbered line of the story map (`## Scope` of docs/vision.md: `6a. ...` under `**P1: ...**`), or a
// line opening with bold text that goes on past it (`**โมดูลเสริม** (...): ...`), which stands as a group of its own.
// A bold line alone, or with only a note in parentheses after it, names a phase. A discussion document links itself
// to features exactly with `feature:` in its frontmatter (`6a` or `P1-6a`, one, a list or comma-separated). A feature
// no document names that way takes the documents its story-map line cites, marked as an estimate. A story map that
// cannot be read (no file, no `## Scope`, only the template's TODO) says so instead of guessing.
//
// Branches are grouped by ahead/behind against main, never by name or merge commits: nothing ahead is in main
// already; ahead and last committed more than STALE_DAYS ago is left behind; the rest is open.
//
// The guide's topics come in the order the work depends on: what blocks everything (an open apply-all run, a
// failing whole-suite run, STATUS's Blocked on, uncommitted files), the changes not finished, the test, the review
// (after the test: a review without one gives no verdict), the E2E tests, the decisions that wait for the user, and
// the rest (branches, features with no document, the agenda). Test and review come from `pending.mjs status`, so a
// row with changes-requested stays open. E2E is looked up in the records of /mflow:e2e and /mflow:test e2e in
// docs/reviews/tests (`Scope: e2e <screen>`), for the screens of the waiting rows and of docs/ui/screens.md; it
// says "no record found", never "no tests", since where the test files live is the stack's business.
//
//   node monitor.mjs [--open] [--out <file>]   -> writes the page, prints JSON { file, opened, project, counts, guide }
//   node monitor.mjs --json                    -> prints all the page shows as JSON { projects: [...] }, writes nothing
//
// The page takes a list of projects, so more than one can be shown later; today it is the one the command runs in.
// NIGHT_NOW (an ISO time) stands in for the clock in tests.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, frontmatter, loadConfig, readText } from "./lib.mjs";
import { fmList, list as listDiscussions } from "./discuss.mjs";
import { local, localDay, now, parse as parseRun } from "./night.mjs";
import { FILE as PENDING, parse as parsePending, readRecord, status as pendingStatus } from "./pending.mjs";

process.env.GIT_OPTIONAL_LOCKS = "0";

export const STALE_DAYS = 14;
const DAY = 86_400_000;
const LIMIT = { merges: 15, commits: 10, archived: 12, runs: 5, text: 180 };
const STATE_ORDER = ["no-doc", "draft", "approved", "building", "built"];

function git(root, ...args) {
  try {
    return execFileSync("git", ["-c", "core.quotePath=false", ...args], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20_000, maxBuffer: 16 * 1024 * 1024,
    }).replace(/\s+$/, "");
  } catch {
    return null;
  }
}
const lines = (out) => (out ? out.split("\n").filter(Boolean) : []);
const toPosix = (p) => p.split(path.sep).join("/");
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const filesIn = (dir, re) => {
  try {
    return fs.readdirSync(dir).filter((f) => re.test(f)).sort();
  } catch {
    return [];
  }
};
const foldersIn = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
};
const short = (text, max = LIMIT.text) => {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
};

// ---------- the story map ----------

/** The features of the story map (`## Scope` of docs/vision.md), by phase, or why it cannot be read. */
export function storyMap(text, discussDir) {
  if (text === null) return { phases: [], problem: "no docs/vision.md" };
  const all = text.replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "").split("\n");
  const at = all.findIndex((l) => /^##\s+Scope\b/i.test(l));
  if (at < 0) return { phases: [], problem: "docs/vision.md has no ## Scope section" };
  const cite = new RegExp(`${escRe(discussDir.replace(/\/+$/, ""))}/(\\d{2,})-[a-z0-9]+(?:-[a-z0-9]+)*\\.md`, "g");
  const phases = [];
  let phase = null;
  let last = null;
  const open = (title) => {
    phase = { title, code: /^([A-Za-z]+\d+)\s*:/.exec(title)?.[1] ?? "", steps: [] };
    phases.push(phase);
  };
  const add = (id, body) => {
    last = {
      id,
      key: phase.code && /^\d/.test(id) ? `${phase.code}-${id}` : id,
      phase: phase.title,
      text: body,
      cites: [...new Set([...body.matchAll(cite)].map((m) => String(Number(m[1])).padStart(2, "0")))],
      release: false,
    };
    phase.steps.push(last);
  };
  for (const line of all.slice(at + 1)) {
    if (/^#{1,2}\s/.test(line)) break;
    const step = /^\s*(\d+[a-z]?)[.)]\s+(.+)$/.exec(line);
    const bold = /^\s*\*\*([^*]+)\*\*\s*(.*)$/.exec(line);
    if (step) {
      if (!phase) open("");
      add(step[1], step[2].trim());
    } else if (bold) {
      const title = bold[1].trim();
      const rest = bold[2].trim();
      if (/^[A-Za-z]+\d+\s*:/.test(title) || !rest.replace(/^\([^)]*\)\s*/, "")) open(rest ? `${title} ${rest}` : title);
      else {
        open(title);
        add(title, `${title} ${rest}`);
      }
    } else if (/^\s*[─━—–-]{2,}.*[─━—–-]{2,}\s*$/.test(line) && last) last.release = true;
  }
  const steps = phases.flatMap((p) => p.steps);
  if (!steps.length) return { phases: [], problem: "no numbered line under ## Scope in docs/vision.md" };
  if (steps.every((s) => /^TODO\b/i.test(s.text))) return { phases: [], problem: "the story map in docs/vision.md is still the template's TODO" };
  return { phases: phases.filter((p) => p.steps.length), problem: null };
}

/** What a discussion document's `feature:` names, as written. */
export function featureRefs(text) {
  const raw = frontmatter(text).feature;
  if (raw === undefined) return [];
  const listed = fmList(text, "feature");
  return (listed.length ? listed : String(raw).split(",")).map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
}

// ---------- the project ----------

function changes(root) {
  const base = path.join(root, "openspec", "changes");
  const read = (name, dir, archived) => {
    const tasks = readText(path.join(dir, "tasks.md")) ?? "";
    return {
      name: archived ? name.replace(/^\d{4}-\d{2}-\d{2}-/, "") : name,
      folder: archived ? `archive/${name}` : name,
      archived,
      proposal: readText(path.join(dir, "proposal.md")) ?? "",
      done: (tasks.match(/^\s*[-*]\s+\[[xX]\]/gm) ?? []).length,
      total: (tasks.match(/^\s*[-*]\s+\[[ xX]\]/gm) ?? []).length,
    };
  };
  return [
    ...foldersIn(base).filter((n) => n !== "archive").map((n) => read(n, path.join(base, n), false)),
    ...foldersIn(path.join(base, "archive")).map((n) => read(n, path.join(base, "archive", n), true)),
  ];
}

function branches(root, main, at) {
  if (!main) return [];
  return lines(git(root, "for-each-ref", "--format=%(refname:short)%09%(committerdate:unix)%09%(subject)", "refs/heads"))
    .map((line) => {
      const [name, unix, ...subject] = line.split("\t");
      if (name === main) return null;
      const [behind, ahead] = (git(root, "rev-list", "--left-right", "--count", `refs/heads/${main}...refs/heads/${name}`) ?? "0 0").split(/\s+/).map(Number);
      const when = new Date(Number(unix) * 1000);
      const ageDays = Math.max(0, Math.floor((at - when) / DAY));
      const group = ahead === 0 ? "merged" : ageDays > STALE_DAYS ? "stale" : "open";
      return { name, ahead, behind, date: localDay(when), ageDays, subject: subject.join("\t"), group };
    })
    .filter(Boolean)
    .sort((a, b) => a.ageDays - b.ageDays || a.name.localeCompare(b.name));
}

const commitRows = (out) => lines(out).map((l) => {
  const [commit, date, ...subject] = l.split("\t");
  return { commit, date, subject: subject.join("\t") };
});

function runFiles(root, dir) {
  return filesIn(path.join(root, dir), /^\d{4}-\d{2}-\d{2}.*\.md$/).reverse().slice(0, LIMIT.runs).map((f) => {
    const run = parseRun(readText(path.join(root, dir, f)) ?? "");
    const lastEvent = run.events[run.events.length - 1] ?? null;
    return { file: `${dir}/${f}`, finished: run.finished, last: lastEvent };
  });
}

/** STATUS.md `## Now`, as its lines. */
function statusNow(root) {
  const text = (readText(path.join(root, "STATUS.md")) ?? "").replace(/\r\n/g, "\n");
  const m = /^## Now[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  return m ? m[1].split("\n").map((l) => l.trim()).filter(Boolean) : [];
}

const TESTS = "docs/reviews/tests";
const SCREENS = "docs/ui/screens.md";
export const screenKey = (name) => String(name ?? "").replace(/[`*]/g, "").replace(/\s+/g, " ").trim().replace(/^\/+/, "").toLowerCase();

/**
 * The screens of an E2E screens cell: split at commas outside parentheses, each without its note in parentheses
 * (`firm/users (new: list, filters, add), /firm/roles` gives `firm/users` and `/firm/roles`).
 */
export function screensOf(cell) {
  const text = String(cell ?? "").replace(/[`*]/g, "").trim();
  if (!text || /^[—–-]+$/.test(text)) return [];
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";") && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((s) => s.replace(/\([^)]*\)?/g, "").replace(/\s+/g, " ").trim()).filter((s) => s && !/^[—–-]+$/.test(s));
}

/**
 * The records of /mflow:test and /mflow:e2e: the newest whole-suite or since run, and the E2E runs. Newest by the
 * tested commit's time, not the file name: runs of one day are named by their commit's hash, which says nothing of
 * their order.
 */
function testRecords(root) {
  const all = filesIn(path.join(root, TESTS), /^\d{4}-\d{2}-\d{2}.*\.md$/).map((f) => {
    const rec = readRecord(readText(path.join(root, TESTS, f)) ?? "");
    return { file: `${TESTS}/${f}`, date: f.slice(0, 10), branch: rec.branch, commit: rec.commit, scope: rec.scope, result: rec.result };
  });
  const whole = all.filter((r) => r.scope === "whole suite" || /^since\s/.test(r.scope)).slice(-20);
  const time = (r) => Number(r.commit && /^[0-9a-f]{7,64}$/.test(r.commit) ? git(root, "log", "-1", "--format=%ct", r.commit) : 0) || 0;
  for (const r of whole) r.time = time(r);
  whole.sort((a, b) => a.date.localeCompare(b.date) || a.time - b.time || a.file.replace(/\.md$/, "").localeCompare(b.file.replace(/\.md$/, "")));
  const e2e = all.filter((r) => /^e2e\b/i.test(r.scope)).map((r) => {
    const target = r.scope.replace(/^e2e\s*/i, "").trim();
    return { file: r.file, date: r.date, result: r.result, all: !target, flow: /^flow\s/i.test(target), target: screenKey(target.replace(/^flow\s+/i, "")) };
  });
  return { lastWhole: whole[whole.length - 1] ?? null, e2e };
}

/** The screens of docs/ui/screens.md (the first cell of each table row past the header), or null without the file. */
function screenNames(root) {
  const text = readText(path.join(root, SCREENS));
  if (text === null) return null;
  const out = [];
  const all = text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim());
  const separator = (t) => /^\|[\s:|-]+\|?$/.test(t);
  all.forEach((t, i) => {
    // A header is the row right above a separator, in whatever language.
    if (!t.startsWith("|") || separator(t) || separator(all[i + 1] ?? "")) return;
    const name = t.replace(/^\|/, "").split("|")[0].replace(/[`*]/g, "").trim();
    if (name && !out.includes(name)) out.push(name);
  });
  return out;
}

/** Everything the page shows of one project. */
export function collect(root, at = now()) {
  let cfg;
  let configError = null;
  try {
    cfg = loadConfig(root);
  } catch (err) {
    configError = err.message;
    cfg = { discussDir: "docs/decisions/discuss", hotspotsDir: "docs/decisions/hotspots" };
  }
  const discussDir = cfg.discussDir.replace(/\/+$/, "");
  const isRepo = git(root, "rev-parse", "--git-dir") !== null;
  const main = ["main", "master"].find((b) => git(root, "rev-parse", "--verify", "--quiet", `refs/heads/${b}`) !== null) ?? null;
  const head = isRepo
    ? { branch: git(root, "rev-parse", "--abbrev-ref", "HEAD"), commit: git(root, "rev-parse", "--short", "HEAD"), dirty: lines(git(root, "status", "--porcelain")).length, main }
    : null;

  // Discussion documents, with the proposals that cite each and the features each names.
  let discussion = { docs: [], agenda: null };
  try {
    discussion = configError ? discussion : listDiscussions(root);
  } catch { /* an unreadable folder shows as no documents */ }
  const all = changes(root);
  const map = storyMap(readText(path.join(root, "docs", "vision.md")), discussDir);
  const steps = map.phases.flatMap((p) => p.steps);
  const match = (ref) => steps.find((s) => [s.key, s.id].some((k) => k.toLowerCase() === ref.toLowerCase()));
  const docs = discussion.docs.map((d) => {
    const text = readText(path.join(root, d.file)) ?? "";
    const base = path.basename(d.file);
    const packs = String(frontmatter(text).packs ?? "").replace(/[[\]]/g, "").split(",").map((s) => s.trim().split("@")[0]).filter(Boolean);
    const builtBy = all.filter((c) => c.proposal.includes(base) || packs.some((n) => c.proposal.includes(`packs/${n}.md`)));
    const refs = featureRefs(text);
    const state = d.status === "approved" ? (builtBy.some((c) => c.archived) ? "built" : builtBy.length ? "building" : "approved") : d.status;
    return {
      id: d.id, slug: d.slug, title: d.title, file: d.file, status: d.status, state, revision: d.revision,
      open: d.openDecisions.length + d.pendingNotes.length + d.pendingReports.length + d.placeholderLines.length,
      readyToApprove: d.readyToApprove,
      builtBy: builtBy.map((c) => c.folder),
      features: refs.map((r) => match(r)?.key).filter(Boolean),
      unknownFeatures: refs.filter((r) => !match(r)),
    };
  });
  const byId = new Map(docs.map((d) => [d.id, d]));

  // Features: the documents that name them, else the ones their line cites.
  const live = (d) => d && !["dropped", "superseded"].includes(d.status);
  const features = steps.map((s) => {
    const exact = docs.filter((d) => d.features.includes(s.key));
    const how = exact.length ? "feature" : s.cites.length ? "cited" : null;
    const linked = exact.length ? exact : s.cites.map((id) => byId.get(id)).filter(Boolean);
    const counted = linked.filter(live);
    const state = counted.length ? STATE_ORDER[Math.min(...counted.map((d) => Math.max(0, STATE_ORDER.indexOf(d.state))))] : "no-doc";
    return { ...s, how, docs: linked.map((d) => d.id), missingCites: s.cites.filter((id) => !byId.has(id)), state };
  });
  const featureOf = new Map(steps.map((s, i) => [s, features[i]]));
  const phases = map.phases.map((p) => ({ title: p.title, code: p.code, features: p.steps.map((s) => featureOf.get(s)) }));

  // Pending rows, change requests, hotspots, runs.
  const pendingText = readText(path.join(root, PENDING));
  const pendingList = pendingText === null ? null : parsePending(pendingText);
  // Where each waiting row stands, as /mflow:test and /mflow:review read it: open or settled, and whether HEAD holds it.
  let pendingState = null;
  try {
    pendingState = pendingList && isRepo ? pendingStatus(root) : null;
  } catch { /* a list that leads outside the project shows its rows without their state */ }
  const checks = new Map((pendingState?.rows ?? []).map((r) => [r.change, { testOpen: r.testOpen, reviewOpen: r.reviewOpen, levelKind: r.levelKind, landed: r.landed }]));
  const crDir = "docs/reviews/change-requests";
  const crs = filesIn(path.join(root, crDir), /^CR-\d+.*\.md$/).map((f) => {
    const text = readText(path.join(root, crDir, f)) ?? "";
    const id = /^CR-\d+/.exec(f)[0];
    const approved = /^[ \t]*(?:[-*][ \t]*)?\**Approved:?\**[ \t]*(.*)$/mi.exec(text)?.[1].trim() ?? "";
    return {
      id, file: `${crDir}/${f}`,
      title: /^#\s+(.*)$/m.exec(text)?.[1].trim() ?? f,
      approved: approved.replace(/^[—–-]+$/, ""),
      startedBy: all.filter((c) => c.proposal.includes(f) || c.proposal.includes(id)).map((c) => c.folder),
    };
  });
  const now_ = statusNow(root);
  const hotspotsDir = cfg.hotspotsDir.replace(/\/+$/, "");
  const hotspots = foldersIn(path.join(root, hotspotsDir)).filter((s) => fs.existsSync(path.join(root, hotspotsDir, s, "map.md")))
    .map((slug) => ({ slug, file: `${hotspotsDir}/${slug}/map.md`, inNow: now_.some((l) => l.includes(slug)) }));
  let openRun = null;
  if (isRepo) {
    const rel = git(root, "rev-parse", "--git-path", "mflow/apply-all.md");
    const file = rel && path.resolve(root, rel);
    const text = file && readText(file);
    if (text) {
      const run = parseRun(text);
      openRun = { queue: (/^Queue: (.*)$/m.exec(text)?.[1] ?? "").trim(), last: run.events[run.events.length - 1] ?? null };
    }
  }

  const project = {
    name: path.basename(root),
    root: toPosix(root),
    generated: local(at),
    problems: [configError && `.mflow/config.json: ${configError}`, !isRepo && "not a git repository: no branches or merges", isRepo && !main && "no main branch: branches are not compared"].filter(Boolean),
    head,
    storyMap: { file: "docs/vision.md", problem: map.problem, phases },
    docs,
    agenda: discussion.agenda ? { file: discussion.agenda.file, topics: discussion.agenda.topics.map(({ order, title, slug, status, doc }) => ({ order, title, slug, status, doc })) } : null,
    branches: isRepo ? branches(root, main, at) : [],
    merges: isRepo && main ? commitRows(git(root, "log", "--first-parent", "--merges", `-n${LIMIT.merges}`, "--format=%h%x09%cs%x09%s", `refs/heads/${main}`)) : [],
    commits: isRepo && main ? commitRows(git(root, "log", "--first-parent", `-n${LIMIT.commits}`, "--format=%h%x09%cs%x09%s", `refs/heads/${main}`)) : [],
    changes: all.filter((c) => !c.archived).map(({ name, done, total }) => ({ name, done, total })),
    archived: { count: all.filter((c) => c.archived).length, latest: all.filter((c) => c.archived).map((c) => c.folder.replace(/^archive\//, "")).reverse().slice(0, LIMIT.archived) },
    pending: pendingList ? { file: PENDING, waiting: pendingList.rows.map(({ change, branch, applied, level, test, review, screens }) => ({ change, branch, applied, level, test, review, screens, ...checks.get(change) })), done: pendingList.doneRows.length, missing: pendingState?.missing ?? [] } : null,
    tests: testRecords(root),
    screens: screenNames(root),
    crs,
    hotspots,
    statusNow: now_,
    runs: { open: openRun, applyAll: runFiles(root, "docs/reviews/apply-all"), night: runFiles(root, "docs/reviews/night") },
  };
  project.guide = guide(project);
  project.counts = counts(project);
  return project;
}

const settled = (cell) => cell && !/^[—–-]*$/.test(cell.trim());

/** The guide's topics, in the order the work depends on. */
export const TOPICS = [
  ["blocked", "ต้องแก้ก่อน"],
  ["changes", "งานที่ทำค้าง"],
  ["test", "Test ที่ยังไม่ได้ทำ"],
  ["review", "Review ที่ยังไม่ได้ทำ"],
  ["e2e", "E2E ที่ยังไม่ได้ทำ"],
  ["decide", "รอคุณตัดสินใจ"],
  ["other", "ตรวจอื่นๆ"],
];
const MAX_NAMES = 6;
const names = (list) => (list.length > MAX_NAMES ? `${list.slice(0, MAX_NAMES).join(", ")} และอีก ${list.length - MAX_NAMES}` : list.join(", "));
const unquote = (cell) => String(cell ?? "").replace(/`/g, "").trim();
const changesRequested = (r) => /^\s*changes-requested\b/i.test(r.review || "");
// The state pending.mjs gave the row; without it (no git), the cells as written.
const testOpen = (r) => r.testOpen ?? !settled(r.test);
const reviewOpen = (r) => r.reviewOpen ?? !/^\s*(approve|not needed)\b/i.test(r.review || "");
const levelSkip = (r) => (r.levelKind ?? (/^\s*(full|short|skip)\b/i.exec(r.level || "")?.[1] || "").toLowerCase()) === "skip";

/**
 * What is left to do, by topic, in the order to do it: each item a line in Thai, the command that does it (or the
 * words to type), and the file it comes from. Every topic is there, empty or not, so the reply can say "ไม่มี" for
 * one with nothing left. Items are numbered across topics: the number is the order.
 */
export function guide(p) {
  const by = Object.fromEntries(TOPICS.map(([id]) => [id, []]));
  const add = (topic, kind, text, command = "", ref = "") => by[topic].push({ kind, text, command, ref });
  const main = p.head?.main ?? "main";
  const rows = p.pending?.waiting ?? [];
  const pendingFile = p.pending?.file ?? PENDING;

  // 1. What blocks everything else.
  if (p.runs.open) add("blocked", "run", `รอบ /mflow:apply-all ยังเปิดอยู่${p.runs.open.last ? ` ขั้นล่าสุด ${p.runs.open.last.step} ${p.runs.open.last.state} (${p.runs.open.last.target})` : ""}`, "/mflow:apply-all (ทำต่อจากขั้นที่ค้าง)", ".git/mflow/apply-all.md");
  const last = p.tests?.lastWhole;
  if (last && last.result === "fail") add("blocked", "test-fail", `test รอบล่าสุด (${last.scope}) fail บน ${last.branch ?? "?"} ที่ ${String(last.commit ?? "").slice(0, 7)} เมื่อ ${last.date}`, "แก้ test ที่ fail แล้ว commit จากนั้น /mflow:test since", last.file);
  for (const l of p.statusNow) {
    const m = /^[-*]\s*(Blocked on|Waiting for the user):\s*(.+)$/i.exec(l);
    if (!m || /^(none|ไม่มี|-|—)\.?$/i.test(m[2].trim())) continue;
    if (/^blocked/i.test(m[1])) add("blocked", "blocked", `ติด: ${short(m[2])}`, "", "STATUS.md");
    else add("decide", "status", `STATUS รอคุณ: ${short(m[2])}`, "", "STATUS.md");
  }
  if (p.head && p.head.dirty) add("blocked", "dirty", `มีไฟล์ที่ยังไม่ commit ${p.head.dirty} รายการ (run ของ /mflow:test ตอนนี้จะไม่นับให้ change ใน ${PENDING} และ /mflow:apply-all ไม่เริ่ม)`, "git status แล้ว commit หรือเก็บไฟล์ที่ค้าง");

  // 2. The changes not finished, and branches with work not in main.
  for (const c of p.changes) {
    if (c.total && c.done === c.total) add("changes", "archive", `change ${c.name} ทำ task ครบ ${c.done}/${c.total} แล้ว ยังไม่ archive`, `/opsx:archive ${c.name}`, `openspec/changes/${c.name}`);
    else add("changes", "apply", c.total ? `change ${c.name} ทำ task แล้ว ${c.done}/${c.total}` : `change ${c.name} ยังไม่มี task`, `/opsx:apply ${c.name}`, `openspec/changes/${c.name}`);
  }
  // A branch an item of the test or the review names is left out of the branches below; every other one ahead of
  // main is listed, a fix branch waiting for its merge too.
  const namedBranches = new Set();
  const branchOf = (r) => (settled(r.branch) && unquote(r.branch) !== main ? unquote(r.branch) : "");

  // 3. The test: one whole run proves every row HEAD holds.
  const testHere = rows.filter((r) => testOpen(r) && r.landed !== false);
  if (testHere.length) add("test", "pending", `${testHere.length} change รอ test ทั้งชุด: ${names(testHere.map((r) => r.change))}`, "/mflow:test", pendingFile);
  for (const r of rows.filter((x) => testOpen(x) && x.landed === false)) {
    const branch = branchOf(r);
    if (branch) namedBranches.add(branch);
    add("test", "elsewhere", `change ${r.change} ยังไม่อยู่ใน ${p.head?.branch ?? main}${branch ? ` (อยู่บน ${branch})` : ""} /mflow:test ที่นี่จึงยังไม่นับให้`, branch ? `/mflow:review ${branch} แล้ว merge เข้า ${main}` : `commit งานของ ${r.change} ก่อน`, pendingFile);
  }
  const missing = p.pending?.missing ?? [];
  if (missing.length) add("test", "missing", `${missing.length} change archive แล้วแต่ไม่อยู่ใน ${PENDING}: ${names(missing.map((m) => m.change))} (/mflow:test และ /mflow:review pending เพิ่มให้)`, "/mflow:test", pendingFile);

  // 4. The review, after the test: a review without one gives no verdict.
  for (const r of rows.filter(changesRequested)) {
    const report = unquote(r.review).replace(/^changes-requested\s*/i, "") || pendingFile;
    const fix = `fix/${r.change}-review`;
    const b = p.branches.find((x) => x.name === fix);
    if (b && b.ahead > 0) {
      namedBranches.add(fix);
      add("review", "fix", `change ${r.change} review ขอให้แก้ (changes-requested) แก้แล้วบน ${fix} ${b.ahead} commit`, `/mflow:test since บน ${fix} แล้ว /mflow:review ${fix} --short`, report);
    } else {
      add("review", "fix", `change ${r.change} review ขอให้แก้ (changes-requested) ${b ? `${fix} อยู่ใน ${main} แล้ว` : `ไม่พบ branch ${fix}`} แถวจึงยังไม่ปิด`, b ? `/mflow:review pending ${r.change} (review ใหม่จากที่แก้แล้วใน ${main})` : `อ่าน ${report} แล้วแก้ตาม finding หรือ /mflow:review pending ${r.change}`, report);
    }
  }
  const open = rows.filter((r) => reviewOpen(r) && !changesRequested(r) && !levelSkip(r));
  const ready = open.filter((r) => !testOpen(r) && r.landed !== false);
  const afterTest = open.filter((r) => testOpen(r));
  if (ready.length) add("review", "pending", `${ready.length} change test ผ่านแล้ว รอ review: ${names(ready.map((r) => r.change))}`, "/mflow:review pending", pendingFile);
  for (const r of open.filter((x) => !testOpen(x) && x.landed === false)) {
    const branch = branchOf(r);
    if (branch) namedBranches.add(branch);
    add("review", "elsewhere", `change ${r.change} test แล้ว รอ review แต่ยังไม่อยู่ใน ${p.head?.branch ?? main}${branch ? ` (อยู่บน ${branch})` : ""}`, branch ? `/mflow:review ${branch}` : `commit งานของ ${r.change} ก่อน`, pendingFile);
  }
  if (afterTest.length) add("review", "after-test", `${afterTest.length} change รอ review หลัง test: ${names(afterTest.map((r) => r.change))}`, "/mflow:test ก่อน แล้ว /mflow:review pending", pendingFile);

  // 2 (continued). Branches ahead of main that no item above names.
  for (const b of p.branches.filter((x) => x.group === "open" && !namedBranches.has(x.name))) {
    add("changes", "branch", `branch ${b.name} มี ${b.ahead} commit ที่ยังไม่อยู่ใน ${main} (ล่าสุด ${b.date})`, /-review$/.test(b.name) ? `ดู report ของ review ล่าสุดของ branch นี้ แล้ว merge เมื่อ approve` : `/mflow:review ${b.name} แล้ว merge`);
  }

  // 5. E2E: the screens of the waiting rows first, then every screen with no record, then a run of them all.
  const e2e = p.tests?.e2e ?? [];
  // Each screen belongs to the newest row that names it: its record must come after that change was applied.
  const latest = new Map();
  for (const r of rows) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(r.applied || "") ? r.applied : "";
    for (const s of screensOf(r.screens)) {
      const at = latest.get(screenKey(s));
      if (!at || date >= at.date) latest.set(screenKey(s), { screen: s, change: r.change, date });
    }
  }
  // A record counts for one screen: the longest known name its target is, or starts with (`e2e billing/notices
  // detail` is the detail screen's, not billing/notices').
  const known = [...new Set([...latest.keys(), ...(p.screens ?? []).map(screenKey)])].sort((a, b) => b.length - a.length);
  const screenOfRecord = (target) => known.find((k) => target === k || target.startsWith(`${k} `)) ?? target;
  const covered = e2e.filter((e) => !e.all && !e.flow && e.target).map((e) => ({ key: screenOfRecord(e.target), date: e.date }));
  const recorded = (screen, since = "") => covered.some((c) => c.key === screenKey(screen) && c.date >= since);
  const named = new Set(latest.keys());
  const byChange = new Map();
  for (const { screen, change, date } of latest.values()) {
    if (recorded(screen, date)) continue;
    if (!byChange.has(change)) byChange.set(change, { date, screens: [] });
    byChange.get(change).screens.push(screen);
  }
  for (const r of rows.filter((x) => byChange.has(x.change))) {
    const { date, screens } = byChange.get(r.change);
    add("e2e", "screen", `change ${r.change}: หน้าจอ ${screens.length} หน้ายังไม่พบ record ของ /mflow:e2e${date ? ` ตั้งแต่ ${date}` : ""}: ${names(screens)}`, `/mflow:e2e ${screens[0]}${screens.length > 1 ? " (ทีละหน้า)" : ""}`, pendingFile);
  }
  const noRecord = (p.screens ?? []).filter((s) => !named.has(screenKey(s)) && !recorded(s));
  if (noRecord.length) add("e2e", "screens", `หน้าจอใน ${SCREENS} ${noRecord.length} จาก ${p.screens.length} หน้ายังไม่พบ record ของ /mflow:e2e: ${names(noRecord)}`, "/mflow:e2e (ไม่ใส่ชื่อ: บอกว่าหน้าไหนยังไม่มี test หรือแก้หลัง test)", SCREENS);
  const allRuns = e2e.filter((e) => e.all);
  const lastAll = allRuns[allRuns.length - 1];
  if (lastAll && lastAll.result === "fail") add("e2e", "fail", `E2E ทั้งหมดรอบล่าสุด fail เมื่อ ${lastAll.date}`, "แก้แล้ว /mflow:test e2e", lastAll.file);
  else if (!lastAll && e2e.length) add("e2e", "all", "มี E2E รายหน้าจอหรือ flow แล้ว แต่ยังไม่เคยรัน E2E ทั้งหมดพร้อมกัน", "/mflow:test e2e");

  // 6. The decisions that wait for the user.
  for (const d of p.docs.filter((x) => x.status === "draft")) {
    if (d.readyToApprove) add("decide", "approve", `เอกสาร ${d.id} ${d.slug} พร้อมอนุมัติ`, `/mflow:discuss ${d.id} approve`, d.file);
    else add("decide", "discuss", `เอกสาร ${d.id} ${d.slug} ${d.open ? `ยังเปิด ${d.open} ข้อ` : "ยังไม่พร้อมอนุมัติ"}`, `/mflow:discuss ${d.id}`, d.file);
  }
  for (const d of p.docs.filter((x) => x.unknownFeatures.length)) add("decide", "feature-ref", `เอกสาร ${d.id} ${d.slug}: feature: ${d.unknownFeatures.join(", ")} ไม่ตรงกับข้อใดใน story map`, `/mflow:discuss ${d.id} แก้ feature: ให้ตรง story map`, d.file);
  for (const c of p.crs) {
    if (!c.approved) add("decide", "cr", `${c.id} รออนุมัติ: ${short(c.title, 80)}`, `พิมพ์ "ทำ ${c.id}" หรือ "ไม่ทำ ${c.id}"`, c.file);
    else if (!c.startedBy.length) add("decide", "cr", `${c.id} อนุมัติแล้ว ยังไม่มี change: ${short(c.title, 80)}`, `/opsx:propose จาก ${c.file}`, c.file);
  }
  const notBuilt = p.docs.filter((d) => d.state === "approved");
  if (notBuilt.length) add("decide", "build", `เอกสารอนุมัติแล้ว ${notBuilt.length} ฉบับยังไม่มี change อ้างถึง: ${names(notBuilt.map((d) => `${d.id} ${d.slug}`))} (ฉบับที่เป็นการตัดสินใจกลาง เช่น stack หรือสิทธิ์ อาจไม่ต้องมี change ของตัวเอง)`, "/mflow:apply-all (แสดงแผนก่อนถามคุณ) หรือ /opsx:propose");

  // 7. The rest.
  if (p.head && p.head.main && p.head.branch !== p.head.main) add("other", "checkout", `checkout อยู่บน ${p.head.branch} ไม่ใช่ ${p.head.main} (/mflow:test ของรายการรอ และ /mflow:apply-all ทำบน ${p.head.main})`, `git switch ${p.head.main}`);
  for (const b of p.branches.filter((x) => x.group === "stale")) add("other", "branch", `branch ${b.name} ค้าง ${b.ageDays} วัน มี ${b.ahead} commit ที่ยังไม่อยู่ใน ${main}`, `/mflow:review ${b.name} แล้ว merge หรือลบเมื่อไม่ใช้แล้ว`);
  const merged = p.branches.filter((x) => x.group === "merged" && x.name !== p.head?.branch);
  if (merged.length) add("other", "merged", `branch ${merged.length} อันอยู่ใน ${main} หมดแล้ว ลบได้: ${names(merged.map((b) => b.name))}`, `git branch -d ${merged.slice(0, MAX_NAMES).map((b) => b.name).join(" ")}`);
  for (const h of p.hotspots.filter((x) => x.inNow)) add("other", "hotspot", `hotspot ${h.slug} อยู่ใน STATUS ## Now`, `/mflow:hotspot ${h.slug}`, h.file);
  const noDoc = p.storyMap.phases.flatMap((ph) => ph.features).filter((f) => f.state === "no-doc");
  if (noDoc.length) add("other", "feature", `feature ${noDoc.length} ข้อยังไม่มีเอกสาร discuss: ${short(noDoc.map((f) => f.key).join(", "), 120)}`, "/mflow:discuss <หัวข้อ> สำหรับข้อที่ต้องตกลงก่อนสร้าง", p.storyMap.file);
  const notStarted = (p.agenda?.topics ?? []).filter((t) => !t.doc && t.status === "ยังไม่เริ่ม");
  if (notStarted.length) add("other", "agenda", `หัวข้อใน AGENDA ยังไม่เริ่ม ${notStarted.length} ข้อ: ${short(notStarted.map((t) => t.slug).join(", "), 120)}`, `/mflow:discuss ${notStarted[0].slug}`, p.agenda.file);

  let n = 0;
  return TOPICS.map(([id, title]) => ({ id, title, items: by[id].map((item) => ({ n: ++n, ...item })) }));
}

function counts(p) {
  const features = p.storyMap.phases.flatMap((ph) => ph.features);
  const by = (list, key) => list.reduce((m, x) => ({ ...m, [x[key]]: (m[x[key]] ?? 0) + 1 }), {});
  return {
    features: features.length,
    featuresWithDoc: features.filter((f) => f.state !== "no-doc").length,
    docs: by(p.docs, "status"),
    branches: { open: 0, stale: 0, merged: 0, ...by(p.branches, "group") },
    changes: p.changes.length,
    pending: p.pending?.waiting.length ?? 0,
    todo: p.guide.reduce((sum, t) => sum + t.items.length, 0),
  };
}

// ---------- the page ----------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Hues of the mflow theme kit (skills/theme/assets/tokens.css, --app-hue-*), each with its text and subtle shade.
const HUES = {
  sky: ["#0ea5e9", "#0369a1", "#f0f9ff"], blue: ["#3b82f6", "#1d4ed8", "#eff6ff"], indigo: ["#6366f1", "#4338ca", "#eef2ff"],
  violet: ["#8b5cf6", "#6d28d9", "#f5f3ff"], cyan: ["#06b6d4", "#0e7490", "#ecfeff"], emerald: ["#10b981", "#047857", "#ecfdf5"],
  green: ["#22c55e", "#15803d", "#f0fdf4"], yellow: ["#eab308", "#a16207", "#fefce8"], amber: ["#f59e0b", "#b45309", "#fffbeb"],
  red: ["#ef4444", "#b91c1c", "#fef2f2"], slate: ["#94a3b8", "#475569", "#f8fafc"],
};
const STATES = {
  "no-doc": ["red", "ยังไม่มีเอกสาร"], draft: ["amber", "กำลังคุย"], approved: ["blue", "อนุมัติแล้ว"],
  building: ["violet", "มี change เปิดอยู่"], built: ["emerald", "change archive แล้ว"], dropped: ["slate", "ยกเลิก"], superseded: ["slate", "แทนแล้ว"],
};
const GROUPS = { stale: ["red", `ค้างเกิน ${STALE_DAYS} วัน`], open: ["sky", "กำลังทำ"], merged: ["green", "อยู่ใน main แล้ว"] };
const TOPIC_HUES = { blocked: "red", changes: "violet", test: "yellow", review: "blue", e2e: "cyan", decide: "amber", other: "slate" };
const pill = (hue, text, title = "") => `<span class="pill h-${hue}"${title ? ` title="${esc(title)}"` : ""}>${esc(text)}</span>`;
const state = (s) => pill(...(STATES[s] ?? ["slate", s || "—"]));
const section = (id, title, body, note = "") => `<section id="${id}"><h2>${esc(title)}${note ? ` <small>${esc(note)}</small>` : ""}</h2>${body}</section>`;
const table = (head, rows) => (rows.length
  ? `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`
  : `<p class="empty">ไม่มี</p>`);
const tr = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;

function renderProject(p) {
  const docChip = (id, how) => {
    const d = p.docs.find((x) => x.id === id);
    return d ? pill(STATES[d.state]?.[0] ?? "slate", `${how === "cited" ? "≈ " : ""}${d.id}`, `${d.id}-${d.slug}: ${STATES[d.state]?.[1] ?? d.state}${how === "cited" ? " (ประมาณจากการอ้างถึงใน story map)" : ""}`) : "";
  };
  const c = p.counts;
  const tiles = [
    ["sky", "feature มีเอกสาร", `${c.featuresWithDoc}/${c.features}`],
    ["blue", "เอกสารอนุมัติ", `${c.docs.approved ?? 0}`],
    ["amber", "เอกสารกำลังคุย", `${c.docs.draft ?? 0}`],
    ["violet", "change ที่เปิดอยู่", `${c.changes}`],
    ["yellow", "รอ test/review", `${c.pending}`],
    ["red", "branch ค้าง", `${c.branches.stale}`],
    ["green", "branch อยู่ใน main", `${c.branches.merged}`],
  ].map(([hue, label, value]) => `<div class="tile h-${hue}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join("");

  const todo = p.guide.map((t) => {
    const hue = TOPIC_HUES[t.id] ?? "slate";
    const items = t.items.length
      ? `<ol class="waiting" start="${t.items[0].n}">${t.items.map((w) => `<li class="k-${hue}">${esc(w.text)}${w.command ? `<br><span class="go">→ <code>${esc(w.command)}</code></span>` : ""}${w.ref ? ` <small>${esc(w.ref)}</small>` : ""}</li>`).join("")}</ol>`
      : `<p class="empty">ไม่มี</p>`;
    return `<h3>${pill(hue, `${t.title} ${t.items.length}`)}</h3>${items}`;
  }).join("");

  const map = p.storyMap.problem
    ? `<p class="problem">${esc(p.storyMap.problem)}</p>`
    : p.storyMap.phases.map((ph) => `<h3>${esc(ph.title || "story map")}</h3>${table(["ข้อ", "feature", "สถานะ", "เอกสาร discuss"], ph.features.map((f) => tr([
      `<b>${esc(f.key)}</b>`,
      `<span title="${esc(f.text)}">${esc(short(f.text))}</span>${f.missingCites.length ? ` <em class="warn">อ้าง ${esc(f.missingCites.join(", "))} ที่ไม่มีไฟล์</em>` : ""}`,
      state(f.state),
      f.docs.map((id) => docChip(id, f.how)).join(" ") || "—",
    ]) + (f.release ? `<tr class="release"><td colspan="4">── เส้น release ──</td></tr>` : "")))}`).join("");

  const docs = table(["#", "หัวข้อ", "สถานะ", "ค้าง", "feature", "change"], p.docs.map((d) => tr([
    `<b>${esc(d.id)}</b>`,
    `${esc(d.title || d.slug)} <code>${esc(d.slug)}</code>`,
    state(d.state) + (d.readyToApprove ? ` ${pill("blue", "พร้อมอนุมัติ")}` : ""),
    d.status === "draft" ? esc(String(d.open)) : "",
    esc(d.features.join(", ")) + (d.unknownFeatures.length ? ` <em class="warn">ไม่พบ ${esc(d.unknownFeatures.join(", "))}</em>` : ""),
    esc(d.builtBy.join(", ")),
  ])));
  const agenda = p.agenda
    ? `<h3>AGENDA <small>${esc(p.agenda.file)}</small></h3>${table(["#", "หัวข้อ", "สถานะ"], p.agenda.topics.map((t) => tr([esc(t.order), `${esc(t.title)} <code>${esc(t.slug)}</code>`, esc(t.status.replace(/`/g, ""))])))}`
    : "";

  const branchGroups = ["stale", "open", "merged"].map((g) => {
    const list = p.branches.filter((b) => b.group === g);
    return `<h3>${pill(GROUPS[g][0], `${GROUPS[g][1]} ${list.length}`)}</h3>${table(["branch", "นำ main", "ตาม main", "commit ล่าสุด", "ข้อความ"], list.map((b) => tr([
      `<code>${esc(b.name)}</code>${b.name === p.head?.branch ? ` ${pill("sky", "checkout")}` : ""}`, esc(String(b.ahead)), esc(String(b.behind)), `${esc(b.date)} (${esc(String(b.ageDays))} วัน)`, esc(short(b.subject, 100)),
    ])))}`;
  }).join("");

  const mainLog = (list) => table(["commit", "วันที่", "ข้อความ"], list.map((m) => tr([`<code>${esc(m.commit)}</code>`, esc(m.date), esc(short(m.subject, 120))])));
  const work = [
    `<h3>change ที่เปิดอยู่ <small>openspec/changes</small></h3>${table(["change", "task"], p.changes.map((ch) => tr([`<code>${esc(ch.name)}</code>`, ch.total ? `<span class="bar"><i style="width:${Math.round((100 * ch.done) / ch.total)}%"></i></span> ${esc(`${ch.done}/${ch.total}`)}` : "—"])))}`,
    `<h3>รอ test และ review <small>${esc(PENDING)}${p.pending ? ` · Done ${p.pending.done}` : ""}</small></h3>${p.pending ? table(["change", "branch", "applied", "level", "test", "review", "E2E screens"], p.pending.waiting.map((r) => tr([r.change, r.branch, r.applied, r.level, r.test, r.review, r.screens].map((x, i) => (i === 0 ? `<code>${esc(x)}</code>` : esc(x)))))) : `<p class="empty">ไม่มีไฟล์</p>`}`,
    `<h3>Change request</h3>${table(["CR", "เรื่อง", "อนุมัติ", "change"], p.crs.map((cr) => tr([`<b>${esc(cr.id)}</b>`, esc(short(cr.title, 120)), cr.approved ? esc(cr.approved) : pill("indigo", "รออนุมัติ"), esc(cr.startedBy.join(", ")) || "—"])))}`,
    `<h3>Hotspot</h3>${table(["hotspot", "ใน STATUS ## Now"], p.hotspots.map((h) => tr([`<code>${esc(h.slug)}</code>`, h.inNow ? pill("cyan", "ใช่") : ""])))}`,
    `<h3>archive <small>${esc(String(p.archived.count))} change</small></h3>${p.archived.latest.length ? `<p class="list">${p.archived.latest.map((a) => `<code>${esc(a)}</code>`).join(" ")}</p>` : `<p class="empty">ไม่มี</p>`}`,
    `<h3>รอบที่รันเอง</h3>${table(["ไฟล์", "ผล", "ขั้นล่าสุด"], [...p.runs.applyAll, ...p.runs.night].map((r) => tr([`<code>${esc(r.file)}</code>`, r.finished ? esc(r.finished.result) : pill("violet", "ยังไม่จบ"), r.last ? esc(`${r.last.step} ${r.last.state} ${r.last.target}`) : "—"])))}`,
  ].join("");

  const head = p.head
    ? `<code>${esc(p.head.branch)}</code> @ <code>${esc(p.head.commit)}</code>${p.head.dirty ? ` ${pill("amber", `ไฟล์ยังไม่ commit ${p.head.dirty}`)}` : ` ${pill("green", "tree สะอาด")}`}`
    : "";
  return `<article class="project">
<header><h1>${esc(p.name)}</h1><p class="meta"><code>${esc(p.root)}</code> · ${head} · สร้างเมื่อ ${esc(p.generated)}</p>
${p.problems.map((x) => `<p class="problem">${esc(x)}</p>`).join("")}
<div class="tiles">${tiles}</div>
<nav><a href="#todo">ลำดับงาน</a><a href="#features">feature</a><a href="#discuss">discuss</a><a href="#branches">branch</a><a href="#main">main</a><a href="#work">change</a></nav></header>
${section("todo", `ลำดับงาน ${p.counts.todo}`, todo, "เรียงตามลำดับที่ควรทำ แต่ละข้อมีคำสั่งที่ใช้ทำ E2E ทำเมื่อหน้าจอนิ่งแล้วและคุณสั่ง")}
${section("features", "Feature จาก story map", map, "≈ คือเอกสารที่ประมาณจากการอ้างถึงใน story map ใส่ feature: ใน frontmatter ของเอกสารเพื่อผูกให้ตรง")}
${section("discuss", `เอกสาร discuss ${p.docs.length}`, docs + agenda)}
${section("branches", `Branch เทียบ ${p.head?.main ?? "main"}`, branchGroups, "จัดกลุ่มจากจำนวน commit ที่นำและตาม main")}
${section("main", "main", `<h3>merge ล่าสุด</h3>${mainLog(p.merges)}<h3>commit ล่าสุด</h3>${mainLog(p.commits)}`)}
${section("work", "Change และการตรวจ", work)}
</article>`;
}

export function render(projects) {
  const hue = Object.entries(HUES).map(([n, [base, text, subtle]]) => `.h-${n}{background:${subtle};color:${text};border-color:${base}}.k-${n}{border-left-color:${base}}.k-${n}::marker{color:${base}}`).join("");
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>mflow monitor · ${esc(projects.map((p) => p.name).join(", "))}</title>
<style>
:root{--bg:#f8fafc;--surface:#fff;--text:#0f172a;--muted:#64748b;--line:#e2e8f0;--accent:#6366f1}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 system-ui,"Segoe UI","Noto Sans Thai",Tahoma,sans-serif}
.project{max-width:1200px;margin:0 auto;padding:16px}header h1{margin:0 0 4px;font-size:24px;color:var(--accent)}.meta{margin:0 0 12px;color:var(--muted)}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:12px 0}.tile{border:1px solid;border-top-width:4px;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column}.tile b{font-size:26px;line-height:1.1}
nav{display:flex;flex-wrap:wrap;gap:6px;position:sticky;top:0;background:var(--bg);padding:8px 0;z-index:1}nav a{padding:4px 10px;border-radius:999px;background:var(--surface);border:1px solid var(--line);color:var(--accent);text-decoration:none}
section{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:14px 0}h2{margin:4px 0 10px;font-size:18px}h3{margin:14px 0 6px;font-size:15px}small{color:var(--muted);font-weight:400;font-size:12px}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600;white-space:nowrap}td:first-child{white-space:nowrap}
tr.release td{text-align:center;color:#b45309;font-weight:600;background:#fffbeb}
.pill{display:inline-block;border:1px solid;border-radius:999px;padding:0 8px;font-size:12px;white-space:nowrap;margin:1px 0}
.waiting{margin:0;padding-left:28px}.waiting li{border-left-width:4px;border-left-style:solid;padding:6px 10px;margin:6px 0;background:var(--bg);border-radius:0 8px 8px 0}.go{color:var(--muted)}.go code{color:var(--accent);font-weight:600}
code{font-family:ui-monospace,Consolas,monospace;font-size:12px;background:#f1f5f9;border-radius:4px;padding:0 4px}
.empty{color:var(--muted)}.problem{color:#b91c1c;background:#fef2f2;border:1px solid #ef4444;border-radius:8px;padding:8px 12px}.warn{color:#b91c1c;font-style:normal;font-size:12px}
.bar{display:inline-block;width:120px;height:8px;background:var(--line);border-radius:4px;vertical-align:middle;overflow:hidden}.bar i{display:block;height:100%;background:#10b981}
.list{display:flex;flex-wrap:wrap;gap:6px}
${hue}
</style></head><body>
${projects.map(renderProject).join("\n")}
</body></html>
`;
}

// ---------- the command ----------

/** The page in the default browser. No shell anywhere: a path with & or ^ (a folder named R&D) would run as a command under cmd. */
export function opener(file, platform = process.platform) {
  if (platform === "win32") return ["explorer.exe", [file]];
  return [platform === "darwin" ? "open" : "xdg-open", [file]];
}

function openInBrowser(file) {
  if (/^(1|true|yes|on)$/i.test(process.env.CLAUDE_CODE_REMOTE ?? "")) return false;
  const [cmd, args] = opener(file);
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function main(argv) {
  const opt = { open: argv.includes("--open"), json: argv.includes("--json"), out: null };
  const o = argv.indexOf("--out");
  if (o >= 0) opt.out = argv[o + 1] ?? null;
  const root = findRoot(process.cwd());
  if (!root) throw new Error("not an mflow project (no .mflow/config.json here or above): run /mflow:init first");
  const project = collect(root);
  if (opt.json) return { projects: [project] };
  let file = opt.out && path.resolve(opt.out);
  if (!file) {
    const rel = git(root, "rev-parse", "--git-path", "mflow/monitor.html");
    if (!rel) throw new Error("this folder is not a git repository: the page is written inside .git");
    file = path.resolve(root, rel);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, render([project]));
  return { file: toPosix(file), opened: opt.open ? openInBrowser(file) : false, project: project.name, problems: project.problems, storyMap: project.storyMap.problem, counts: project.counts, guide: project.guide };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(JSON.stringify(main(process.argv.slice(2)), null, 2) + "\n");
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err.message }) + "\n");
    process.exit(1);
  }
}
