#!/usr/bin/env node
// Skills for Codex and OpenCode: /mflow:test, /mflow:review, /mflow:e2e and /mflow:test-pr, generated from this
// plugin's own skills into .agents/skills/mflow-test, mflow-review, mflow-e2e and mflow-test-pr, the folder both
// tools read (Antigravity reads it too). Codex calls
// them as $mflow-test, OpenCode as /mflow-test. Neither runs mflow's Claude Code hooks, so each skill carries
// the rules a hook enforces here (write the STATUS.md entry yourself). The one hook that matters for safety,
// the E2E guard that caps the browsers a Playwright run opens, is also written into the project's
// .codex/hooks.json, which Codex runs once the user trusts the project and approves the hook in `/hooks`;
// before any Playwright run the skills check that the guard is on. OpenCode has no such hook: it never runs E2E.
//
//   node agent-skills.mjs plan [--root <dir>]    -> JSON: what writing would create, update or remove
//   node agent-skills.mjs write [--root <dir>]   -> write it; JSON: the same, as done
//   node agent-skills.mjs status [--root <dir>]  -> JSON: which version each generated skill is, and the hook
//
// A folder of that name without mflow's marker (`mflow/generated` in the frontmatter's metadata) is the
// user's own skill and is never touched. In .codex/hooks.json only mflow's entry (the one that runs the
// guard copy in .agents/skills/mflow-e2e) is added or replaced; every other hook stays as it is, and a file
// that is not valid JSON is left alone. Nothing is written through a link that leads outside the project.
// Writing again changes nothing unless the plugin changed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, frontmatter, realInside, writeFileAtomic } from "./lib.mjs";

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
const BASE = ".agents/skills";
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Where the E2E guard runs from in Codex: the copy in mflow-e2e, through the project's .codex/hooks.json. */
export const HOOKS_FILE = ".codex/hooks.json";
export const GUARD = `${BASE}/mflow-e2e/scripts/e2e-guard.mjs`;
// The same text in every version, so the hash Codex keeps for the user's approval in `/hooks` stays valid
// across mflow upgrades. `$(git rev-parse …)` works in sh and in PowerShell, which Codex uses on Windows.
export const HOOK_ENTRY = {
  matcher: "Bash",
  hooks: [{ type: "command", command: `node "$(git rev-parse --show-toplevel)/${GUARD}"`, timeout: 10 }],
};

// Proves the guard is on without a browser: with no guard, `node` fails first and nothing more runs.
const GUARD_CHECK = "E2E guard check, once in the session before its first Playwright run: run `node -e \"process.exit(1)\" && npx playwright test`, exactly so. It cannot start a browser: without the guard, `node` fails first and nothing after it runs. When a hook blocks it with mflow's reason (\"This Playwright run sets no --workers…\"), the guard is on: carry on, every Playwright run with `--workers=2` (at most `e2eMaxWorkers` in `.mflow/config.json`). When it is not blocked, the guard is off: run no `playwright test` command and write no test record (nothing ran), and tell the user how to turn it on: trust this project in Codex (Codex asks when it first opens the folder; `codex exec --trust` for exec), approve mflow's hook in `/hooks` (again after `.codex/hooks.json` changes, when Codex asks), and when `.codex/hooks.json` has no entry for `" + GUARD + "`, run `/mflow:init` in Claude Code.";
const SANDBOX = "Playwright and Playwright CLI start browsers and the web servers listen on local ports, which Codex's sandbox may block: when a run fails for that, ask the user to approve the command outside the sandbox. On Windows, Codex's sandbox runs commands as its own account, which may not find the user's global npm tools or their browsers: when `playwright-cli --version` fails in the sandbox, run it once outside it (with the user's approval) before treating Playwright CLI as not installed; when you cannot ask (such as in `codex exec`), say in one line of the reply that the page was not looked at because Playwright CLI did not run in Codex's sandbox. Never raise `--workers` past the cap to get around a failure.";

// Codex's and Antigravity's sandboxes keep .git read-only (index.lock: Permission denied), so the commit a skill
// asks for fails there; Claude Code on Sonnet, run outside the sandbox, commits the run's files by name.
const commitNote = (name, kind) => "When a `git commit` this skill asks for fails because the sandbox keeps `.git` read-only (Codex and Antigravity: `index.lock: Permission denied`), leave the files as they are and run `node \"" + BASE + "/" + name + "/scripts/results.mjs\" command --tool <codex, antigravity or opencode, whichever you are> --kind " + kind + "`. Run the `command` it gives from the repository root, outside the sandbox (in Codex, ask the user to approve it): Claude Code on Sonnet reads the record and words the message, and the script commits the run's files by name and pushes nothing. When it cannot run (the approval is refused, `claude` is not installed, or you cannot ask, as in `codex exec` or a headless run), end the final message with that command, its `byHand` line (the same commit without Claude) and the files left uncommitted, for the user to run in a terminal in this folder.";

// What each generated skill takes from the plugin. `edits` are the lines of the source that only hold in
// Claude Code; each must match exactly once, so a reworded source fails the tests instead of drifting.
// `$&` in an edit's text keeps the source line it matched.
export const SKILLS = [
  {
    name: "mflow-test",
    source: "test",
    describe: " In Codex it runs E2E only while mflow's E2E guard in .codex/hooks.json is on; in OpenCode never.",
    references: ["init/references/stacks.md"],
    scripts: ["pending.mjs", "results.mjs", "lib.mjs"],
    edits: [
      [/^In the same message, tell the user how to keep working while it runs\..*$/m,
        "In the same message, tell the user how to keep working while it runs: this session is busy until the run ends, so work that only writes documents goes in a second session in the same folder (this tool or Claude Code). Leave anything that changes or builds code in this checkout until the run ends, `$mflow-e2e` included: it breaks the run or what it proves. The record keeps the commit taken when the run started, so documents committed meanwhile need nothing more (see `since`)."],
      [/^- E2E, when the argument names it:.*$/m,
        "$& In this tool: in Codex only after the E2E guard check of \"Running in Codex or OpenCode\" below finds the guard on; in OpenCode never, since no hook there caps the browsers: stop and tell the user to run `$mflow-test e2e` in Codex or `/mflow:test e2e` in Claude Code."],
    ],
    notes: [
      "E2E runs only when the argument names it, and only in Codex with the guard on. " + GUARD_CHECK,
      "In OpenCode E2E never runs, whatever the argument: for `e2e`, tell the user to run `$mflow-test e2e` in Codex or `/mflow:test e2e` in Claude Code.",
      SANDBOX,
      "Run each part in the foreground within this tool's time limit for one command; a part that cannot finish within it is split further, as \"Parts\" says.",
      "Write `By: codex`, `By: antigravity` or `By: opencode` in the record, whichever tool you are.",
      commitNote("mflow-test", "test"),
    ],
  },
  {
    name: "mflow-review",
    source: "review",
    references: ["init/references/stacks.md", "theme/references/responsive.md", "screen/references/prototype-data.md"],
    scripts: ["discuss.mjs", "pending.mjs", "results.mjs", "lib.mjs"],
    edits: [],
    notes: [
      "Write `Reviewer: codex`, `Reviewer: antigravity` or `Reviewer: opencode` in the report, whichever tool you are, and the `Author:` line as Report says. A verdict counts toward a merge only when the reviewer is not the author.",
      "A review never runs E2E tests here either.",
      commitNote("mflow-review", "review"),
    ],
  },
  {
    name: "mflow-e2e",
    source: "e2e",
    describe: " Codex runs them only while mflow's E2E guard in .codex/hooks.json is on; OpenCode writes them but never runs them.",
    references: ["init/references/stacks.md", "theme/references/responsive.md", "e2e/references/chain.md"],
    scripts: ["e2e-guard.mjs", "results.mjs", "lib.mjs"],
    edits: [
      [/^- Only this screen's or this flow's test files, in the foreground,.*$/m,
        "- In this tool, first: in Codex, run nothing below until the E2E guard check of \"Running in Codex or OpenCode\" finds the guard on; in OpenCode, run nothing: no hook there caps the browsers, so stop after section 2 and tell the user to run `$mflow-e2e <screen>` in Codex or `/mflow:e2e <screen>` in Claude Code.\n$&"],
    ],
    notes: [
      "Before section 3 (Run): " + GUARD_CHECK,
      "The one Playwright CLI session of section 2 (`-s=mflow-e2e`, closed at the end of that section) is not a test run: it may look at the page in Codex with the guard off and in OpenCode too.",
      "In OpenCode, write the tests (sections 1 and 2) and stop before section 3: no hook there caps the browsers. Tell the user to run `$mflow-e2e <screen>` in Codex or `/mflow:e2e <screen>` in Claude Code.",
      SANDBOX,
      "Write `By: codex`, `By: antigravity` or `By: opencode` in the record, whichever tool you are.",
      commitNote("mflow-e2e", "e2e"),
    ],
  },
  {
    // The next test job of the open checks batch (0.58.0): the user opens Codex or Antigravity in the project and
    // calls it, instead of Claude Code taking the job on the tool's behalf.
    name: "mflow-test-pr",
    source: "test-pr",
    describe: "",
    references: [],
    scripts: ["checks.mjs", "pending.mjs", "worktree.mjs", "lib.mjs"],
    edits: [],
    notes: [
      "`--as <you>` is `codex` in Codex and `antigravity` in Antigravity. In OpenCode stop at once: OpenCode takes reviews only; tell the user `$mflow-test-pr` in Codex or Antigravity, or `/mflow:test-pr` in Claude Code.",
      "Run the scripts from the root of the main checkout (the folder this tool was opened in), and the test commands of section 2 in the batch's worktree (`dir`).",
      "Where section 2 says the way `/mflow:test` does it, read `.agents/skills/mflow-test/SKILL.md` and follow it (its plan, parts, `since`, record format) with the differences listed there; its record format is the one `checks.mjs done` reads.",
      "`checks.mjs next`, `done`, `release` and `publish` write under `.git` (the hold on the job, the commit), which the sandbox keeps read-only, and `publish` pushes: run each outside the sandbox (in Codex, ask the user to approve it). The test commands run in the sandbox; when one fails because the sandbox blocks Docker, Testcontainers, a port or the network, ask the user to approve that command outside it. When you cannot ask (`codex exec`, a headless run), stop and tell the user the runner does that: `checks-run.mjs --as <you>` in a terminal.",
      "Write `By: codex` or `By: antigravity` in the record, whichever tool you are.",
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
    })
    // A link to the skill's own references (`[references/chain.md](references/chain.md)`) becomes the path
    // from the repository root, as every other path in the generated file is.
    .replace(/\[references\/([\w.-]+\.md)\]\(references\/\1\)/g, (all, file) => {
      if (!skill.references.some((r) => path.posix.basename(r) === file)) throw new Error(`${skill.name}: the source links references/${file}, which the skill does not carry`);
      return `\`${BASE}/${skill.name}/references/${file}\``;
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
  if (/\]\(references\//.test(body)) throw new Error(`${skill.name}: a link relative to the skill is left in the body`);
  if (!NAME.test(skill.name)) throw new Error(`${skill.name}: not a valid skill name`);
  const description = (String(fm.description || "").trim() + (skill.describe || "")).trim();
  if (!description || description.length > 1024) throw new Error(`${skill.name}: the description must be 1 to 1024 characters (${description.length})`);
  const own = call(skill.name);
  const [test, review, e2e] = ["mflow-test", "mflow-review", "mflow-e2e"].map(call);
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
    `- \`/mflow:test\` in this text is \`${test.codex}\` / \`${test.opencode}\`, \`/mflow:review\` is \`${review.codex}\` / \`${review.opencode}\`, and \`/mflow:e2e\` is \`${e2e.codex}\` / \`${e2e.opencode}\`. Every other \`/mflow:*\` command named here runs only in Claude Code, and \`/opsx:*\` is Claude Code's or this tool's OpenSpec skill: name it for the user rather than trying it. Where this text says \`/clear\`, start a fresh session of this tool instead.`,
    `- mflow's hooks run only in Claude Code, except its E2E guard, which Codex runs from \`${HOOKS_FILE}\` once the user trusts the project and approves the hook in \`/hooks\`. Write the STATUS.md entry yourself, as "Session ritual" in AGENTS.md says, except in a linked worktree (\`git rev-parse --git-dir\` differs from \`git rev-parse --git-common-dir\`): there leave STATUS.md alone, as AGENTS.md \`## Branches and worktrees\` says, because the main checkout writes it when the branch is merged. Ask the user in plain text wherever this text says to ask.`,
    // 0.59.0: in Claude Code every commit is pushed; in these tools the commit already goes through results.mjs
    // outside the sandbox, so a push here would only add an approval prompt or a failure.
    "- Push nothing, whatever this text or AGENTS.md says about pushing: that is Claude Code's part, and the user or Claude Code pushes what you commit.",
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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isGroupOfOurs = (g) => Array.isArray(g?.hooks) && g.hooks.some((h) => typeof h?.command === "string" && h.command.includes(GUARD));

/** The project's .codex/hooks.json as data, or why mflow leaves it alone. */
function readHooks(root) {
  let now = null;
  try { now = fs.readFileSync(path.join(root, HOOKS_FILE), "utf8"); } catch { /* none yet */ }
  if (now === null) return { now, data: { hooks: {} } };
  let data;
  try { data = JSON.parse(now); } catch { return { now, problem: `${HOOKS_FILE} is not valid JSON` }; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { now, problem: `${HOOKS_FILE} is not a JSON object` };
  if (data.hooks === undefined) data.hooks = {};
  if (!data.hooks || typeof data.hooks !== "object" || Array.isArray(data.hooks)) return { now, problem: `"hooks" in ${HOOKS_FILE} is not an object` };
  if (data.hooks.PreToolUse !== undefined && !Array.isArray(data.hooks.PreToolUse)) return { now, problem: `"hooks.PreToolUse" in ${HOOKS_FILE} is not a list` };
  return { now, data };
}

/** What writing does to .codex/hooks.json: mflow's entry added or replaced, every other hook kept. */
function planHook(root, skills) {
  const e2e = skills.find((s) => s.name === "mflow-e2e");
  if (!e2e?.files) return { path: HOOKS_FILE, state: "skipped", note: `${BASE}/mflow-e2e is not mflow's here, so the guard copy the hook runs is not either` };
  if (!realInside(root, HOOKS_FILE)) return { path: HOOKS_FILE, state: "refused", note: `${HOOKS_FILE}, or a folder above it, is a link that leads outside the project` };
  const { now, data, problem } = readHooks(root);
  if (problem) return { path: HOOKS_FILE, state: "refused", note: `${problem}: mflow leaves it as it is; add this entry under hooks.PreToolUse by hand: ${JSON.stringify(HOOK_ENTRY)}` };
  const list = (data.hooks.PreToolUse ||= []);
  const at = list.findIndex(isGroupOfOurs);
  if (at >= 0 && same(list[at], HOOK_ENTRY) && list.filter(isGroupOfOurs).length === 1) return { path: HOOKS_FILE, state: "unchanged" };
  const kept = list.filter((g) => !isGroupOfOurs(g));
  kept.splice(at >= 0 ? Math.min(at, kept.length) : kept.length, 0, HOOK_ENTRY);
  data.hooks.PreToolUse = kept;
  return { path: HOOKS_FILE, state: now === null ? "create" : "update", text: JSON.stringify(data, null, 2) + "\n" };
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
  return { version: VERSION, skills, hook: planHook(root, skills) };
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
  if (p.hook.text !== undefined) writeFileAtomic(path.join(root, HOOKS_FILE), p.hook.text);
  return p;
}

/** Whether .codex/hooks.json runs the guard: current, outdated (mflow's entry differs), missing or unreadable. */
function hookStatus(root) {
  const { data, problem } = readHooks(root);
  if (problem) return { path: HOOKS_FILE, state: "unreadable", note: problem };
  const ours = (data.hooks.PreToolUse || []).filter(isGroupOfOurs);
  return { path: HOOKS_FILE, state: !ours.length ? "missing" : ours.length === 1 && same(ours[0], HOOK_ENTRY) ? "current" : "outdated" };
}

export function status(root) {
  return {
    version: VERSION,
    skills: SKILLS.map((s) => {
      const was = installed(root, s.name);
      const state = was === undefined ? "missing" : was === null ? "foreign" : was === VERSION ? "current" : "outdated";
      return { name: s.name, state, version: was ?? null };
    }),
    hook: hookStatus(root),
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
      const { text, ...hook } = p.hook;
      out = { ...p, written: cmd === "write", skills: p.skills.map(({ files, ...rest }) => rest), hook };
    } else if (cmd === "status") out = status(root);
    else throw new Error("usage: agent-skills.mjs plan | write | status [--root <dir>]");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
