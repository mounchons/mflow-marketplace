// The runner of a checks batch (0.55): one tool's jobs, one at a time, the tool run headless in the batch's worktree
// and its results recorded and committed by the runner outside the tool's sandbox. A fake tool plays Codex or
// Antigravity here: it reads the brief and writes what the job asks, or says it hit its limit, or asks the user.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { git, hasGit, project, run } from "./helpers.mjs";

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
  assert.ok(fs.existsSync(path.join(dir, "src/extra.txt")), "the files stay for the user to look at");
  assert.equal(jobsOf().T1.state, "open");
});

test("--dry-run shows the command; a tool with no job ready, or a time already past, takes nothing", needsGit, () => {
  repo();
  const d = ok(runner(["--as", "antigravity", "--dry-run"]));
  assert.match(d.command, /fake-tool\.mjs/);
  const none = ok(runner(["--as", "antigravity"]));
  assert.deepEqual(none.jobs, []);
  assert.match(none.stopped, /no open job for antigravity is ready/);
  const late = ok(runner(["--as", "codex", "--until", "00:00"]));
  assert.deepEqual(late.jobs, []);
  assert.match(late.stopped, /past 00:00/);
  assert.notEqual(runner(["--as", "gemini"]).status, 0);
});
