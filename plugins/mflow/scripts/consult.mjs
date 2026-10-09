#!/usr/bin/env node
// Consultations: optional rounds in which other AI tools analyze the system (/mflow:analyze), propose a
// design (/mflow:design) or try to break one (/mflow:challenge), for the user to weigh. Only the user
// starts one: no hook or other command does, none is a prerequisite of the main flow, and a consultation
// waiting for reports never blocks the main work. The user runs the other tools; mflow writes the brief
// and the commands (requirement §13).
//
//   node consult.mjs new <analyze|design|challenge> --scope "<what>" [--to <tool,tool | any>]
//        [--focus <a,b>] [--target <file>] [--from <file>] [--again]
//        -> JSON: the session and where its brief, reports and summary go. The same intent and scope
//           while a session is still open returns that session (existing: true) unless --again.
//   node consult.mjs round <id> --issues <F3,C2>     -> start the next round on the findings still disputed
//   node consult.mjs status <id>                     -> JSON: the state of one session, read from disk
//   node consult.mjs list                            -> JSON: every session with its state
//
// .mflow/consultations/<id>/session.json holds only what does not change: intent, scope, the snapshot it
// started from (commit, uncommitted changes, the --target and --from files with their hashes), the tools
// asked, and the rounds. The rest is read from disk each time, so it cannot drift: reports are
// <inboxDir>/<id>-r<n>-<tool>.md (or name `<id>-r<n>` in their `brief`), a report is assessed when its
// .assessment.md exists or its status is `assessed`, and the session is summarized when its summary
// lists every report in `reports:`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, frontmatter, gitStatus, loadConfig, readJsonFile, readText, run, writeFileAtomic } from "./lib.mjs";
import { fileHash } from "./source-index.mjs";

// `legacy` is the folder before 0.20.0: a session written there and not moved yet by migrate-layout.mjs
// keeps its summary there, so a project that has not moved still reads its sessions.
export const INTENTS = {
  analyze: { prefix: "AN", dir: "docs/ai/analysis", legacy: "docs/analysis", summary: "summary.md" },
  design: { prefix: "DS", dir: "docs/ai/design", legacy: "docs/design", summary: "proposal.md" },
  challenge: { prefix: "CH", dir: "docs/ai/challenge", legacy: "docs/challenge", summary: "summary.md" },
};

/** The folder of one session's documents: the current one, or the legacy one while only that holds it. */
function docsDir(root, s) {
  const { dir, legacy } = INTENTS[s.intent];
  return !fs.existsSync(path.join(root, dir, s.id)) && fs.existsSync(path.join(root, legacy, s.id)) ? legacy : dir;
}
const ID_RE = /^(AN|DS|CH)-\d{3,}$/;
const REPORT_RE = /(?:^|[^A-Za-z0-9])((?:AN|DS|CH)-\d{3,})-r(\d+)(?![0-9])/;
const SESSIONS = ".mflow/consultations";

const toPosix = (p) => p.split(path.sep).join("/");
const today = () => new Date().toISOString().slice(0, 10);
const normalize = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

/** Which consultation and round a report answers, from its brief id or file name; null if none. */
export function consultationId(fileName, fm = {}) {
  const m = REPORT_RE.exec(fm.brief || "") || REPORT_RE.exec(path.basename(fileName));
  return m ? { id: m[1], round: Number(m[2]) } : null;
}

function sessionFile(root, id) {
  return path.join(root, SESSIONS, id, "session.json");
}

function readSession(root, id) {
  if (!ID_RE.test(id || "")) throw new Error(`not a consultation id: ${id} (expected AN-001, DS-001 or CH-001)`);
  const label = `${SESSIONS}/${id}/session.json`;
  const s = readJsonFile(sessionFile(root, id), { label });
  if (!s) throw new Error(`no consultation ${id}`);
  const bad = (what) => { throw new Error(`${label} ${what}; fix it by hand`); };
  if (s.id !== id) bad(`names ${JSON.stringify(s.id)} instead of ${id}`);
  if (!INTENTS[s.intent]) bad(`has intent ${JSON.stringify(s.intent)}`);
  if (!Array.isArray(s.rounds) || !s.rounds.length || s.rounds.some((r) => !Number.isInteger(r?.n))) bad("has no valid rounds");
  if (!Array.isArray(s.participants) || !s.participants.every((t) => typeof t === "string")) bad("has no valid participants");
  if (!s.snapshot || typeof s.snapshot !== "object") bad("has no snapshot");
  return s;
}

function sessionIds(root) {
  const dir = path.join(root, SESSIONS);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => ID_RE.test(d)).sort() : [];
}

/** Whether a path, relative to the project root, stays inside the project. */
function insideProject(root, p) {
  if (typeof p !== "string" || !p) return false;
  const rel = path.relative(root, path.resolve(root, p));
  return !!rel && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/** A project file named on the command line, with its hash; refuses one outside the project. */
function pinned(root, p, flag) {
  const rel = path.relative(root, path.resolve(root, p.replace(/^@/, "")));
  if (!insideProject(root, rel)) throw new Error(`${flag} ${p} is outside the project`);
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`${flag} ${p}: not found`);
  return { path: toPosix(rel), hash: fileHash(path.join(root, rel)) };
}

const paths = (root, s, round) => {
  const inbox = loadConfig(root).inboxDir;
  return {
    brief: `.mflow/briefs/${s.id}-r${round}.md`,
    out: `${inbox}/${s.id}-r${round}-{tool}.md`,
    summary: `${docsDir(root, s)}/${s.id}/${INTENTS[s.intent].summary}`,
  };
};

/** The state of a session, read from the files on disk. */
export function inspect(root, s) {
  const latest = Math.max(...s.rounds.map((r) => r.n));
  const where = paths(root, s, latest);
  const inboxDir = path.join(root, loadConfig(root).inboxDir);
  const reports = (fs.existsSync(inboxDir) ? fs.readdirSync(inboxDir) : [])
    .filter((f) => f.endsWith(".md") && f !== "README.md" && !f.endsWith(".assessment.md"))
    .map((f) => {
      const text = readText(path.join(inboxDir, f)) || "";
      const fm = frontmatter(text);
      const of = consultationId(f, fm);
      if (!of || of.id !== s.id) return null;
      const from = fm.from || /-r\d+-([^.]+)\.md$/.exec(f)?.[1] || "unknown";
      const assessed = fs.existsSync(path.join(inboxDir, f.replace(/\.md$/, ".assessment.md"))) || fm.status === "assessed";
      return { file: toPosix(path.relative(root, path.join(inboxDir, f))), round: of.round, from, assessed };
    })
    .filter(Boolean);
  const summaryText = readText(path.join(root, where.summary));
  const summaryFm = frontmatter(summaryText || "");
  const covered = new Set((summaryFm.reports || "").split(",").map((r) => r.trim()).filter(Boolean));
  const unsummarized = reports.filter((r) => !covered.has(r.file));
  const inLatest = reports.filter((r) => r.round === latest);
  const named = s.participants.filter((t) => t !== "any");
  const missing = named.filter((t) => !inLatest.some((r) => r.from === t));
  const briefWritten = fs.existsSync(path.join(root, where.brief));
  let state;
  if (!briefWritten && inLatest.length === 0) state = "prepared";
  else if (inLatest.length === 0) state = "awaiting-reports";
  else if (unsummarized.length) state = "assessing";
  else state = "summarized";

  // session.json is committed and editable: a pinned path that leaves the project is never read, only reported.
  const changed = [s.snapshot.target, s.snapshot.from].filter(Boolean)
    .filter((f) => !insideProject(root, f.path) || !fs.existsSync(path.join(root, f.path)) || fileHash(path.join(root, f.path)) !== f.hash)
    .map((f) => String(f.path));
  const head = run("git rev-parse HEAD", root, 8000)?.trim() || null;
  const cmd = `/mflow:${s.intent} ${s.id}`;
  const next = {
    prepared: `write the brief ${where.brief}, then hand over the commands (${cmd})`,
    "awaiting-reports": `run ${missing.length ? missing.join(", ") : "the tools you chose"} with ${where.brief}; when reports are in, ${cmd}`,
    assessing: `${cmd}: assess the reports and write ${where.summary}${missing.length ? ` (partial: ${missing.join(", ")} not in yet)` : ""}`,
    summarized: null,
  }[state];
  return {
    id: s.id,
    intent: s.intent,
    scope: s.scope,
    focus: s.focus,
    round: latest,
    state,
    completeness: inLatest.length === 0 ? "none" : missing.length ? "partial" : "complete",
    asked: s.participants,
    missing,
    reports,
    summaryRevision: summaryText === null ? null : Number(summaryFm.revision) || 1,
    stale: { changed, baseMoved: !!(s.snapshot.base && head && head !== s.snapshot.base) },
    ...where,
    next,
  };
}

function create(root, intent, opts) {
  if (!INTENTS[intent]) throw new Error("new: intent must be analyze, design or challenge");
  if (intent === "challenge" && !opts.target) throw new Error("new challenge: --target <file> names what to challenge");
  const target = opts.target ? pinned(root, opts.target, "--target") : null;
  const scope = (opts.scope || (target ? target.path : "")).trim();
  if (!scope) throw new Error("new: --scope \"<what>\" is needed");
  if (!opts.again) {
    for (const id of sessionIds(root)) {
      const s = readSession(root, id);
      if (s.intent === intent && normalize(s.scope) === normalize(scope)) {
        const state = inspect(root, s);
        if (state.state !== "summarized") return { existing: true, ...state };
      }
    }
  }
  const prefix = INTENTS[intent].prefix;
  const max = sessionIds(root).filter((d) => d.startsWith(`${prefix}-`)).reduce((m, d) => Math.max(m, Number(d.slice(3))), 0);
  const id = `${prefix}-${String(max + 1).padStart(3, "0")}`;
  const git = gitStatus(root);
  const session = {
    schemaVersion: 1,
    id,
    intent,
    scope,
    focus: (opts.focus || "").split(",").map((f) => f.trim()).filter(Boolean),
    created: today(),
    snapshot: {
      base: git ? run("git rev-parse HEAD", root, 8000)?.trim() || null : null,
      dirty: git ? git.entries.length > 0 : null,
      target,
      from: opts.from ? pinned(root, opts.from, "--from") : null,
    },
    participants: (opts.to || "any").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    rounds: [{ n: 1, started: today() }],
  };
  writeFileAtomic(sessionFile(root, id), JSON.stringify(session, null, 2) + "\n");
  return { created: true, ...inspect(root, session), snapshot: session.snapshot };
}

function nextRound(root, id, issues) {
  const s = readSession(root, id);
  const state = inspect(root, s);
  if (!state.reports.some((r) => r.round === state.round)) throw new Error(`round: ${id} has no report for round ${state.round} yet`);
  const list = (issues || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!list.length) throw new Error("round: --issues <F3,C2> names the disputed findings the next round answers");
  s.rounds.push({ n: state.round + 1, started: today(), issues: list });
  writeFileAtomic(sessionFile(root, id), JSON.stringify(s, null, 2) + "\n");
  return inspect(root, s);
}

export function list(root) {
  return { sessions: sessionIds(root).map((id) => inspect(root, readSession(root, id))) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()) || process.cwd();
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = {};
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--again") opts.again = true;
    else if (rest[i].startsWith("--")) opts[rest[i].slice(2)] = rest[++i];
    else positional.push(rest[i]);
  }
  try {
    let out;
    if (cmd === "new") out = create(root, positional[0], opts);
    else if (cmd === "round") out = nextRound(root, positional[0], opts.issues);
    else if (cmd === "status") out = inspect(root, readSession(root, positional[0]));
    else if (cmd === "list") out = list(root);
    else throw new Error("usage: consult.mjs new <analyze|design|challenge> --scope \"…\" [--to …] [--focus …] [--target f] [--from f] [--again] | round <id> --issues … | status <id> | list");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
