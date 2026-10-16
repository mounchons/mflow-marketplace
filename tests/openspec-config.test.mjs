// openspec/config.yaml: mflow's lines go between markers, earlier wordings are replaced, the project's own
// lines stay, and OpenSpec can still read the file (it ignores a file it cannot parse).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { LINES, VERSION, plan, yamlItem } from "../plugins/mflow/scripts/openspec-config.mjs";
import { project, run } from "./helpers.mjs";

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

// A project set up by mflow 0.1 to 0.24 in the layout before 0.20, with lines of its own.
const OLD = `schema: spec-driven

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
    - Every task ends with the test that proves it (xUnit for rules, Playwright for user flows).
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

test("a new project gets every line between markers, keeps OpenSpec's comments, and a rerun changes nothing", () => {
  p = project();
  p.write("openspec/config.yaml", OPENSPEC_TEMPLATE);
  const first = merge();
  assert.equal(first.changed, true);
  assert.deepEqual(first.problems, []);
  const text = p.read("openspec/config.yaml");
  assert.match(text, /^schema: spec-driven\n\ncontext: \|\n  Read AGENTS\.md/);
  assert.match(text, /docs\/decisions\/hotspots\/<slug>\/rules\.md/);
  for (const line of LINES["operations.apply.guidance"]) assert.ok(text.includes(`      - ${line}`), line.slice(0, 60));
  assert.equal(text.split(`# mflow:begin ${VERSION}`).length - 1, 4, "one marker pair per list");
  assert.ok(text.trimEnd().endsWith("#         - Keep test summaries concise"), "OpenSpec's comments stay at the end");
  assert.equal(merge().changed, false, "a rerun changes nothing");
});

test("an old config loses mflow's earlier wording, keeps the project's own lines and its folders", () => {
  p = project({ hotspotsDir: "docs/hotspots", discussDir: "docs/discuss" });
  p.write("openspec/config.yaml", OLD);
  const r = merge();
  assert.deepEqual(r.removed, ["Every task ends with the test that proves it (xUnit for rules, Playwright for user flows)."]);
  assert.ok(r.added.some((l) => l.startsWith("Never run E2E tests")));
  const text = p.read("openspec/config.yaml");
  assert.doesNotMatch(text, /Playwright for user flows/);
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
    - Every task ends with the test that proves it (a unit test for rules, an E2E test for user flows; frameworks as in AGENTS.md Stack).
    - A change that builds an aggregate ends by replacing its section in apps/ThawSi.Api/PrototypeData/README.md with a pointer to the entity and migration.
`);
  const r = merge();
  const text = p.read("openspec/config.yaml");
  assert.equal(text.match(/current data dictionary/g).length, 1, "one data dictionary line in the context");
  assert.equal(text.match(/alters tables/g).length, 1);
  assert.equal(text.match(/builds an aggregate/g).length, 1);
  assert.match(text, /apps\/ThawSi\.Api\/PrototypeData\/README\.md with a pointer/, "the project's wording stays");
  assert.doesNotMatch(text, /an E2E test for user flows/);
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
  assert.equal(text.split("# mflow:begin").length - 1, 4);
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
  p.write("openspec/config.yaml", OLD);
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
});
