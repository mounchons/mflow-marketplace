// Flow coverage: every step, branch, transition and rule of a flow doc must be walked by a case, every
// case must name a test, and every named test must exist in the project's test files. E2E cases without a
// test wait for /mtest:e2e and are not gaps.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { project, run } from "./mtest-helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const FLOW = `---
flow: upload-to-post
title: เอกสารจากอัปโหลดถึง Posted
status: draft
---

# Upload to post

## Goal
A document becomes a posted journal.

## Steps
| Step | Actor | Action | Expected | State after |
|---|---|---|---|---|
| 1 | Uploader | upload | stored | Uploaded |
| 2 | AI | read | draft | Draft |
| 3 | Reviewer | check | balanced | Ready |
| 4 | Approver | approve | posted | Posted |

## Branches
| Branch | At | When | Then | Back to |
|---|---|---|---|---|
| B1 | 2 | no purpose | question | 3 |
| B2 | 3 | unbalanced | approve disabled | 3 |

## Transitions
| Transition | From | To | Trigger | Allowed for |
|---|---|---|---|---|
| T1 | Posted | Draft | edit | nobody |

## Rules
| Rule | Where it applies | Unit test |
|---|---|---|
| R1 | 3 | VatTests.Rounds_half_up |
| R2 | 4 | TODO |

## Cases
| Case | Path | Kind | Expect | Level | Test |
|---|---|---|---|---|---|
| C01 | 1-2-3-4 | happy | posted | integration | \`tests/Api/FlowTests.cs::AC19_upload_to_trial_balance\` |
| C02 | 1-2-B1-3-4 | alt | posted after answer | integration | AC02_question_blocks_approval |
| C03 | 1 → 2 → 3 → B2 | error | no journal | integration | TODO |
| C04 | 1-2-3-4 | permission | 403 | integration | Gone_test |
| C05 | 1-2-3-4 | happy | screen | e2e | TODO |
| C06 | 1-2-3-4-T1 | error | refused | integration | "AC-07 posted is immutable" |
`;

function setup() {
  p = project({ config: { testRoots: ["tests", "web", "src"] } });
  p.write("mtest/flows/upload-to-post.md", FLOW);
  p.write("tests/Api/FlowTests.cs", "public class FlowTests { [Fact] public async Task AC19_upload_to_trial_balance() {} [Fact] public void AC02_question_blocks_approval() {} }");
  p.write("tests/Unit/VatTests.cs", "public class VatTests { [Theory] public void Rounds_half_up() {} }");
  p.write("web/e2e/flows.spec.ts", "test('AC-07 posted is immutable', async () => {})");
  p.write("src/Api/Gone.cs", "// Gone_test appears in product code, which is not a test file");
}

test("check reports what no case walks, cases and rules without a test, and tests that do not exist", () => {
  setup();
  const r = run(p, "flows.mjs", ["check"]);
  assert.equal(r.status, 0, r.stderr);
  const f = r.json.flows[0];
  assert.equal(f.flow, "upload-to-post");
  assert.equal(f.ok, false);
  assert.deepEqual(f.problems, []);
  assert.deepEqual(f.gaps.stepsUncovered, []);
  assert.deepEqual(f.gaps.branchesUncovered, []);
  assert.deepEqual(f.gaps.transitionsUncovered, []);
  assert.deepEqual(f.gaps.casesWithoutTest.map((c) => c.case), ["C03"]);
  assert.deepEqual(f.gaps.rulesWithoutTest, ["R2"]);
  assert.deepEqual(f.gaps.testsNotFound, [{ case: "C04", ref: "Gone_test" }]);
  assert.deepEqual(f.e2ePending.map((c) => c.case), ["C05"]);
  assert.equal(f.counts.casesWithTest, 3);
  assert.equal(f.counts.rulesWithTest, 1);
});

test("a step or branch no case walks, and a path token that names nothing, are gaps", () => {
  p = project();
  p.write("mtest/flows/short.md", FLOW.replace("| C02 | 1-2-B1-3-4 |", "| C02 | 1-2-3-9 |").replace("| B2 | 3 |", "| B2 | 3 |").replace("1 → 2 → 3 → B2", "1-2-3"));
  const f = run(p, "flows.mjs", ["check", "short"]).json.flows[0];
  assert.deepEqual(f.gaps.branchesUncovered, ["B1", "B2"]);
  assert.deepEqual(f.gaps.unknownTokens, [{ case: "C02", token: "9" }]);
});

test("a flow where every case and rule has a test that exists is complete, and --strict passes", () => {
  setup();
  const done = FLOW.replace("| R2 | 4 | TODO |", "| R2 | 4 | VatTests.Rounds_half_up |")
    .replace("| integration | TODO |", "| integration | AC02_question_blocks_approval |")
    .replace("| integration | Gone_test |", "| integration | FlowTests.AC19_upload_to_trial_balance |");
  p.write("mtest/flows/upload-to-post.md", done);
  const r = run(p, "flows.mjs", ["check", "--strict"]);
  assert.equal(r.status, 0, JSON.stringify(r.json?.flows?.[0]?.gaps));
  assert.equal(r.json.ok, true);
  assert.equal(r.json.totals.e2ePending, 1);
});

test("--strict exits 1 while a gap is open", () => {
  setup();
  assert.equal(run(p, "flows.mjs", ["check", "--strict"]).status, 1);
});

test("malformed ids, a duplicated id and an unknown level are problems; no permission case is a warning", () => {
  p = project();
  p.write("mtest/flows/bad.md", `---\nflow: bad\n---\n## Steps\n| Step | Actor | Action |\n|---|---|---|\n| one | Clerk | x |\n| 2 | Clerk | y |\n| 2 | Clerk | z |\n\n## Cases\n| Case | Path | Kind | Expect | Level | Test |\n|---|---|---|---|---|---|\n| C01 | 2 | happy | ok | browser | TODO |\n`);
  const f = run(p, "flows.mjs", ["check"]).json.flows[0];
  assert.ok(f.problems.some((x) => /"one"/.test(x)), f.problems.join("; "));
  assert.ok(f.problems.some((x) => /used twice/.test(x)));
  assert.ok(f.problems.some((x) => /level "browser"/.test(x)));
  assert.ok(f.warnings.some((x) => /permission/.test(x)));
});

const PARTIES = `---
flow: survey
title: Survey to suppliers
{{SKIP}}
---
## Steps
| Step | Actor | Action | Expected | State after |
|---|---|---|---|---|
| 1 | Buyer | set up and invite | invitation sent | Invited |
| 2 | Supplier | answer and attach | sent back | Submitted |
| 3 | worker | collect | stored in the library | Collected |
| 4 | Approver | approve | supplier told | Approved |

## Cases
| Case | Path | Kind | Expect | Level | Test |
|---|---|---|---|---|---|
| C01 | 1-2-3-4 | happy | approved | integration | TODO |
| C02 | 1-2 | permission | supplier cannot approve | integration | TODO |
{{MORE}}
`;
const parties = (skip = "", more = "") => PARTIES.replace("{{SKIP}}", skip).replace("{{MORE}}", more);

test("a flow where two parties act warns until it has a handoff and an isolation case", () => {
  p = project();
  p.write("mtest/flows/survey.md", parties());
  let f = run(p, "flows.mjs", ["check"]).json.flows[0];
  assert.ok(f.warnings.some((w) => /kind handoff, though Buyer, Supplier, Approver act/.test(w)), f.warnings.join("; "));
  assert.ok(f.warnings.some((w) => /kind isolation: .*\(Buyer, Supplier, Approver\)/.test(w)), f.warnings.join("; "));
  assert.match(run(p, "flows.mjs", ["list"]).json.flows[0].summary, /2 warning\(s\)$/);
  p.write("mtest/flows/survey.md", parties("", "| C03 | 1-2 | handoff | the supplier sees the questions and deadline as set | e2e | TODO |\n| C04 | 1-2 | isolation | supplier B sees none of A's survey | integration | TODO |"));
  f = run(p, "flows.mjs", ["check"]).json.flows[0];
  assert.deepEqual(f.warnings, []);
  assert.deepEqual(f.e2ePending.map((c) => c.case), ["C03"]);
});

test("skip: in the front matter silences the warnings of the kinds a flow cannot have", () => {
  p = project();
  p.write("mtest/flows/survey.md", parties("skip: isolation, handoff"));
  assert.deepEqual(run(p, "flows.mjs", ["check"]).json.flows[0].warnings, []);
  p.write("mtest/flows/survey.md", parties("skip: isolatoin"));
  assert.ok(run(p, "flows.mjs", ["check"]).json.flows[0].warnings.some((w) => /skip: "isolatoin"/.test(w)));
});

test("a branch out of place in a path is a warning", () => {
  p = project();
  p.write("mtest/flows/w.md", FLOW.replace("| C02 | 1-2-B1-3-4 |", "| C02 | 1-B1-3-4 |"));
  const f = run(p, "flows.mjs", ["check"]).json.flows[0];
  assert.ok(f.warnings.some((x) => /C02: B1 starts at step 2 but follows 1/.test(x)), f.warnings.join("; "));
});

test("new creates a flow doc from the template once, and list summarises it", () => {
  p = project();
  const r = run(p, "flows.mjs", ["new", "order-to-cash", "--title", "ขายเชื่อถึงรับเงิน"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(p.read("mtest/flows/order-to-cash.md"), /^flow: order-to-cash$/m);
  assert.match(p.read("mtest/flows/order-to-cash.md"), /^title: ขายเชื่อถึงรับเงิน$/m);
  assert.equal(run(p, "flows.mjs", ["new", "order-to-cash"]).status, 2);
  assert.equal(run(p, "flows.mjs", ["new", "Bad Name"]).status, 2);
  const list = run(p, "flows.mjs", ["list"]).json;
  assert.equal(list.flows.length, 1);
  assert.match(list.flows[0].summary, /^order-to-cash \(draft\): steps 1\/1/);
});
