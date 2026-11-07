// The copy of mflow for Claude Code on the web (.claude/skills/mflow/, 0.38.1): the web installs no plugins, so
// /mflow:init writes the plugin into the repository, marked so a later write refreshes only what changed and never
// touches a folder of that name that is not its copy. Synthetic projects only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { SCRIPTS, project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const version = JSON.parse(fs.readFileSync(path.join(SCRIPTS, "..", ".claude-plugin", "plugin.json"), "utf8")).version;
const COPY = ".claude/skills/mflow";

test("write makes a marked copy with the skills, hooks, agents, packs and scripts, and refreshes only what changed", () => {
  p = project();
  assert.deepEqual(run(p, "vendor.mjs", ["status"]).json, { present: false });
  const plan = run(p, "vendor.mjs", ["plan"]).json;
  for (const f of [".claude-plugin/plugin.json", "skills/night/SKILL.md", "hooks/hooks.json", "agents/dev.md", "scripts/night.mjs", "compat.json"]) {
    assert.ok(plan.create.includes(f), f);
  }
  assert.ok(plan.create.some((f) => f.startsWith("packs/")), "the packs go with it");
  assert.ok(!plan.create.includes("README.md"), "the README stays out of the copy");
  assert.equal(run(p, "vendor.mjs", ["write"]).status, 0);
  assert.ok(p.exists(`${COPY}/scripts/night.mjs`));
  const st = run(p, "vendor.mjs", ["status"]).json;
  assert.deepEqual([st.current, st.version], [true, version]);

  p.write(`${COPY}/scripts/stale.mjs`, "x");
  const mark = JSON.parse(p.read(`${COPY}/.mflow-vendor.json`));
  mark.files["scripts/stale.mjs"] = "0";
  mark.files["scripts/night.mjs"] = "0";
  p.write(`${COPY}/.mflow-vendor.json`, JSON.stringify(mark));
  assert.equal(run(p, "vendor.mjs", ["status"]).json.current, false);
  const again = run(p, "vendor.mjs", ["plan"]).json;
  assert.deepEqual([again.remove, again.update], [["scripts/stale.mjs"], ["scripts/night.mjs"]]);
  run(p, "vendor.mjs", ["write"]);
  assert.equal(p.exists(`${COPY}/scripts/stale.mjs`), false);
  assert.equal(run(p, "vendor.mjs", ["status"]).json.current, true);
});

test("names in the copy's marker that lead out of the copy are never deleted", () => {
  p = project();
  run(p, "vendor.mjs", ["write"]);
  p.write("victim.txt", "keep me");
  p.write(".claude/keep.json", "{}");
  const mark = JSON.parse(p.read(`${COPY}/.mflow-vendor.json`));
  for (const rel of ["../../../victim.txt", "scripts/../../../victim.txt", "../../keep.json", "/etc/hosts", "C:/Windows/win.ini", "notes.md"]) mark.files[rel] = "0";
  p.write(`${COPY}/.mflow-vendor.json`, JSON.stringify(mark));
  const plan = run(p, "vendor.mjs", ["plan"]).json;
  assert.deepEqual(plan.remove, []);
  assert.equal(plan.ignored.length, 6);
  assert.equal(run(p, "vendor.mjs", ["write"]).status, 0);
  assert.equal(p.read("victim.txt"), "keep me");
  assert.ok(p.exists(".claude/keep.json"));
});

test("a folder of the same name that is not mflow's copy is never touched", () => {
  p = project();
  p.write(`${COPY}/SKILL.md`, "theirs");
  assert.equal(run(p, "vendor.mjs", ["write"]).json.foreign, true);
  assert.equal(p.read(`${COPY}/SKILL.md`), "theirs");
  assert.equal(p.exists(`${COPY}/scripts`), false);
});
