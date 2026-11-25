// Parallel work (0.53): /opsx:apply on main moves the change to feat/<change>, and each session or tool that
// works at the same time takes its own worktree (worktree.mjs, /mflow:worktree), where mflow still works:
// the briefing says it is a worktree, the STATUS.md check leaves it to the main checkout, and rows added to
// docs/reviews/pending.md on parallel branches all land when they merge.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { git, hasGit, project, run, SCRIPTS } from "./helpers.mjs";
import { LINES, yamlItem } from "../plugins/mflow/scripts/openspec-config.mjs";

let p;
afterEach(() => p?.cleanup());
const needsGit = { skip: !hasGit && "git not installed" };
// A Windows checkout may hold CRLF; temp folders may come as 8.3 short names (RUNNER~1) while git gives long ones.
const read = (rel) => fs.readFileSync(path.join(SCRIPTS, "..", rel), "utf8").replace(/\r\n/g, "\n");
const real = (dir) => fs.realpathSync.native(dir).toLowerCase();

/** A git project on main with STATUS.md, a git-ignored .env and the review list, committed. */
function repo() {
  p = project();
  p.write("STATUS.md", "# STATUS\n\n## Now\n- start\n\n## Log\n");
  p.write(".gitignore", ".env\n");
  p.write(".env", "SECRET=1\n");
  p.write("src/a.txt", "a\n");
  git(p, "init", "-q", "-b", "main");
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "baseline");
}
const wt = (args, opts) => run(p, "worktree.mjs", args, opts);
const inTree = (change) => path.join(p.root, ".claude", "worktrees", change);
const gitIn = (dir, ...args) => git({ ...p, root: dir }, ...args);

test("setup ignores .claude/worktrees/, merges the review list by line and lists the ignored settings; a rerun adds nothing", needsGit, () => {
  repo();
  p.write("deploy/.env", "A=1\n");
  p.write(".gitignore", ".env\ndeploy/.env\nnode_modules/\n");
  p.write("web/node_modules/x/.env", "not this one\n");
  const dry = wt(["setup", "--dry-run"]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.deepEqual(dry.json.gitignore, [".claude/worktrees/"]);
  assert.deepEqual(dry.json.gitattributes, ["docs/reviews/pending.md merge=union"]);
  assert.deepEqual(dry.json.worktreeinclude, ["/.env", "/deploy/.env"]);
  assert.ok(!p.exists(".worktreeinclude"), "a dry run writes nothing");
  const done = wt(["setup"]);
  assert.equal(done.status, 0, done.stderr);
  assert.match(p.read(".gitignore"), /^\.claude\/worktrees\/$/m);
  assert.match(p.read(".gitattributes"), /^docs\/reviews\/pending\.md merge=union$/m);
  assert.match(p.read(".worktreeinclude"), /^\/deploy\/\.env$/m);
  const again = wt(["setup"]);
  assert.deepEqual([again.json.gitignore, again.json.gitattributes, again.json.worktreeinclude], [[], [], null]);
});

test("new makes .claude/worktrees/<change> on feat/<change> from main, copies what .worktreeinclude names, and refuses a second one", needsGit, () => {
  repo();
  p.write(".worktreeinclude", ".env\n");
  p.write("openspec/changes/add-x/proposal.md", "## Why\n");
  const r = wt(["new", "add-x"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.branch, "feat/add-x");
  assert.equal(real(r.json.dir), real(inTree("add-x")));
  assert.deepEqual(r.json.copied, [".env"]);
  assert.match(r.json.gitignored, /added to \.gitignore/);
  assert.ok(r.json.warnings.some((w) => /openspec\/changes\/add-x\/ has uncommitted files/.test(w)), "an uncommitted proposal is named");
  assert.equal(fs.readFileSync(path.join(inTree("add-x"), ".env"), "utf8"), "SECRET=1\n");
  assert.equal(gitIn(inTree("add-x"), "branch", "--show-current").trim(), "feat/add-x");
  for (const tool of ["claude", "codex", "antigravity", "opencode"]) assert.ok(r.json.start[tool].includes(r.json.dir), tool);
  assert.equal(git(p, "status", "--porcelain", "--", ".claude").trim(), "", "the worktree is not untracked work of the main checkout");
  const twice = wt(["new", "add-x"]);
  assert.notEqual(twice.status, 0);
  assert.match(twice.stderr, /already exists|already checked out/);
  assert.notEqual(wt(["new", "Bad Name"]).status, 0, "a change name is kebab-case");
});

test("where and list tell a worktree from the main checkout", needsGit, () => {
  repo();
  wt(["new", "add-x"]);
  const here = wt(["where"], { cwd: inTree("add-x"), env: { CLAUDE_PROJECT_DIR: inTree("add-x") } });
  assert.equal(here.json.linked, true);
  assert.equal(here.json.branch, "feat/add-x");
  assert.equal(real(here.json.main), real(p.root));
  const all = wt(["list"]).json;
  assert.equal(all.linked, false);
  assert.deepEqual(all.worktrees.map((w) => [w.branch, w.main, w.change]), [["main", true, null], ["feat/add-x", false, "add-x"]]);
});

test("the briefing names the worktree and its rules there, and the other worktrees in the main checkout", needsGit, () => {
  repo();
  wt(["new", "add-x"]);
  const brief = (dir) => run(p, "session-start.mjs", [], { cwd: dir, env: { CLAUDE_PROJECT_DIR: dir }, input: { session_id: "t-wt", cwd: dir, source: "startup" } }).json?.hookSpecificOutput?.additionalContext ?? "";
  const there = brief(inTree("add-x"));
  assert.match(there, /## Worktree\n- This session works in a worktree on `feat\/add-x`/);
  assert.match(there, /Leave STATUS\.md to the main checkout/);
  assert.match(there, /Create Backlog tasks and decisions with the `backlog` CLI run in the main checkout/);
  assert.match(there, /In this worktree STATUS\.md is not written/);
  fs.writeFileSync(path.join(inTree("add-x"), "src", "a.txt"), "changed\n");
  assert.ok(!/## Not yet in STATUS\.md/.test(brief(inTree("add-x"))), "no STATUS.md reminder in a worktree");
  const main = brief(p.root);
  assert.match(main, /## Other worktrees \(parallel work\)\n- `feat\/add-x` in /);
  assert.ok(!/## Worktree\n/.test(main));
});

test("the STATUS.md check at a commit lets a worktree through: the main checkout writes STATUS.md at the merge", needsGit, () => {
  repo();
  wt(["new", "add-x"]);
  const dir = inTree("add-x");
  const env = { CLAUDE_PROJECT_DIR: dir, MFLOW_DEBUG: "1" };
  run(p, "session-start.mjs", [], { cwd: dir, env, input: { session_id: "t-wt2", cwd: dir, source: "startup" } });
  fs.writeFileSync(path.join(dir, "src", "a.txt"), "changed\n");
  const r = run(p, "status-guard.mjs", [], { cwd: dir, env, input: { session_id: "t-wt2", cwd: dir, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git commit -m work" } } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json, null, "no deny");
  assert.match(r.stderr, /linked worktree/);
});

test("rows added to the review list on two parallel branches both land when they merge", needsGit, () => {
  repo();
  wt(["setup"]);
  git(p, "add", ".gitignore", ".gitattributes", ".worktreeinclude");
  git(p, "commit", "-q", "-m", "setup");
  for (const c of ["add-x", "add-y"]) {
    wt(["new", c]);
    const dir = inTree(c);
    const r = run(p, "pending.mjs", ["add", c, "--level", "short", "--why", "test", "--branch", `feat/${c}`], { cwd: dir, env: { CLAUDE_PROJECT_DIR: dir } });
    assert.equal(r.status, 0, r.stderr);
    gitIn(dir, "add", "docs/reviews/pending.md");
    gitIn(dir, "commit", "-q", "-m", `apply ${c}`);
  }
  git(p, "merge", "-q", "--no-ff", "feat/add-x", "-m", "Merge feat/add-x");
  git(p, "merge", "-q", "--no-ff", "feat/add-y", "-m", "Merge feat/add-y");
  const rows = run(p, "pending.mjs", ["status"]).json.rows.map((r) => [r.change, r.branch]);
  assert.deepEqual(rows, [["add-x", "feat/add-x"], ["add-y", "feat/add-y"]]);
});

test("remove keeps unmerged work and removes a merged worktree with its branch", needsGit, () => {
  repo();
  wt(["new", "add-x"]);
  fs.writeFileSync(path.join(inTree("add-x"), "src", "a.txt"), "x\n");
  assert.match(wt(["remove", "add-x"]).stderr, /uncommitted changes/);
  gitIn(inTree("add-x"), "commit", "-q", "-am", "work");
  assert.match(wt(["remove", "add-x"]).stderr, /not merged into main/);
  git(p, "merge", "-q", "--no-ff", "feat/add-x", "-m", "Merge feat/add-x");
  const r = wt(["remove", "add-x"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.branchDeleted, true);
  assert.ok(!fs.existsSync(inTree("add-x")));
  assert.equal(git(p, "branch", "--list", "feat/add-x").trim(), "");
});

// The user, 2026-11-25 ("1 a, 2 a, 3 a"): a branch first, as StemHub did, named feat/<change>, and the merge asked in
// one line after apply. StemHub's branches had come from a tasks.md line copied from change to change; now the guidance
// does it, for every tool that reads `openspec instructions apply` (Codex and Antigravity through .agents/skills).
test("apply on main moves the change to feat/<change>, stays on any other branch, and asks to merge at the end", () => {
  const apply = LINES["operations.apply.guidance"];
  const branch = apply[1];
  assert.match(branch, /^Before the first task, check the branch with `git branch --show-current`\. On `main`, first move the change to its own branch with `git switch -c feat\/<change>`/);
  assert.match(branch, /On any other branch \(a worktree's own, `change\/<change>` of \/mflow:apply-all, one the user made\) stay on it/);
  assert.equal(yamlItem(branch), branch, "a plain YAML item");
  assert.match(apply.at(-1), /On a `feat\/<change>` branch, then ask in one line whether to merge it into main/);
  assert.ok(LINES["rules.tasks"].includes("No task creates or switches a git branch; /opsx:apply puts the change on its branch before the first task."));
  const agents = read("templates/AGENTS.md");
  assert.match(agents, /^## Branches and worktrees\n- `\/opsx:apply` started on `main` first puts the change on its own branch `feat\/<change>`/m);
  assert.match(agents, /running the `backlog` CLI in the main checkout/);
  assert.match(agents, /`git -C <main checkout> merge --no-ff feat\/<change>`/);
  const skill = read("skills/worktree/SKILL.md");
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.match(skill, /worktree\.mjs new <change>/);
  assert.match(read("skills/init/SKILL.md"), /worktree\.mjs" setup --dry-run/);
  assert.match(read("skills/delegate/SKILL.md"), /git worktree add \.claude\/worktrees\/agent-/);
  assert.ok(!/\.\.\/<repo>-agent-<id>/.test(read("skills/delegate/SKILL.md")), "no worktree outside the main checkout by default");
});

// Line-by-line merging brings back the old copy of a row that one side changed next to a row the other added.
test("a row ticked on main while a branch adds its own is read once, with the tick, after the merge", needsGit, () => {
  repo();
  wt(["setup"]);
  assert.equal(run(p, "pending.mjs", ["add", "old-one", "--level", "skip", "--why", "label"]).status, 0);
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "old row");
  wt(["new", "add-x"]);
  const dir = inTree("add-x");
  run(p, "pending.mjs", ["add", "add-x", "--level", "short", "--why", "test", "--branch", "feat/add-x"], { cwd: dir, env: { CLAUDE_PROJECT_DIR: dir } });
  gitIn(dir, "commit", "-q", "-am", "apply add-x");
  p.write("docs/reviews/pending.md", p.read("docs/reviews/pending.md").replace(/(\| old-one \|[^\n]*?)\| — \| — \| — \|/, "$1| pass 2026-11-25 | — | — |"));
  git(p, "commit", "-q", "-am", "tick old-one");
  git(p, "merge", "-q", "--no-ff", "feat/add-x", "-m", "Merge feat/add-x");
  assert.equal(p.read("docs/reviews/pending.md").match(/^\| old-one \|/gm).length, 2, "the union merge leaves both copies in the file");
  const rows = run(p, "pending.mjs", ["status"]).json.rows;
  assert.deepEqual(rows.map((r) => [r.change, r.test]), [["old-one", "pass 2026-11-25"], ["add-x", "—"]]);
  assert.equal(run(p, "pending.mjs", ["add", "add-z", "--level", "skip", "--why", "x"]).status, 0);
  assert.equal(p.read("docs/reviews/pending.md").match(/^\| old-one \|/gm).length, 1, "the next write keeps one");
});

test("a change merged from its worktree is still found by pending.mjs range after the worktree and branch are removed", needsGit, () => {
  repo();
  wt(["new", "add-x"]);
  const dir = inTree("add-x");
  fs.mkdirSync(path.join(dir, "openspec", "changes", "archive", "2026-11-25-add-x"), { recursive: true });
  fs.writeFileSync(path.join(dir, "openspec", "changes", "archive", "2026-11-25-add-x", "tasks.md"), "- [x] 1.1 do\n");
  fs.writeFileSync(path.join(dir, "src", "a.txt"), "x\n");
  run(p, "pending.mjs", ["add", "add-x", "--level", "short", "--why", "test", "--branch", "feat/add-x"], { cwd: dir, env: { CLAUDE_PROJECT_DIR: dir } });
  gitIn(dir, "add", ".");
  gitIn(dir, "commit", "-q", "-m", "apply add-x");
  git(p, "merge", "-q", "--no-ff", "feat/add-x", "-m", "Merge feat/add-x");
  assert.equal(wt(["remove", "add-x"]).status, 0);
  const r = run(p, "pending.mjs", ["range", "add-x"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.json.codeFiles.includes("src/a.txt"), JSON.stringify(r.json));
  assert.equal(run(p, "pending.mjs", ["status"]).json.rows[0].landed, true);
});
