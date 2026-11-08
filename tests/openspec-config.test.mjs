// openspec/config.yaml: mflow's lines go between markers, earlier wordings are replaced, the project's own
// lines stay, and OpenSpec can still read the file (it ignores a file it cannot parse).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { LINES, VERSION, plan, yamlItem } from "../plugins/mflow/scripts/openspec-config.mjs";
import { TEMPLATE as PENDING_TEMPLATE } from "../plugins/mflow/scripts/pending.mjs";
import { SCRIPTS, project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

// What `openspec init` leaves: the schema and its commented examples.
const OPENSPEC_TEMPLATE = `schema: spec-driven

# Project context (optional)
# Example:
#   context: |
#     Tech stack: TypeScript, React, Node.js

# Per-operation guidance (optional)
# Example:
#   operations:
#     apply:
#       guidance:
#         - Keep test summaries concise
`;

// mflow's lines without markers (copied by hand), in folders the project named itself, with lines of its own.
const UNMARKED = `schema: spec-driven

context: |
  Read AGENTS.md for stack, commands, architecture and domain vocabulary.
  The user's answers and instructions are the customer's: build first, test in use, then refine through follow-up changes.
  Business rules for fuzzy areas are worked out first in docs/hotspots/<slug>/rules.md.
  Designs agreed before building (roles, data models, ...) are in docs/discuss/NN-*.md with status approved.
  The current data dictionary is PrototypeData/README.md until a change builds the entity.
  Dates are shown in Asia/Bangkok.
rules:
  proposal:
    - If the change implements a hotspot, link docs/hotspots/<slug>/rules.md in the proposal.
    - If the change adds or alters tables, link the approved data-model doc in docs/discuss/ and follow PrototypeData/README.md; state any difference.
  specs:
    - Every requirement has at least one Scenario; for rule tables, one Scenario per distinct outcome row.
  tasks:
    - Name tests after the UAT step.
    - A change that builds an aggregate ends by replacing its section in PrototypeData/README.md with a pointer to the entity and migration.
operations:
  apply:
    guidance:
      - Only when this session's mflow briefing says the apply subagent mflow:dev is ON, hand the code changes of each task to a fresh \`mflow:dev\` subagent, which runs on Sonnet 5.5, one task at a time in tasks.md order. Give it the change name, the task text, the contextFiles paths and the reports of the tasks already done in this session (files changed, tests). It is off until switched on with /mflow:subagent on; decide from this session only, never from notes or memories of earlier sessions. When it is off, not available, or the call is denied, implement every task yourself without pausing to ask.
      - When the subagent did a task, before marking it \`- [x]\` and starting the next one, check its diff against the task and its specs, and confirm the task's test passes (rerun it when the report shows no passing run).

# Per-artifact rules (optional)
#   rules:
#     tasks:
#       - Break tasks into chunks of max 2 hours
`;

const merge = (args = []) => {
  const r = run(p, "openspec-config.mjs", args);
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};

test("every line mflow writes reads back as text in YAML", () => {
  for (const [key, lines] of Object.entries(LINES)) {
    for (const line of key === "context" ? [] : lines) {
      const item = yamlItem(line);
      if (!item.startsWith('"')) assert.doesNotMatch(item, /: | #|:$|^[-?:,[\]{}#&*!|>'"%@`]/, `${key}: ${item.slice(0, 80)}`);
    }
  }
  assert.equal(yamlItem("asks for it: do the rest"), '"asks for it: do the rest"');
  assert.equal(yamlItem("`E2E` first"), '"`E2E` first"');
  assert.equal(yamlItem("plain text; with /mflow:test"), "plain text; with /mflow:test");
});

// StemHub 2026-10-23: a proposal asked with options ก) ข) ค), so the answer "1 ก 2 ข 3 ก" needed the Thai keyboard.
test("the proposal asks its questions numbered, with options a) b) c)", () => {
  assert.ok(LINES["rules.proposal"].some((l) => l.includes("label each one's options a), b), c), never ก ข ค") && l.includes("`1 a, 2 b, 3 a`")));
});

// 0.37.1, 0.38.0: a setting made once on the admin web and shown on the supplier web had no Scenario for its other
// state, whom it reaches or when it takes effect, so /mflow:e2e flow had nothing to test it against.
test("the specs ask for every state of a setting another role or web shows, whom it reaches and when it takes effect", () => {
  const rule = LINES["rules.specs"].find((l) => l.startsWith("When a role sets something once on one screen or web"));
  assert.ok(rule, "the settings rule");
  assert.match(rule, /each of its states \(set and cleared, on and off/);
  assert.match(rule, /whom it reaches when it reaches only some \(and that the others do not see it\)/);
  assert.match(rule, /when the change takes effect/);
  // 0.38.0: StemHub's system-settings spec gives the timing of every key in one table ("When a saved value applies") with a
  // Scenario per kind of timing; a Scenario per setting must not be the only form the rule accepts.
  assert.match(rule, /either in a Scenario per setting or in one requirement with a table of when each setting applies and a Scenario for each kind of timing/);
  assert.ok(!/and one for when the change takes effect/.test(rule), "the 0.37.1 wording is gone");
  assert.ok(LINES["rules.specs"].some((l) => l.includes("a second party of that kind sees none of it")), "the 0.37.0 hand-off rule stays");
});

// StemHub 2026-10-31: CR-009 planned four changes, each with its screens; the 0.34 size rule split two of them
// into a server change and a screens change, each with its own propose, archive and merge.
test("a change holds its server side and screens together, and is split by feature only past about 25 tasks", () => {
  const rules = LINES["rules.proposal"];
  const rule = rules.find((l) => l.startsWith("One change holds one feature whole"));
  assert.ok(rule, "the size rule");
  assert.match(rule, /more than about 25 tasks, or when the user says so/);
  assert.match(rule, /by feature, each part with its own server side and screens/);
  assert.match(rule, /continues in a new session from the first unticked task/);
  assert.ok(!rules.some((l) => /about 15 tasks|propose only its first part now/.test(l)), "the 0.34 wording is gone");
});

test("apply ends with a row in docs/reviews/pending.md, never with /mflow:test or a review as the next step", () => {
  const g = LINES["operations.apply.guidance"];
  const row = g.find((l) => l.includes("add a row for the change to docs/reviews/pending.md"));
  assert.ok(row);
  assert.match(row, /Do not give \/mflow:test, \/mflow:review or \/mflow:e2e as the next step, in the reply or in STATUS\.md/);
  const header = /`(\| Change \|[^`]+\|)`/.exec(row)?.[1];
  assert.ok(header && PENDING_TEMPLATE.includes(header), "the header apply writes is the template's");
  assert.ok(!g.some((l) => /give the user \/mflow:test as the next command|name them to the user/.test(l)));
  assert.ok(!Object.values(LINES).flat().some((l) => /once per change/.test(l)));
});

// StemHub 2026-10-08..11-07: about 140 of the user's replies picked commit, push or merge from a menu. The
// user chose (2026-11-08) that apply and archive commit their own work; push and merge still wait for a yes.
test("apply and archive commit their own work by name, and push or merge only on the user's yes", () => {
  const apply = LINES["operations.apply.guidance"].at(-1);
  assert.match(apply, /^Once the change is ready to archive, commit its work on the branch checked out without asking/);
  assert.match(apply, /never with `git add -A`/);
  const archive = LINES["operations.archive.guidance"];
  assert.equal(archive.length, 1);
  assert.match(archive[0], /^After the archive, commit it on the branch checked out without asking/);
  for (const line of [apply, archive[0]]) {
    assert.match(line, /Push and merge only on the user's yes\.$/);
    assert.equal(yamlItem(line), line, "a plain YAML item, no quotes needed");
  }
});

// StemHub 2026-10-31: landing-content ran integration classes 9 times in 8 tasks, 22 of its 24 test minutes; 15–17
// of them were classes the change did not add, which the whole suite on main runs again anyway.
test("apply runs each task's own integration tests only, and the shared checks once at the end", () => {
  const g = LINES["operations.apply.guidance"];
  assert.ok(g.some((l) => l.startsWith("After each task") && l.includes("the integration test classes the task added or changed") && l.includes("no other integration class")));
  const shared = g.find((l) => l.includes("`- Shared checks:`"));
  assert.ok(shared, "the shared checks line");
  assert.match(shared, /^Once, after the last task, when the change touched a migration or the data model/);
  assert.match(shared, /`none` leaves nothing to run/);
  assert.ok(g.indexOf(shared) < g.findIndex((l) => l.includes("docs/reviews/pending.md") && l.includes("add a row")), "the checks come before the row");
  assert.ok(!Object.values(LINES).flat().some((l) => /test classes that cover the code it changed|about a third of/.test(l)), "the 0.34 covering-class runs are gone");
  assert.match(fs.readFileSync(path.join(SCRIPTS, "..", "templates", "AGENTS.md"), "utf8"), /^- Shared checks: `TODO`$/m);
});

test("a new project gets every line between markers, keeps OpenSpec's comments, and a rerun changes nothing", () => {
  p = project();
  p.write("openspec/config.yaml", OPENSPEC_TEMPLATE);
  const first = merge();
  assert.equal(first.changed, true);
  assert.deepEqual(first.problems, []);
  const text = p.read("openspec/config.yaml");
  assert.match(text, /^schema: spec-driven\n\ncontext: \|\n  Read AGENTS\.md/);
  assert.match(text, /docs\/decisions\/hotspots\/<slug>\/rules\.md/);
  for (const line of [...LINES["operations.apply.guidance"], ...LINES["operations.archive.guidance"]]) assert.ok(text.includes(`      - ${line}`), line.slice(0, 60));
  assert.equal(text.split(`# mflow:begin ${VERSION}`).length - 1, 5, "one marker pair per list");
  assert.ok(text.trimEnd().endsWith("#         - Keep test summaries concise"), "OpenSpec's comments stay at the end");
  assert.equal(merge().changed, false, "a rerun changes nothing");
});

test("mflow's lines without markers are taken in, the missing ones added; the project's own lines and folders stay", () => {
  p = project({ hotspotsDir: "docs/hotspots", discussDir: "docs/discuss" });
  p.write("openspec/config.yaml", UNMARKED);
  const r = merge();
  assert.deepEqual(r.removed, []);
  assert.ok(r.added.some((l) => l.startsWith("Never run E2E tests")));
  assert.ok(!r.added.some((l) => l.startsWith("Only when this session")), "a line already there is not added again");
  const text = p.read("openspec/config.yaml");
  assert.equal(text.match(/Only when this session/g).length, 1);
  assert.match(text, /    - Name tests after the UAT step\./, "the project's own task rule stays");
  assert.match(text, /  Dates are shown in Asia\/Bangkok\./, "the project's own context line stays");
  assert.match(text, /docs\/hotspots\/<slug>\/rules\.md in the proposal/);
  assert.doesNotMatch(text, /docs\/decisions/);
  assert.match(text, /#       - Break tasks into chunks of max 2 hours\n$/);
  assert.equal(merge().changed, false);
});

test("a project's own wording of an mflow line stands in for it, so the two never sit side by side", () => {
  p = project();
  p.write("openspec/config.yaml", `schema: spec-driven
context: |
  Read AGENTS.md for stack, commands, architecture and domain vocabulary.
  The current data dictionary is apps/ThawSi.Api/PrototypeData/README.md until a change builds the entity (location from docs/decisions/discuss/02-code-structure.md).
rules:
  proposal:
    - If the change adds or alters tables, link the approved data-model doc in docs/decisions/discuss/ and follow apps/ThawSi.Api/PrototypeData/README.md; state any difference.
  tasks:
    - A change that builds an aggregate ends by replacing its section in apps/ThawSi.Api/PrototypeData/README.md with a pointer to the entity and migration.
`);
  const r = merge();
  const text = p.read("openspec/config.yaml");
  assert.equal(text.match(/current data dictionary/g).length, 1, "one data dictionary line in the context");
  assert.equal(text.match(/alters tables/g).length, 1);
  assert.equal(text.match(/builds an aggregate/g).length, 1);
  assert.match(text, /apps\/ThawSi\.Api\/PrototypeData\/README\.md with a pointer/, "the project's wording stays");
  assert.ok(!r.added.some((l) => /data dictionary|alters tables|builds an aggregate/.test(l)), JSON.stringify(r.added));
  assert.equal(merge().changed, false);
});

test("a later version replaces exactly what sits between the markers", () => {
  p = project();
  p.write("openspec/config.yaml", "schema: spec-driven\nrules:\n  tasks:\n    # mflow:begin 0.27.0\n    - Some wording mflow will never write again.\n    # mflow:end\n    - Keep the tasks small.\n");
  merge();
  const text = p.read("openspec/config.yaml");
  assert.doesNotMatch(text, /never write again/);
  assert.match(text, /# mflow:end\n    - Keep the tasks small\./);
  assert.equal(text.split("# mflow:begin").length - 1, 5);
});

test("forms the merge does not handle are reported and left alone; the rest is merged", () => {
  p = project();
  p.write("openspec/config.yaml", "schema: spec-driven\ncontext: Our own one-line context\nrules:\n  tasks: keep it short\n  proposal:\n    - Say why: in one line.\n");
  const r = merge();
  assert.equal(r.problems.length, 3, JSON.stringify(r.problems));
  assert.match(r.problems.join("\n"), /context is written as one line/);
  assert.match(r.problems.join("\n"), /rules\.tasks is not a list/);
  assert.match(r.problems.join("\n"), /double quotes: Say why: in one line\./);
  const text = p.read("openspec/config.yaml");
  assert.match(text, /^context: Our own one-line context$/m);
  assert.match(text, /^  tasks: keep it short$/m);
  assert.match(text, /# mflow:begin [\d.]+\n      - Only when this session's/);
});

test("--dry-run writes nothing, line endings are kept, and a missing file is created", () => {
  p = project();
  p.write("openspec/config.yaml", OPENSPEC_TEMPLATE.replace(/\n/g, "\r\n"));
  assert.equal(merge(["--dry-run"]).written, false);
  assert.equal(p.read("openspec/config.yaml"), OPENSPEC_TEMPLATE.replace(/\n/g, "\r\n"));
  merge();
  assert.doesNotMatch(p.read("openspec/config.yaml").replace(/\r\n/g, ""), /\n/, "every line ends in CRLF");
  fs.rmSync(p.file("openspec/config.yaml"));
  assert.equal(merge().created, true);
  assert.ok(plan(p.root).text.startsWith("schema: spec-driven\n"));
});

const openspec = spawnSync("openspec", ["--version"], { encoding: "utf8", shell: true });
test("OpenSpec reads the merged file: the context, the task rules and every apply guidance line", { skip: openspec.status !== 0 && "the openspec CLI is not installed" }, () => {
  p = project({ hotspotsDir: "docs/hotspots", discussDir: "docs/discuss" });
  p.write("openspec/config.yaml", UNMARKED);
  p.write("openspec/changes/demo/.openspec.yaml", "schema: spec-driven\n");
  p.write("openspec/changes/demo/proposal.md", "## Why\nx\n\n## What Changes\n- x\n");
  p.write("openspec/changes/demo/tasks.md", "## 1. A\n- [ ] 1.1 do\n");
  merge();
  const env = { ...process.env, OPENSPEC_TELEMETRY: "0", NO_COLOR: "1" };
  const apply = spawnSync("openspec instructions apply --change demo --json", { cwd: p.root, encoding: "utf8", shell: true, env });
  assert.doesNotMatch(apply.stderr, /could not parse/i, apply.stderr);
  const out = JSON.parse(apply.stdout);
  assert.equal(out.operationGuidance.length, LINES["operations.apply.guidance"].length);
  assert.match(out.context, /Dates are shown in Asia\/Bangkok/);
  const tasks = JSON.parse(spawnSync("openspec instructions tasks --change demo --json", { cwd: p.root, encoding: "utf8", shell: true, env }).stdout);
  assert.ok(tasks.rules.includes("Name tests after the UAT step."));
  assert.ok(tasks.rules.some((r) => r.startsWith("Every task that changes code")));
  const proposal = JSON.parse(spawnSync("openspec instructions proposal --change demo --json", { cwd: p.root, encoding: "utf8", shell: true, env }).stdout);
  assert.ok(proposal.rules.some((r) => r.startsWith("In the proposal, list every choice") && r.includes("docs/discuss/") && r.includes("`1 a, 2 b, 3 a`")), JSON.stringify(proposal.rules));
  const archive = JSON.parse(spawnSync("openspec instructions archive --change demo --json", { cwd: p.root, encoding: "utf8", shell: true, env }).stdout);
  assert.deepEqual(archive.operationGuidance, LINES["operations.archive.guidance"]);
});
