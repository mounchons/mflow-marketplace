// The STATUS.md check at a git commit (status-guard.mjs, PreToolUse on Bash and PowerShell): it denies a
// commit once when work since the last entry is not in STATUS.md, including files deleted, renamed or
// committed, so the entry goes into that commit before the reply instead of after it (the Stop hook
// before 0.39 asked after every answer and broke the reply). The briefing names such work too.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { git, hasGit, project, run } from "./helpers.mjs";
import { commitsInCommand } from "../plugins/mflow/scripts/status-guard.mjs";

let p;
afterEach(() => p?.cleanup());
const needsGit = { skip: !hasGit && "git not installed" };
const hourAgo = () => new Date(Date.now() - 3_600_000);

/** A git project with a committed baseline and STATUS.md older than the session. */
function repo(guard = { enabled: true, repeatMinutes: 0 }) {
  p = project({ statusGuard: guard });
  p.write("STATUS.md", "# Status\n\n## Now\n- start\n");
  p.write("src/a.txt", "a\n");
  p.write("src/b.txt", "b\n");
  git(p, "init", "-q");
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "baseline");
  fs.utimesSync(p.file("STATUS.md"), hourAgo(), hourAgo());
}
/** Start the session the way Claude Code does, so SessionStart records its baseline. */
function start(session = "t-stat") {
  const r = run(p, "session-start.mjs", [], { input: { session_id: session, cwd: p.root, source: "startup" } });
  assert.equal(r.status, 0, r.stderr);
  return r.json?.hookSpecificOutput?.additionalContext ?? "";
}
const call = (command, { session = "t-stat", cwd = p.root, env = {}, tool = "Bash" } = {}) =>
  run(p, "status-guard.mjs", [], {
    cwd,
    env: { MFLOW_DEBUG: "1", ...env },
    input: { session_id: session, cwd, hook_event_name: "PreToolUse", tool_name: tool, tool_input: { command } },
  });
/**
 * The guard's decision. With MFLOW_DEBUG it names why it let a command through, and the assertion carries
 * that reason. A git command that times out on a loaded machine lets it through on purpose (a reminder is
 * best effort), so that one reason gets a second try; any other reason is the result.
 */
let why = "";
const decide = (command = 'git commit -m "work"', opts) => {
  for (let attempt = 1; ; attempt++) {
    const r = call(command, opts);
    assert.equal(r.status, 0, r.stderr);
    why = r.stderr.trim() || "denied";
    if (attempt === 1 && /git status unavailable/.test(why)) continue;
    return r.json?.hookSpecificOutput?.permissionDecision ?? "pass";
  }
};
const expect = (decision, command, opts) => assert.equal(decide(command, opts), decision, why);
const reason = (command = "git commit -m work") => call(command).json?.hookSpecificOutput?.permissionDecisionReason ?? "";

test("which shell lines are a git commit", () => {
  for (const c of [
    "git commit -m x",
    'git add -A && git commit -m "$(cat <<\'EOF\'\nmsg\nEOF\n)"',
    "cd apps/web && git commit -am x",
    "git -C sub commit -m x",
    "git -c user.name=x commit -m x",
    "GIT_AUTHOR_DATE=now git commit --amend --no-edit",
    "rtk git commit -m x",
    "& git commit -m 'x'",
    "git.exe commit -m x",
  ]) assert.ok(commitsInCommand(c), c);
  for (const c of [
    "git status",
    "git commit-tree HEAD^{tree}",
    "git log --grep commit",
    "git merge main",
    "git cherry-pick abc",
    "git revert HEAD",
    'echo "git commit"',
    "npm test",
  ]) assert.ok(!commitsInCommand(c), c);
});

test("an edited file denies the commit once and asks for the entry", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  expect("deny");
});

test("the same commit tried again passes, so the hook never loops", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  expect("deny");
  expect("pass");
  assert.match(why, /asked once for this commit/);
});

test("a command that is not a commit passes without looking", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  expect("pass", "git status");
  expect("pass", "git merge main");
  expect("pass", "npx playwright test --workers=1");
});

test("the commit asks in PowerShell too, and after cd or rtk", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  expect("deny", "git commit -m x", { tool: "PowerShell" });
  p.cleanup();
  repo(); start();
  p.write("src/a.txt", "changed\n");
  expect("deny", "cd src && rtk git commit -am x");
});

test("a branch for code only (a review fix, a night run's fixes or E2E tests) is not asked", needsGit, () => {
  repo(); start();
  for (const b of ["fix/supplier-import-review", "fix/night-2026-11-08-tests", "e2e/night-2026-11-08"]) {
    git(p, "checkout", "-q", "-B", b);
    p.write("src/a.txt", `changed on ${b}\n`);
    expect("pass");
    assert.match(why, /holds code only/);
  }
  git(p, "checkout", "-q", "-B", "fix/typo");
  expect("deny");
});

test("nothing changed: the commit passes", needsGit, () => {
  repo(); start();
  expect("pass");
});

test("STATUS.md written after the work lets the commit through, staged in the same command or not", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(p.file("STATUS.md"), later, later);
  expect("pass", "git add -A && git commit -m work");
});

test("no grace period: work in the first minutes of a session still asks", needsGit, () => {
  repo({ enabled: true, graceMinutes: 10, repeatMinutes: 0 }); start();
  p.write("src/a.txt", "changed\n");
  expect("deny");
});

test("at most one ask per repeatMinutes", needsGit, () => {
  repo({ enabled: true, repeatMinutes: 30 }); start();
  p.write("src/a.txt", "changed\n");
  expect("deny");
  git(p, "commit", "-q", "-am", "work without entry");
  p.write("src/b.txt", "changed\n");
  expect("pass");
  assert.match(why, /asked recently/);
});

test("the older name stopGuard still switches it off, and statusGuard: false does too", needsGit, () => {
  repo(false); start();
  p.write("src/a.txt", "changed\n");
  expect("pass");
  assert.match(why, /disabled/);
  p.write(".mflow/config.json", JSON.stringify({ version: 1, stopGuard: { enabled: false } }));
  expect("pass");
  assert.match(why, /disabled/);
  // StemHub's config: the old timings were for a hook that asked every turn; each commit asks again.
  p.write(".mflow/config.json", JSON.stringify({ version: 1, stopGuard: { enabled: true, graceMinutes: 10, repeatMinutes: 30 } }));
  expect("deny");
  git(p, "commit", "-q", "-am", "work without entry");
  p.write("src/b.txt", "changed\n");
  expect("deny");
});

test("by default every commit holding work the log does not cover asks (apply, then archive)", needsGit, () => {
  repo({ enabled: true }); start();
  p.write("src/a.txt", "applied\n");
  expect("deny");
  p.write("STATUS.md", "# Status\n\n## Now\n- applied\n");
  git(p, "commit", "-q", "-am", "apply with entry");
  const before = new Date(Date.now() - 5000);
  fs.utimesSync(p.file("STATUS.md"), before, before);
  p.write("src/b.txt", "archived\n");
  expect("deny");
});

test("a deleted file asks (T06)", needsGit, () => {
  repo(); start();
  fs.rmSync(p.file("src/b.txt"));
  expect("deny");
});

test("a file deleted before the session started does not", needsGit, () => {
  repo();
  fs.rmSync(p.file("src/b.txt"));
  start();
  expect("pass");
});

test("a renamed file asks, though it keeps its old mtime", needsGit, () => {
  repo(); start();
  git(p, "mv", "src/a.txt", "src/c.txt");
  expect("deny");
});

test("work committed during the session without its entry asks at the next commit", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  git(p, "commit", "-q", "-am", "work");
  expect("deny");
});

test("work committed before STATUS.md was updated does not", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  git(p, "commit", "-q", "-am", "work");
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(p.file("STATUS.md"), later, later);
  expect("pass");
});

// StemHub 2026-10-23: the work was committed, STATUS.md written, then committed on its own; the old guard
// saw a commit newer than STATUS.md and counted every file since the session began (141), then asked to
// trim the log, and nine entries were folded into one line.
test("committing the entry after the work does not ask again", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  git(p, "commit", "-q", "-am", "work");
  p.write("STATUS.md", "# Status\n\n## Now\n- work committed\n");
  git(p, "commit", "-q", "-am", "handoff");
  expect("pass");
});

test("work committed together with its STATUS.md entry does not ask", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  p.write("STATUS.md", "# Status\n\n## Now\n- work and entry\n");
  git(p, "commit", "-q", "-am", "work with entry");
  expect("pass");
});

test("work committed after the entry asks, and counts only that work", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  p.write("STATUS.md", "# Status\n\n## Now\n- a done\n");
  git(p, "commit", "-q", "-am", "a with entry");
  p.write("src/b.txt", "changed\n");
  git(p, "commit", "-q", "-am", "b");
  assert.match(reason(), /: 1 file\(s\) changed .*\(src\/b\.txt\)/);
});

test("older entries moved to docs/status-log.md after STATUS.md do not ask", needsGit, () => {
  repo(); start();
  p.write("STATUS.md", "# Status\n\n## Now\n- trimmed\n");
  p.write("docs/status-log.md", "# STATUS log archive\n\n### old entry\n");
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "handoff and archive");
  p.write("docs/status-log.md", "# STATUS log archive\n\n### older entry\n### old entry\n");
  expect("pass");
});

// The names come from git's own paths minus the project's prefix, so they hold below the top level of
// a monorepo, and on Windows when the temp folder is an 8.3 short name (RUNNER~1 on CI).
test("a project below the git top level names its own files, and only those", needsGit, () => {
  p = project();
  const sub = "apps/web";
  p.write(`${sub}/.mflow/config.json`, JSON.stringify({ version: 1, statusGuard: { enabled: true, repeatMinutes: 0 } }));
  p.write(`${sub}/STATUS.md`, "# Status\n\n## Now\n- start\n");
  p.write(`${sub}/src/a.txt`, "a\n");
  p.write("other/x.txt", "x\n");
  git(p, "init", "-q");
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "baseline");
  const cwd = p.file(sub);
  const env = { CLAUDE_PROJECT_DIR: cwd };
  assert.equal(run(p, "session-start.mjs", [], { cwd, env, input: { session_id: "t-sub", cwd, source: "startup" } }).status, 0);
  p.write(`${sub}/STATUS.md`, "# Status\n\n## Now\n- handoff\n");
  p.write(`${sub}/docs/status-log.md`, "# STATUS log archive\n");
  p.write("other/x.txt", "changed\n");
  const guard = () => call("git commit -m x", { session: "t-sub", cwd, env }).json?.hookSpecificOutput;
  assert.equal(guard()?.permissionDecision, undefined, "the archive and a file outside the project do not ask");
  p.write(`${sub}/src/a.txt`, "changed\n");
  git(p, "commit", "-q", "-m", "work", "--", `${sub}/src/a.txt`);
  assert.match(guard()?.permissionDecisionReason ?? "", /: 1 file\(s\) changed .*\(src\/a\.txt\)/);
});

test("the request puts the entry in this commit, leaves older entries alone, and keeps it out of the reply", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  const text = reason();
  assert.match(text, /Before this commit/);
  assert.match(text, /Stage STATUS\.md with this commit/);
  assert.match(text, /Leave the older log entries as they are/);
  assert.match(text, /Say nothing about it in the reply/);
  assert.doesNotMatch(text, /fold|newest 10|Then stop/);
});

test("a session record from an older mflow, with no baseline, still catches a deletion", needsGit, () => {
  repo();
  const dir = path.join(p.temp, "mflow-sessions");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "t-stat.json"), JSON.stringify({ root: p.root, startedAt: Date.now() - 1_800_000, lastBlockAt: 0 }));
  fs.rmSync(p.file("src/b.txt"));
  expect("deny");
});

test("without STATUS.md the commit passes; the briefing asks for the file", needsGit, () => {
  repo(); fs.rmSync(p.file("STATUS.md")); start();
  p.write("src/a.txt", "changed\n");
  expect("pass");
  assert.match(why, /no STATUS\.md/);
});

test("the briefing names work an earlier session left out of STATUS.md, and nothing when it is in", needsGit, () => {
  repo();
  p.write("src/a.txt", "changed\n");
  git(p, "commit", "-q", "-am", "work without entry");
  let context = start("t-b1");
  assert.match(context, /## Not yet in STATUS\.md\n- 1 file\(s\) changed since STATUS\.md was last written \(src\/a\.txt\), 1 commit\(s\) of them without it/);
  p.write("STATUS.md", "# Status\n\n## Now\n- logged\n");
  git(p, "commit", "-q", "-am", "entry");
  context = start("t-b2");
  assert.doesNotMatch(context, /Not yet in STATUS\.md/);
});

test("the briefing's ritual writes STATUS.md with a commit, not after an answer, and keeps options a) b) c)", () => {
  p = project();
  p.write("STATUS.md", "# Status\n\n## Now\n- focus\n");
  const context = start("t-ask");
  assert.match(context, /STATUS\.md is written as part of a commit/);
  assert.match(context, /Do not add a STATUS\.md update after an answer/);
  assert.match(context, /Commit each finished piece of work without asking, its files added by name; push, merge or deploy only on the user's word, asked once in one line at the end, never as a numbered menu/);
  assert.ok(context.includes("label the options a), b), c), never ก ข ค, so the answer is one line such as `1 a, 2 b, 3 a`"));
});

test("a long STATUS.md is shortened in the briefing, and what is waiting and the ritual still arrive", () => {
  p = project();
  const long = Array.from({ length: 400 }, (_, i) => `- note ${i}: ${"รายละเอียด ".repeat(3)}`).join("\n");
  p.write("STATUS.md", `# Status\n\n## Now\n- focus first\n${long}\n`);
  p.write("docs/source/tor.md", "# TOR\n");
  const context = start("t-long");
  assert.ok(context.length <= 9000, `briefing is ${context.length} characters`);
  assert.match(context, /- focus first/);
  assert.match(context, /shortened to fit the briefing/);
  assert.match(context, /1 new source doc\(s\) not processed/);
  assert.match(context, /## Session ritual/);
});

// ComparePrice 2026-10..11: one request per item, every finished item committed, no numbered menus, 13% of the
// prompts were ceremony against 44% in StemHub since 0.35. The user chose (2026-11-08) to bring that loop over.
test("the templates commit finished work, ask push or merge once, chain the change, and let a fix skip OpenSpec", () => {
  const read = (f) => fs.readFileSync(new URL(`../plugins/mflow/templates/${f}`, import.meta.url), "utf8");
  const claude = read("CLAUDE.md");
  const agents = read("AGENTS.md");
  for (const text of [claude, agents]) {
    assert.match(text, /Commit each finished piece of work without asking, its files added by name \(never `git add -A`\)/);
    assert.match(text, /Push, merge and deploy only on the user's word, asked once in one line at the end, never as a numbered menu/);
  }
  assert.match(claude, /`\/opsx:apply` archives the change in the same turn and commits once/);
  assert.match(claude, /"Do X to the end" runs propose, apply and archive in one go/);
  assert.match(claude, /A fix that changes no behaviour the specs describe: just ask, no change/);
  assert.match(agents, /A fix that changes no behaviour `openspec\/specs\/` describes .* needs no OpenSpec change/);
  assert.match(agents, /say in one line of the reply that it went without a change and why\. Behaviour that is new, changed, or not in the specs yet is an OpenSpec change/);
});

test("the plugin has no Stop hook; the check runs before Bash and PowerShell", () => {
  const hooks = JSON.parse(fs.readFileSync(new URL("../plugins/mflow/hooks/hooks.json", import.meta.url), "utf8")).hooks;
  assert.equal(hooks.Stop, undefined);
  const shell = hooks.PreToolUse.find((e) => e.matcher === "Bash|PowerShell");
  assert.ok(shell.hooks.some((h) => h.command.includes("status-guard.mjs")));
});
