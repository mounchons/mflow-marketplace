#!/usr/bin/env node
// /mflow:monitor: every piece of work in the project on one page, read-only (docs/mflow-factory-proposal.md §11,
// phase 1 of §10). The features of the story map in docs/vision.md with the discussion documents that cover each,
// every discussion document and agenda topic, the branches against main, the merges and latest commits on main, the
// changes in openspec/changes, the rows waiting in docs/reviews/pending.md, change requests, hotspots, the runs of
// /mflow:apply-all and /mflow:night, and the list of what waits for the user.
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
//   node monitor.mjs [--open] [--out <file>]   -> writes the page, prints JSON { file, opened, project, counts, waiting }
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
import { FILE as PENDING, parse as parsePending } from "./pending.mjs";

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
    pending: pendingList ? { file: PENDING, waiting: pendingList.rows.map(({ change, branch, applied, level, test, review, screens }) => ({ change, branch, applied, level, test, review, screens })), done: pendingList.doneRows.length } : null,
    crs,
    hotspots,
    statusNow: now_,
    runs: { open: openRun, applyAll: runFiles(root, "docs/reviews/apply-all"), night: runFiles(root, "docs/reviews/night") },
  };
  project.waiting = waiting(project);
  project.counts = counts(project);
  return project;
}

const settled = (cell) => cell && !/^[—–-]*$/.test(cell.trim());

/** What waits for the user, most urgent first, each a line in Thai for the page and the chat. */
export function waiting(p) {
  const out = [];
  const add = (kind, text, ref = "") => out.push({ kind, text, ref });
  if (p.runs.open) add("run", `รอบ /mflow:apply-all ยังเปิดอยู่${p.runs.open.last ? ` ขั้นล่าสุด ${p.runs.open.last.step} ${p.runs.open.last.state} (${p.runs.open.last.target})` : ""}`, ".git/mflow/apply-all.md");
  for (const l of p.statusNow) {
    const m = /^[-*]\s*(Blocked on|Waiting for the user):\s*(.+)$/i.exec(l);
    if (m && !/^(none|ไม่มี|-|—)\.?$/i.test(m[2].trim())) add(/^blocked/i.test(m[1]) ? "blocked" : "status", `${/^blocked/i.test(m[1]) ? "ติด" : "STATUS รอคุณ"}: ${short(m[2])}`, "STATUS.md");
  }
  if (p.head && p.head.main && p.head.branch !== p.head.main) add("checkout", `checkout อยู่บน ${p.head.branch} ไม่ใช่ ${p.head.main} (/mflow:apply-all เริ่มได้จาก ${p.head.main} เท่านั้น)`);
  if (p.head && p.head.dirty) add("checkout", `มีไฟล์ที่ยังไม่ commit ${p.head.dirty} รายการ`);
  for (const d of p.docs.filter((x) => x.status === "draft")) {
    const text = d.readyToApprove ? "พร้อมอนุมัติ" : d.open ? `ยังเปิด ${d.open} ข้อ` : "ยังไม่พร้อมอนุมัติ";
    add(d.readyToApprove ? "approve" : "discuss", `เอกสาร ${d.id} ${d.slug} ${text}`, d.file);
  }
  for (const d of p.docs.filter((x) => x.unknownFeatures.length)) add("discuss", `เอกสาร ${d.id} ${d.slug}: feature: ${d.unknownFeatures.join(", ")} ไม่ตรงกับข้อใดใน story map`, d.file);
  for (const r of p.pending?.waiting ?? []) {
    const left = [!settled(r.test) && "test", !settled(r.review) && "review"].filter(Boolean);
    if (left.length) add("pending", `change ${r.change} รอ ${left.join(" และ ")}`, p.pending.file);
  }
  for (const c of p.crs) {
    if (!c.approved) add("cr", `${c.id} รออนุมัติ: ${short(c.title, 80)}`, c.file);
    else if (!c.startedBy.length) add("cr", `${c.id} อนุมัติแล้ว ยังไม่มี change: ${short(c.title, 80)}`, c.file);
  }
  for (const b of p.branches.filter((x) => x.group === "stale")) add("branch", `branch ${b.name} ค้าง ${b.ageDays} วัน มี ${b.ahead} commit ที่ยังไม่อยู่ใน main`);
  for (const h of p.hotspots.filter((x) => x.inNow)) add("hotspot", `hotspot ${h.slug} อยู่ใน STATUS ## Now`, h.file);
  const noDoc = p.storyMap.phases.flatMap((ph) => ph.features).filter((f) => f.state === "no-doc");
  if (noDoc.length) add("feature", `feature ${noDoc.length} ข้อยังไม่มีเอกสาร discuss: ${short(noDoc.map((f) => f.key).join(", "), 120)}`, p.storyMap.file);
  const notStarted = (p.agenda?.topics ?? []).filter((t) => !t.doc && t.status === "ยังไม่เริ่ม");
  if (notStarted.length) add("agenda", `หัวข้อใน AGENDA ยังไม่เริ่ม ${notStarted.length} ข้อ: ${short(notStarted.map((t) => t.slug).join(", "), 120)}`, p.agenda.file);
  return out;
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
    waiting: p.waiting.length,
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
const KINDS = {
  run: "violet", blocked: "red", status: "amber", checkout: "slate", approve: "blue", discuss: "amber", pending: "yellow",
  cr: "indigo", branch: "red", hotspot: "cyan", feature: "red", agenda: "amber",
};
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

  const wait = p.waiting.length
    ? `<ol class="waiting">${p.waiting.map((w) => `<li class="k-${KINDS[w.kind] ?? "slate"}">${esc(w.text)}${w.ref ? ` <code>${esc(w.ref)}</code>` : ""}</li>`).join("")}</ol>`
    : `<p class="empty">ไม่มีงานรอคุณ</p>`;

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
<nav><a href="#wait">รอคุณ</a><a href="#features">feature</a><a href="#discuss">discuss</a><a href="#branches">branch</a><a href="#main">main</a><a href="#work">change</a></nav></header>
${section("wait", `รอคุณ ${p.waiting.length}`, wait)}
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
.waiting{margin:0;padding-left:28px}.waiting li{border-left-width:4px;border-left-style:solid;padding:6px 10px;margin:6px 0;background:var(--bg);border-radius:0 8px 8px 0}
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
  return { file: toPosix(file), opened: opt.open ? openInBrowser(file) : false, project: project.name, problems: project.problems, storyMap: project.storyMap.problem, counts: project.counts, waiting: project.waiting };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(JSON.stringify(main(process.argv.slice(2)), null, 2) + "\n");
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err.message }) + "\n");
    process.exit(1);
  }
}
