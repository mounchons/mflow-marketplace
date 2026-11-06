// The runner: parts run one at a time, results come from each tool's own results file, the record ties
// the run to its commit, a missing prerequisite is a skip and never a silent failure, a failed build stops
// the rest, E2E stays out of the whole suite and never starts more browsers than the cap, and `since`
// decides what a later commit needs.
import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, test } from "node:test";
import { FAKE, project, run } from "./mtest-helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const PARTS = [
  { name: "build", kind: "build", command: "node fake.mjs exit 0" },
  { name: "unit", kind: "unit", command: "node fake.mjs trx 5 0", results: "trx" },
  { name: "integration", kind: "integration", command: "node fake.mjs junit 3 1 {out}", results: "junit" },
  { name: "lint", kind: "check", command: "node fake.mjs exit 0" },
  { name: "e2e", kind: "e2e", command: "node ../fake.mjs pw 2 0 playwright", cwd: "e2e", results: "playwright-json" },
];

function setup(parts = PARTS, extra = {}) {
  p = project({ git: true, config: { parts, ...extra } });
  p.write("fake.mjs", FAKE);
  p.write("e2e/.keep", "");
  p.commit("tools");
}

const runner = (...args) => {
  const r = run(p, "run.mjs", args);
  assert.equal(r.status, 0, `${args.join(" ")}: ${r.stderr}`);
  return r.json;
};

function wholeSuite() {
  const started = runner("start", "--scope", "whole");
  for (const name of started.expected) runner("part", name);
  return runner("finish");
}

test("the whole suite runs every part but E2E, reads the results files and records the failures", () => {
  setup();
  const started = runner("start", "--scope", "whole");
  assert.deepEqual(started.expected, ["build", "unit", "integration", "lint"]);
  const unit = runner("part", "unit");
  assert.deepEqual([unit.result, unit.passed, unit.failed, unit.skipped], ["pass", 5, 0, 1]);
  const integ = runner("part", "integration");
  assert.deepEqual([integ.result, integ.passed, integ.failed], ["fail", 3, 1]);
  runner("part", "build");
  runner("part", "lint");
  const done = runner("finish");
  assert.equal(done.result, "fail");
  const rec = p.read(done.record);
  const head = p.git("rev-parse", "HEAD");
  assert.match(rec, new RegExp(`^Tested: main at ${head}$`, "m"));
  assert.match(rec, /^Scope: whole suite$/m);
  assert.match(rec, /^Result: fail$/m);
  assert.match(rec, /^- integration › mod › test_bad: assert 1 == 2$/m);
  assert.doesNotMatch(rec, /\| e2e \|/);
  assert.equal(p.exists(".mtest/run-open.json"), false);
});

test("TRX failures carry the test name and the first line of the message", () => {
  setup([{ name: "unit", kind: "unit", command: "node fake.mjs trx 2 1", results: "trx" }]);
  runner("start");
  runner("part", "unit");
  const rec = p.read(runner("finish").record);
  assert.match(rec, /^- unit › Ns\.Tests\.Fails0: Assert\.Equal\(\) Failure: expected 1 & got 2$/m);
});

test("a run where every part passes on a clean tree is a pass", () => {
  setup(PARTS.map((x) => (x.name === "integration" ? { ...x, command: "node fake.mjs junit 4 0 {out}" } : x)));
  const done = wholeSuite();
  assert.equal(done.result, "pass");
  assert.doesNotMatch(p.read(done.record), /with uncommitted changes/);
});

test("a missing prerequisite skips the part with the reason, and the run is incomplete", () => {
  setup([
    { name: "unit", kind: "unit", command: "node fake.mjs trx 1 0", results: "trx" },
    { name: "integration", kind: "integration", command: "node fake.mjs exit 0", requires: ["env:MTEST_TEST_NOT_SET_42 | tcp:127.0.0.1:9"] },
  ]);
  runner("start");
  runner("part", "unit");
  const integ = runner("part", "integration");
  assert.equal(integ.result, "skipped");
  assert.match(integ.note, /prerequisite not met: env:MTEST_TEST_NOT_SET_42 \| tcp:127\.0\.0\.1:9/);
  const done = runner("finish");
  assert.equal(done.result, "incomplete");
  assert.match(p.read(done.record), /^- integration: skipped — prerequisite not met/m);
});

test("a part the whole suite expects but never ran makes the run incomplete", () => {
  setup();
  runner("start");
  runner("part", "build");
  const done = runner("finish");
  assert.equal(done.result, "incomplete");
  assert.deepEqual(done.notRun, ["unit", "integration", "lint"]);
});

test("a failed build marks the other parts not run", () => {
  setup([{ name: "build", kind: "build", command: "node fake.mjs exit 3" }, { name: "unit", kind: "unit", command: "node fake.mjs trx 1 0", results: "trx" }]);
  runner("start");
  assert.equal(runner("part", "build").result, "fail");
  const unit = runner("part", "unit");
  assert.equal(unit.result, "not run");
  assert.equal(runner("finish").result, "fail");
});

test("a part over its time is stopped and recorded as a timeout", () => {
  setup([{ name: "slow", kind: "unit", command: "node fake.mjs sleep 20000", timeoutMin: 0.03 }]);
  runner("start");
  const slow = runner("part", "slow");
  assert.equal(slow.result, "timeout");
  assert.ok(slow.seconds < 15, `stopped after ${slow.seconds}s`);
  assert.equal(runner("finish").result, "fail");
});

test("without a results file the counts come from the console summary", () => {
  setup([{ name: "unit", kind: "unit", command: "node fake.mjs console 7 2", results: "trx", resultsArgs: "--nothing {dir}" }]);
  runner("start");
  const unit = runner("part", "unit");
  assert.deepEqual([unit.result, unit.passed, unit.failed], ["fail", 7, 2]);
  assert.match(unit.note, /console/);
  runner("finish");
});

test("Jest JSON is read through --outputFile", () => {
  setup([{ name: "web", kind: "unit", command: "node fake.mjs jest 4 1", results: "jest-json" }]);
  runner("start", "--scope", "part web");
  const web = runner("part", "web");
  assert.deepEqual([web.passed, web.failed], [4, 1]);
  assert.match(p.read(runner("finish").record), /^- web › cart adds: expected 2$/m);
});

test("E2E runs only in its scope, with a workers cap added when nothing sets one", () => {
  setup();
  const started = runner("start", "--scope", "e2e");
  assert.deepEqual(started.expected, ["build", "e2e"]);
  runner("part", "build");
  const e2e = runner("part", "e2e");
  assert.equal(e2e.result, "pass");
  assert.equal(e2e.passed, 2);
  assert.match(e2e.command, /--workers=4$/);
  assert.match(e2e.command, /--reporter=list,json/);
  runner("finish");
});

test("E2E keeps the Playwright config's workers within the cap, and refuses a command above it", () => {
  setup([
    { name: "e2e", kind: "e2e", command: "node ../fake.mjs pw 1 0 playwright", cwd: "e2e", results: "playwright-json" },
    { name: "e2e-wide", kind: "e2e", command: "node ../fake.mjs pw 1 0 playwright --workers=6", cwd: "e2e", results: "playwright-json" },
  ]);
  p.write("e2e/playwright.config.ts", "export default defineConfig({\n  workers: 1, // one shared database\n})\n");
  runner("start", "--scope", "e2e");
  const e2e = runner("part", "e2e");
  assert.doesNotMatch(e2e.command, /--workers/);
  const wide = runner("part", "e2e-wide");
  assert.equal(wide.result, "refused");
  assert.match(wide.note, /6 browsers.*at most 4/);
  runner("finish");
});

test("uncommitted changes are named in the record, and a part refuses to run after HEAD moved", () => {
  setup([{ name: "unit", kind: "unit", command: "node fake.mjs trx 1 0", results: "trx" }]);
  p.write("src/a.cs", "changed");
  runner("start");
  runner("part", "unit");
  assert.match(p.read(runner("finish").record), /with uncommitted changes/);
  runner("start");
  p.commit("moved");
  const r = run(p, "run.mjs", ["part", "unit"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /HEAD moved/);
  runner("abort");
});

test("since: no base asks for the whole suite; documents only need nothing; code needs a targeted run", () => {
  setup(PARTS.map((x) => (x.name === "integration" ? { ...x, command: "node fake.mjs junit 4 0 {out}" } : x)));
  assert.equal(runner("since").decision, "whole");
  const done = wholeSuite();
  p.commit("record");
  assert.equal(done.result, "pass");
  assert.equal(runner("since").decision, "none");
  p.write("docs/notes.md", "x");
  p.commit("docs");
  assert.equal(runner("since").decision, "none");
  p.write("src/Billing/Invoice.cs", "class Invoice {}");
  p.commit("code");
  const s = runner("since");
  assert.equal(s.decision, "targeted");
  assert.deepEqual(s.codeFiles, ["src/Billing/Invoice.cs"]);
  assert.equal(s.base.file, done.record);
  const started = runner("start", "--scope", "since");
  assert.match(started.scope, /^since [0-9a-f]{7}$/);
  runner("part", "unit");
  const sinceDone = runner("finish");
  assert.match(p.read(sinceDone.record), /^Base: mtest\/runs\//m);
  assert.match(p.read(sinceDone.record), /src\/Billing\/Invoice\.cs/);
  p.write("package.json", "{}");
  p.commit("deps");
  const w = runner("since");
  assert.equal(w.decision, "whole");
  assert.match(w.why, /package\.json/);
});

test("since reruns the parts the base did not prove", () => {
  setup();
  wholeSuite();
  p.commit("record");
  const s = runner("since");
  assert.deepEqual(s.rerunParts, ["integration"]);
  assert.equal(s.decision, "targeted");
});

test("all runs the whole suite in one go, writes the record and exits 1 when it fails", () => {
  setup();
  const r = run(p, "run.mjs", ["all"]);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.json.result, "fail");
  assert.match(r.stderr, /\[mtest\] unit: pass \(5 passed, 0 failed, 1 skipped\)/);
  assert.equal(run(p, "run.mjs", ["last", "--whole"]).json.result, "fail");
  const plan = runner("plan");
  const verified = Object.fromEntries(plan.parts.map((x) => [x.name, x.verified]));
  assert.deepEqual(verified, { build: true, unit: true, integration: false, lint: true, e2e: false });
  assert.equal(p.git("status", "--porcelain", ".mtest/config.json"), "", "the run leaves the config as it was");
  assert.match(plan.runner, /\/scripts\/run\.mjs$/);
});

test("since treats a dependency list as a whole-suite change, not as a document", () => {
  setup(PARTS.map((x) => (x.name === "integration" ? { ...x, command: "node fake.mjs junit 4 0 {out}" } : x)));
  wholeSuite();
  p.commit("record");
  p.write("requirements-dev.txt", "pytest==8\n");
  p.commit("deps");
  const s = runner("since");
  assert.equal(s.decision, "whole");
  assert.match(s.why, /requirements-dev\.txt/);
});

test("plan lists the parts in scope with their missing prerequisites and the newest record", () => {
  setup([{ name: "integration", kind: "integration", command: "x", requires: ["env:MTEST_TEST_NOT_SET_42"], verified: false }]);
  const plan = runner("plan");
  assert.deepEqual(plan.parts[0].prerequisitesMissing, ["env:MTEST_TEST_NOT_SET_42"]);
  assert.equal(plan.parts[0].verified, false);
  assert.equal(plan.defaultBranch, "main");
  assert.equal(plan.last, null);
});

test("an open run whose id leads out of .mtest/tmp is refused, and abort deletes nothing outside", () => {
  setup([{ name: "unit", kind: "unit", command: "node fake.mjs trx 1 0", results: "trx" }]);
  const outside = p.write("../outside/keep.txt", "keep me");
  const run0 = { id: "../../../outside", scopeLabel: "x", startedAt: "2026-11-06T00:00:00Z", commit: p.git("rev-parse", "HEAD"), parts: [], expected: [] };
  p.write(".mtest/run-open.json", JSON.stringify(run0));
  for (const args of [["finish"], ["part", "unit"], ["plan"]]) {
    const r = run(p, "run.mjs", args);
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, /run id mtest never writes/);
  }
  assert.equal(runner("abort").aborted, "../../../outside");
  assert.equal(p.exists(".mtest/run-open.json"), false);
  assert.equal(fs.readFileSync(outside, "utf8"), "keep me");
});

test("a --label that is not a plain name is refused", () => {
  setup([{ name: "unit", kind: "unit", command: "node fake.mjs trx 1 0", results: "trx" }]);
  runner("start");
  const r = run(p, "run.mjs", ["part", "unit", "--label", "../../x"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--label must be a short name/);
  runner("abort");
});

test("a config with a wrong part is refused with the reason", () => {
  setup([{ name: "x y", kind: "smoke", command: "" }]);
  const r = run(p, "run.mjs", ["plan"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /parts\[0\]\.name/);
  assert.match(r.stderr, /parts\[0\]\.kind/);
});
