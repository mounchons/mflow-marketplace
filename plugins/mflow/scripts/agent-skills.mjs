#!/usr/bin/env node
// Skills for Codex and OpenCode: /mflow:test and /mflow:review, generated from this plugin's own skills
// into .agents/skills/mflow-test and .agents/skills/mflow-review, the folder both tools read. Codex calls
// them as $mflow-test, OpenCode as /mflow-test. Neither runs mflow's hooks, so each skill carries the
// rules a hook enforces here: write the STATUS.md entry, and never run E2E (no hook caps the browsers).
//
//   node agent-skills.mjs plan [--root <dir>]    -> JSON: what writing would create, update or remove
//   node agent-skills.mjs write [--root <dir>]   -> write it; JSON: the same, as done
//   node agent-skills.mjs status [--root <dir>]  -> JSON: which version each generated skill is
//
// A folder of that name without mflow's marker (`mflow/generated` in the frontmatter's metadata) is the
// user's own skill and is never touched. Nothing is written through a link that leads outside the
// project. Writing again changes nothing unless the plugin changed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, frontmatter, realInside, writeFileAtomic } from "./lib.mjs";

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
const BASE = ".agents/skills";
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// What each generated skill takes from the plugin. `edits` are the lines of the source that only hold in
// Claude Code; each must match exactly once, so a reworded source fails the tests instead of drifting.
export const SKILLS = [
  {
    name: "mflow-test",
    source: "test",
    describe: " In Codex and OpenCode it never runs E2E: that stays in Claude Code.",
    references: ["init/references/stacks.md"],
    scripts: [],
    edits: [
      [/^In the same message, tell the user how to keep working while it runs\..*$/m,
        "In the same message, tell the user how to keep working while it runs: this session is busy until the run ends, so work that only writes documents goes in a second session in the same folder (this tool or Claude Code). Leave anything that changes or builds code in this checkout until the run ends: it breaks the run or what it proves. The record keeps the commit taken when the run started, so documents committed meanwhile need nothing more (see `since`)."],
      [/^- E2E, when the argument names it:.*$/m,
        "- E2E never runs here: no hook in this tool caps the browsers a Playwright run opens, and an uncapped run has crashed a laptop's graphics driver. When the argument names `e2e`, stop and tell the user to run `/mflow:test e2e` in Claude Code."],
    ],
    notes: [
      "E2E never runs here, whatever the argument: for `e2e`, tell the user to run `/mflow:test e2e` in Claude Code.",
      "Run each part in the foreground within this tool's time limit for one command; a part that cannot finish within it is split further, as \"Parts\" says.",
      "Write `By: codex` or `By: opencode` in the record, whichever tool you are.",
    ],
  },
  {
    name: "mflow-review",
    source: "review",
    references: ["init/references/stacks.md", "theme/references/responsive.md", "screen/references/prototype-data.md"],
    scripts: ["discuss.mjs", "lib.mjs"],
    edits: [],
    notes: [
      "Write `Reviewer: codex` or `Reviewer: opencode` in the report, whichever tool you are, and the `Author:` line as Report says. A verdict counts toward a merge only when the reviewer is not the author.",
      "A review never runs E2E tests here either.",
    ],
  },
];

const call = (name) => ({ codex: `$${name}`, opencode: `/${name}` });

/** `${CLAUDE_PLUGIN_ROOT}/…` paths, rewritten to the copies this skill carries, or named as plugin-only. */
function rewritePaths(text, skill, { strict }) {
  return text
    .replace(/node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/([\w.-]+)"/g, (all, file) => {
      if (!skill.scripts.includes(file)) throw new Error(`${skill.name}: the source runs scripts/${file}, which the skill does not carry`);
      return `node "${BASE}/${skill.name}/scripts/${file}"`;
    })
    .replace(/(`?)\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/([\w./-]+\.md)\1/g, (all, tick, rel) => {
      if (skill.references.includes(rel)) return `${tick}${BASE}/${skill.name}/references/${path.posix.basename(rel)}${tick}`;
      if (strict) throw new Error(`${skill.name}: the source reads skills/${rel}, which the skill does not carry`);
      return `${tick}skills/${rel}${tick} of the mflow plugin (Claude Code only)`;
    });
}

/** The files of one generated skill: repo-relative path → content. */
export function build(skill) {
  const src = fs.readFileSync(path.join(PLUGIN, "skills", skill.source, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  const fm = frontmatter(src);
  const block = /^---\n[\s\S]*?\n---\n/.exec(src);
  let body = block ? src.slice(block[0].length) : src;
  for (const [re, text] of skill.edits) {
    const hits = body.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
    if (!hits || hits.length !== 1) throw new Error(`${skill.name}: the source line ${re} matched ${hits?.length || 0} times; update SKILLS in agent-skills.mjs`);
    body = body.replace(re, text);
  }
  body = rewritePaths(body, skill, { strict: true });
  if (body.includes("${CLAUDE_PLUGIN_ROOT}")) throw new Error(`${skill.name}: a plugin path is left in the body`);
  if (!NAME.test(skill.name)) throw new Error(`${skill.name}: not a valid skill name`);
  const description = (String(fm.description || "").trim() + (skill.describe || "")).trim();
  if (!description || description.length > 1024) throw new Error(`${skill.name}: the description must be 1 to 1024 characters (${description.length})`);
  const own = call(skill.name);
  const test = call("mflow-test");
  const review = call("mflow-review");
  const head = [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(description)}`,
    `compatibility: ${JSON.stringify(`Generated by mflow ${VERSION} from its Claude Code skill /mflow:${skill.source}, for Codex and OpenCode. Needs git and Node 20 or newer.`)}`,
    "metadata:",
    `  mflow/generated: "${VERSION}"`,
    `  mflow/source: "${skill.source}"`,
    "  opencode/slash: \"true\"",
    "  opencode/autoinvoke: \"false\"",
    "---",
    "",
  ].join("\n");
  const adapter = [
    "",
    "## Running in Codex or OpenCode",
    "",
    `Generated by mflow ${VERSION} from \`/mflow:${skill.source}\` of its Claude Code plugin; \`/mflow:init\` writes it again, so a change belongs in the plugin, not here.`,
    "",
    `- Run only when the user calls it: \`${own.codex}\` in Codex, \`${own.opencode}\` in OpenCode, with the arguments above.`,
    "- Run every command from the repository root: every path in this file is relative to it.",
    `- \`/mflow:test\` in this text is \`${test.codex}\` / \`${test.opencode}\`, and \`/mflow:review\` is \`${review.codex}\` / \`${review.opencode}\`. Every other \`/mflow:*\` command named here runs only in Claude Code, and \`/opsx:*\` is Claude Code's or this tool's OpenSpec skill: name it for the user rather than trying it.`,
    "- mflow's hooks run only in Claude Code. Write the STATUS.md entry yourself, as \"Session ritual\" in AGENTS.md says, and ask the user in plain text wherever this text says to ask.",
    ...skill.notes.map((n) => `- ${n}`),
    "",
  ].join("\n");
  const files = {
    [`${BASE}/${skill.name}/SKILL.md`]: head + body.replace(/\n+$/, "\n") + adapter,
    [`${BASE}/${skill.name}/agents/openai.yaml`]: "policy:\n  allow_implicit_invocation: false\n",
  };
  for (const rel of skill.references) {
    const text = fs.readFileSync(path.join(PLUGIN, "skills", rel), "utf8");
    files[`${BASE}/${skill.name}/references/${path.posix.basename(rel)}`] = rewritePaths(text, skill, { strict: false });
  }
  for (const file of skill.scripts) files[`${BASE}/${skill.name}/scripts/${file}`] = fs.readFileSync(path.join(PLUGIN, "scripts", file), "utf8");
  return files;
}

/** The version a generated skill was made by, null when it has no marker, undefined when it is absent. */
function installed(root, name) {
  const dir = path.join(root, BASE, name);
  if (!fs.existsSync(dir)) return undefined;
  let text = null;
  try { text = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"); } catch { /* no SKILL.md: not ours */ }
  return /^\s*mflow\/generated:\s*"?([\w.-]+)"?\s*$/m.exec(text?.match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0] || "")?.[1] || null;
}

/** Files under a folder, without following links, repo-relative. */
function filesUnder(root, rel) {
  const out = [];
  const walk = (r) => {
    for (const e of fs.readdirSync(path.join(root, r), { withFileTypes: true })) {
      const child = `${r}/${e.name}`;
      if (e.isDirectory()) walk(child);
      else out.push(child);
    }
  };
  if (fs.existsSync(path.join(root, rel))) walk(rel);
  return out;
}

export function plan(root) {
  const skills = SKILLS.map((skill) => {
    const was = installed(root, skill.name);
    if (was === null) {
      return { name: skill.name, state: "foreign", note: `${BASE}/${skill.name} has no mflow marker: it is your own skill and stays as it is; rename it to let mflow generate this one` };
    }
    if (!realInside(root, path.join(BASE, skill.name))) {
      return { name: skill.name, state: "refused", note: `${BASE}/${skill.name}, or a folder above it, is a link that leads outside the project` };
    }
    const files = build(skill);
    const write = [];
    const unchanged = [];
    // Line endings do not count: git may check the files out with CRLF (core.autocrlf on Windows).
    const lf = (s) => s.replace(/\r\n/g, "\n");
    for (const [rel, text] of Object.entries(files)) {
      let now = null;
      try { now = fs.readFileSync(path.join(root, rel), "utf8"); } catch { /* new */ }
      (now !== null && lf(now) === lf(text) ? unchanged : write).push(rel);
    }
    const remove = was === undefined ? [] : filesUnder(root, `${BASE}/${skill.name}`).filter((f) => !(f in files));
    const state = was === undefined ? "create" : write.length || remove.length ? "update" : "unchanged";
    return { name: skill.name, state, from: was ?? null, to: VERSION, write, unchanged: unchanged.length, remove, files };
  });
  return { version: VERSION, skills };
}

export function write(root) {
  const p = plan(root);
  for (const s of p.skills) {
    if (!s.files) continue;
    for (const rel of s.write) {
      if (!realInside(root, rel)) throw new Error(`${rel} leads outside the project through a link; nothing more written`);
      writeFileAtomic(path.join(root, rel), s.files[rel]);
    }
    for (const rel of s.remove) fs.rmSync(path.join(root, rel), { force: true });
  }
  return p;
}

export function status(root) {
  return {
    version: VERSION,
    skills: SKILLS.map((s) => {
      const was = installed(root, s.name);
      const state = was === undefined ? "missing" : was === null ? "foreign" : was === VERSION ? "current" : "outdated";
      return { name: s.name, state, version: was ?? null };
    }),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--root");
  const start = at >= 0 ? path.resolve(args[at + 1] || ".") : process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const root = findRoot(start) || start;
  try {
    const cmd = args[0];
    let out;
    if (cmd === "plan" || cmd === "write") {
      const p = cmd === "plan" ? plan(root) : write(root);
      out = { ...p, written: cmd === "write", skills: p.skills.map(({ files, ...rest }) => rest) };
    } else if (cmd === "status") out = status(root);
    else throw new Error("usage: agent-skills.mjs plan | write | status [--root <dir>]");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
