// /mflow:apply-all takes what the user approved in /mflow:discuss to main: a plan of changes, one yes, then for each
// change propose, apply, test, review and a merge. scripts/apply-all.mjs keeps where the run is, inside .git so a line
// of it never dirties the tree, refuses a change that names no approved document, caps the fix rounds, and holds the
// merge until the files say the change passed. Asked for on 2026-11-08 and 2026-11-09 for BunTukTransport.
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
const doc = (id, slug, status = "approved", extra = "") => ({ [`docs/decisions/discuss/${id}-${slug}.md`]: `---\nid: ${id}\nslug: ${slug}\ntitle: ${slug} title\nstatus: ${status}\nrevision: 1\n${extra}---\n# x\n` });

/** main with one approved discussion per name, numbered from 10: `one` is 10, `two` is 11. */
function repo(...names) {
  p = project();
  git(p, "init", "-q", "-b", "main");
  commit("first", { "src/app.txt": "1\n", ...Object.assign({}, ...names.map((n, i) => doc(10 + i, n))) });
}
const passSteps = (name, ...steps) => { for (const s of steps) ok("log", s, "done", "--target", name); };

test("start needs a plan of changes, each from an approved discussion, and keeps it in order", needsGit, () => {
  repo("one", "two");
  assert.match(all(["start"]).json.error, /no plan/);
  const s = ok("start", "zebra=11", "apple=10,11");
  assert.deepEqual(s.queue, ["zebra", "apple"], "the plan's order, not the alphabet");
  assert.equal(s.rounds, 3);
  assert.equal(git(p, "status", "--porcelain").trim(), "", "the run file does not dirty the tree");
  const next = ok("status").next;
  assert.deepEqual(next, { change: "zebra", branch: "change/zebra", docs: ["docs/decisions/discuss/11-two.md"], step: "propose", roundsLeft: null });
  assert.deepEqual(ok("status").changes[1].docs, ["docs/decisions/discuss/10-one.md", "docs/decisions/discuss/11-two.md"]);
});

test("a change that has not been through an approved discussion is refused", needsGit, () => {
  repo("one");
  commit("a draft and a dropped one", { ...doc(20, "still-talking", "draft"), ...doc(21, "dropped-one", "dropped") });
  assert.match(all(["start", "free-standing"]).json.error, /approved in \/mflow:discuss/);
  assert.match(all(["start", "x=99"]).json.error, /no discussion document 99/);
  assert.match(all(["start", "x=20"]).json.error, /discussion 20 \(still-talking\) is draft: settle it and approve it/);
  assert.match(all(["start", "x=21"]).json.error, /is dropped/);
  assert.match(all(["start", "x=10,20"]).json.error, /is draft/, "one unapproved document refuses the change");
  assert.equal(ok("status").open, false, "nothing started");
});

test("start and candidates refuse what they cannot build on", needsGit, () => {
  repo("one");
  assert.match(all(["start", "--rounds", "11", "x=10"]).json.error, /--rounds/);
  assert.match(all(["start", "x=10"], { CLAUDE_CODE_REMOTE: "1" }).json.error, /not on the web/);

  p.write("src/app.txt", "2\n");
  for (const r of [all(["start", "x=10"]), all(["candidates"])]) {
    assert.equal(r.status, 1);
    assert.match(r.json.error, /uncommitted changes/);
    assert.deepEqual(r.json.files, ["M src/app.txt"]);
  }
  git(p, "checkout", "--", "src/app.txt");

  git(p, "switch", "-q", "-c", "chore/discussions");
  for (const r of [all(["start", "x=10"]), all(["candidates"])]) assert.match(r.json.error, /on chore\/discussions: the approved documents must be on main/);
  git(p, "switch", "-q", "main");

  commit("half a proposal", { "openspec/changes/half/proposal.md": "# p\n", "openspec/changes/archive/2026-10-01-old/proposal.md": "# p\n" });
  assert.match(all(["start", "half=10"]).json.error, /no tasks\.md/);
  assert.match(all(["start", "old=10"]).json.error, /already built and archived/);
  assert.match(all(["start", "x=10", "x=10"]).json.error, /twice/);
});

test("candidates lists the approved documents with what already cites them", needsGit, () => {
  repo();
  assert.match(all(["candidates"]).json.error, /settle the topics with \/mflow:discuss/);
  p.cleanup();

  repo("one", "two");
  commit("more", {
    ...doc(12, "sign-in", "approved", "packs: auth@3\n"),
    ...doc(13, "still-talking", "draft"),
    "openspec/changes/archive/2026-10-01-old/proposal.md": "builds docs/decisions/discuss/10-one.md\n",
    "openspec/changes/waiting/proposal.md": "starts from docs/decisions/packs/auth.md\n",
    "openspec/changes/waiting/tasks.md": "- [ ] 1\n",
  });
  git(p, "branch", "change/earlier");
  const c = ok("candidates");
  assert.deepEqual(c.approved.map((d) => [d.id, d.builtBy]), [["10", ["archive/2026-10-01-old"]], ["11", []], ["12", ["waiting"]]]);
  assert.deepEqual(c.approved[2].packs, ["auth"]);
  assert.deepEqual(c.notApproved.map((d) => d.slug), ["still-talking"]);
  assert.deepEqual(c.changes, ["waiting"]);
  assert.deepEqual(c.branches, ["change/earlier"]);
});

test("a second start is refused while a run is open", needsGit, () => {
  repo("one");
  ok("start", "x=10");
  const again = all(["start", "x=10"]);
  assert.equal(again.status, 1);
  assert.match(again.json.error, /an apply-all run is open/);
  assert.equal(again.json.next.step, "propose");
});

test("status names the next step of the first change not merged, and steps cannot be skipped", needsGit, () => {
  repo("one", "two");
  ok("start", "first=10", "second=11");
  const early = all(["log", "apply", "done", "--target", "first"]);
  assert.equal(early.status, 1);
  assert.match(early.json.error, /propose of first is not finished/);
  assert.match(all(["log", "propose", "done", "--target", "other"]).json.error, /--target names a change/);

  ok("log", "propose", "skipped", "--target", "first", "--note", "already proposed");
  assert.equal(ok("status").next.step, "apply");
  ok("log", "apply", "done", "--target", "first");
  assert.equal(ok("status").next.step, "test");
  ok("log", "test", "done", "--target", "first", "--note", "docs/reviews/tests/r.md | whole");
  ok("log", "review", "skipped", "--target", "first");
  assert.equal(ok("status").next.step, "merge");
  ok("log", "merge", "done", "--target", "first");

  const s = ok("status");
  assert.equal(s.next.change, "second");
  assert.equal(s.next.step, "propose");
  assert.deepEqual(s.merged, ["first"]);
});

test("a part a proposal split off runs right after it, from approved documents only", needsGit, () => {
  repo("one", "two");
  commit("a draft", doc(20, "still-talking", "draft"));
  ok("start", "first=10", "last=11");
  assert.deepEqual(ok("extend", "first-part-2=10", "--after", "first").queue, ["first", "first-part-2", "last"]);
  assert.deepEqual(ok("extend", "first-part-3=10", "--after", "first-part-2").queue, ["first", "first-part-2", "first-part-3", "last"]);
  assert.deepEqual(ok("status").changes[1].docs, ["docs/decisions/discuss/10-one.md"]);
  assert.match(all(["extend", "x=10", "--after", "nobody"]).json.error, /--after names a change/);
  assert.match(all(["extend", "first-part-2=10", "--after", "first"]).json.error, /already in the plan/);
  assert.match(all(["extend", "x=20", "--after", "first"]).json.error, /is draft/);
});

test("fix rounds are counted per step and refused past the cap", needsGit, () => {
  repo("one");
  ok("start", "x=10", "--rounds", "2");
  passSteps("x", "propose", "apply");
  assert.equal(ok("status").next.roundsLeft, 2);
  assert.equal(ok("log", "test", "round", "--target", "x").roundsLeft, 1);
  assert.equal(ok("log", "test", "round", "--target", "x").roundsLeft, 0);
  const over = all(["log", "test", "round", "--target", "x"]);
  assert.equal(over.status, 1);
  assert.match(over.json.error, /no rounds left/);
  assert.match(all(["log", "merge", "round", "--target", "x"]).json.error, /belongs to test or review/);

  ok("log", "test", "done", "--target", "x");
  assert.equal(ok("status").next.roundsLeft, 2, "review has its own rounds");
});

test("one stop stops the run: the change after it is not offered", needsGit, () => {
  repo("one", "two");
  ok("start", "first=10", "second=11");
  ok("log", "propose", "stopped", "--target", "first", "--note", "1. who sees the log? a) all b) admins");
  const s = ok("status");
  assert.equal(s.next, null);
  assert.deepEqual(s.stopped, { change: "first", step: "propose", note: "1. who sees the log? a) all b) admins" });
});

test("finish moves the run file under docs/reviews/apply-all and closes the run", needsGit, () => {
  repo("one");
  ok("start", "x=10");
  const f = ok("finish", "--result", "stopped");
  assert.match(f.file, /^docs\/reviews\/apply-all\/\d{4}-\d{2}-\d{2}-\d{4}\.md$/);
  assert.match(p.read(f.file), /^Queue: x$/m);
  assert.match(p.read(f.file), /^Docs: x=docs\/decisions\/discuss\/10-one\.md$/m);
  assert.match(p.read(f.file), /^Finished: \S+ \(stopped\)/m);
  assert.equal(ok("status").open, false);
  assert.match(all(["finish"]).json.error, /no apply-all run is open/);
});

// The state a change reaches on its branch after apply, test and review.
const PENDING = (review) => `# Waiting\n\n| Change | Branch | Applied | Review level | Test | Review | E2E screens |\n|---|---|---|---|---|---|---|\n\n## Done\n\n| Change | Applied | Test | Review |\n|---|---|---|---|\n| one | 2026-11-08 | docs/reviews/tests/r.md | ${review} |\n`;
const record = (sha, result = "pass") => `Tested: change/one at ${sha}\nBy: claude\nScope: whole suite\nResult: ${result}\n`;

function built() {
  repo("doc");
  commit("propose one", change("one"));
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

for (const [what, alter] of [
  ["AGENTS.md, which steers the AI", () => commit("rules", { "AGENTS.md": "# changed\n" })],
  ["a Markdown file under .claude/", () => commit("a command", { ".claude/commands/x.md": "run this\n" })],
  ["a file that is not Markdown under docs/", () => commit("a script", { "docs/run.ps1": "echo\n" })],
  ["code moved under docs/reviews/", () => { fs.mkdirSync(p.file("docs/reviews"), { recursive: true }); git(p, "mv", "src/app.txt", "docs/reviews/app.md"); commit("moved"); }],
  ["a CLAUDE.md nested under docs/", () => commit("nested", { "docs/CLAUDE.md": "run this\n" })],
  ["an AGENTS.md among the reports", () => commit("nested", { "docs/reviews/AGENTS.md": "run this\n" })],
  ["a .claude folder among the reports", () => commit("nested", { "docs/reviews/.claude/commands/x.md": "run this\n" })],
  ["a main spec", () => commit("spec", { "openspec/specs/a/spec.md": "s\n" })],
]) {
  test(`gate: ${what}, committed after the test run and the review, holds the merge`, needsGit, () => {
    passed(built());
    alter();
    const g = ok("gate", "one");
    assert.equal(g.ready, false);
    assert.match(g.why.join("\n"), /no passing whole-suite or since record/);
  });
}

test("gate: what a run writes after its review may follow it", needsGit, () => {
  passed(built());
  commit("documents", { "STATUS.md": "# s\n", "docs/status-log.md": "l\n", "docs/reviews/more.md": "r\n", "backlog/tasks/t.md": "t\n", "openspec/changes/archive/2026-11-08-one/tasks.md": "- [x] 1\n" });
  assert.deepEqual(ok("gate", "one").why, []);
});

test("a name that is not a change name is refused", needsGit, () => {
  repo("one");
  assert.match(all(["start", "Bad Name=10"]).json.error, /not a change name/);
  assert.match(all(["start", "../up=10"]).json.error, /not a change name/);
  assert.match(all(["gate", "../one"]).json.error, /name the change/);
});

test("gate: a failing record, an open row and a change still unarchived each hold the merge", needsGit, () => {
  passed(built(), "approve docs/reviews/code/r.md", "fail");
  assert.match(ok("gate", "one").why.join("\n"), /no passing whole-suite or since record/);
  p.cleanup();

  repo("doc");
  commit("propose one", change("one"));
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

test("the skill plans from approved discussions, asks once, proposes on the branch, gates the merge, and never pushes or runs E2E", () => {
  assert.match(SKILL, /disable-model-invocation: true/);
  assert.match(SKILL, /A topic that has not been through `\/mflow:discuss` and been approved does not run here/);
  assert.match(SKILL, /a\) ทำทั้งหมด b\) ทำบางข้อ \(เช่น `b 1,3`\) c\) แก้แผน \(บอกว่าแก้อะไร\) d\) ยกเลิก/, "the one answer, all or some, before anything is written");
  assert.match(SKILL, /Nothing is written before the answer/);
  assert.match(SKILL, /\*\*the work\*\* it will do/);
  assert.match(SKILL, /A missing prototype never keeps a change out of the plan: the user decides/);
  assert.match(SKILL, /with your recommendation for it/);
  assert.match(SKILL, /goes with the change that first builds its tables/);
  assert.match(SKILL, /`order` of `packs\.mjs selected`/);
  assert.match(SKILL, /A marked choice they do not settle stops the change/);
  assert.match(SKILL, /openspec validate <change> --strict/);
  assert.match(SKILL, /skills\/<name>\/SKILL\.md/, "test and review refuse to be called as skills");
  assert.match(SKILL, /Never\*\* push, force, rebase or delete a branch/);
  assert.match(SKILL, /gate <change>` on the branch must say `ready: true`/);
  assert.match(SKILL, /git merge --abort/);
  assert.match(SKILL, /runs no E2E tests/);
  assert.match(SKILL, /One stop stops the run/);
  assert.match(SKILL, /Never remove, skip or loosen a test/);
  assert.match(SKILL, /never `git add -A`/);
});
