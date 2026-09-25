#!/usr/bin/env node
// Discussion documents: one Markdown file per topic in <discussDir>/NN-<slug>.md, where Claude writes
// its understanding or a proposed design and พี่ปู replies until they match, then approves.
//
//   node discuss.mjs list                              -> JSON: next id + every doc with its open items
//   node discuss.mjs check <NN | file>                 -> JSON: open decisions and pending notes of one doc
//   node discuss.mjs new <slug> [--title "..."] [--sources "a, b"]
//                                                      -> create NN-<slug>.md from the template (never overwrites)
//
// Reply markers (the template explains them to พี่ปู):
//   decision answer   a line `**พี่ปูเลือก:** <answer>` under a `### D<n>: ...` heading; empty = open
//   note              a line starting with `> พี่ปู:`; every such line is pending until Claude processes it
//   placeholder       Thai text in angle brackets left from the template, e.g. <คำถาม>
// HTML comments and fenced code blocks are ignored, so examples of the markers there do not count.
// A doc is ready to approve when it is a draft with no open decision, pending note or placeholder,
// no unclosed code fence (it would hide everything below it), and no unprocessed report from another AI tool.
//
// Pictures (skills/discuss/references/visuals.md) are counted and linted but never gate approval:
//   visuals            mermaid blocks, text-fence wireframes, linked screenshots, mermaid diagram types
//   mermaidWarnings    flowchart node labels left unquoted around ( ) [ ] { } ; or #, which break the parser
//
// Reports from other tools (/mflow:discuss NN consult) land in <inboxDir> and are matched to a doc by
// the id `discuss-<NN>-r<revision>` in their `brief` frontmatter or their file name. A report counts as
// pending while its status is `new`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, loadConfig, frontmatter, readText } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(here, "..", "skills", "discuss", "assets", "discussion.md");
const FILE_RE = /^(\d{2,})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DECISION_RE = /^\s*(?:[-*]\s*)?\*\*พี่ปูเลือก:\*\*(.*)$/;
const NOTE_RE = /^\s*>\s*พี่ปู\s*:(.*)$/;
const HEADING_RE = /^###\s+(D\d+\b.*)$/;
// Template placeholders open with Thai text right after "<", e.g. <คำถาม>. Comparisons in validation
// text ("PickupDate < วันนี้ และ Status > 0") have a space after "<" and are not placeholders;
// inline code is never a placeholder.
const PLACEHOLDER_RE = /<[\u0E00-\u0E7F][^<>\n]*>/;

const REPORT_ID_RE = /(?:^|[^a-z0-9])discuss-(\d{2,})(?:-r(\d+))?(?![0-9])/i;

const toPosix = (p) => p.split(path.sep).join("/");
const discussDir = (root) => path.join(root, loadConfig(root).discussDir || "docs/discuss");

/**
 * Blank out HTML comments and fenced code blocks, keeping line numbers intact, and collect the fenced
 * blocks on the way (one pass, so the markers check and the picture count never disagree).
 */
function scanLines(text) {
  const blanked = text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ""));
  const visible = [];
  const blocks = [];
  let block = null;
  blanked.split(/\r?\n/).forEach((line, i) => {
    const fence = /^\s*(?:```|~~~)\s*([\w-]*)/.exec(line);
    if (fence) {
      if (block) { blocks.push(block); block = null; }
      else block = { lang: fence[1].toLowerCase(), line: i + 1, body: [] };
      visible.push("");
      return;
    }
    if (block) block.body.push(line);
    visible.push(block ? "" : line);
  });
  return { visible, blocks, unclosedFenceLine: block ? block.line : null };
}

const IMAGE_RE = /!\[[^\]]*\]\([^)\s]+\.(?:png|jpe?g|gif|svg|webp)\)/i;
// A flowchart node: ASCII id, an opening shape, then an unquoted label up to the first closing bracket.
const NODE_RE = /(?:^|[^\w-])[A-Za-z_][\w-]*\s*(\[\[|\[\(|\(\(|\(\[|\{\{|\[|\(|\{)(?!["\[({])([^\n]*?)[\])}]/g;

function lintMermaid(block) {
  const type = (block.body.find((l) => l.trim()) || "").trim().split(/\s+/)[0];
  if (!/^(flowchart|graph)$/.test(type)) return [];
  const warnings = [];
  block.body.forEach((raw, i) => {
    // Quoted text and edge labels (|...|) are safe; only unquoted node labels are checked.
    const line = raw.replace(/"[^"]*"/g, '""').replace(/\|[^|]*\|/g, "||");
    for (const m of line.matchAll(NODE_RE)) {
      if (/[()[\]{};#]/.test(m[2])) warnings.push({ line: block.line + i + 1, text: raw.trim() });
    }
  });
  return warnings;
}

/** Which discussion doc (and revision) a report answers, from its brief id or file name; null if none. */
export function reportDiscussId(fileName, fm = {}) {
  const m = REPORT_ID_RE.exec(fm.brief || "") || REPORT_ID_RE.exec(path.basename(fileName));
  return m ? { id: String(Number(m[1])).padStart(2, "0"), revision: m[2] ? Number(m[2]) : null } : null;
}

function reports(root) {
  const dir = path.join(root, loadConfig(root).inboxDir || "docs/ai-inbox");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md" && !f.endsWith(".assessment.md"))
    .map((f) => {
      const fm = frontmatter(readText(path.join(dir, f)));
      const of = reportDiscussId(f, fm);
      return of && { file: toPosix(path.relative(root, path.join(dir, f))), ...of, from: fm.from || "", status: fm.status || "new" };
    })
    .filter(Boolean);
}

function inspect(root, full, allReports = reports(root)) {
  const text = readText(full) || "";
  const fm = frontmatter(text);
  const openDecisions = [];
  const answeredDecisions = [];
  const pendingNotes = [];
  const placeholders = [];
  let heading = null;
  const { visible, blocks, unclosedFenceLine } = scanLines(text);
  visible.forEach((line, i) => {
    const h = HEADING_RE.exec(line);
    if (h) heading = h[1].trim();
    const d = DECISION_RE.exec(line);
    if (d) (d[1].trim() ? answeredDecisions : openDecisions).push(heading || `line ${i + 1}`);
    const n = NOTE_RE.exec(line);
    if (n) pendingNotes.push({ line: i + 1, text: n[1].trim() });
    if (PLACEHOLDER_RE.test(line.replace(/`[^`]*`/g, ""))) placeholders.push(i + 1);
  });
  const mermaid = blocks.filter((b) => b.lang === "mermaid");
  const visuals = {
    mermaid: mermaid.length,
    wireframes: blocks.filter((b) => b.lang === "text" || b.lang === "wireframe").length,
    screenshots: visible.filter((l) => IMAGE_RE.test(l)).length,
    types: [...new Set(mermaid.map((b) => (b.body.find((l) => l.trim()) || "").trim().split(/\s+/)[0]))],
  };
  const status = fm.status || "draft";
  const id = fm.id || FILE_RE.exec(path.basename(full))?.[1] || "";
  const pendingReports = allReports
    .filter((r) => r.status === "new" && Number(r.id) === Number(id))
    .map(({ file, from, revision }) => ({ file, from, revision }));
  return {
    file: toPosix(path.relative(root, full)),
    id,
    slug: fm.slug || FILE_RE.exec(path.basename(full))?.[2] || "",
    title: fm.title || "",
    status,
    revision: Number(fm.revision) || 1,
    updated: fm.updated || "",
    openDecisions,
    answeredDecisions: answeredDecisions.length,
    pendingNotes,
    placeholderLines: placeholders,
    pendingReports,
    unclosedFenceLine,
    visuals,
    mermaidWarnings: mermaid.flatMap(lintMermaid),
    readyToApprove:
      status === "draft" && openDecisions.length === 0 && pendingNotes.length === 0 &&
      placeholders.length === 0 && pendingReports.length === 0 && unclosedFenceLine === null,
  };
}

function docFiles(root) {
  const dir = discussDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => FILE_RE.test(f)).sort().map((f) => path.join(dir, f));
}

function nextId(root) {
  const max = docFiles(root).reduce((m, f) => Math.max(m, Number(FILE_RE.exec(path.basename(f))[1])), 0);
  return String(max + 1).padStart(2, "0");
}

export function list(root) {
  return {
    dir: toPosix(path.relative(root, discussDir(root))),
    next: nextId(root),
    docs: (() => { const all = reports(root); return docFiles(root).map((f) => inspect(root, f, all)); })(),
  };
}

function check(root, ref) {
  if (!ref) throw new Error("check: give a document id (01) or file path");
  const byId = docFiles(root).find((f) => FILE_RE.exec(path.basename(f))[1] === ref.padStart(2, "0"));
  const full = /^\d+$/.test(ref) ? byId : path.resolve(root, ref);
  if (!full || !fs.existsSync(full)) throw new Error(`check: no discussion document ${ref}`);
  return inspect(root, full);
}

function create(root, argv) {
  const [slug, ...rest] = argv;
  if (!slug || !SLUG_RE.test(slug)) {
    throw new Error("new: slug must be lowercase ASCII kebab-case, e.g. access-control");
  }
  const opts = {};
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith("--")) opts[rest[i].slice(2)] = rest[++i] ?? "";
  // A frozen doc (approved, superseded, dropped) may be followed by a new doc on the same topic;
  // only one draft per topic may be open at a time.
  const openDraft = docFiles(root)
    .map((f) => inspect(root, f))
    .find((d) => d.slug === slug && d.status === "draft");
  if (openDraft) throw new Error(`new: ${openDraft.file} is still a draft on '${slug}'; revise it instead`);
  const id = nextId(root);
  const today = new Date().toISOString().slice(0, 10);
  const content = fs.readFileSync(TEMPLATE, "utf8")
    .replaceAll("{{ID}}", id)
    .replaceAll("{{SLUG}}", slug)
    .replaceAll("{{TITLE}}", opts.title || slug)
    .replaceAll("{{SOURCES}}", opts.sources || "")
    .replaceAll("{{DATE}}", today);
  const dest = path.join(discussDir(root), `${id}-${slug}.md`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, { flag: "wx" });
  return { created: toPosix(path.relative(root, dest)), id };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()) || process.cwd();
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    let out;
    if (cmd === "list") out = list(root);
    else if (cmd === "check") out = check(root, rest[0]);
    else if (cmd === "new") out = create(root, rest);
    else throw new Error("usage: discuss.mjs list | check <NN|file> | new <slug> [--title ...] [--sources ...]");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
