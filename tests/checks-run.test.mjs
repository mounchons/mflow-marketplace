// The runner of a checks batch (0.55): one tool's jobs, one at a time, the tool run headless in the batch's worktree
// and its results recorded and committed by the runner outside the tool's sandbox. A fake tool plays Codex or
// Antigravity here: it reads the brief and writes what the job asks, or says it hit its limit, or asks the user.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { git, hasGit, project, run, runAsync } from "./helpers.mjs";
import { deadlineOf, PROTECTED } from "../plugins/mflow/scripts/checks-run.mjs";

let p;
afterEach(() => p?.cleanup());
const needsGit = { skip: !hasGit && "git not installed" };
const ID = { GIT_AUTHOR_NAME: "mflow-test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "mflow-test", GIT_COMMITTER_EMAIL: "test@example.invalid" };
const ok = (r) => {
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};
const checks = (args, env = {}) => run(p, "checks.mjs", args, { env: { ...ID, ...env } });
const runner = (args, env = {}) => run(p, "checks-run.mjs", args, { env: { ...ID, ...env } });
const runnerAsync = (args, env = {}) => runAsync(p, "checks-run.mjs", args, { env: { ...ID, MFLOW_CHECKS_POLL_MS: "200", ...env } });
const gitIn = (dir, ...args) => git({ ...p, root: dir }, ...args);
const jobsOf = () => Object.fromEntries(ok(checks(["status"])).batches[0].jobs.map((j) => [j.id, j]));

const FAKE = `import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const [brief, out, dir] = process.argv.slice(2);
const text = fs.readFileSync(brief, "utf8");
const field = (k) => new RegExp("^" + k + ": (.+)$", "m").exec(text)[1].trim();
const [kind, id, tool] = [field("Kind"), field("Job"), field("Tool")];
const mode = process.env.FAKE_MODE || "";
if (process.env.FAKE_SLOW_MS) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.FAKE_SLOW_MS));
const write = (rel, body) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); };
if (mode === "limit") { console.log("You've hit your usage limit. Try again in 3 hours."); process.exit(1); }
if (mode === "blocked") { fs.writeFileSync(out, "BLOCKED: the spec says nothing about refunds; a) refund b) no refund\\n"); process.exit(0); }
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
const branch = execFileSync("git", ["branch", "--show-current"], { cwd: dir, encoding: "utf8" }).trim();
let wrote;
if (["test", "test-since", "e2e"].includes(kind)) {
  wrote = "docs/reviews/tests/fake-" + id + ".md";
  const scope = kind === "test" ? "whole suite" : kind === "e2e" ? "e2e" : "since abc1234";
  write(wrote, "Tested: " + branch + " at " + head + "\\nBy: " + tool + "\\nScope: " + scope + "\\nResult: " + (process.env.FAKE_RESULT || "pass") + "\\nDuration: 1m\\n\\n## Failures\\nnone\\n");
  write("docs/reviews/pending.md", fs.readFileSync(path.join(dir, "docs/reviews/pending.md"), "utf8") + "\\n<!-- a tool's own edit -->\\n");
} else if (kind.startsWith("review") && field("Mode") === "read-only") {
  // A read-only tool writes nothing: its report is its final message.
  fs.writeFileSync(out, "Here is my review.\\nChange: add-a\\nReviewer: " + tool + "\\nVerdict: " + (process.env.FAKE_VERDICT || "approve") + "\\n\\n## Findings\\nnone\\n");
  process.exit(0);
} else if (kind.startsWith("review")) {
  wrote = "docs/reviews/code/fake-" + id + ".md";
  write(wrote, "Change: x\\nReviewer: " + tool + "\\nVerdict: " + (process.env.FAKE_VERDICT || "approve") + "\\n");
} else if (kind === "fix") {
  wrote = "src/fixed-" + id + ".txt";
  write(wrote, "fixed\\n");
} else {
  wrote = "tests/e2e/" + id + ".spec.ts";
  write(wrote, "test('x', () => {});\\n");
}
if (mode === "stray") write("src/extra.txt", "not asked for\\n");
if (mode === "protected") write(".mflow/config.json", "{}\\n");
if (mode === "planted") write(".claude/settings.local.json", "{\\"hooks\\":{}}\\n");
// Windows hides a worktree's .git file, and a hidden file cannot be opened for a fresh write: rewrite it in place.
if (mode === "gitpointer") { const fd = fs.openSync(path.join(dir, ".git"), "r+"); fs.ftruncateSync(fd); fs.writeSync(fd, "gitdir: " + path.join(dir, "..", "elsewhere.git") + "\\n"); fs.closeSync(fd); }
if (mode === "worktreeconfig") fs.writeFileSync(path.join(execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: dir, encoding: "utf8" }).trim(), "config.worktree"), "[core]\\n\\tfsmonitor = echo planted\\n");
if (mode === "include") execFileSync("git", ["config", "include.path", process.env.FAKE_VICTIM], { cwd: dir });
if (mode === "gitconfig") execFileSync("git", ["config", "core.fsmonitor", "echo planted"], { cwd: dir });
if (mode === "linkdir") { fs.rmSync(path.join(dir, ".claude"), { recursive: true, force: true }); fs.symlinkSync(path.join(dir, ".."), path.join(dir, ".claude"), "junction"); }
if (mode === "rename") { execFileSync("git", ["mv", "AGENTS.md", "docs/agents-old.md"], { cwd: dir }); execFileSync("git", ["commit", "-qm", "move"], { cwd: dir }); }
if (mode === "commit") { execFileSync("git", ["add", "--", wrote], { cwd: dir }); execFileSync("git", ["commit", "-qm", "results.mjs commit"], { cwd: dir }); }
if (mode === "fail") process.exit(3);
fs.writeFileSync(out, "DONE: " + wrote + "\\n");
`;

function repo() {
  p = project();
  const fake = path.join(p.temp, "fake-tool.mjs");
  fs.writeFileSync(fake, FAKE);
  const cmd = `node '${fake}' {brief} {out} {worktree}`;
  p.write(".mflow/config.json", JSON.stringify({ version: 1, checks: { route: { test: "codex", review: "codex", fix: "codex" }, commands: { codex: { bash: cmd, pwsh: cmd }, antigravity: { bash: cmd, pwsh: cmd } } } }));
  p.write("STATUS.md", "# STATUS\n");
  p.write(".gitignore", ".claude/worktrees/\n");
  p.write("AGENTS.md", "# P\n");
  git(p, "init", "-q", "-b", "main");
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "baseline");
  p.write("openspec/changes/archive/2026-11-26-add-a/proposal.md", "## Why\n");
  p.write("src/add-a.cs", "class A {}\n");
  ok(run(p, "pending.mjs", ["add", "add-a", "--level", "full", "--why", "rule"]));
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "Merge feat/add-a");
  ok(checks(["sync"]));
}

test("the runner takes the tool's jobs one at a time, records each and commits it, and stops after --jobs", needsGit, () => {
  repo();
  const r = ok(runner(["--as", "codex", "--jobs", "2"]));
  assert.deepEqual(r.jobs.map((j) => [j.job, j.result]), [["T1", "done"], ["R1", "done"]]);
  assert.match(r.stopped, /2 jobs done/);
  const jobs = jobsOf();
  assert.match(jobs.T1.result, /^docs\/reviews\/tests\/fake-T1\.md pass \(by codex\)$/);
  assert.match(jobs.R1.result, /^docs\/reviews\/code\/fake-R1\.md approve/);
  const dir = ok(checks(["status"])).batches[0].dir;
  assert.equal(gitIn(dir, "status", "--porcelain").trim(), "", "the runner leaves the worktree clean: everything is committed, the tool's own edit of pending.md undone");
  const row = ok(run(p, "pending.mjs", ["status"], { cwd: dir, env: { CLAUDE_PROJECT_DIR: dir } })).done;
  assert.deepEqual(row, ["add-a"], "Test and an approval: the row is done");
  assert.ok(fs.readdirSync(path.join(p.root, ".git", "mflow", "checks", "runs")).some((f) => f.endsWith(".brief.md")), "the briefs stay in .git");
});

test("a fix the tool could not commit is committed by the runner, and the rules go on to the since run", needsGit, () => {
  repo();
  ok(runner(["--as", "codex", "--jobs", "2"], { FAKE_VERDICT: "changes-requested" }));
  assert.equal(jobsOf().F1.target, "R1 round 1");
  const r = ok(runner(["--as", "codex", "--jobs", "1"]));
  assert.deepEqual(r.jobs[0].added, ["S1"]);
  const dir = ok(checks(["status"])).batches[0].dir;
  assert.match(gitIn(dir, "log", "--format=%s", "-2"), /fix\(checks\): F1 R1 round 1 \(codex\)/);
  assert.match(jobsOf().F1.result, /^fixed [0-9a-f]{7}\.\.[0-9a-f]{7} \(1 files\)/);
});

test("a usage limit gives the job back and stops this tool's runner", needsGit, () => {
  repo();
  const r = ok(runner(["--as", "codex"], { FAKE_MODE: "limit" }));
  assert.equal(r.jobs[0].result, "limit");
  assert.match(r.stopped, /codex hit its usage or rate limit/);
  const t1 = jobsOf().T1;
  assert.equal(t1.state, "open");
  assert.equal(t1.running, null, "the claim is gone, so another runner can take it");
  assert.match(t1.result, /codex hit its usage limit/);
});

test("BLOCKED from the tool blocks the job for the user; files it did not explain stop the runner and stay", needsGit, () => {
  repo();
  const b = ok(runner(["--as", "codex"], { FAKE_MODE: "blocked" }));
  assert.equal(b.jobs[0].result, "blocked");
  assert.equal(jobsOf().T1.state, "blocked");
  assert.match(jobsOf().T1.result, /refunds; a\) refund b\) no refund/);
  ok(checks(["release", "T1"]));
  const s = ok(runner(["--as", "codex"], { FAKE_MODE: "stray" }));
  assert.equal(s.jobs[0].result, "not done");
  assert.match(s.stopped, /left files the job does not explain: src\/extra\.txt/);
  const dir = ok(checks(["status"])).batches[0].dir;
  assert.match(s.jobs[0].stashed, /^checks-run .+\/T1 codex not done$/);
  assert.ok(!fs.existsSync(path.join(dir, "src/extra.txt")), "the leftovers are stashed, out of the next job's way");
  assert.match(gitIn(dir, "stash", "list"), /checks-run .+\/T1 codex not done/);
  assert.equal(jobsOf().T1.state, "open");
});

test("--dry-run shows the command; a tool with no job ready, or a time already past, takes nothing", needsGit, () => {
  repo();
  const d = ok(runner(["--as", "antigravity", "--dry-run"]));
  assert.match(d.command, /fake-tool\.mjs/);
  const none = ok(runner(["--as", "antigravity"]));
  assert.deepEqual(none.jobs, []);
  assert.match(none.stopped, /no open job for antigravity is ready/);
  // 06:00 asked at 22:00 is tomorrow morning, so the evening's run takes jobs.
  const night = ok(runner(["--as", "codex", "--jobs", "1", "--until", "06:00"], { MFLOW_NOW: "2026-11-26T22:00:00" }));
  assert.deepEqual(night.jobs.map((j) => j.job), ["T1"]);
  const d22 = new Date(2026, 10, 26, 22, 0);
  assert.equal(deadlineOf("06:00", d22).getTime(), new Date(2026, 10, 27, 6, 0).getTime());
  assert.equal(deadlineOf("23:30", d22).getTime(), new Date(2026, 10, 26, 23, 30).getTime());
  assert.throws(() => deadlineOf("25:00", d22), /HH:MM/);
  assert.notEqual(runner(["--as", "gemini"]).status, 0);
});

test("a tool that changes files no job may change is stopped, its changes stashed and nothing committed", needsGit, () => {
  repo();
  const r = ok(runner(["--as", "codex"], { FAKE_MODE: "protected" }));
  assert.equal(r.jobs[0].result, "not done");
  assert.match(r.stopped, /changed files no job may change .*\.mflow\/config\.json/);
  const dir = ok(checks(["status"])).batches[0].dir;
  assert.equal(gitIn(dir, "status", "--porcelain").trim(), "");
  assert.notEqual(fs.readFileSync(path.join(dir, ".mflow/config.json"), "utf8"), "{}\n");
  for (const f of [".mflow/config.json", ".agents/skills/x/SKILL.md", ".husky/pre-commit", "AGENTS.md", ".github/workflows/a.yml", "openspec/config.yaml", ".MFLOW/config.json", "src/web/AGENTS.md", "docs/CLAUDE.md", ".mcp.json", "opencode.jsonc", ".gemini/settings.json", ".vscode/tasks.json", "src/.gitattributes"]) assert.ok(PROTECTED.test(f), f);
  for (const f of ["src/a.cs", "tests/e2e/a.spec.ts", "docs/reviews/tests/a.md"]) assert.ok(!PROTECTED.test(f), f);
});

test("a tool that committed its record itself has the commit undone and the record recorded; a fix that failed is not recorded", needsGit, () => {
  repo();
  const c = ok(runner(["--as", "codex", "--jobs", "1"], { FAKE_MODE: "commit" }));
  assert.equal(c.jobs[0].result, "done");
  const dir = ok(checks(["status"])).batches[0].dir;
  assert.doesNotMatch(gitIn(dir, "log", "--format=%s", "-3"), /results\.mjs commit/, "the tool's own commit was undone");
  ok(runner(["--as", "codex", "--jobs", "1"], { FAKE_VERDICT: "changes-requested" }));
  const f = ok(runner(["--as", "codex", "--jobs", "1"], { FAKE_MODE: "fail" }));
  assert.equal(f.jobs[0].result, "not done", "a fix whose tool failed is never committed");
  assert.equal(jobsOf().F1.state, "open");
  assert.match(f.jobs[0].stashed, /F1 codex not done/);
});

test("two runners at once: the second waits while the first holds the batch, then takes its own job", needsGit, async () => {
  repo();
  ok(checks(["assign", "R1", "antigravity"]));
  const a = runnerAsync(["--as", "codex", "--jobs", "1"], { FAKE_SLOW_MS: "1500" });
  await new Promise((r) => setTimeout(r, 700));
  const b = runnerAsync(["--as", "antigravity", "--jobs", "1"]);
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.status, 0, ra.stderr);
  assert.equal(rb.status, 0, rb.stderr);
  assert.deepEqual(ra.json.jobs.map((j) => [j.job, j.result]), [["T1", "done"]]);
  assert.deepEqual(rb.json.jobs.map((j) => [j.job, j.result]), [["R1", "done"]], "antigravity waited for T1, then reviewed");
  const r1 = jobsOf().R1;
  assert.match(r1.result, /^docs\/reviews\/code\/\d{4}-\d{2}-\d{2}-add-a-antigravity\.md approve/, "the runner saved its final message as the report");
  const dir = ok(checks(["status"])).batches[0].dir;
  const report = fs.readFileSync(path.join(dir, r1.result.split(" ")[0]), "utf8");
  assert.match(report, /^Change: add-a\nReviewer: antigravity\nVerdict: approve/, "from its Change: line on");
});

test("a git-ignored file a tool plants in a protected place is removed, and the job stops", needsGit, () => {
  repo();
  const dir = ok(checks(["status"])).batches[0].dir;
  fs.writeFileSync(path.join(dir, ".gitignore"), ".claude/worktrees/\n.claude/settings.local.json\n");
  gitIn(dir, "add", ".gitignore");
  gitIn(dir, "commit", "-qm", "ignore local settings");
  const r = ok(runner(["--as", "codex"], { FAKE_MODE: "planted" }));
  assert.equal(r.jobs[0].result, "not done");
  assert.ok(r.jobs[0].restored.includes(".claude/settings.local.json"), JSON.stringify(r.jobs[0].restored));
  assert.ok(!fs.existsSync(path.join(dir, ".claude/settings.local.json")), "the planted file is gone");
  assert.equal(jobsOf().T1.state, "open");
});

test("a protected file the tool renames away in its own commit still stops the job", needsGit, () => {
  repo();
  const r = ok(runner(["--as", "codex"], { FAKE_MODE: "rename" }));
  assert.equal(r.jobs[0].result, "not done");
  assert.match(r.stopped, /no job may change .*AGENTS\.md/);
  const dir = ok(checks(["status"])).batches[0].dir;
  assert.ok(fs.existsSync(path.join(dir, "AGENTS.md")), "the rename was undone and stashed");
});

test("a git config a tool changed (core.fsmonitor runs a program at the next git command) is put back, and the job stops", needsGit, () => {
  repo();
  const r = ok(runner(["--as", "codex"], { FAKE_MODE: "gitconfig" }));
  assert.equal(r.jobs[0].result, "not done");
  assert.ok(r.jobs[0].restored.some((f) => /config$/.test(f)), JSON.stringify(r.jobs[0]));
  assert.doesNotMatch(fs.readFileSync(path.join(p.root, ".git", "config"), "utf8"), /fsmonitor/);
});

test("a protected folder swapped for a link loses the link, and the job stops", needsGit, (t) => {
  repo();
  const probe = path.join(p.temp, "probe-link");
  try {
    fs.symlinkSync(p.temp, probe, "junction");
  } catch {
    t.skip("this machine cannot make links");
    return;
  }
  const r = ok(runner(["--as", "codex"], { FAKE_MODE: "linkdir" }));
  assert.equal(r.jobs[0].result, "not done");
  assert.ok(r.jobs[0].restored.includes(".claude"));
  const dir = ok(checks(["status"])).batches[0].dir;
  let isLink = false;
  try {
    isLink = fs.lstatSync(path.join(dir, ".claude")).isSymbolicLink();
  } catch { /* removed */ }
  assert.equal(isLink, false);
});

test("a tool that points the worktree's .git elsewhere has the pointer put back, and the job stops", needsGit, () => {
  repo();
  const dir = ok(checks(["status"])).batches[0].dir;
  const pointer = fs.readFileSync(path.join(dir, ".git"), "utf8");
  const r = ok(runner(["--as", "codex"], { FAKE_MODE: "gitpointer" }));
  assert.equal(r.jobs[0].result, "not done");
  assert.equal(fs.readFileSync(path.join(dir, ".git"), "utf8"), pointer);
  assert.equal(jobsOf().T1.state, "open");
});

test("a read-only tool runs in the registry's review mode and is never handed a job that writes", needsGit, () => {
  repo();
  p.write(".mflow/config.json", JSON.stringify({ version: 1, checks: {} }));
  const d = ok(runner(["--as", "antigravity", "--dry-run"]));
  assert.match(d.command, /--mode plan --sandbox/, "agy's read-only review mode, not --dangerously-skip-permissions");
  assert.match(d.command, /antigravity-readonly\.json'/, "its read-only settings file, expanded to the plugin's copy");
  assert.doesNotMatch(d.command, /\{plugin:/, "no placeholder left");
  assert.doesNotMatch(d.command, /dangerously/);
  const none = ok(runner(["--as", "antigravity"]));
  assert.deepEqual(none.jobs, [], "T1 is a test: agy waits for a review");
  p.write(".mflow/config.json", JSON.stringify({ version: 1, checks: { route: { test: "antigravity" } } }));
  assert.match(checks(["status"]).stderr, /checks\.route\.test must be any, claude or codex/);
});

test("an include.path a tool adds to the git config stops the job, and the file it names is never deleted", needsGit, () => {
  repo();
  const victim = path.join(p.temp, "keep-me.txt");
  fs.writeFileSync(victim, "the user's file\n");
  const r = ok(runner(["--as", "codex"], { FAKE_MODE: "include", FAKE_VICTIM: victim }));
  assert.equal(r.jobs[0].result, "not done");
  assert.equal(fs.readFileSync(victim, "utf8"), "the user's file\n", "the named file is still there");
  assert.doesNotMatch(fs.readFileSync(path.join(p.root, ".git", "config"), "utf8"), /keep-me/, "the config is put back");
});

test("a config.worktree a tool creates where there was none is removed, and the job stops", needsGit, () => {
  repo();
  const planted = path.join(p.root, ".git", "config.worktree");
  assert.ok(!fs.existsSync(planted));
  const r = ok(runner(["--as", "codex"], { FAKE_MODE: "worktreeconfig" }));
  assert.equal(r.jobs[0].result, "not done");
  assert.ok(!fs.existsSync(planted), "the planted config.worktree is gone");
});
