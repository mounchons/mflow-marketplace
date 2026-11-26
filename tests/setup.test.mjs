// /mflow:init on a rerun (0.59.0): setup.mjs plans every optional part in one call and keeps the user's answers in
// .mflow/config.json "setup", so a rerun after an mflow upgrade asks nothing it was told already: a part never
// offered is asked once, a part declined stays quiet, and a part accepted or already there is written without
// asking. Synthetic projects only.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { afterEach, test } from "node:test";
import { git, hasGit, project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const states = (plan) => Object.fromEntries(plan.parts.map((x) => [x.part, x.state]));

test("a first run asks about every optional part once; the answers are kept and the next run asks nothing", { skip: !hasGit }, () => {
  p = project({ packs: ["foundation"] });
  git(p, "init", "-q");
  const first = run(p, "setup.mjs", ["plan"]).json;
  assert.deepEqual(first.ask, ["agentSkills", "worktree", "webCopy"]);
  assert.equal(states(first).openspecConfig, "write", "written after openspec init, never asked");

  assert.equal(run(p, "setup.mjs", ["record", "agentSkills", "yes"]).json.changed, true);
  assert.equal(run(p, "setup.mjs", ["record", "worktree", "yes"]).status, 0);
  assert.equal(run(p, "setup.mjs", ["record", "webCopy", "no"]).status, 0);
  const config = JSON.parse(p.read(".mflow/config.json"));
  assert.deepEqual(config.setup, { agentSkills: true, worktree: true, webCopy: false });
  assert.deepEqual(config.packs, ["foundation"], "the other settings stay as they were");
  assert.equal(run(p, "setup.mjs", ["record", "webCopy", "no"]).json.changed, false, "the same answer changes nothing");

  const second = run(p, "setup.mjs", ["plan"]).json;
  assert.deepEqual(second.ask, [], "nothing is asked again");
  assert.deepEqual(states(second), { agentSkills: "write", worktree: "write", webCopy: "declined", openspecConfig: "write" });

  // What init does on the yes answers; then a rerun with the same plugin has nothing to write.
  assert.equal(run(p, "agent-skills.mjs", ["write"]).status, 0);
  assert.equal(run(p, "worktree.mjs", ["setup"]).status, 0);
  const third = run(p, "setup.mjs", ["plan"]).json;
  assert.deepEqual([states(third).agentSkills, states(third).worktree, states(third).webCopy], ["current", "current", "declined"]);
  assert.deepEqual([third.ask, third.write], [[], ["openspecConfig"]]);
});

test("a project set up before 0.59, with no answers kept, is refreshed where its parts already are and asked only about the rest", { skip: !hasGit }, () => {
  p = project();
  git(p, "init", "-q");
  assert.equal(run(p, "vendor.mjs", ["write"]).status, 0);
  assert.equal(run(p, "agent-skills.mjs", ["write"]).status, 0);
  const plan = run(p, "setup.mjs", ["plan"]).json;
  // Same plugin: the copies are current; the worktree part was never offered.
  assert.deepEqual([states(plan).agentSkills, states(plan).webCopy, states(plan).worktree], ["current", "current", "ask"]);
  // A copy for the web that is there but from another plugin version is refreshed without asking.
  const mark = JSON.parse(p.read(".claude/skills/mflow/.mflow-vendor.json"));
  mark.files["scripts/night.mjs"] = "0".repeat(16);
  p.write(".claude/skills/mflow/.mflow-vendor.json", JSON.stringify(mark));
  assert.equal(states(run(p, "setup.mjs", ["plan"]).json).webCopy, "write");
});

test("a declined part stays quiet even when the plugin would write it, until the user says yes", { skip: !hasGit }, () => {
  p = project({ setup: { webCopy: false, agentSkills: false } });
  git(p, "init", "-q");
  const plan = run(p, "setup.mjs", ["plan"]).json;
  assert.deepEqual(plan.declined, ["agentSkills", "webCopy"]);
  assert.ok(!plan.ask.includes("webCopy") && !plan.ask.includes("agentSkills"));
  run(p, "setup.mjs", ["record", "webCopy", "yes"]);
  assert.equal(states(run(p, "setup.mjs", ["plan"]).json).webCopy, "write");
});

test("a first run plans before .mflow/config.json exists, and keeps no answer until it does", { skip: !hasGit }, () => {
  p = project();
  fs.rmSync(p.file(".mflow"), { recursive: true, force: true });
  git(p, "init", "-q");
  p.write(".gitignore", ".claude/\n");
  const plan = run(p, "setup.mjs", ["plan", "--root", p.root]);
  assert.equal(plan.status, 0, plan.stderr);
  assert.deepEqual(plan.json.ask, ["agentSkills", "worktree", "webCopy"], "an ignore rule for all of .claude/ is not a worktree setup");
  assert.equal(plan.json.parts.find((x) => x.part === "webCopy").webBranches, false);
  const r = run(p, "setup.mjs", ["record", "webCopy", "no", "--root", p.root]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /run scaffold\.mjs/);
  assert.ok(!p.exists(".mflow/config.json"), "nothing is written before step 3");
});

test("record refuses an unknown part or answer, and a setup value that is not true or false stops every script", () => {
  p = project();
  assert.notEqual(run(p, "setup.mjs", ["record", "cloud", "yes"]).status, 0);
  assert.notEqual(run(p, "setup.mjs", ["record", "webCopy", "maybe"]).status, 0);
  p.write(".mflow/config.json", JSON.stringify({ version: 1, setup: { webCopy: "no" } }));
  const r = run(p, "discuss.mjs", ["list"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /"setup" must be an object of true\/false answers/);
  const plan = run(p, "setup.mjs", ["plan"]);
  assert.notEqual(plan.status, 0, "the plan stops on the same wrong value instead of asking again");
  assert.match(plan.stderr, /"setup" must be an object/);
});

test("--root is the project itself: a new folder inside an mflow project does not take the parent's answers", { skip: !hasGit }, () => {
  p = project({ setup: { webCopy: false, agentSkills: false, worktree: false } });
  const child = p.file("child");
  fs.mkdirSync(child);
  spawnSync("git", ["init", "-q"], { cwd: child });
  const r = run(p, "setup.mjs", ["plan", "--root", child], { cwd: child });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json.ask, ["agentSkills", "worktree", "webCopy"]);
  assert.notEqual(run(p, "setup.mjs", ["record", "webCopy", "yes", "--root", child], { cwd: child }).status, 0, "no answer is kept before the child has its own config");
});
