#!/usr/bin/env node
// The lines mflow writes into openspec/config.yaml, and the merge that puts them there. OpenSpec hands this
// file to the AI on every /opsx:* run (the context, rules per artifact and the apply guidance), and
// `openspec update` never rewrites it, so these lines are the only way mflow steers OpenSpec: it never edits
// OpenSpec's skills, commands or schema.
//
// mflow's list items sit between `# mflow:begin <version>` and `# mflow:end`, so a later version replaces
// exactly them and leaves the project's own items alone; an item with mflow's exact wording outside them is
// taken in too. The context is one YAML string, where a comment would be text, so its lines are recognised
// by their text. Folder names follow .mflow/config.json.
// A line of the project's own that says one of mflow's lines in its own words (its own path to the data
// dictionary, a note in brackets) stands in for it: mflow's wording is then left out, never set beside it.
//
// OpenSpec ignores the whole file when it cannot parse it, so an item YAML would misread (a ": " or " #"
// inside, a leading indicator) is written in double quotes, and such an item of the project's own is
// reported. A form this line-based merge does not handle (a context on one line, a key that is not a list)
// is reported and left as it is; the rest is still merged.
//
//   node openspec-config.mjs [--root <dir>] [--dry-run]
//     -> JSON { file, created, changed, removed, added, problems }
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, loadConfig, readText, realInside, writeFileAtomic } from "./lib.mjs";

const PLUGIN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;

// {hotspots} and {discuss} stand for the folders in .mflow/config.json.
export const LINES = {
  context: [
    "Read AGENTS.md for stack, commands, architecture and domain vocabulary.",
    "The user's answers and instructions are the customer's: build first, test in use, then refine through follow-up changes.",
    "Business rules for fuzzy areas are worked out first in {hotspots}/<slug>/rules.md.",
    "Designs agreed before building (roles, data models, ...) are in {discuss}/NN-*.md with status approved.",
    "The current data dictionary is PrototypeData/README.md until a change builds the entity.",
  ],
  "rules.proposal": [
    "If the change implements a hotspot, link {hotspots}/<slug>/rules.md in the proposal.",
    "If the change adds or alters tables, link the approved data-model doc in {discuss}/ and follow PrototypeData/README.md; state any difference.",
    "In the proposal, list every choice that the user's request, the customer documents, the approved designs in {discuss}/ and the hotspots leave open, with the option taken and why. Mark each one where a wrong choice changes a table or key, a permission or data scope, a write to an external system or something sent to the customer (an e-mail, an account, a password), or where the choice departs from a customer document. Ask the user about the marked ones before the proposal is final; the rest stay as questions for testing in use. Number the questions and label each one's options a), b), c), never ก ข ค, so the user answers in one line such as `1 a, 2 b, 3 a` without switching keyboard language.",
    "Keep a change small enough to apply, test and review in one sitting. When it would need more than about 15 tasks, or changes code that every module relies on (sign-in, sessions, security, seed data, shared tables) together with screens, propose only its first part now, usually the server side, and list the rest under Later changes in the proposal, one line each, for the user to propose next. Keep it as one change only when the user said so.",
  ],
  "rules.specs": [
    "Every requirement has at least one Scenario; for rule tables, one Scenario per distinct outcome row.",
  ],
  "rules.tasks": [
    "Every task that changes code ends with the unit test that proves it (framework as in AGENTS.md Stack); a user flow is proven by unit tests of the rules and services behind it. A task that changes only documents needs no test. No task writes, changes or runs E2E tests; /mflow:e2e <screen> does that one screen at a time when the user calls it.",
    "A task runs its own test and the test classes that cover the code it changed (the test command filtered to them), with the build; when those classes are about a third of the integration suite or more, only the unit tests and the tests the task added or changed. tasks.md has no gate task that runs the whole suite, format, lint or validate; /mflow:test runs those once per change when the user calls it, and /mflow:review reuses its run.",
    "A change that builds an aggregate ends by replacing its section in PrototypeData/README.md with a pointer to the entity and migration.",
  ],
  "operations.apply.guidance": [
    "Only when this session's mflow briefing says the apply subagent mflow:dev is ON, hand the code changes of each task to a fresh `mflow:dev` subagent, which runs on Sonnet 5.5, one task at a time in tasks.md order. Give it the change name, the task text, the contextFiles paths and the reports of the tasks already done in this session (files changed, tests). It is off until switched on with /mflow:subagent on; decide from this session only, never from notes or memories of earlier sessions. When it is off, not available, or the call is denied, implement every task yourself without pausing to ask.",
    "When the subagent did a task, before marking it `- [x]` and starting the next one, check its diff against the task and its specs, and confirm the task's test passes (rerun it when the report shows no passing run).",
    "Run each task's own test and the test classes that cover the code it changed (filtered to them), with the build when the task touched compiled code, never the whole suite. Leave a gate task (one whose only work is running the build, the suites or the checks) unticked; /mflow:test ticks it when the whole suite passes. When the other tasks are done, give the user /mflow:test as the next command, and name the review that follows from the files the change touched (a full /mflow:review for business rules, permissions or data scope, queries, migrations, integrations or startup wiring; no review for documents, styles or label text only; /mflow:review --short for anything else).",
    "Run tests in the foreground, one command at a time, each expected to end within about 8 minutes, and split a longer filtered run into parts by class. Never send a test run to the background, because a background run is stopped when the machine runs low on memory and then proves nothing.",
    "When the integration test classes that cover the change are about a third of that suite or more, or their run would take more than about 10 minutes, run only the unit tests and the tests the task added or changed, and leave the integration classes to /mflow:test, which runs the whole suite once per change. Say so in the task, so the run is not repeated. Unit tests that run in seconds always run.",
    "Never run E2E tests or the build only they need (Playwright, an E2E build script), and never write or change E2E test files, even when a task's text asks for it. Do the rest of the task, prove it with unit tests and the build, and add `E2E on request (/mflow:e2e <screen>)` to the task. A task whose only work is E2E stays unticked. When the change touched screens, name them to the user as screens whose E2E tests /mflow:e2e can write or update.",
  ],
};

const BEGIN = /^\s*#\s*mflow:begin\b/;
const END = /^\s*#\s*mflow:end\b/;
const indentOf = (l) => l.length - l.trimStart().length;
const blank = (l) => !l.trim();
const comment = (l) => l.trimStart().startsWith("#");
const content = (l) => !blank(l) && !comment(l);

/** A YAML plain scalar that reads back as this text, or the text in double quotes. */
export function yamlItem(text) {
  const plain = !/: |:$| #|^[-?:,[\]{}#&*!|>'"%@`]|^\s|\s$/.test(text);
  return plain ? text : JSON.stringify(text);
}

function unquote(text) {
  const t = text.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    try { return JSON.parse(t); } catch { return t.slice(1, -1); }
  }
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replaceAll("''", "'");
  return t;
}

function folders(cfg) {
  const clean = (v) => String(v).replace(/\\/g, "/").replace(/\/+$/, "");
  return { hotspots: clean(cfg.hotspotsDir), discuss: clean(cfg.discussDir) };
}

/** The text as mflow compares it: whitespace collapsed, folder names as {hotspots} and {discuss}. */
function normalise(text, dirs) {
  let t = unquote(text).replace(/\s+/g, " ").trim();
  for (const [key, names] of [["hotspots", [dirs.hotspots, "docs/decisions/hotspots"]], ["discuss", [dirs.discuss, "docs/decisions/discuss"]]]) {
    for (const name of [...new Set(names)].sort((a, b) => b.length - a.length)) t = t.split(name).join(`{${key}}`);
  }
  return t;
}

/** Two lines that differ only in the data dictionary's path or in notes in brackets say the same thing. */
function variantKey(text, dirs) {
  return normalise(text, dirs)
    .replace(/(?:[\w.-]+\/)*PrototypeData\/README\.md/g, "{data}")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "");
}

const render = (line, dirs) => line.replaceAll("{hotspots}", dirs.hotspots).replaceAll("{discuss}", dirs.discuss);

/** The line of `key:` at this indent between from and to, or -1. */
function findKey(lines, from, to, indent, key) {
  const re = new RegExp(`^ {${indent}}${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:(\\s|$)`);
  for (let i = from; i < to; i++) {
    if (content(lines[i]) && indentOf(lines[i]) < indent) return -1;
    if (re.test(lines[i])) return i;
  }
  return -1;
}

/** Where the block under the key at line k ends (exclusive), and its last line of content. */
function blockOf(lines, k, to) {
  const indent = indentOf(lines[k]);
  let end = to;
  for (let i = k + 1; i < to; i++) if (content(lines[i]) && indentOf(lines[i]) <= indent) { end = i; break; }
  let last = k;
  for (let i = k + 1; i < end; i++) if (!blank(lines[i]) && indentOf(lines[i]) > indent) last = i;
  return { end, last };
}

const valueOf = (line) => line.slice(line.indexOf(":") + 1).replace(/\s+#.*$/, "").trim();

/** Find or create the mapping path; returns the line of the last key, or a problem. */
function ensurePath(lines, keys) {
  let from = 0;
  let to = lines.length;
  let indent = 0;
  let k = -1;
  for (let depth = 0; depth < keys.length; depth++) {
    const key = keys[depth];
    k = findKey(lines, from, to, indent, key);
    if (k < 0) {
      // Create it, with whatever keys below it are still missing, after the parent's last line of content.
      // A new top-level key goes after the last line of content, before a trailing block of comments.
      let at;
      if (depth === 0) {
        at = 0;
        for (let i = lines.length - 1; i >= 0; i--) if (content(lines[i]) || (!blank(lines[i]) && indentOf(lines[i]) > 0)) { at = i + 1; break; }
      } else {
        at = blockOf(lines, from - 1, lines.length).last + 1;
      }
      const made = keys.slice(depth).map((name, j) => `${" ".repeat(indent + 2 * j)}${name}:`);
      if (depth === 0 && at > 0 && !blank(lines[at - 1])) made.unshift("");
      lines.splice(at, 0, ...made);
      return { line: at + made.length - 1 };
    }
    const value = valueOf(lines[k]);
    if (depth < keys.length - 1 && value) return { problem: `${keys.slice(0, depth + 1).join(".")} has a value on its own line (${value}), not keys below it` };
    const block = blockOf(lines, k, to);
    from = k + 1;
    to = block.end;
    const child = lines.slice(from, to).find(content);
    indent = child ? indentOf(child) : indent + 2;
  }
  return { line: k };
}

/** Merge one managed list. */
function mergeList(lines, key, dirs, report) {
  const keys = key.split(".");
  const found = ensurePath(lines, keys);
  if (found.problem) return report.problems.push(found.problem);
  const k = found.line;
  const value = valueOf(lines[k]);
  if (value && value !== "[]") return report.problems.push(`${key} is not a list (${value}); merge mflow's lines by hand`);
  if (value === "[]") lines[k] = lines[k].replace(/:\s*\[\]/, ":");
  const after = lines.slice(k + 1).find(content);
  if (after && indentOf(after) === indentOf(lines[k]) && after.trimStart().startsWith("-")) return report.problems.push(`${key} has its items at the key's own indent; merge mflow's lines by hand`);
  const { end } = blockOf(lines, k, lines.length);
  const first = lines.slice(k + 1, end).find(content);
  if (first && !first.trimStart().startsWith("- ") && first.trim() !== "-") return report.problems.push(`${key} is not a list; merge mflow's lines by hand`);
  const pad = " ".repeat(first ? indentOf(first) : indentOf(lines[k]) + 2);
  const itemIndent = pad.length;

  // Elements of the list in order: marker comments and items with their line ranges.
  const elements = [];
  for (let i = k + 1; i < end; ) {
    const line = lines[i];
    if (comment(line) && (BEGIN.test(line) || END.test(line))) { elements.push({ kind: BEGIN.test(line) ? "begin" : "end", from: i, to: i + 1 }); i++; continue; }
    if (content(line) && indentOf(line) === itemIndent && line.trimStart().startsWith("-")) {
      let j = i + 1;
      while (j < end) {
        if (blank(lines[j])) {
          const next = lines.slice(j, end).find((l) => !blank(l));
          if (next !== undefined && indentOf(next) > itemIndent && !BEGIN.test(next) && !END.test(next)) { j++; continue; }
          break;
        }
        if (indentOf(lines[j]) > itemIndent && !BEGIN.test(lines[j]) && !END.test(lines[j])) { j++; continue; }
        break;
      }
      const text = [line.trimStart().replace(/^-\s?/, ""), ...lines.slice(i + 1, j).map((l) => l.trim())].join(" ").trim();
      elements.push({ kind: "item", from: i, to: j, text });
      i = j;
      continue;
    }
    i++;
  }

  const known = new Set(LINES[key].map((l) => normalise(l, dirs)));
  const remove = [];
  let open = null;
  for (const el of elements) {
    if (el.kind === "begin") open = el;
    else if (el.kind === "end" && open) {
      remove.push(open, el, ...elements.filter((x) => x.kind === "item" && x.from > open.from && x.from < el.from));
      open = null;
    }
  }
  for (const el of elements) {
    if (el.kind !== "item" || remove.includes(el)) continue;
    if (known.has(normalise(el.text, dirs))) remove.push(el);
    else if (!/^["']/.test(el.text) && /: | #/.test(el.text)) report.problems.push(`${key}: YAML reads this item as a mapping or cuts it at a comment, so OpenSpec may ignore the whole file; put it in double quotes: ${el.text.slice(0, 90)}`);
  }
  if (open) report.problems.push(`${key}: "# mflow:begin" without "# mflow:end"; only mflow's known lines were replaced`);

  const removedText = remove.filter((el) => el.kind === "item").map((el) => unquote(el.text));
  const own = elements.filter((el) => el.kind === "item" && !remove.includes(el)).map((el) => variantKey(el.text, dirs));
  const fresh = LINES[key].filter((l) => !own.includes(variantKey(l, dirs))).map((l) => render(l, dirs));
  const block = fresh.length ? [`${pad}# mflow:begin ${VERSION}`, ...fresh.map((l) => `${pad}- ${yamlItem(l)}`), `${pad}# mflow:end`] : [];
  const drop = new Set(remove.flatMap((el) => Array.from({ length: el.to - el.from }, (_, n) => el.from + n)));
  const at = remove.length ? Math.min(...remove.map((el) => el.from)) : k + 1;
  const out = [];
  for (let i = 0; i <= lines.length; i++) {
    if (i === at) out.push(...block);
    if (i < lines.length && !drop.has(i)) out.push(lines[i]);
  }
  lines.splice(0, lines.length, ...out);
  note(report, removedText, fresh, dirs);
}

/** Merge the context block: mflow's lines first, the project's own kept. */
function mergeContext(lines, dirs, report) {
  let fresh = LINES.context.map((l) => render(l, dirs));
  const k = findKey(lines, 0, lines.length, 0, "context");
  if (k < 0) {
    const schema = findKey(lines, 0, lines.length, 0, "schema");
    const at = schema >= 0 ? blockOf(lines, schema, lines.length).last + 1 : 0;
    lines.splice(at, 0, ...(at > 0 ? [""] : []), "context: |", ...fresh.map((l) => `  ${l}`));
    return note(report, [], fresh, dirs);
  }
  const value = valueOf(lines[k]);
  if (value && !/^[|]/.test(value)) return report.problems.push(`context is written as ${/^>/.test(value) ? "a folded block (>)" : "one line"}, not a literal block (|); add mflow's context lines by hand`);
  if (!value) lines[k] = lines[k].replace(/context:\s*/, "context: |");
  const { end } = blockOf(lines, k, lines.length);
  const firstLine = lines.slice(k + 1, end).find((l) => !blank(l) && indentOf(l) > 0);
  const pad = " ".repeat(firstLine ? indentOf(firstLine) : 2);
  const known = new Set(LINES.context.map((l) => normalise(l, dirs)));
  const own = lines.slice(k + 1, end).filter((l) => !blank(l) && indentOf(l) > 0 && !known.has(normalise(l, dirs))).map((l) => variantKey(l, dirs));
  fresh = LINES.context.filter((l) => !own.includes(variantKey(l, dirs))).map((l) => render(l, dirs));
  const removed = [];
  let at = -1;
  const out = [];
  for (let i = k + 1; i < end; i++) {
    if (!blank(lines[i]) && indentOf(lines[i]) > 0 && known.has(normalise(lines[i], dirs))) {
      removed.push(lines[i].trim());
      if (at < 0) at = out.length;
      continue;
    }
    out.push(lines[i]);
  }
  out.splice(at < 0 ? 0 : at, 0, ...fresh.map((l) => pad + l));
  lines.splice(k + 1, end - (k + 1), ...out);
  note(report, removed, fresh, dirs);
}

function note(report, removed, fresh, dirs) {
  const had = new Set(removed.map((l) => normalise(l, dirs)));
  const now = new Set(fresh.map((l) => normalise(l, dirs)));
  report.removed.push(...removed.filter((l) => !now.has(normalise(l, dirs))));
  report.added.push(...fresh.filter((l) => !had.has(normalise(l, dirs))));
}

/** What the merge would make of the project's config.yaml; writes nothing. */
export function plan(root) {
  const dirs = folders(loadConfig(root));
  if (!fs.existsSync(path.join(root, "openspec"))) throw new Error("OpenSpec is not initialised here (openspec/ is missing); run openspec init first");
  const name = !fs.existsSync(path.join(root, "openspec", "config.yaml")) && fs.existsSync(path.join(root, "openspec", "config.yml")) ? "config.yml" : "config.yaml";
  const file = `openspec/${name}`;
  if (!realInside(root, file)) throw new Error(`${file} leads outside the project through a link`);
  const original = readText(path.join(root, file));
  const eol = original?.includes("\r\n") ? "\r\n" : "\n";
  const lines = original === null ? ["schema: spec-driven"] : original.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const report = { file, created: original === null, removed: [], added: [], problems: [] };
  mergeContext(lines, dirs, report);
  for (const key of ["rules.proposal", "rules.specs", "rules.tasks", "operations.apply.guidance"]) mergeList(lines, key, dirs, report);
  let text = lines.join(eol) + eol;
  // The version on a marker says which mflow last changed the lines; the same lines from a later one keep it.
  const unversioned = (t) => t.replace(/# mflow:begin \S+/g, "# mflow:begin");
  if (original !== null && unversioned(text) === unversioned(original)) text = original;
  return { ...report, changed: text !== original, original, text };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--root");
  const start = i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    const root = findRoot(start);
    if (!root) throw new Error("no .mflow/config.json here or above; run /mflow:init first");
    const p = plan(root);
    const dryRun = args.includes("--dry-run");
    if (p.changed && !dryRun) writeFileAtomic(path.join(root, p.file), p.text);
    const { original, text, ...result } = p;
    process.stdout.write(JSON.stringify({ ...result, written: p.changed && !dryRun }, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
