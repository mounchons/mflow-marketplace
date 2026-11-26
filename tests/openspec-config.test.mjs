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

// StemHub effort test 2026-11-16: four designs of one task, two at effort high and two at xhigh, judged blind. Every
// design held at least one false "only / always / never" sentence about the current code, at both levels, and the one
// design defect was such a sentence (a guard on a field that another valid save also changes). One design read the
// customer document's section on the screen, never its error table, and so missed that its resend went against it.
test("a sentence that says only, always or never about the current system is checked against every caller or writer", () => {
  const line = LINES.context.find((l) => l.startsWith("Before a proposal, design or spec says the current system"));
  assert.ok(line, "the context line");
  assert.match(line, /only, always or never one way/);
  assert.match(line, /a guard that can never reject a valid write/);
  assert.match(line, /find every caller or writer of it by search, or say where you looked instead/);
});

test("the proposal looks up each case it decides in the customer documents, not only their part on the screen", () => {
  const rule = LINES["rules.proposal"].find((l) => l.startsWith("In the proposal, list every choice"));
  assert.match(rule, /or where the choice departs from a customer document\. To find the departures, look up each case the choice decides in the customer documents themselves/);
  assert.match(rule, /an error code or answer from another system, a status, a retry or resend, a limit/);
  assert.match(rule, /not only their part on the screen or feature the change is about\. Ask the user about the marked ones/);
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
  // OpenSpec 2.2.0 (2026-11-26): archive writes a TBD Purpose for a new capability, which strict validation fails,
  // and copies a delta's own `## Purpose` instead.
  const purpose = LINES["rules.specs"].find((l) => l.startsWith("A delta spec that creates a capability"));
  assert.ok(purpose, "the Purpose rule");
  assert.match(purpose, /starts with `## Purpose`, one or two sentences of at least 50 characters/);
  assert.equal(yamlItem(purpose), purpose, "a plain YAML item, no quotes needed");
  const init = fs.readFileSync(path.join(SCRIPTS, "..", "skills", "init", "SKILL.md"), "utf8");
  assert.match(init, /`openspec init --tools claude,codex --scope project` on OpenSpec 2\.0 or newer/, "init keeps OpenSpec's skills in the repository");
  // 0.58.2: one /mflow:init after a plugin update also brings the OpenSpec CLI up to date, asked in one line.
  // 0.59.0: the check runs in step 2, so its question joins the one message of the run.
  assert.match(init, /`openspec version --check --json`, run in step 2\. When `update\.status` is not `current`/);
  assert.match(init, /4\. Updating the OpenSpec CLI, when `openspec version --check --json` \(run it here\) finds a newer one/);
  assert.ok(init.indexOf("openspec version --check --json") < init.indexOf("- OpenSpec already initialised: `openspec update`"), "the CLI is updated before openspec update");
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

// StemHub 2026-10-08..11-07: about 140 of the user's replies picked commit, push or merge from a menu, and each
// change took /opsx:propose, /opsx:apply and /opsx:archive typed apart. The user chose (2026-11-08) that apply
// and archive commit their own work (0.39), and that apply archives the change in the same turn with one commit
// (0.40); push and merge are asked once, in one line.
test("apply archives the change in the same turn and commits once; archive commits by name; push or merge asked in one line", () => {
  const apply = LINES["operations.apply.guidance"].at(-1);
  assert.match(apply, /^Then archive the change in this same turn, the way \/opsx:archive does/);
  assert.match(apply, /unless the user said to stop after apply/);
  assert.match(apply, /in one commit on the branch checked out, without asking/);
  assert.match(apply, /never with `git add -A`/);
  assert.ok(!LINES["operations.apply.guidance"].some((l) => /tell the user that the change is ready to archive/.test(l)), "apply no longer stops at 'ready to archive'");
  const archive = LINES["operations.archive.guidance"];
  assert.equal(archive.length, 2);
  assert.match(archive[0], /does not stop the archive\. Archive, and name it in one line of the reply instead of asking/);
  assert.match(archive[1], /^After the archive, commit it on the branch checked out without asking/);
  assert.match(archive[1], /when \/opsx:apply ran the archive in its turn, its one commit holds both/);
  assert.match(archive[1], /Push it after that commit as \/opsx:apply does; merge only on the user's word, asked once in one line\.$/);
  // The user's answer 1 a, 2026-11-26 (0.59.0): every commit is pushed without asking, main included; a deploy to
  // decide holds the push for one line, push only or push and deploy.
  assert.match(apply, /Push the branch right after that commit without asking \(`git push -u origin HEAD`, never `--force`\), as AGENTS\.md says for every commit/);
  assert.match(apply, /open no pull request, and when there is no `origin` or the push is refused, say so in one line/);
  assert.match(apply, /When the change has a deploy to decide \(a migration or seed for a shared or live database, a running stack to rebuild\), hold that push and ask in one line whether to a\) push only or b\) push and deploy, and a push to a branch that deploys by itself \(a workflow or hosting service that deploys on a push to it\) is asked before it\./);
  assert.match(apply, /When this reply asks about a deploy and about the merge below, number the two questions so the answer reads `1 a, 2 b`/);
  assert.ok(!/never main/.test(apply), "main is pushed like any branch");
  assert.match(apply, /On a `feat\/<change>` branch, then ask in one line which way, a\) first `\/mflow:test` and `\/mflow:review feat\/<change>` on this branch, merged once the review approves, recommended for business rules, permissions or data scope, queries, migrations, integrations or startup wiring, or b\) merge it into main now, tested and reviewed later on main with the other waiting changes; never merge while a test, review or E2E run is going in the main checkout, and on a merge follow AGENTS\.md `## Branches and worktrees`; on any other branch merge only on the user's word\. After a merge into main, push main the same way\.$/);
  assert.match(apply, /in a linked worktree STATUS\.md is left to the main checkout/);
  for (const line of [apply, ...archive]) assert.equal(yamlItem(line), line, "a plain YAML item, no quotes needed");
});

// BunTukTransport 2026-11-08: /mflow:init saw "commit on the user's word" in the project, asked about it, recommended
// keeping it and wrote that into CLAUDE.md and AGENTS.md, so /opsx:apply did not commit. The user chose that init
// takes the plugin's line and asks nothing.
test("init replaces a project's own commit line with the template's and asks nothing", () => {
  const read = (rel) => fs.readFileSync(path.join(SCRIPTS, "..", rel), "utf8");
  const skill = read("skills/init/SKILL.md");
  assert.match(skill, /says something else about commits[^\n]*replace it with the template's line/);
  assert.match(skill, /Do not ask about it, whatever work is waiting or failing/);
  assert.match(skill, /which line was replaced/);
  for (const name of ["templates/CLAUDE.md", "templates/AGENTS.md"]) assert.match(read(name), /Commit each finished piece of work without asking/);
  assert.match(read("templates/CLAUDE.md"), /`\/opsx:apply` archives the change in the same turn and commits once/);
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
  assert.match(text, /# mflow:begin [\d.]+\n      - Do not enter plan mode/);
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
  // The design artifact has no mflow rules of its own; the context is what reaches it.
  const design = JSON.parse(spawnSync("openspec instructions design --change demo --json", { cwd: p.root, encoding: "utf8", shell: true, env }).stdout);
  assert.match(design.context, /find every caller or writer of it by search/);
  const archive = JSON.parse(spawnSync("openspec instructions archive --change demo --json", { cwd: p.root, encoding: "utf8", shell: true, env }).stdout);
  assert.deepEqual(archive.operationGuidance, LINES["operations.archive.guidance"]);
});

// BanchiDesk 2026-11-25: the CLAUDE.md template asked for plan mode before an aggregate's invariants, propose copied
// it into tasks.md, and apply opened Claude Code's plan dialog after the user had approved design and tasks. The user
// asked for no plan mode; the guidance overrides the old line in projects that still have it.
test("apply never enters plan mode and no task asks for it", () => {
  const apply = LINES["operations.apply.guidance"][0];
  assert.match(apply, /^Do not enter plan mode, even when CLAUDE\.md or tasks\.md asks for it/);
  assert.match(apply, /design\.md and tasks\.md are the plan the user approved/);
  assert.match(apply, /reread its part of design\.md and the hotspot's rules\.md/);
  assert.match(LINES["rules.tasks"].at(-1), /^No task asks for plan mode/);
  for (const line of [apply, LINES["rules.tasks"].at(-1)]) assert.equal(yamlItem(line), line, "a plain YAML item");
  const read = (rel) => fs.readFileSync(path.join(SCRIPTS, "..", rel), "utf8");
  const claude = read("templates/CLAUDE.md");
  assert.ok(!/Use plan mode/.test(claude), "the template no longer asks for plan mode");
  assert.match(claude, /^- Never enter plan mode, even when tasks\.md asks for it/m);
  assert.match(read("skills/init/SKILL.md"), /a line asking for plan mode[^\n]*replace it with the template's `Never enter plan mode…` line/);
  // 0.59.0: a rerun merges the templates by hand, so init names the 0.58 lines that must not stay beside the new ones.
  const init = read("skills/init/SKILL.md");
  assert.match(init, /the push and mflow-step lines of templates before 0\.59\.0, so the old rule never stays beside the new one: `Push, merge and deploy only on the user's word…` \(CLAUDE\.md and AGENTS\.md\) becomes the template's push sentences/);
  assert.match(init, /`\/mflow:\* commands still run only when the user types them` and `Other \/mflow:\* commands still run only when the user types them` go/);
  assert.match(init, /`never main` leaves the AGENTS\.md line on pushing `feat\/<change>`/);
});

// BanchiDesk 2026-11-25: every reply ended "type /opsx:propose <change>" or "type /opsx:apply <change>", and the user
// typed each one. The opsx commands are project skills Claude can run, so it asks in one line and runs them on a yes.
test("Claude runs the next /opsx step itself, asking in one line, and the next mflow step too, except test, review and e2e", () => {
  const read = (rel) => fs.readFileSync(path.join(SCRIPTS, "..", rel), "utf8");
  const line = read("templates/CLAUDE.md").split("\n").find((l) => l.includes("`openspec-propose`"));
  assert.ok(line, "the run-it-yourself line");
  assert.match(line, /run the next one yourself; never end a reply telling the user to type one/);
  assert.match(line, /Run it at once when the user's last message already asked for that step/);
  assert.match(line, /ask in one line whether to go on/);
  // The user's word 2026-11-26: once the planning questions are answered, propose runs straight into apply, and
  // the change's branch is pushed when apply has committed.
  assert.match(line, /Once the user has answered the questions that plan a change[^\n]*go from its proposal straight into `\/opsx:apply` without asking/);
  assert.match(line, /push that branch like every commit \(`git push -u origin feat\/<change>`, no pull request\)/);
  assert.doesNotMatch(line, /such as applying a change whose planning is done/, "apply is no longer asked for");
  assert.match(line, /If the Skill call is refused, read `\.claude\/skills\/<name>\/SKILL\.md` and follow it/);
  // The user's answer 2 a, 2026-11-26 (0.59.0): the user typed the next mflow step Claude had named 17 times out of 17;
  // an approved discussion or change request goes on into propose and apply, any other step runs on a one-line yes.
  const claude = read("templates/CLAUDE.md");
  assert.ok(!/`\/mflow:\*` commands still run only when the user types them/.test(claude), "mflow steps are no longer typed-only");
  const steps = claude.split("\n").find((l) => l.startsWith("- An mflow step the work leads to"));
  assert.ok(steps, "the mflow-steps line");
  assert.match(steps, /Once `\/mflow:discuss <NN> approve` or an approved `\/mflow:change-request` settles something to build, go straight into `\/opsx:propose` for it and on into `\/opsx:apply`/);
  assert.match(steps, /ask in one line and run it on any yes: follow that command's `SKILL\.md`, in the folder the briefing's `## mflow commands` names/);
  assert.match(steps, /`\/mflow:test`, `\/mflow:test-pr`, `\/mflow:review`, `\/mflow:e2e`, `\/mflow:night`, `\/mflow:apply-all` and `\/mflow:checks` \(every form\) still wait for the user's command/);
  const cr = read("skills/change-request/SKILL.md");
  assert.match(cr, /hand it on in this same turn: a change to behaviour in `openspec\/specs\/` → run `\/opsx:propose` yourself/);
  assert.match(cr, /go on from the proposal into `\/opsx:apply` without asking/);
  const discuss = read("skills/discuss/SKILL.md");
  assert.match(discuss, /go straight into `\/opsx:propose` for that change \(the `openspec-propose` skill\) and on into `\/opsx:apply`/);
  assert.match(discuss, /ask in one line whether to start it: on any yes, follow that command yourself/);
});
