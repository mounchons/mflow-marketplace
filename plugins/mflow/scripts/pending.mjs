#!/usr/bin/env node
// The list of changes whose tasks are done but whose work the whole suite has not yet proven, or no review
// has yet read: docs/reviews/pending.md. /opsx:apply adds a row when a change's tasks are done (mflow's
// apply guidance in openspec/config.yaml), so apply never stops the work to ask for /mflow:test or
// /mflow:review; the user runs those later, usually on main, once for every change in the list.
// /mflow:test ticks Test for every row its passing run contains, by git ancestry; /mflow:review pending
// reviews the rows one at a time and ticks Review. A row with both (or with Test, at level skip) moves to
// ## Done.
//
// Where a change's work ends is the newest commit that touches its folder, openspec/changes/<name>/ or
// openspec/changes/archive/<date>-<name>/ (the last tick in tasks.md, or the archive); where it starts is
// the commit before the first one that touched that folder (the proposal).
//
//   node pending.mjs status                       -> JSON: the rows with where each change ends and whether HEAD holds it, the rows done, archived changes missing from the list
//   node pending.mjs range <change>               -> JSON: the commits and files of one change, for its review
//   node pending.mjs add <change> --level <full|short|skip> [--why <text>] [--branch <name>] [--screens <list>] [--applied <YYYY-MM-DD>]
//   node pending.mjs init [--since <YYYY-MM-DD>]  -> create the list, or set its Since date: archived changes from that date on that are not listed count as missing
//   node pending.mjs tick-test <record>           -> Test for every open row the record's commit holds (a passing whole-suite or since run, clean tree)
//   node pending.mjs tick-review <change> --report <path> --verdict <approve|changes-requested|none>
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, insideProject, readText, realInside, writeFileAtomic } from "./lib.mjs";

export const FILE = "docs/reviews/pending.md";
export const NAME = /^[a-z0-9][a-z0-9-]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LEVELS = ["full", "short", "skip"];
const VERDICTS = ["approve", "changes-requested", "none"];
const COLS = ["Change", "Branch", "Applied", "Review level", "Test", "Review", "E2E screens"];
const DONE_COLS = ["Change", "Applied", "Test", "Review"];
const KEYS = { Change: "change", Branch: "branch", Applied: "applied", "Review level": "level", Test: "test", Review: "review", "E2E screens": "screens" };
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const DONE_HEADING = /^##\s+Done\b/i;

export const TEMPLATE = `# Waiting for test and review · รอ test และ review

<!-- Written by mflow. /opsx:apply adds a row when a change's tasks are done, instead of asking for /mflow:test and
     /mflow:review; the user runs those later, usually on main, once for every row. /mflow:test fills Test when a
     passing whole-suite or since run holds the change; /mflow:review pending fills Review. A row moves to Done when
     both are filled, or Test alone at level skip. Review level: full, short or skip, then the reason in a few words.
     "Since:" (optional, YYYY-MM-DD): changes archived from that date on that are missing here are added by
     /mflow:test and /mflow:review. -->

| ${COLS.join(" | ")} |
|${COLS.map(() => "---").join("|")}|

## Done

| ${DONE_COLS.join(" | ")} |
|${DONE_COLS.map(() => "---").join("|")}|
`;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const open = (cell) => !cell || /^[—–-]*$/.test(cell.trim());
const clean = (text) => String(text ?? "").replace(/\|/g, "/").replace(/[\r\n]+/g, " ").trim() || "—";
const isDoc = (f) => /\.md$/i.test(f) || /^(openspec|backlog|docs)\//.test(f) || f === "STATUS.md";

// ---------- git ----------

function git(root, args, timeout = 20_000) {
  try {
    return execFileSync("git", ["-c", "core.quotePath=false", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout, maxBuffer: 16 * 1024 * 1024 });
  } catch {
    return null;
  }
}
const gitOk = (root, args) => spawnSync("git", args, { cwd: root, stdio: "ignore", timeout: 20_000 }).status === 0;
const lines = (out) => (out || "").split("\n").map((l) => l.trim()).filter(Boolean);
const isAncestor = (root, a, b) => a === b || gitOk(root, ["merge-base", "--is-ancestor", a, b]);
const commitOf = (root, ref) => (ref && gitOk(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) ? lines(git(root, ["rev-parse", `${ref}^{commit}`]))[0] : null);

const archiveGlob = (name) => `:(glob)openspec/changes/archive/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-${name}/**`;
const changePaths = (name) => [`openspec/changes/${name}`, archiveGlob(name)];

/** The archive folders of a change at HEAD, oldest first (a name used twice has two). */
function archiveFolders(root, name) {
  const dir = path.join(root, "openspec", "changes", "archive");
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const re = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${name}$`);
  return entries.filter((e) => e.isDirectory() && re.test(e.name)).map((e) => e.name).sort();
}

/** Where a change's work ends and starts, as commits: the newest and the oldest that touch its folder. */
export function locate(root, name, branch) {
  const paths = changePaths(name);
  let from = "HEAD";
  let end = lines(git(root, ["log", "-1", "--format=%H", "HEAD", "--", ...paths]))[0] || null;
  // The branch's tip, when the work went on there after the last commit that touched the folder (code
  // committed after the last tick, or the whole change while it is not merged yet).
  const tip = branch && !open(branch) ? commitOf(root, branch.replace(/`/g, "")) : null;
  if (tip) {
    if (!end) {
      from = tip;
      end = lines(git(root, ["log", "-1", "--format=%H", tip, "--", ...paths]))[0] || null;
    }
    if (end && isAncestor(root, end, tip)) end = tip;
  }
  if (!end) return { end: null, start: null, base: null, landed: false };
  const landed = isAncestor(root, end, commitOf(root, "HEAD") || "HEAD");
  // A name used before: count only the commits after the older change's archive.
  const folders = archiveFolders(root, name);
  let after = null;
  if (folders.length >= 2) {
    after = lines(git(root, ["log", "--diff-filter=A", "--reverse", "--format=%H", from, "--", `openspec/changes/archive/${folders[folders.length - 2]}`]))[0] || null;
  }
  const start = lines(git(root, ["log", "--reverse", "--format=%H", after ? `${after}..${end}` : end, "--", ...paths]))[0] || end;
  const base = commitOf(root, `${start}^`) || EMPTY_TREE;
  return { end, start, base, landed };
}

// ---------- the list ----------

function cells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}
const isSeparator = (line) => /^\|[\s:|-]+\|?$/.test(line.trim());

/** The table in these lines: its header, its rows as objects, and where it sits. */
function readTable(block, defaults) {
  const at = block.findIndex((l) => l.trim().startsWith("|"));
  if (at < 0) return { at: -1, end: -1, rows: [] };
  let end = at;
  while (end < block.length && block[end].trim().startsWith("|")) end++;
  const head = cells(block[at]);
  const known = head.every((h) => KEYS[h]) ? head : defaults;
  const rows = [];
  for (const line of block.slice(at, end)) {
    if (isSeparator(line)) continue;
    const c = cells(line);
    if (c.join("|") === head.join("|")) continue;
    const row = {};
    known.forEach((h, i) => { row[KEYS[h]] = c[i] ?? ""; });
    if (row.change && NAME.test(row.change.replace(/`/g, ""))) {
      row.change = row.change.replace(/`/g, "");
      rows.push(row);
    }
  }
  return { at, end, rows };
}

export function parse(text) {
  const all = text.replace(/\r\n/g, "\n").split("\n");
  const d = all.findIndex((l) => DONE_HEADING.test(l));
  const main = d < 0 ? all : all.slice(0, d);
  const done = d < 0 ? [] : all.slice(d);
  const since = /^Since:\s*(\d{4}-\d{2}-\d{2})\s*$/m.exec(main.join("\n"))?.[1] || null;
  return { all, d, main, done, since, rows: readTable(main, COLS).rows, doneRows: readTable(done, DONE_COLS).rows };
}

const renderRows = (cols, rows) => [
  `| ${cols.join(" | ")} |`,
  `|${cols.map(() => "---").join("|")}|`,
  ...rows.map((r) => `| ${cols.map((h) => clean(r[KEYS[h]])).join(" | ")} |`),
];

/** The file with these rows: everything around the two tables stays as the user left it. */
export function render(text, rows, doneRows, since) {
  const p = parse(text);
  let main = [...p.main];
  if (since !== undefined) {
    const i = main.findIndex((l) => /^Since:/.test(l));
    if (i >= 0) main[i] = `Since: ${since}`;
    else {
      const title = main.findIndex((l) => /^#\s/.test(l));
      main.splice(title + 1, 0, "", `Since: ${since}`);
    }
  }
  const t = readTable(main, COLS);
  if (t.at >= 0) main.splice(t.at, t.end - t.at, ...renderRows(COLS, rows));
  else main.push(...(main.length && main[main.length - 1].trim() ? [""] : []), ...renderRows(COLS, rows), "");
  let done = p.d < 0 ? ["## Done", ""] : [...p.done];
  const dt = readTable(done, DONE_COLS);
  if (dt.at >= 0) done.splice(dt.at, dt.end - dt.at, ...renderRows(DONE_COLS, doneRows));
  else done.push(...renderRows(DONE_COLS, doneRows));
  while (main.length && !main[main.length - 1].trim()) main.pop();
  return [...main, "", ...done].join("\n").replace(/\n+$/, "") + "\n";
}

function load(root) {
  if (!realInside(root, FILE)) throw new Error(`${FILE} leads outside the project through a link`);
  const text = readText(path.join(root, FILE));
  return { exists: text !== null, text: text ?? TEMPLATE, ...parse(text ?? TEMPLATE) };
}
function save(root, list, rows, doneRows, since) {
  writeFileAtomic(path.join(root, FILE), render(list.text, rows, doneRows, since));
}

const levelOf = (row) => (/^\s*(full|short|skip)\b/i.exec(row.level || "")?.[1] || "").toLowerCase();
const reviewed = (row) => /^\s*approve\b/i.test(row.review || "") || /^\s*not needed\b/i.test(row.review || "");

/** Rows whose Test and Review are both settled leave for Done. */
function settle(rows, doneRows) {
  const keep = [];
  const moved = [];
  for (const r of rows) {
    if (!open(r.test) && levelOf(r) === "skip" && open(r.review)) r.review = "not needed (level skip)";
    if (!open(r.test) && reviewed(r)) {
      doneRows.push({ change: r.change, applied: r.applied, test: r.test, review: r.review });
      moved.push(r.change);
    } else keep.push(r);
  }
  return { rows: keep, moved };
}

// ---------- commands ----------

export function status(root) {
  const list = load(root);
  const rows = list.rows.map((r) => {
    const at = locate(root, r.change, r.branch);
    const folders = archiveFolders(root, r.change);
    return { ...r, levelKind: levelOf(r) || null, testOpen: open(r.test), reviewOpen: !reviewed(r), end: at.end, landed: at.landed, archived: folders[folders.length - 1] || null };
  });
  const listed = new Set([...list.rows, ...list.doneRows].map((r) => r.change));
  const dates = [...list.rows, ...list.doneRows].map((r) => r.applied).filter((d) => DATE.test(d || "")).sort();
  const since = list.since || dates[0] || null;
  const missing = [];
  if (since) {
    let entries = [];
    try {
      entries = fs.readdirSync(path.join(root, "openspec", "changes", "archive"), { withFileTypes: true });
    } catch { /* no archive yet */ }
    for (const e of entries) {
      const m = /^(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)$/.exec(e.name);
      if (e.isDirectory() && m && m[1] >= since && !listed.has(m[2])) missing.push({ change: m[2], archived: e.name });
    }
    missing.sort((a, b) => a.archived.localeCompare(b.archived));
  }
  return { file: FILE, exists: list.exists, since: list.since, missingFrom: since, head: commitOf(root, "HEAD"), rows, done: list.doneRows.map((r) => r.change), missing };
}

export function range(root, name) {
  if (!NAME.test(name || "")) throw new Error("range: name the change, e.g. range owning-site-names");
  const list = load(root);
  const row = list.rows.find((r) => r.change === name) || list.doneRows.find((r) => r.change === name);
  const at = locate(root, name, row?.branch);
  if (!at.end) throw new Error(`range: no commit touches openspec/changes/${name}/ or its archive folder, here or on its branch`);
  const files = (git(root, ["diff", "--name-only", "--relative", "-z", at.base, at.end]) || "").split("\0").filter(Boolean);
  const commits = lines(git(root, ["log", "--max-count=200", "--format=%h %s", at.base === EMPTY_TREE ? at.end : `${at.base}..${at.end}`]));
  const folders = archiveFolders(root, name);
  const folder = fs.existsSync(path.join(root, "openspec", "changes", name)) ? `openspec/changes/${name}` : folders.length ? `openspec/changes/archive/${folders[folders.length - 1]}` : null;
  return { change: name, base: at.base, end: at.end, landed: at.landed, folder, diff: `git diff ${at.base} ${at.end}`, commits, files, codeFiles: files.filter((f) => !isDoc(f)) };
}

export function add(root, name, { level, why, branch, screens, applied } = {}) {
  if (!NAME.test(name || "")) throw new Error("add: name the change, e.g. add owning-site-names --level full --why migration");
  const kind = String(level || "").toLowerCase();
  if (!LEVELS.includes(kind)) throw new Error(`add: --level is one of ${LEVELS.join(", ")}`);
  if (applied !== undefined && !DATE.test(applied)) throw new Error("add: --applied is a date, YYYY-MM-DD");
  const list = load(root);
  if ([...list.rows, ...list.doneRows].some((r) => r.change === name)) return { file: FILE, added: false, reason: `${name} is already in the list` };
  const rows = [...list.rows, { change: name, branch: branch || "—", applied: applied || today(), level: why ? `${kind}: ${why}` : kind, test: "—", review: "—", screens: screens || "—" }];
  save(root, list, rows, list.doneRows);
  return { file: FILE, added: true, created: !list.exists };
}

export function init(root, since) {
  if (since !== undefined && !DATE.test(since)) throw new Error("init: --since is a date, YYYY-MM-DD");
  const list = load(root);
  if (list.exists && since === undefined) return { file: FILE, created: false, since: list.since };
  save(root, list, list.rows, list.doneRows, since);
  return { file: FILE, created: !list.exists, since: since ?? null };
}

/** The header of a /mflow:test record, as that skill writes it. */
export function readRecord(text) {
  const tested = /^Tested:\s*(.+?)\s+at\s+([0-9a-f]{7,64})(\s+with uncommitted changes)?\s*$/m.exec(text);
  const scope = /^Scope:\s*(.+?)\s*$/m.exec(text)?.[1] || "";
  const result = /^Result:\s*(\w+)/m.exec(text)?.[1]?.toLowerCase() || "";
  return { branch: tested?.[1] || null, commit: tested?.[2] || null, uncommitted: Boolean(tested?.[3]), scope, result };
}

export function tickTest(root, recordPath) {
  const rel = String(recordPath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!rel) throw new Error("tick-test: name the record, e.g. tick-test docs/reviews/tests/2026-10-31-1a37737.md");
  if (!insideProject(rel) || !realInside(root, rel)) throw new Error(`tick-test: ${recordPath} is outside the project`);
  const text = readText(path.join(root, rel));
  if (text === null) throw new Error(`tick-test: ${rel} not found`);
  const rec = readRecord(text);
  const why = !rec.commit ? "the record has no Tested: … at <commit> line"
    : rec.result !== "pass" ? `the run did not pass (Result: ${rec.result || "missing"})`
    : rec.uncommitted ? "the run had uncommitted changes"
    : !(rec.scope === "whole suite" || /^since\s+[0-9a-f]{7,64}$/.test(rec.scope)) ? `its scope is "${rec.scope}", not the whole suite or since`
    : null;
  if (why) return { record: rel, ticked: [], moved: [], reason: why };
  const tested = commitOf(root, rec.commit);
  if (!tested) return { record: rel, ticked: [], moved: [], reason: `commit ${rec.commit} is not in this repository` };
  const list = load(root);
  const ticked = [];
  const notHeld = [];
  for (const r of list.rows) {
    if (!open(r.test)) continue;
    const at = locate(root, r.change, r.branch);
    // Held: the change's last commit is in the tested one, or comes after it with documents only (an archive).
    const held = at.end && (isAncestor(root, at.end, tested)
      || (isAncestor(root, tested, at.end) && (git(root, ["diff", "--name-only", "--relative", "-z", tested, at.end]) || "").split("\0").filter(Boolean).every(isDoc)));
    if (held) {
      r.test = rel;
      ticked.push(r.change);
    } else notHeld.push(r.change);
  }
  const { rows, moved } = settle(list.rows, list.doneRows);
  if (ticked.length) save(root, list, rows, list.doneRows);
  return { record: rel, commit: tested, ticked, moved, notHeld };
}

export function tickReview(root, name, { report, verdict } = {}) {
  if (!NAME.test(name || "")) throw new Error("tick-review: name the change");
  const v = String(verdict || "").toLowerCase();
  if (!VERDICTS.includes(v)) throw new Error(`tick-review: --verdict is one of ${VERDICTS.join(", ")}`);
  const rel = String(report || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!rel) throw new Error("tick-review: --report names the review report");
  if (!insideProject(rel) || !realInside(root, rel)) throw new Error(`tick-review: ${report} is outside the project`);
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`tick-review: ${rel} not found`);
  const list = load(root);
  const row = list.rows.find((r) => r.change === name);
  if (!row) throw new Error(`tick-review: ${name} is not waiting in ${FILE}`);
  row.review = `${v} ${rel}`;
  const { rows, moved } = settle(list.rows, list.doneRows);
  save(root, list, rows, list.doneRows);
  return { change: name, review: row.review, done: moved.includes(name), testOpen: open(row.test) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()) || process.cwd();
  const [cmd, ...rest] = process.argv.slice(2);
  const name = rest[0] && !rest[0].startsWith("--") ? rest[0] : undefined;
  const opt = (flag) => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    let out;
    if (cmd === "status") out = status(root);
    else if (cmd === "range") out = range(root, name);
    else if (cmd === "add") out = add(root, name, { level: opt("--level"), why: opt("--why"), branch: opt("--branch"), screens: opt("--screens"), applied: opt("--applied") });
    else if (cmd === "init") out = init(root, opt("--since"));
    else if (cmd === "tick-test") out = tickTest(root, name);
    else if (cmd === "tick-review") out = tickReview(root, name, { report: opt("--report"), verdict: opt("--verdict") });
    else throw new Error("usage: pending.mjs status | range <change> | add <change> --level <full|short|skip> [--why <text>] [--branch <name>] [--screens <list>] [--applied <date>] | init [--since <date>] | tick-test <record> | tick-review <change> --report <path> --verdict <approve|changes-requested|none>");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
