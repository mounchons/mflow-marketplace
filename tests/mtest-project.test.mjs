// The rest of an mtest project: the copy of the plugin for Claude Code on the web, what is still
// unreviewed, the session briefing and the doctor.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { PLUGIN, project, run } from "./mtest-helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const version = JSON.parse(fs.readFileSync(path.join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;

test("vendor writes a marked copy, reports it current, and refreshes only what changed", () => {
  p = project();
  assert.deepEqual(run(p, "vendor.mjs", ["status"]).json, { present: false });
  const plan = run(p, "vendor.mjs", ["plan"]).json;
  assert.ok(plan.create.includes(".claude-plugin/plugin.json"));
  assert.ok(plan.create.includes("skills/test/SKILL.md"));
  assert.ok(!plan.create.some((f) => f === "README.md"), "the README stays out of the copy");
  run(p, "vendor.mjs", ["write"]);
  assert.ok(p.exists(".claude/skills/mtest/scripts/run.mjs"));
  assert.ok(p.exists(".claude/skills/mtest/hooks/hooks.json"));
  const st = run(p, "vendor.mjs", ["status"]).json;
  assert.equal(st.current, true);
  assert.equal(st.version, version);
  p.write(".claude/skills/mtest/scripts/stale.mjs", "x");
  const mark = JSON.parse(p.read(".claude/skills/mtest/.mtest-vendor.json"));
  mark.files["scripts/stale.mjs"] = "0";
  mark.files["scripts/run.mjs"] = "0";
  p.write(".claude/skills/mtest/.mtest-vendor.json", JSON.stringify(mark));
  const again = run(p, "vendor.mjs", ["plan"]).json;
  assert.deepEqual(again.remove, ["scripts/stale.mjs"]);
  assert.deepEqual(again.update, ["scripts/run.mjs"]);
  run(p, "vendor.mjs", ["write"]);
  assert.equal(p.exists(".claude/skills/mtest/scripts/stale.mjs"), false);
  assert.equal(run(p, "vendor.mjs", ["status"]).json.current, true);
});

test("names in the copy's marker that lead out of the copy are never deleted", () => {
  p = project();
  run(p, "vendor.mjs", ["write"]);
  p.write("victim.txt", "keep me");
  p.write(".claude/keep.json", "{}");
  const mark = JSON.parse(p.read(".claude/skills/mtest/.mtest-vendor.json"));
  for (const rel of ["../../../victim.txt", "scripts/../../../victim.txt", "../../keep.json", "/etc/hosts", "C:/Windows/win.ini", "notes.md"]) mark.files[rel] = "0";
  p.write(".claude/skills/mtest/.mtest-vendor.json", JSON.stringify(mark));
  const plan = run(p, "vendor.mjs", ["plan"]).json;
  assert.deepEqual(plan.remove, []);
  assert.equal(plan.ignored.length, 6);
  assert.equal(run(p, "vendor.mjs", ["write"]).status, 0);
  assert.equal(p.read("victim.txt"), "keep me");
  assert.ok(p.exists(".claude/keep.json"));
});

test("a folder of the same name that is not an mtest copy is never touched", () => {
  p = project();
  p.write(".claude/skills/mtest/SKILL.md", "theirs");
  assert.equal(run(p, "vendor.mjs", ["write"]).json.foreign, true);
  assert.equal(p.read(".claude/skills/mtest/SKILL.md"), "theirs");
  assert.equal(p.exists(".claude/skills/mtest/scripts"), false);
});

test("review since starts at the newest report's end, or where the branch left the default branch", () => {
  p = project({ git: true });
  const first = p.git("rev-parse", "HEAD");
  p.git("checkout", "-q", "-b", "claude/feature");
  p.write("src/a.cs", "a");
  p.commit("feature a");
  let s = run(p, "reviews.mjs", ["since"]).json;
  assert.equal(s.base, first);
  assert.equal(s.commits.length, 1);
  assert.deepEqual(s.files, ["src/a.cs"]);
  const end = p.git("rev-parse", "HEAD");
  p.write("mtest/reviews/2026-11-06-claude-feature.md", `Reviewed: claude/feature ${first}..${end}\nReviewer: claude\nAuthor: claude\nLevel: full\nTests: none\nVerdict: approve\n\n## Findings\nnone\n`);
  p.commit("review");
  p.write("src/b.cs", "b");
  p.write(".claude/skills/mtest/x.md", "copy");
  p.commit("feature b");
  s = run(p, "reviews.mjs", ["since"]).json;
  assert.equal(s.base, end);
  assert.equal(s.lastReview.verdict, "approve");
  assert.deepEqual(s.files, ["mtest/reviews/2026-11-06-claude-feature.md", "src/b.cs"]);
});

test("the briefing shows the newest run, the flows and the unreviewed commits; it is silent outside a project", () => {
  p = project({ git: true, config: { parts: [{ name: "unit", kind: "unit", command: "x", verified: false }] } });
  p.write("mtest/STATUS.md", "# Test status\n\n## Now\n- testing the briefing\n");
  p.write("mtest/flows/f.md", "---\nflow: f\n---\n## Steps\n| Step | Actor |\n|---|---|\n| 1 | system |\n\n## Cases\n| Case | Path | Kind | Expect | Level | Test |\n|---|---|---|---|---|---|\n| C01 | 1 | happy | ok | unit | TODO |\n");
  const head = p.commit("state");
  p.write(`mtest/runs/2026-11-06-${head.slice(0, 7)}.md`, `Tested: main at ${head}\nBy: claude\nScope: whole suite\nResult: fail\nDuration: 1m 2s\nStarted: 2026-11-06T01:00:00Z\n\n| Part | Kind | Command | Result | Passed | Failed | Skipped | Duration |\n|---|---|---|---|---|---|---|---|\n| unit | unit | \`x\` | fail | 1 | 1 | 0 | 1m 2s |\n\n## Failures\n- unit › T.A: boom\n`);
  const r = run(p, "session-start.mjs", [], { input: { cwd: p.root } });
  assert.equal(r.status, 0, r.stderr);
  const ctx = r.json.hookSpecificOutput.additionalContext;
  assert.match(ctx, /testing the briefing/);
  assert.match(ctx, /newest: fail — whole suite at [0-9a-f]{7}, 1m 2s, at HEAD/);
  assert.match(ctx, /failing: unit › T\.A: boom/);
  assert.match(ctx, /no record shows passing yet \(unverified\): unit/);
  assert.match(ctx, /f \(draft\): steps 1\/1, cases with a test 0\/1 — 1 gap\(s\)/);
  p.cleanup();
  p = project({ marker: false });
  const silent = run(p, "session-start.mjs", [], { input: { cwd: p.root } });
  assert.equal(silent.status, 0);
  assert.equal(silent.stdout, "");
});

test("the doctor fails a project without parts and one the mflow plugin also drives", () => {
  p = project({ git: true });
  let d = run(p, "doctor.mjs").json;
  assert.equal(d.status, "fail");
  assert.ok(d.checks.some((c) => c.id === "parts" && c.status === "fail"));
  assert.ok(d.checks.some((c) => c.id === "agents-md" && c.status === "fail"));
  p.write(".mflow/config.json", "{}");
  d = run(p, "doctor.mjs").json;
  assert.ok(d.checks.some((c) => c.id === "other-plugin" && c.status === "fail"));
});

test("the doctor warns about a part no record shows passing, and is content once one does", () => {
  p = project({ marker: false, git: true });
  assert.equal(run(p, "scaffold.mjs", ["--root", p.root]).status, 0);
  const cfg = JSON.parse(p.read(".mtest/config.json"));
  cfg.parts = [{ name: "unit", kind: "unit", command: "x" }];
  p.config(cfg);
  let d = run(p, "doctor.mjs").json;
  assert.deepEqual(d.checks.filter((c) => c.status !== "ok").map((c) => c.id), ["unverified"]);
  p.write("mtest/runs/2026-11-06-abcdef0.md", "Tested: main at abcdef0\nScope: part unit\nResult: pass\n\n| Part | Kind | Command | Result | Passed | Failed | Skipped | Duration |\n|---|---|---|---|---|---|---|---|\n| unit-2 | unit | `x` | pass | 1 | 0 | 0 | 1s |\n");
  d = run(p, "doctor.mjs").json;
  assert.deepEqual(d.checks.filter((c) => c.status !== "ok"), []);
  assert.equal(d.status, "ok");
});
