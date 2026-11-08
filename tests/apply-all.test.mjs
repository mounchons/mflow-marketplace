// /mflow:apply-all builds every change in openspec/changes/ one after the other. scripts/apply-all.mjs keeps where the
// run is, inside .git so a line of it never dirties the tree, caps the fix rounds, and holds the merge until the files
// say the change passed. Asked for on 2026-11-08 for BunTukTransport, where several approved topics wait to be built.
// Synthetic projects only; NIGHT_NOW stands in for the clock.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { git, hasGit, project, run } from "./helpers.mjs";

const needsGit = { skip: !hasGit && "git not installed" };
const SKILL = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "plugins", "mflow", "skills", "apply-all", "SKILL.md"), "utf8");
const NOW = { NIGHT_NOW: "2026-11-08T15:10:00.000Z", CLAUDE_CODE_REMOTE: "" };

let p;
afterEach(() => p?.cleanup());

const all = (args, env = {}) => run(p, "apply-all.mjs", args, { env: { ...NOW, ...env } });
const ok = (...args) => {
  const r = all(args);
  assert.equal(r.status, 0, r.stdout);
  return r.json;
};
const commit = (msg, files = {}) => {
  for (const [rel, text] of Object.entries(files)) p.write(rel, text);
  git(p, "add", "-A");
  git(p, "commit", "-q", "-m", msg);
  return git(p, "rev-parse", "HEAD").trim();
};
const change = (name) => ({ [`openspec/changes/${name}/proposal.md`]: "# p\n", [`openspec/changes/${name}/tasks.md`]: "- [ ] 1\n" });

function repo(...names) {
  p = project();
  git(p, "init", "-q", "-b", "main");
  commit("first", { "src/app.txt": "1\n" });
  names.forEach((n, i) => {
    for (const [rel, text] of Object.entries(change(n))) p.write(rel, text);
    git(p, "add", "-A");
    process.env.GIT_COMMITTER_DATE = `2026-11-0${i + 1}T10:00:00`; // the queue reads the committer date
    try {
      git(p, "commit", "-q", "-m", `propose ${n}`);
    } finally {
      delete process.env.GIT_COMMITTER_DATE;
    }
  });
}

test("the queue is the oldest proposal first, or the names given in their order", needsGit, () => {
  repo("zebra-first", "apple-second");
  const s = ok("start");
  assert.deepEqual(s.queue, ["zebra-first", "apple-second"]);
  assert.equal(s.rounds, 3);
  assert.equal(git(p, "status", "--porcelain").trim(), "", "the run file does not dirty the tree");
  ok("finish", "--result", "stopped");
  commit("the finished run file");
  assert.deepEqual(ok("start", "apple-second", "--rounds", "2").queue, ["apple-second"]);
});

test("start refuses what it cannot build on", needsGit, () => {
  repo("one");
  assert.match(all(["start", "two"]).json.error, /no change named "two"/);
  assert.match(all(["start", "--rounds", "11"]).json.error, /--rounds/);
  assert.match(all(["start"], { CLAUDE_CODE_REMOTE: "1" }).json.error, /not on the web/);

  p.write("src/app.txt", "2\n");
  const dirty = all(["start"]);
  assert.equal(dirty.status, 1);
  assert.match(dirty.json.error, /uncommitted changes/);
  assert.deepEqual(dirty.json.files, ["M src/app.txt"]);
  git(p, "checkout", "--", "src/app.txt");

  git(p, "switch", "-q", "-c", "chore/discussions");
  const off = all(["start"]);
  assert.match(off.json.error, /on chore\/discussions/);
  git(p, "switch", "-q", "main");

  p.write("openspec/changes/half/proposal.md", "# p\n");
  commit("half a proposal");
  assert.match(all(["start"]).json.error, /no tasks\.md\): half/);
});

test("start with nothing waiting says to propose first; a second start is refused while one is open", needsGit, () => {
  repo();
  assert.match(all(["start"]).json.error, /propose them first/);
  p.cleanup();
  repo("one");
  ok("start");
  const again = all(["start"]);
  assert.equal(again.status, 1);
  assert.match(again.json.error, /an apply-all run is open/);
  assert.equal(again.json.next.step, "apply");
});

test("status names the next step of the first change not merged, and steps cannot be skipped", needsGit, () => {
  repo("one", "two");
  ok("start");
  assert.deepEqual(ok("status").next, { change: "one", branch: "change/one", step: "apply", roundsLeft: null });

  const early = all(["log", "merge", "done", "--target", "one"]);
  assert.equal(early.status, 1);
  assert.match(early.json.error, /apply of one is not finished/);
  assert.match(all(["log", "apply", "done", "--target", "other"]).json.error, /--target names a change/);

  ok("log", "apply", "done", "--target", "one");
  assert.equal(ok("status").next.step, "test");
  ok("log", "test", "done", "--target", "one", "--note", "docs/reviews/tests/r.md | whole");
  ok("log", "review", "skipped", "--target", "one");
  assert.equal(ok("status").next.step, "merge");
  ok("log", "merge", "done", "--target", "one");

  const s = ok("status");
  assert.deepEqual(s.next, { change: "two", branch: "change/two", step: "apply", roundsLeft: null });
  assert.deepEqual(s.merged, ["one"]);
});

test("fix rounds are counted per step and refused past the cap", needsGit, () => {
  repo("one");
  ok("start", "--rounds", "2");
  ok("log", "apply", "done", "--target", "one");
  assert.equal(ok("status").next.roundsLeft, 2);
  assert.equal(ok("log", "test", "round", "--target", "one").roundsLeft, 1);
  assert.equal(ok("log", "test", "round", "--target", "one").roundsLeft, 0);
  const over = all(["log", "test", "round", "--target", "one"]);
  assert.equal(over.status, 1);
  assert.match(over.json.error, /no rounds left/);
  assert.match(all(["log", "merge", "round", "--target", "one"]).json.error, /belongs to test or review/);

  ok("log", "test", "done", "--target", "one");
  assert.equal(ok("status").next.roundsLeft, 2, "review has its own rounds");
});

test("one stop stops the run: the change after it is not offered", needsGit, () => {
  repo("one", "two");
  ok("start");
  ok("log", "apply", "stopped", "--target", "one", "--note", "task 3 needs a table the spec does not have");
  const s = ok("status");
  assert.equal(s.next, null);
  assert.deepEqual(s.stopped, { change: "one", step: "apply", note: "task 3 needs a table the spec does not have" });
});

test("finish moves the run file under docs/reviews/apply-all and closes the run", needsGit, () => {
  repo("one");
  ok("start");
  const f = ok("finish", "--result", "stopped");
  assert.match(f.file, /^docs\/reviews\/apply-all\/\d{4}-\d{2}-\d{2}-\d{4}\.md$/);
  assert.match(p.read(f.file), /^Queue: one$/m);
  assert.match(p.read(f.file), /^Finished: \S+ \(stopped\)/m);
  assert.equal(ok("status").open, false);
  assert.match(all(["finish"]).json.error, /no apply-all run is open/);
});

// The state a change reaches on its branch after apply, test and review.
const PENDING = (review) => `# Waiting\n\n| Change | Branch | Applied | Review level | Test | Review | E2E screens |\n|---|---|---|---|---|---|---|\n\n## Done\n\n| Change | Applied | Test | Review |\n|---|---|---|---|\n| one | 2026-11-08 | docs/reviews/tests/r.md | ${review} |\n`;
const record = (sha, result = "pass") => `Tested: change/one at ${sha}\nBy: claude\nScope: whole suite\nResult: ${result}\n`;

function built() {
  repo("one");
  git(p, "switch", "-q", "-c", "change/one");
  p.write("src/app.txt", "built\n");
  fs.mkdirSync(p.file("openspec/changes/archive"), { recursive: true });
  git(p, "add", "-A");
  git(p, "mv", "openspec/changes/one", "openspec/changes/archive/2026-11-08-one");
  return commit("build one");
}
const passed = (sha, review = "approve docs/reviews/code/r.md", result = "pass") => commit("documents", {
  "docs/reviews/tests/2026-11-08-aaa.md": record(sha, result),
  "docs/reviews/code/r.md": `Reviewed: change/one at ${sha}\nChange: one\nVerdict: approve\n`,
  "docs/reviews/pending.md": PENDING(review),
});

test("gate: ready once the record and the approving report cover the commit, with only documents after them", needsGit, () => {
  passed(built());
  const g = ok("gate", "one");
  assert.deepEqual(g.why, []);
  assert.equal(g.ready, true);
  assert.equal(g.test, "docs/reviews/tests/2026-11-08-aaa.md");
});

test("gate: code committed after the test run or the review holds the merge", needsGit, () => {
  passed(built());
  commit("one more fix", { "src/app.txt": "fixed\n" });
  const g = ok("gate", "one");
  assert.equal(g.ready, false);
  assert.match(g.why.join("\n"), /no passing whole-suite or since record/);
  assert.match(g.why.join("\n"), /code changed after the review/);
});

for (const [what, change_] of [
  ["AGENTS.md, which steers the AI", () => commit("rules", { "AGENTS.md": "# changed\n" })],
  ["a Markdown file under .claude/", () => commit("a command", { ".claude/commands/x.md": "run this\n" })],
  ["a file that is not Markdown under docs/", () => commit("a script", { "docs/run.ps1": "echo\n" })],
  ["code moved under docs/", () => { git(p, "mv", "src/app.txt", "docs/app.md"); commit("moved"); }],
]) {
  test(`gate: ${what}, committed after the test run and the review, holds the merge`, needsGit, () => {
    passed(built());
    change_();
    const g = ok("gate", "one");
    assert.equal(g.ready, false);
    assert.match(g.why.join("\n"), /no passing whole-suite or since record/);
  });
}

test("gate: Markdown under docs/, openspec/ and backlog/ and STATUS.md may follow the review", needsGit, () => {
  passed(built());
  commit("documents", { "STATUS.md": "# s\n", "docs/status-log.md": "l\n", "backlog/tasks/t.md": "t\n", "openspec/specs/a/spec.md": "s\n" });
  assert.deepEqual(ok("gate", "one").why, []);
});

test("a folder or an argument that is not a change name is refused", needsGit, () => {
  repo("one");
  p.write("openspec/changes/Bad Name/tasks.md", "- [ ] 1\n");
  commit("an odd folder");
  assert.match(all(["start"]).json.error, /not a change name .*Bad Name/);
  assert.match(all(["start", "Bad Name"]).json.error, /not a change name/);
  assert.deepEqual(ok("start", "one").queue, ["one"], "naming only real changes leaves the odd folder out");
  assert.match(all(["gate", "../one"]).json.error, /name the change/);
});

test("gate: a failing record, an open row and a change still unarchived each hold the merge", needsGit, () => {
  passed(built(), "approve docs/reviews/code/r.md", "fail");
  assert.match(ok("gate", "one").why.join("\n"), /no passing whole-suite or since record/);
  p.cleanup();

  repo("one");
  git(p, "switch", "-q", "-c", "change/one");
  const g = ok("gate", "one");
  assert.equal(g.ready, false);
  assert.match(g.why.join("\n"), /openspec\/changes\/one is not archived/);
  assert.match(g.why.join("\n"), /not under ## Done/);
});

test("gate: level skip needs no report, and another branch or a dirty tree is refused", needsGit, () => {
  passed(built(), "not needed (level skip)");
  assert.equal(ok("gate", "one").ready, true);
  p.write("src/app.txt", "half\n");
  assert.match(ok("gate", "one").why.join("\n"), /uncommitted changes/);
  git(p, "checkout", "--", "src/app.txt");
  git(p, "switch", "-q", "main");
  assert.match(ok("gate", "one").why.join("\n"), /on main, not change\/one/);
});

test("gate reads what pending.mjs writes: a review sent back and then approved opens the merge", needsGit, () => {
  const sha = built();
  const pending = (...args) => {
    const r = run(p, "pending.mjs", args);
    assert.equal(r.status, 0, r.stderr);
    return r.json;
  };
  pending("init");
  pending("add", "one", "--level", "full", "--why", "rules", "--branch", "change/one");
  const documents = commit("the list");
  p.write("docs/reviews/tests/2026-11-08-bbb.md", record(documents));
  p.write("docs/reviews/code/first.md", `Reviewed: change/one at ${documents}\nChange: one\n`);
  assert.deepEqual(pending("tick-test", "docs/reviews/tests/2026-11-08-bbb.md").ticked, ["one"]);
  pending("tick-review", "one", "--report", "docs/reviews/code/first.md", "--verdict", "changes-requested");
  commit("first review");
  assert.match(ok("gate", "one").why.join("\n"), /not under ## Done/, "sent back: no merge");

  const fix = commit("fix findings", { "src/app.txt": "fixed\n" });
  assert.notEqual(fix, sha);
  p.write("docs/reviews/tests/2026-11-08-ccc.md", `Tested: change/one at ${fix}\nScope: since ${documents.slice(0, 7)}\nResult: pass\n`);
  p.write("docs/reviews/code/second.md", `Reviewed: change/one at ${fix}\nChange: one\n`);
  pending("tick-review", "one", "--report", "docs/reviews/code/second.md", "--verdict", "approve");
  commit("second review");
  const g = ok("gate", "one");
  assert.deepEqual(g.why, []);
  assert.equal(g.test, "docs/reviews/tests/2026-11-08-ccc.md", "the newest record, not the one in the row's Test column");
});

test("the skill follows the commands it chains by reading them, gates the merge, and never pushes or runs E2E", () => {
  assert.match(SKILL, /disable-model-invocation: true/);
  assert.match(SKILL, /skills\/test\/SKILL\.md/, "test and review refuse to be called as skills");
  assert.match(SKILL, /skills\/review\/SKILL\.md/);
  assert.match(SKILL, /Never\*\* push, force, rebase or delete a branch/);
  assert.match(SKILL, /gate <change>` on the branch must say `ready: true`/);
  assert.match(SKILL, /git merge --abort/);
  assert.match(SKILL, /runs no E2E tests/);
  assert.match(SKILL, /One stop stops the run/);
  assert.match(SKILL, /Never remove, skip or loosen a test/);
  assert.match(SKILL, /never `git add -A`/);
});
