// docs/reviews/pending.md: /opsx:apply adds a row instead of asking for /mflow:test and /mflow:review, one
// passing run on main ticks every change it holds, and /mflow:review pending reviews each change by its own
// range. StemHub 2026-10-31: the server change of CR-009 A spent 4 h 25 min in test and review before the
// next change could start, while the next three changes skipped both on the user's word.
import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, test } from "node:test";
import { TEMPLATE, parse, render } from "../plugins/mflow/scripts/pending.mjs";
import { git, hasGit, project, run } from "./helpers.mjs";

const needsGit = { skip: !hasGit && "git not installed" };
let p;
afterEach(() => p?.cleanup());

const pending = (...args) => run(p, "pending.mjs", args);
const ok = (...args) => {
  const r = pending(...args);
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};
const commit = (msg, files = {}) => {
  for (const [rel, text] of Object.entries(files)) p.write(rel, text);
  git(p, "add", "-A");
  git(p, "commit", "-q", "-m", msg);
  return git(p, "rev-parse", "HEAD").trim();
};
const archive = (name, date = "2026-10-31") => {
  fs.mkdirSync(p.file("openspec/changes/archive"), { recursive: true });
  git(p, "mv", `openspec/changes/${name}`, `openspec/changes/archive/${date}-${name}`);
  return commit(`archive ${name}`);
};
const record = (rel, commitSha, { scope = "whole suite", result = "pass", dirty = false } = {}) =>
  p.write(rel, `Tested: main at ${commitSha}${dirty ? " with uncommitted changes" : ""}\nBy: claude\nScope: ${scope}\nChanges: none\nResult: ${result}\nDuration: 1 min\n`);

/** main with one change proposed, built and archived: foo touches src/foo.cs. */
function repoWithChange() {
  p = project();
  git(p, "init", "-q", "-b", "main");
  const root = commit("start", { "README.md": "x\n", "src/base.cs": "base\n" });
  const proposal = commit("propose foo", { "openspec/changes/foo/proposal.md": "# foo\n" });
  commit("build foo", { "src/foo.cs": "foo\n", "openspec/changes/foo/tasks.md": "- [x] 1.1\n", "STATUS.md": "now\n" });
  const end = archive("foo");
  return { root, proposal, end };
}

test("range runs from before the proposal to the archive, and keeps code apart from documents", needsGit, () => {
  const { root, end } = repoWithChange();
  const r = ok("range", "foo");
  assert.equal(r.base, root);
  assert.equal(r.end, end);
  assert.equal(r.landed, true);
  assert.equal(r.folder, "openspec/changes/archive/2026-10-31-foo");
  assert.deepEqual(r.codeFiles, ["src/foo.cs"]);
  assert.ok(r.files.includes("STATUS.md") && r.files.includes("openspec/changes/archive/2026-10-31-foo/proposal.md"));
  assert.equal(r.commits.length, 3);
});

test("a name used twice: the range starts after the older change's archive", needsGit, () => {
  repoWithChange();
  const before = git(p, "rev-parse", "HEAD").trim();
  commit("propose foo again", { "openspec/changes/foo/proposal.md": "# foo 2\n" });
  commit("build foo again", { "src/foo2.cs": "foo2\n" });
  archive("foo", "2026-11-02");
  const r = ok("range", "foo");
  assert.equal(r.base, before);
  assert.deepEqual(r.codeFiles, ["src/foo2.cs"]);
});

test("one passing run on main ticks every change it holds; an approved review then moves the row to Done", needsGit, () => {
  repoWithChange();
  commit("propose bar", { "openspec/changes/bar/proposal.md": "# bar\n" });
  commit("build bar", { "src/bar.cs": "bar\n" });
  archive("bar");
  assert.equal(ok("add", "foo", "--level", "full", "--why", "migration", "--branch", "feat/foo", "--screens", "orders").created, true);
  ok("add", "bar", "--level", "short", "--why", "a screen");
  assert.equal(ok("add", "foo", "--level", "full").added, false, "a change is listed once");
  const head = git(p, "rev-parse", "HEAD").trim();
  record("docs/reviews/tests/2026-11-01-x.md", head);
  const t = ok("tick-test", "docs/reviews/tests/2026-11-01-x.md");
  assert.deepEqual(t.ticked.sort(), ["bar", "foo"]);
  assert.deepEqual(t.moved, []);
  p.write("docs/reviews/code/2026-11-01-foo.md", "Reviewed: foo\n");
  const v = ok("tick-review", "foo", "--report", "docs/reviews/code/2026-11-01-foo.md", "--verdict", "approve");
  assert.equal(v.done, true);
  const s = ok("status");
  assert.deepEqual(s.rows.map((r) => r.change), ["bar"]);
  assert.deepEqual(s.done, ["foo"]);
  assert.equal(s.rows[0].testOpen, false);
  assert.equal(s.rows[0].reviewOpen, true);
  const text = p.read("docs/reviews/pending.md");
  assert.match(text, /\| foo \| 20\d\d-\d\d-\d\d \| docs\/reviews\/tests\/2026-11-01-x\.md \| approve docs\/reviews\/code\/2026-11-01-foo\.md \|/);
  assert.match(text, /^# Waiting for test and review/, "the template's title and note stay");
});

test("a run that failed, had uncommitted changes or was not the whole suite ticks nothing", needsGit, () => {
  repoWithChange();
  ok("add", "foo", "--level", "full");
  const head = git(p, "rev-parse", "HEAD").trim();
  for (const [name, opts, why] of [
    ["fail", { result: "fail" }, /did not pass/],
    ["dirty", { dirty: true }, /uncommitted/],
    ["unit", { scope: "unit" }, /not the whole suite/],
  ]) {
    record(`docs/reviews/tests/${name}.md`, head, opts);
    const r = ok("tick-test", `docs/reviews/tests/${name}.md`);
    assert.deepEqual(r.ticked, [], name);
    assert.match(r.reason, why);
  }
  record("docs/reviews/tests/since.md", head, { scope: `since ${head.slice(0, 7)}` });
  assert.deepEqual(ok("tick-test", "docs/reviews/tests/since.md").ticked, ["foo"], "a since run counts");
});

test("a change still on its branch is not held by a run on main; an archive after the run is", needsGit, () => {
  repoWithChange();
  const mainHead = git(p, "rev-parse", "HEAD").trim();
  git(p, "checkout", "-q", "-b", "feat/baz");
  commit("propose baz", { "openspec/changes/baz/proposal.md": "# baz\n" });
  commit("build baz", { "src/baz.cs": "baz\n" });
  git(p, "checkout", "-q", "main");
  ok("add", "foo", "--level", "full");
  ok("add", "baz", "--level", "short", "--branch", "feat/baz");
  const s = ok("status");
  assert.equal(s.rows.find((r) => r.change === "baz").landed, false);
  record("docs/reviews/tests/main.md", mainHead);
  const r = ok("tick-test", "docs/reviews/tests/main.md");
  assert.deepEqual(r.ticked, ["foo"]);
  assert.deepEqual(r.notHeld, ["baz"]);

  // Tested on the branch before its archive: the archive only moves documents, so the run still holds it.
  git(p, "checkout", "-q", "feat/baz");
  const tested = git(p, "rev-parse", "HEAD").trim();
  archive("baz");
  record("docs/reviews/tests/baz.md", tested);
  assert.deepEqual(ok("tick-test", "docs/reviews/tests/baz.md").ticked, ["baz"]);
});

// StemHub's system-settings: the proposal was committed on main, the code on feat/system-settings.
test("a proposal on main with its code on a branch is not landed until the merge", needsGit, () => {
  p = project();
  git(p, "init", "-q", "-b", "main");
  commit("start", { "src/base.cs": "base\n" });
  const proposal = commit("propose qux", { "openspec/changes/qux/proposal.md": "# qux\n" });
  git(p, "checkout", "-q", "-b", "feat/qux");
  const tip = commit("build qux", { "src/qux.cs": "qux\n" });
  git(p, "checkout", "-q", "main");
  ok("add", "qux", "--level", "full", "--branch", "feat/qux");
  let row = ok("status").rows[0];
  assert.equal(row.end, tip);
  assert.equal(row.landed, false);
  record("docs/reviews/tests/m.md", proposal);
  assert.deepEqual(ok("tick-test", "docs/reviews/tests/m.md").notHeld, ["qux"]);
  git(p, "merge", "-q", "--no-ff", "-m", "merge qux", "feat/qux");
  row = ok("status").rows[0];
  assert.equal(row.landed, true);
  record("docs/reviews/tests/m2.md", git(p, "rev-parse", "HEAD").trim());
  assert.deepEqual(ok("tick-test", "docs/reviews/tests/m2.md").ticked, ["qux"]);
  assert.deepEqual(ok("range", "qux").codeFiles, ["src/qux.cs"]);
});

test("code committed after the tested commit is not held by it", needsGit, () => {
  p = project();
  git(p, "init", "-q", "-b", "main");
  commit("start", { "src/base.cs": "base\n" });
  const tested = commit("propose foo", { "openspec/changes/foo/proposal.md": "# foo\n" });
  commit("build foo", { "src/foo.cs": "foo\n", "openspec/changes/foo/tasks.md": "- [x] 1.1\n" });
  ok("add", "foo", "--level", "full");
  record("docs/reviews/tests/early.md", tested);
  assert.deepEqual(ok("tick-test", "docs/reviews/tests/early.md").notHeld, ["foo"]);
});

test("a row at level skip needs no review: the run alone moves it to Done", needsGit, () => {
  repoWithChange();
  ok("add", "foo", "--level", "skip", "--why", "styles only");
  record("docs/reviews/tests/r.md", git(p, "rev-parse", "HEAD").trim());
  assert.deepEqual(ok("tick-test", "docs/reviews/tests/r.md").moved, ["foo"]);
  assert.match(p.read("docs/reviews/pending.md"), /\| foo \| [\d-]+ \| docs\/reviews\/tests\/r\.md \| not needed \(level skip\) \|/);
});

test("archived changes from the Since date on that are not listed are reported missing", needsGit, () => {
  repoWithChange();
  commit("propose old", { "openspec/changes/old/proposal.md": "# old\n" });
  archive("old", "2026-10-20");
  assert.equal(ok("status").missingFrom, null, "no list and no date: nothing is missing");
  assert.equal(ok("init", "--since", "2026-10-28").created, true);
  assert.match(p.read("docs/reviews/pending.md"), /^# Waiting for test and review · รอ test และ review\n\nSince: 2026-10-28\n/);
  assert.deepEqual(ok("status").missing, [{ change: "foo", archived: "2026-10-31-foo" }]);
  ok("add", "foo", "--level", "full", "--applied", "2026-10-31");
  assert.deepEqual(ok("status").missing, []);
});

test("the rows a hand-written file holds are read, and the text around the tables stays", () => {
  const text = [
    "# Waiting for test and review",
    "",
    "Notes the user wrote.",
    "",
    "| Change | Branch | Applied | Review level | Test | Review | E2E screens |",
    "|---|---|---|---|---|---|---|",
    "| `owning-site-names` | feat/owning-site-names | 2026-10-31 | full: migration, sync | — | — | orders, settings |",
    "",
    "More notes.",
  ].join("\n");
  const list = parse(text);
  assert.equal(list.rows.length, 1);
  assert.equal(list.rows[0].change, "owning-site-names");
  assert.equal(list.rows[0].level, "full: migration, sync");
  const out = render(text, [{ ...list.rows[0], test: "docs/reviews/tests/a.md" }], []);
  assert.match(out, /Notes the user wrote\./);
  assert.match(out, /More notes\./);
  assert.match(out, /\| owning-site-names \| feat\/owning-site-names \| 2026-10-31 \| full: migration, sync \| docs\/reviews\/tests\/a\.md \| — \| orders, settings \|/);
  assert.match(out, /## Done\n\n\| Change \| Applied \| Test \| Review \|/);
  assert.deepEqual(parse(TEMPLATE).rows, []);
  assert.equal(parse(render(TEMPLATE, [], [])).rows.length, 0);
});

test("bad input is refused with a message", needsGit, () => {
  repoWithChange();
  assert.match(pending("add", "Foo Bar", "--level", "full").stderr, /name the change/);
  assert.match(pending("add", "foo", "--level", "big").stderr, /--level is one of full, short, skip/);
  assert.match(pending("tick-test", "../x.md").stderr, /outside the project/);
  assert.match(pending("tick-review", "foo", "--report", "docs/x.md", "--verdict", "ok").stderr, /--verdict is one of/);
  assert.match(pending("range", "nope").stderr, /no commit touches openspec\/changes\/nope\//);
});
