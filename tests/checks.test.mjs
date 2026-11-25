// Checks of merged changes by any agent (0.55): a batch branch checks/<date>-<n> with its own worktree and a
// checklist of jobs (test parts, reviews, E2E per screen); the batch is pinned when its first job is taken, tests
// and E2E take turns on the machine, reviews wait for the tests and E2E for them to pass, the test parts combine
// into one whole-suite record that ticks pending.md, and a draft pull request carries it all to main.
import assert from "node:assert/strict";
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

function repo({ parts = true } = {}) {
  p = project({ checks: {} });
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
  assert.equal(busy.job, null, "T1 waits: the heavy lane is busy, and R1 waits for the tests");
  assert.match(busy.reason, /heavy lane \(claude runs .*T0\)/);
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
  const a = ok(checks(["assign", "T0,T1", "antigravity"]));
  assert.deepEqual(a.assigned, ["T0", "T1"]);
  assert.equal(ok(checks(["next", "--as", "codex"])).job.id, "T2", "T0 and T1 are antigravity's now; T2 is anyone's");
  assert.equal(ok(checks(["next", "--as", "antigravity"])).job, null, "one test at a time on the machine");
  ok(checks(["release", "T2"]));
  assert.equal(ok(checks(["next", "--as", "antigravity"])).job.id, "T0");
  const e2e = checks(["assign", "EW1", "antigravity"]);
  assert.notEqual(e2e.status, 0);
  assert.match(e2e.stderr, /E2E: only claude and codex/);
});

test("the parts combine into one whole-suite record at the pinned commit that ticks pending.md; then reviews and E2E are ready", needsGit, () => {
  repo();
  merge("add-a", { screens: "Approvals" });
  ok(checks(["sync"]));
  ok(checks(["assign", "T1", "codex"]));
  ok(checks(["assign", "T2", "antigravity"]));
  for (const [id, by] of [["T0", "claude"], ["T1", "codex"], ["T2", "antigravity"]]) {
    const job = ok(checks(["next", "--as", by]));
    const { dir, pinned } = job;
    assert.equal(job.job.id, id);
    const rel = record(dir, `part-${id}`, { by, scope: id === "T0" ? "prepare" : `part ${id}` });
    const d = ok(checks(["done", id, "--record", rel]));
    assert.equal(d.job.state, "done");
    if (id !== "T2") assert.equal(d.combined, null);
    else {
      assert.equal(d.combined.result, "pass");
      assert.deepEqual(d.combined.ticked.ticked, ["add-a"]);
      const suite = readIn(dir, d.combined.record);
      assert.match(suite, new RegExp(`^Tested: checks/\\S+ at ${pinned}$`, "m"));
      assert.match(suite, /^Scope: whole suite$/m);
      assert.match(suite, /^By: claude, codex, antigravity \(checks /m);
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

test("a failing part fails the suite: reviews go on, E2E waits; a record from a commit with other code is refused", needsGit, () => {
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
  const failed = ok(checks(["done", "T1", "--record", record(job.dir, "run", { result: "fail", scope: "whole suite" })]));
  assert.equal(failed.job.state, "failed");
  const jobs = Object.fromEntries(ok(checks(["status"])).batches[0].jobs.map((j) => [j.id, j]));
  assert.equal(jobs.R1.ready, true, "a review reads the failed run and says so");
  assert.equal(jobs.EW1.ready, false, "E2E waits for the tests to pass");
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
  assert.match(tpl("CLAUDE.md"), /numbered menu\. The `checks\/\*` branches are the one exception/);
  assert.match(tpl("AGENTS.md"), /One test or E2E job at a time per machine\. The `checks\/\*` branches and their draft pull requests are pushed without asking; the user merges them\./);
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
