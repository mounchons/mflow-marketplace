// Checks of merged changes by any agent (0.55): a batch branch checks/<date>-<n> with its own worktree and a
// checklist of jobs (test parts, reviews, E2E per screen); the batch is pinned when its first job is taken, tests
// and E2E take turns on the machine, reviews wait for the tests and E2E for them to pass, the test parts combine
// into one whole-suite record that ticks pending.md, and a draft pull request carries it all to main.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { git, hasGit, project, run, SCRIPTS } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());
const needsGit = { skip: !hasGit && "git not installed" };
// Scripts commit: CI runners have no git identity.
const ID = { GIT_AUTHOR_NAME: "mflow-test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "mflow-test", GIT_COMMITTER_EMAIL: "test@example.invalid" };
const real = (dir) => fs.realpathSync.native(dir).toLowerCase();
const checks = (args, opts = {}) => run(p, "checks.mjs", args, { ...opts, env: { ...ID, ...(opts.env || {}) } });
const ok = (r) => {
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};
const gitIn = (dir, ...args) => git({ ...p, root: dir }, ...args);
const readIn = (dir, rel) => fs.readFileSync(path.join(dir, rel), "utf8").replace(/\r\n/g, "\n");

const jobsOf = (i = 0) => Object.fromEntries(ok(checks(["status"])).batches[i].jobs.map((j) => [j.id, j]));
function fixCommit(dir, rel, text = "fixed\n") {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
  gitIn(dir, "add", "--", rel);
  gitIn(dir, "commit", "-qm", `fix(checks): ${rel}`);
}
/** A review report as /mflow:review writes it; `tick` plays a reviewer that ticked pending.md itself. */
function reviewReport(dir, change, verdict, { tool = "claude", tick = false, n = "" } = {}) {
  const rel = `docs/reviews/code/2026-11-26-${change}${tool === "claude" ? "" : `-${tool}`}${n}.md`;
  fs.mkdirSync(path.join(dir, "docs/reviews/code"), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), `Reviewed: ${change}\nChange: ${change}\nReviewer: ${tool}\nVerdict: ${verdict}\n`);
  if (tick) ok(run(p, "pending.mjs", ["tick-review", change, "--report", rel, "--verdict", verdict], { cwd: dir, env: { CLAUDE_PROJECT_DIR: dir } }));
  return rel;
}
/** Take the next job for a tool and finish it with a passing (or failing) record. */
function passTest(as = "claude", { result = "pass", scope = "whole suite", name, job } = {}) {
  const t = ok(checks(["next", "--as", as, ...(job ? ["--job", job] : [])]));
  const rel = record(t.dir, name || `run-${t.job.id}`, { result, scope, by: as });
  return { t, d: ok(checks(["done", t.job.id, "--batch", t.batch, "--record", rel])), rel };
}

function repo({ parts = true, config = {} } = {}) {
  p = project({ checks: config });
  p.write("STATUS.md", "# STATUS\n\n## Now\n- start\n");
  p.write(".gitignore", ".env\n.claude/worktrees/\n");
  p.write(".gitattributes", "docs/reviews/pending.md merge=union\n");
  p.write("AGENTS.md", `# P\n\n## Commands\n- Build: \`dotnet build\`\n${parts ? "- Test parts: unit: `dotnet test U`; integration: `dotnet test I`; e2e: `npx playwright test`\n" : ""}`);
  git(p, "init", "-q", "-b", "main");
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "baseline");
}

/** A change merged into main: its archived folder, a code file, and its row in pending.md. */
function merge(change, { screens } = {}) {
  p.write(`openspec/changes/archive/2026-11-26-${change}/proposal.md`, `## Why\n${change}\n`);
  p.write(`src/${change}.cs`, `class ${change.replace(/-/g, "")} {}\n${"// line\n".repeat(5)}`);
  const args = ["add", change, "--level", "full", "--why", "rule"];
  if (screens) args.push("--screens", screens);
  ok(run(p, "pending.mjs", args));
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", `Merge feat/${change}`);
}

/** What the test skill would write for a job: a record at the worktree's HEAD, left for `done` to commit. */
function record(dir, name, { result = "pass", scope = "unit", by = "claude" } = {}) {
  const head = gitIn(dir, "rev-parse", "HEAD").trim();
  const rel = `docs/reviews/tests/${name}.md`;
  fs.mkdirSync(path.join(dir, "docs/reviews/tests"), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), `Tested: ${gitIn(dir, "branch", "--show-current").trim()} at ${head}\nBy: ${by}\nScope: ${scope}\nResult: ${result}\nDuration: 3m\n\n## Failures\n${result === "pass" ? "none" : "Unit.A: boom"}\n`);
  return rel;
}

test("sync opens a batch on its own branch and worktree with the test parts, a review per change and E2E per screen; a second merge joins it", needsGit, () => {
  repo();
  merge("add-a", { screens: "Approvals" });
  const first = ok(checks(["sync"]));
  assert.deepEqual(first.added, ["add-a"]);
  assert.ok(first.created);
  assert.match(first.batch, /^\d{4}-\d{2}-\d{2}-1$/);
  assert.equal(real(first.dir), real(path.join(p.root, ".claude", "worktrees", `checks-${first.batch}`)));
  assert.equal(gitIn(first.dir, "branch", "--show-current").trim(), `checks/${first.batch}`);
  const doc = readIn(first.dir, `docs/reviews/checks/${first.batch}.md`);
  assert.match(doc, /^Pinned: —$/m);
  assert.match(doc, /^\| T0 \| test \| prepare: /m);
  assert.match(doc, /^\| T1 \| test \| part unit \|/m);
  assert.match(doc, /^\| T2 \| test \| part integration \|/m);
  assert.doesNotMatch(doc, /part e2e/, "an E2E part stays out of the test jobs");
  assert.match(doc, /^\| R1 \| review \| add-a \| \d+ lines \| claude \| T0 T1 T2 \| open \|/m);
  assert.match(doc, /^\| EW1 \| e2e-write \| Approvals \| 1 screen \| claude \| T0 T1 T2 \| open \|/m);
  assert.match(doc, /^\| E1 \| e2e \| Approvals \| 1 screen \| claude \| EW1 \| open \|/m);
  assert.equal(gitIn(first.dir, "status", "--porcelain").trim(), "", "the checklist is committed on the batch branch");
  assert.equal(git(p, "status", "--porcelain").trim(), "", "main's checkout is left clean");

  merge("add-b");
  const second = ok(checks(["sync"]));
  assert.equal(second.batch, first.batch);
  assert.deepEqual(second.added, ["add-b"]);
  const doc2 = readIn(first.dir, `docs/reviews/checks/${first.batch}.md`);
  assert.match(doc2, /^Changes: add-a, add-b$/m);
  assert.match(doc2, /^\| R2 \| review \| add-b \|/m);
  assert.ok(fs.existsSync(path.join(first.dir, "src/add-b.cs")), "main was merged into the batch branch");
  assert.deepEqual(ok(checks(["sync"])).added, [], "nothing new: nothing added");
});

test("the first job taken pins the batch; a change merged after that opens the next batch", needsGit, () => {
  repo();
  merge("add-a");
  const b = ok(checks(["sync"])).batch;
  const job = ok(checks(["next", "--as", "claude"]));
  assert.equal(job.job.id, "T0");
  assert.match(job.how, /prepare|format/);
  assert.match(readIn(job.dir, job.file), new RegExp(`^Pinned: ${job.pinned} \\(`, "m"));
  assert.equal(gitIn(job.dir, "status", "--porcelain").trim(), "", "taking a job leaves the tree clean for the run");
  merge("add-c");
  const later = ok(checks(["sync"]));
  assert.notEqual(later.batch, b);
  assert.match(later.batch, /-2$/);
  assert.deepEqual(later.added, ["add-c"]);
  assert.deepEqual(later.waitingInPinned, [b]);
});

test("tests and E2E take turns on the machine, reviews wait for the tests, and a claim that went stale is taken again", needsGit, () => {
  repo();
  merge("add-a", { screens: "Approvals" });
  ok(checks(["sync"]));
  assert.equal(ok(checks(["next", "--as", "claude"])).job.id, "T0");
  const busy = ok(checks(["next", "--as", "codex"]));
  assert.equal(busy.job, null, "one job at a time in a batch, and R1 waits for the tests");
  assert.match(busy.reason, /runs T0 \(claude\); one job at a time in a batch/);
  assert.equal(busy.busy, true, "a runner knows to wait rather than give up");
  const st = ok(checks(["status"]));
  assert.equal(st.batches[0].jobs.find((j) => j.id === "T0").running.tool, "claude");
  assert.equal(st.batches[0].jobs.find((j) => j.id === "R1").ready, false);

  // The session that took T0 stopped at a usage limit an hour and a half ago.
  const claims = path.join(p.root, ".git", "mflow", "checks", "claims.json");
  const c = JSON.parse(fs.readFileSync(claims, "utf8"));
  for (const k of Object.keys(c)) c[k].at = new Date(Date.now() - 90 * 60_000).toISOString();
  fs.writeFileSync(claims, JSON.stringify(c));
  const again = ok(checks(["next", "--as", "codex"]));
  assert.equal(again.job.id, "T0");
  assert.equal(again.reclaimed, true);
  ok(checks(["release", "T0"]));
  assert.equal(ok(checks(["next", "--as", "codex"])).job.id, "T0", "a released job is free again");
});

test("assign moves a job to a tool, which alone takes it; E2E goes only to a tool with the browser guard", needsGit, () => {
  repo();
  merge("add-a", { screens: "Approvals" });
  ok(checks(["sync"]));
  const a = ok(checks(["assign", "T0,T1", "claude"]));
  assert.deepEqual(a.assigned, ["T0", "T1"]);
  assert.equal(ok(checks(["next", "--as", "codex"])).job.id, "T2", "T0 and T1 are claude's now; T2 is anyone's");
  assert.equal(ok(checks(["next", "--as", "claude"])).job, null, "one job at a time in a batch");
  ok(checks(["release", "T2"]));
  assert.equal(ok(checks(["next", "--as", "claude"])).job.id, "T0");
  ok(checks(["release", "T0"]));
  // OpenCode takes reviews only; Antigravity, since 0.58.0, tests and fixes too.
  assert.match(checks(["assign", "T2", "opencode"]).stderr, /T2 is a test job: opencode takes reviews only/);
  assert.equal(ok(checks(["next", "--as", "opencode"])).job, null, "OpenCode is never handed a test");
  assert.equal(ok(checks(["assign", "T2", "antigravity"])).tool, "antigravity", "Antigravity takes a test");
  ok(checks(["assign", "T2", "any"]));
  assert.equal(ok(checks(["assign", "R1", "antigravity"])).tool, "antigravity", "a review is fine");
  const e2e = checks(["assign", "EW1", "antigravity"]);
  assert.notEqual(e2e.status, 0);
  assert.match(e2e.stderr, /E2E: only claude and codex/);
});

test("the parts combine into one whole-suite record at the pinned commit that ticks pending.md; then reviews and E2E are ready", needsGit, () => {
  repo();
  merge("add-a", { screens: "Approvals" });
  ok(checks(["sync"]));
  ok(checks(["assign", "T1", "codex"]));
  ok(checks(["assign", "T2", "claude"]));
  for (const [id, by] of [["T0", "claude"], ["T1", "codex"], ["T2", "claude"]]) {
    const job = ok(checks(["next", "--as", by]));
    const { dir, pinned } = job;
    assert.equal(job.job.id, id);
    const rel = record(dir, `part-${id}`, { by, scope: id === "T0" ? "prepare" : `part ${id}` });
    const d = ok(checks(["done", id, "--record", rel]));
    assert.equal(d.job.state, "done");
    if (id !== "T2") assert.equal(d.combined, null);
    else {
      assert.equal(d.combined.result, "pass");
      const suite = readIn(dir, d.combined.record);
      assert.match(suite, new RegExp(`^Tested: checks/\\S+ at ${pinned}$`, "m"));
      assert.match(suite, /^Scope: whole suite$/m);
      assert.match(suite, /^By: claude, codex \(checks /m);
      assert.match(readIn(dir, "docs/reviews/pending.md"), new RegExp(`\\| add-a \\|[^\\n]*${d.combined.record.replace(/[.]/g, "\\.")}`));
      assert.match(readIn(dir, `docs/reviews/checks/${d.batch}.md`), new RegExp(`^Suite: ${d.combined.record.replace(/[.]/g, "\\.")} pass$`, "m"));
      assert.equal(gitIn(dir, "status", "--porcelain").trim(), "", "done commits the record, the suite record, pending.md and the checklist");
    }
  }
  const st = ok(checks(["status"]));
  const jobs = Object.fromEntries(st.batches[0].jobs.map((j) => [j.id, j]));
  assert.equal(jobs.R1.ready, true);
  assert.equal(jobs.EW1.ready, true);
  assert.equal(jobs.E1.ready, false, "E1 waits for its tests to be written");
});

test("a failing suite starts a fix; reviews and E2E wait; after the fix's since run passes they wait on it, and Test points at it", needsGit, () => {
  repo({ parts: false });
  merge("add-a", { screens: "Approvals" });
  ok(checks(["sync"]));
  const job = ok(checks(["next", "--as", "claude"]));
  assert.equal(job.job.target, "whole suite");
  fs.writeFileSync(path.join(job.dir, "src/add-a.cs"), "changed\n");
  gitIn(job.dir, "commit", "-qam", "code after the pin");
  const wrong = checks(["done", "T1", "--record", record(job.dir, "wrong", { scope: "whole suite" })]);
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /changes src\/add-a\.cs after the pinned commit/);
  gitIn(job.dir, "reset", "-q", "--hard", "HEAD~1");
  fs.rmSync(path.join(job.dir, "docs/reviews/tests/wrong.md"));
  const failed = ok(checks(["done", "T1", "--record", record(job.dir, "run", { result: "fail", scope: "whole suite" })]));
  assert.equal(failed.job.state, "failed");
  assert.deepEqual(failed.added, ["F1"]);
  let jobs = jobsOf();
  assert.equal(jobs.F1.target, "tests round 1");
  assert.equal(jobs.R1.ready, false, "a review waits for a passing suite");
  assert.equal(jobs.EW1.ready, false, "E2E waits for the tests to pass");

  const f = ok(checks(["next", "--as", "claude"]));
  assert.equal(f.job.id, "F1");
  assert.match(f.how, /the failing tests of docs\/reviews\/tests\/run\.md/);
  assert.match(checks(["done", "F1"]).stderr, /no fix commit/, "a fix job needs its commit");
  fixCommit(f.dir, "src/add-a.cs");
  const fd = ok(checks(["done", "F1"]));
  assert.match(fd.job.result, /^fixed [0-9a-f]{7}\.\.[0-9a-f]{7} \(1 files\)$/);
  assert.deepEqual(fd.added, ["S1"]);
  const s = ok(checks(["next", "--as", "claude"]));
  assert.equal(s.job.id, "S1");
  const sRel = record(s.dir, "since", { scope: "since abc1234" });
  ok(checks(["done", "S1", "--record", sRel]));
  jobs = jobsOf();
  assert.deepEqual(jobs.R1.waits, ["S1"]);
  assert.equal(jobs.R1.ready, true);
  assert.equal(jobs.EW1.ready, true);
  const row = ok(run(p, "pending.mjs", ["status"], { cwd: s.dir, env: { CLAUDE_PROJECT_DIR: s.dir } })).rows.find((r) => r.change === "add-a");
  assert.equal(row.test, sRel, "Test of the row points at the run after the fix");
});

test("a review's verdict goes into its row; block keeps a job for the user", needsGit, () => {
  repo({ parts: false });
  merge("add-a");
  ok(checks(["sync"]));
  const t = ok(checks(["next", "--as", "claude"]));
  ok(checks(["done", "T1", "--record", record(t.dir, "run", { scope: "whole suite" })]));
  const r = ok(checks(["next", "--as", "claude"]));
  assert.equal(r.job.id, "R1");
  assert.match(r.how, /report only/);
  fs.mkdirSync(path.join(r.dir, "docs/reviews/code"), { recursive: true });
  fs.writeFileSync(path.join(r.dir, "docs/reviews/code/2026-11-26-add-a.md"), "Reviewed: add-a\nChange: add-a\nReviewer: claude\nVerdict: changes-requested\n");
  const d = ok(checks(["done", "R1", "--report", "docs/reviews/code/2026-11-26-add-a.md"]));
  assert.equal(d.job.result, "docs/reviews/code/2026-11-26-add-a.md changes-requested");
  const blocked = checks(["block", "R1"]);
  assert.notEqual(blocked.status, 0, "block needs the question");
});

test("publish without a remote keeps the file; with one it pushes the branch and opens a draft pull request once", needsGit, () => {
  repo();
  merge("add-a");
  const b = ok(checks(["sync"]));
  const none = ok(checks(["publish"])).batches[0];
  assert.equal(none.pushed, false);
  assert.match(none.reason, /no origin remote/);

  const bare = path.join(p.base, "remote.git");
  git(p, "init", "-q", "--bare", bare);
  git(p, "remote", "add", "origin", bare);
  const fake = path.join(p.temp, "gh.mjs");
  const calls = path.join(p.temp, "gh-calls.txt");
  fs.writeFileSync(fake, `import fs from "node:fs";\nfs.appendFileSync(${JSON.stringify(calls)}, process.argv.slice(2, 4).join(" ") + "\\n");\nif (process.argv[3] === "create") console.log("https://github.com/o/r/pull/7");\n`);
  const env = { MFLOW_GH: fake };
  const made = ok(checks(["publish"], { env })).batches[0];
  assert.equal(made.pr, "https://github.com/o/r/pull/7");
  assert.equal(made.created, true);
  assert.equal(made.pushed, true);
  assert.match(readIn(b.dir, `docs/reviews/checks/${b.batch}.md`), /^PR: https:\/\/github\.com\/o\/r\/pull\/7$/m);
  assert.equal(git(p, "--git-dir", bare, "rev-parse", `checks/${b.batch}`).trim(), gitIn(b.dir, "rev-parse", "HEAD").trim(), "the remote has the PR line too");
  const again = ok(checks(["publish"], { env })).batches[0];
  assert.equal(again.created, false);
  assert.deepEqual(fs.readFileSync(calls, "utf8").trim().split("\n"), ["pr create", "pr edit"]);
});

test("merging the batch's pull request into main brings each row once with its tick, and closes the batch", needsGit, () => {
  repo({ parts: false });
  merge("add-a");
  ok(checks(["sync"]));
  const t = ok(checks(["next", "--as", "claude"]));
  const rel = record(t.dir, "run", { scope: "whole suite" });
  ok(checks(["done", "T1", "--record", rel]));
  assert.match(readIn(t.dir, "docs/reviews/pending.md"), new RegExp(`\\| add-a \\|[^\\n]*${rel.replace(/[.]/g, "\\.")}`), "a passing whole-suite run ticks Test");
  merge("add-b");
  git(p, "merge", "-q", "--no-ff", "--no-edit", `checks/${t.batch}`);
  // The union merge may leave the old and the ticked copy of a row; pending.mjs reads them as one, with the tick.
  const rows = ok(run(p, "pending.mjs", ["status"])).rows;
  assert.deepEqual(rows.map((r) => r.change), ["add-a", "add-b"]);
  assert.equal(rows[0].test, rel);
  const st = ok(checks(["status"]));
  assert.deepEqual(st.batches.map((b) => b.name), [], "a merged batch is closed");
  const next = ok(checks(["sync"]));
  assert.deepEqual(next.added, ["add-a", "add-b"], "add-a still waits for its review, so it joins the next batch with add-b");
  assert.match(next.batch, /-2$/);
});

test("the briefing shows the open batch and names the checks skill once the project opted in; the templates carry the push exception", needsGit, () => {
  repo();
  merge("add-a");
  const brief = () => run(p, "session-start.mjs", [], { env: ID, input: { session_id: "t-ck", cwd: p.root, source: "startup" } }).json?.hookSpecificOutput?.additionalContext ?? "";
  assert.match(brief(), /## Checks\n- no open batch/);
  const b = ok(checks(["sync"]));
  ok(checks(["next", "--as", "claude"]));
  const text = brief();
  assert.match(text, new RegExp(`- \`checks/${b.batch}\`: pinned at [0-9a-f]{7}; [0-9]+ open, 1 running, 0 done, 0 blocked`));
  assert.ok(text.includes(path.join(SCRIPTS, "..", "skills", "checks", "SKILL.md")), "the briefing names the skill file");
  p.write(".mflow/config.json", JSON.stringify({ version: 1 }));
  assert.doesNotMatch(brief(), /## Checks/, "a project that has not opted in gets no section");
  const tpl = (f) => fs.readFileSync(path.join(SCRIPTS, "..", "templates", f), "utf8").replace(/\r\n/g, "\n");
  assert.match(tpl("CLAUDE.md"), /When `\.mflow\/config\.json` has `checks`: after each merge into main, put the change into the open checks batch/);
  assert.match(tpl("CLAUDE.md"), /`checks\/\*` branches and their draft pull requests are pushed on the user's standing word, and a pull request is never merged by Claude/);
  assert.match(tpl("AGENTS.md"), /One job at a time in a batch, and one test or E2E job at a time per machine\. The `checks\/\*` branches and their draft pull requests are pushed without asking; the user merges them\./);
});

test("enable opts the project in once; a route that sends E2E to a tool without the browser guard is refused", needsGit, () => {
  repo();
  p.write(".mflow/config.json", JSON.stringify({ version: 1 }));
  assert.equal(ok(checks(["enable"])).changed, true);
  assert.deepEqual(JSON.parse(p.read(".mflow/config.json")).checks, {});
  assert.equal(ok(checks(["enable"])).changed, false);
  p.write(".mflow/config.json", JSON.stringify({ version: 1, checks: { route: { e2e: "antigravity" } } }));
  const r = checks(["status"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /checks\.route\.e2e must be claude or codex/);
});

test("two open batches: done, release and assign find the batch by the job taken or still open, and publish pushes both", needsGit, () => {
  repo({ parts: false });
  merge("add-a");
  const first = ok(checks(["sync"])).batch;
  const t1 = ok(checks(["next", "--as", "claude"]));
  assert.equal(t1.batch, first);
  merge("add-b");
  const second = ok(checks(["sync"])).batch;
  assert.notEqual(second, first);
  const st = ok(checks(["status"]));
  assert.deepEqual(st.batches.map((b) => b.name), [first, second]);
  assert.ok(st.batches[1].jobs.find((j) => j.id === "T1").how.includes("/mflow:test"), "status gives each open job's how, for a tool that is not Claude");
  // T1 is in both; the one taken is the first batch's.
  const d = ok(checks(["done", "T1", "--record", record(t1.dir, "run", { scope: "whole suite" })]));
  assert.equal(d.batch, first);
  // R1 is in both and open in both: the oldest.
  assert.equal(ok(checks(["assign", "R1", "codex"])).batch, first);
  assert.equal(ok(checks(["assign", "R1", "codex", "--batch", second])).batch, second);
  const bare = path.join(p.base, "remote.git");
  git(p, "init", "-q", "--bare", bare);
  git(p, "remote", "add", "origin", bare);
  const pub = ok(checks(["publish"], { env: { MFLOW_GH: path.join(p.temp, "missing-gh.mjs") } }));
  assert.deepEqual(pub.batches.map((b) => [b.batch, b.pushed]), [[first, true], [second, true]]);
  assert.match(pub.batches[0].reason, /pull request not opened/);
});

test("a batch given up is closed: its rows still waiting join the next batch", needsGit, () => {
  repo({ parts: false });
  merge("add-a");
  const first = ok(checks(["sync"])).batch;
  const t1 = ok(checks(["next", "--as", "claude"]));
  ok(checks(["done", "T1", "--record", record(t1.dir, "run", { result: "fail", scope: "whole suite" })]));
  assert.notEqual(checks(["close", first]).status, 0, "close needs a reason");
  const c = ok(checks(["close", first, "--note", "suite failed; fixed on main"]));
  assert.match(c.closed, /suite failed; fixed on main$/);
  assert.match(readIn(t1.dir, `docs/reviews/checks/${first}.md`), /^Closed: .+suite failed/m);
  assert.deepEqual(ok(checks(["status"])).batches, []);
  const next = ok(checks(["sync"]));
  assert.notEqual(next.batch, first);
  assert.deepEqual(next.added, ["add-a"]);
});

test("the loop by rule: changes requested → fix → since run → a short review round, whose approval settles the row", needsGit, () => {
  repo({ parts: false });
  merge("add-a");
  ok(checks(["sync"]));
  passTest();
  const r = ok(checks(["next", "--as", "claude"]));
  assert.equal(r.job.id, "R1");
  assert.match(r.how, /leave section 4 \(Fix\) and the tick of pending\.md out \(checks\.mjs done ticks it\)/);
  const rd = ok(checks(["done", "R1", "--report", reviewReport(r.dir, "add-a", "changes-requested")]));
  assert.deepEqual(rd.added, ["F1"]);
  assert.match(rd.ticked.review, /^changes-requested docs\/reviews\/code\/2026-11-26-add-a\.md$/);
  const f = ok(checks(["next", "--as", "claude"]));
  assert.equal(f.job.target, "R1 round 1");
  assert.match(f.how, /the blockers and majors of docs\/reviews\/code\/2026-11-26-add-a\.md/);
  fixCommit(f.dir, "src/add-a.cs");
  assert.deepEqual(ok(checks(["done", "F1"])).added, ["S1"]);
  const s = passTest("claude", { scope: "since abc1234", name: "since" });
  assert.deepEqual(s.d.added, ["R1.2"]);
  const again = ok(checks(["next", "--as", "claude"]));
  assert.equal(again.job.id, "R1.2");
  assert.match(again.job.size, /^fix [0-9a-f]{7}\.\.[0-9a-f]{7}$/);
  assert.match(again.how, /--short, report only: the diff [0-9a-f]{7}\.\.[0-9a-f]{7} after docs\/reviews\/code\/2026-11-26-add-a\.md/);
  const ad = ok(checks(["done", "R1.2", "--report", reviewReport(again.dir, "add-a", "approve", { n: "-2" })]));
  assert.equal(ad.ticked.done, true, "Test and an approval: the row moves to Done");
  assert.deepEqual(ad.added, []);
  assert.deepEqual(ad.left, []);
});

test("a review that still requests changes after the last round is blocked for the user", needsGit, () => {
  repo({ parts: false, config: { rounds: 1 } });
  merge("add-a");
  ok(checks(["sync"]));
  passTest();
  const r = ok(checks(["next", "--as", "claude"]));
  ok(checks(["done", "R1", "--report", reviewReport(r.dir, "add-a", "changes-requested")]));
  const f = ok(checks(["next", "--as", "claude"]));
  fixCommit(f.dir, "src/add-a.cs");
  ok(checks(["done", "F1"]));
  passTest("claude", { scope: "since abc1234", name: "since" });
  const r2 = ok(checks(["next", "--as", "claude"]));
  const d = ok(checks(["done", "R1.2", "--report", reviewReport(r2.dir, "add-a", "changes-requested", { n: "-2" })]));
  assert.deepEqual(d.added, []);
  assert.equal(d.job.state, "blocked");
  assert.match(d.job.result, /out of rounds: R1 still fails after 1 fixes; the user decides/);
  assert.equal(ok(checks(["release", "R1.2", "--note", "the user answered: 1 a"])).job.state, "open", "released once the user answered");
});

test("a review given to two tools splits into one each and a merge; a reviewer's own tick is undone, the merge ticks once", needsGit, () => {
  repo({ parts: false });
  merge("add-a");
  ok(checks(["sync"]));
  const a = ok(checks(["assign", "R1", "claude,codex"]));
  assert.deepEqual(a.jobs, ["T1", "R1a", "R1b", "R1"]);
  let jobs = jobsOf();
  assert.equal(jobs.R1.kind, "review-merge");
  assert.deepEqual(jobs.R1.waits, ["R1a", "R1b"]);
  assert.equal(jobs.R1b.agent, "codex");
  passTest();
  const sub = ok(checks(["next", "--as", "codex"]));
  assert.equal(sub.job.id, "R1b");
  assert.match(sub.how, /name the report docs\/reviews\/code\/<date>-add-a-codex\.md/);
  const sd = ok(checks(["done", "R1b", "--report", reviewReport(sub.dir, "add-a", "approve", { tool: "codex", tick: true })]));
  assert.equal(sd.ticked, null, "a sub-review never ticks");
  const row = () => ok(run(p, "pending.mjs", ["status"], { cwd: sub.dir, env: { CLAUDE_PROJECT_DIR: sub.dir } })).rows.find((x) => x.change === "add-a");
  assert.equal(row().review, "—", "the reviewer's own tick was undone");
  const ra = ok(checks(["next", "--as", "claude"]));
  assert.equal(ra.job.id, "R1a");
  ok(checks(["done", "R1a", "--report", reviewReport(ra.dir, "add-a", "changes-requested", { n: "-claude" })]));
  const m = ok(checks(["next", "--as", "claude"]));
  assert.equal(m.job.id, "R1");
  assert.match(m.how, /read the reports of R1a, R1b \(docs\/reviews\/code\/2026-11-26-add-a-claude\.md, docs\/reviews\/code\/2026-11-26-add-a-codex\.md\)/);
  const md = ok(checks(["done", "R1", "--report", reviewReport(m.dir, "add-a", "approve")]));
  assert.equal(md.ticked.done, true);
  jobs = jobsOf();
  assert.equal(assign_err(), true);
  function assign_err() {
    return /only an open first review can go to several tools/.test(checks(["assign", "R1", "claude,codex"]).stderr);
  }
});

test("E2E: a failed screen gets a fix, and a fix of tests only goes straight to the screen's next round; a fix of a screen's file reruns passed E2E", needsGit, () => {
  repo({ parts: false });
  merge("add-a", { screens: "Approvals" });
  ok(checks(["sync"]));
  passTest();
  const w = ok(checks(["next", "--as", "claude", "--job", "EW1"]));
  assert.equal(w.job.id, "EW1");
  ok(checks(["done", "EW1", "--batch", w.batch]));
  const e = passTest("claude", { result: "fail", scope: "e2e Approvals", name: "e2e", job: "E1" });
  assert.deepEqual(e.d.added, ["F1"]);
  assert.equal(jobsOf().F1.target, "E1 round 1");
  assert.match(checks(["assign", "F1", "antigravity"]).stderr, /E2E: only claude and codex/);
  const f = ok(checks(["next", "--as", "claude", "--job", "F1"]));
  fixCommit(f.dir, "tests/e2e/approvals.spec.ts", "test('x', () => {});\n");
  assert.deepEqual(ok(checks(["done", "F1"])).added, ["E1.2"], "only E2E test files changed: no since run");
  const e2t = ok(checks(["next", "--as", "claude", "--job", "E1.2"]));
  const e2 = { d: ok(checks(["done", "E1.2", "--record", record(e2t.dir, "e2e-2", { scope: "e2e Approvals" })])) };
  assert.equal(e2.d.job.state, "done");
  // Now a review fix that touches the screen: the passed E2E runs again.
  const r = ok(checks(["next", "--as", "claude"]));
  assert.equal(r.job.id, "R1");
  ok(checks(["done", "R1", "--report", reviewReport(r.dir, "add-a", "changes-requested")]));
  const f2 = ok(checks(["next", "--as", "claude"]));
  fixCommit(f2.dir, "web/Approvals.cshtml", "<p>fixed</p>\n");
  ok(checks(["done", "F2"]));
  const s = passTest("claude", { scope: "since abc1234", name: "since" });
  assert.deepEqual(s.d.added.sort(), ["E1.3", "R1.2"]);
});

test("two fixes done before the since run is taken share one since run, which starts each origin's next round; a fix is recorded without a claim", needsGit, () => {
  repo({ parts: false });
  merge("add-a");
  merge("add-b");
  ok(checks(["sync"]));
  passTest();
  for (const [id, change] of [["R1", "add-a"], ["R2", "add-b"]]) {
    const r = ok(checks(["next", "--as", "claude"]));
    assert.equal(r.job.id, id);
    ok(checks(["done", id, "--report", reviewReport(r.dir, change, "changes-requested")]));
  }
  const dir = jobsOf() && ok(checks(["status"])).batches[0].dir;
  fixCommit(dir, "src/add-a.cs");
  assert.deepEqual(ok(checks(["done", "F1"])).added, ["S1"], "F1 recorded for a tool that took it outside next");
  fixCommit(dir, "src/add-b.cs");
  assert.deepEqual(ok(checks(["done", "F2"])).added, [], "the open since run takes F2 too");
  assert.deepEqual(jobsOf().S1.waits, ["F1", "F2"]);
  const s = passTest("claude", { scope: "since abc1234", name: "since" });
  assert.deepEqual(s.d.added, ["R1.2", "R2.2"]);
});

test("a newer batch waits until the older one is merged or closed, then takes main as it is when it is pinned", needsGit, () => {
  repo({ parts: false });
  merge("add-a");
  const first = ok(checks(["sync"])).batch;
  passTest();
  merge("add-b");
  const second = ok(checks(["sync"])).batch;
  const none = ok(checks(["next", "--as", "claude", "--batch", second]));
  assert.equal(none.job, null);
  assert.match(none.reason, new RegExp(`${second} waits until ${first} is merged or closed`));
  assert.equal(jobsOf(1).T1.ready, false);
  p.write("docs/notes.md", "after the sync\n");
  git(p, "add", ".");
  git(p, "commit", "-qm", "docs after the sync");
  ok(checks(["close", first, "--note", "done for now"]));
  const t = ok(checks(["next", "--as", "claude"]));
  assert.equal(t.batch, second);
  assert.ok(fs.existsSync(path.join(t.dir, "docs/notes.md")), "main was merged in when the batch was pinned");
});

test("next --kind takes only that group of jobs, and says when no batch is open", needsGit, () => {
  repo();
  assert.equal(ok(checks(["next", "--as", "codex", "--kind", "test"])).reason, "no checks batch is open");
  merge("add-a");
  ok(checks(["sync"]));
  const none = ok(checks(["next", "--as", "codex", "--kind", "review"]));
  assert.equal(none.job, null, "the review waits for the tests");
  assert.match(none.reason, /no open review job for codex is ready/);
  const t = ok(checks(["next", "--as", "antigravity", "--kind", "test"]));
  assert.equal(t.job.kind, "test", "Antigravity takes a test (0.58.0)");
  assert.match(checks(["next", "--as", "codex", "--kind", "lint"]).stderr, /--kind must be one of test, review, e2e, fix/);
});

test("the copy of checks.mjs in the generated $mflow-test-pr skill takes, records and ticks a test job from the main checkout", needsGit, () => {
  repo({ parts: false });
  merge("add-a");
  ok(run(p, "agent-skills.mjs", ["write"]));
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "mflow init: agent skills");
  ok(checks(["sync"]));
  // As Codex runs it: from the main checkout's root, the project's own copy, no Claude Code environment.
  const env = { ...process.env, ...ID };
  delete env.CLAUDE_PROJECT_DIR;
  delete env.CLAUDE_PLUGIN_ROOT;
  const copy = (...args) => {
    const r = spawnSync(process.execPath, [p.file(".agents/skills/mflow-test-pr/scripts/checks.mjs"), ...args], { cwd: p.root, env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  const t = copy("next", "--as", "codex", "--kind", "test");
  assert.equal(t.job.id, "T1");
  assert.equal(real(t.dir), real(path.join(p.root, ".claude/worktrees", `checks-${t.batch}`)), "the batch's worktree, not the main checkout");
  const rel = record(t.dir, "codex-T1", { scope: "whole suite", by: "codex" });
  const d = copy("done", "T1", "--batch", t.batch, "--record", rel);
  assert.equal(d.job.state, "done");
  assert.equal(jobsOf().R1.ready, true, "the review that waited for the tests is ready");
  assert.match(readIn(t.dir, "docs/reviews/pending.md"), /\| add-a \|[^\n]*docs\/reviews\/tests\/codex-T1\.md/, "Test of the row points at the record");
  assert.equal(gitIn(t.dir, "status", "--porcelain").trim(), "", "done committed the record on the batch's branch");
  assert.equal(git(p, "status", "--porcelain").trim(), "", "the main checkout is untouched");
});
