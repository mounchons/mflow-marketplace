// Skills for Codex and OpenCode (/mflow:test, /mflow:review and /mflow:e2e as .agents/skills/mflow-test,
// mflow-review and mflow-e2e) and the E2E guard entry in .codex/hooks.json: frontmatter both tools accept,
// no plugin path left, the user's own skill and other hooks never touched, no write through a link that
// leaves the project, and a second write changes nothing.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const skills = (...args) => {
  const r = run(p, "agent-skills.mjs", args);
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};
const NAMES = ["mflow-test", "mflow-review", "mflow-e2e"];
const GUARD = ".agents/skills/mflow-e2e/scripts/e2e-guard.mjs";
const ENTRY = { matcher: "Bash", hooks: [{ type: "command", command: `node "$(git rev-parse --show-toplevel)/${GUARD}"`, timeout: 10 }] };
const version = JSON.parse(fs.readFileSync(new URL("../plugins/mflow/.claude-plugin/plugin.json", import.meta.url), "utf8")).version;

/** The frontmatter of a SKILL.md as top-level keys and the metadata map. */
function front(text) {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)[1].split("\n");
  const top = block.filter((l) => /^[\w-]+:/.test(l)).map((l) => l.split(":")[0]);
  const metadata = Object.fromEntries(block.filter((l) => /^ {2}\S/.test(l)).map((l) => {
    const m = /^ {2}([^:]+):\s*"(.*)"$/.exec(l);
    return [m[1], m[2]];
  }));
  const description = JSON.parse(/^description: (.*)$/m.exec(text)[1]);
  return { top, metadata, name: /^name: (.*)$/m.exec(text)[1], description };
}

test("write creates the three skills with frontmatter Codex and OpenCode accept and no plugin path left", () => {
  p = project();
  const w = skills("write");
  assert.deepEqual(w.skills.map((s) => [s.name, s.state]), NAMES.map((n) => [n, "create"]));
  for (const name of NAMES) {
    const text = p.read(`.agents/skills/${name}/SKILL.md`);
    const f = front(text);
    assert.equal(f.name, name);
    assert.match(f.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, "OpenCode's name rule");
    assert.ok(f.description.length > 0 && f.description.length <= 1024, "OpenCode's description length");
    assert.deepEqual(f.top, ["name", "description", "compatibility", "metadata"], "no other top-level field (OpenCode)");
    assert.deepEqual(f.metadata, { "mflow/generated": version, "mflow/source": name.slice(6), "opencode/slash": "true", "opencode/autoinvoke": "false" });
    assert.ok(!text.includes("${CLAUDE_PLUGIN_ROOT}"), `${name}: a plugin path is left`);
    assert.ok(!/disable-model-invocation/.test(text));
    assert.match(text, /## Running in Codex or OpenCode/);
    assert.match(text, /`\/mflow:e2e` is `\$mflow-e2e` \/ `\/mflow-e2e`/, "e2e is named as a skill of this tool, not a Claude Code command");
    assert.ok(!/\]\(references\//.test(text), `${name}: a link relative to the skill is left`);
    assert.equal(p.read(`.agents/skills/${name}/agents/openai.yaml`), "policy:\n  allow_implicit_invocation: false\n");
    for (const ref of fs.readdirSync(p.file(`.agents/skills/${name}/references`))) {
      assert.ok(!p.read(`.agents/skills/${name}/references/${ref}`).includes("${CLAUDE_PLUGIN_ROOT}"), `${name}/${ref}: a plugin path is left`);
    }
  }
  const t = p.read(".agents/skills/mflow-test/SKILL.md");
  assert.match(t, /references\/stacks\.md/);
  assert.match(t, /at most 2 browsers at a time.*In this tool: in Codex only after the E2E guard check/, "the E2E step holds in Codex behind the guard");
  assert.match(t, /in OpenCode never, since no hook there caps the browsers/);
  assert.match(t, /E2E guard check, once in the session/);
  assert.match(t, /node -e "process\.exit\(1\)" && npx playwright test/);
  assert.ok(!/open a second Claude Code session/.test(t), "the Claude-only advice is gone");
  assert.match(t, /By: claude \| codex \| opencode/);
  assert.match(front(t).description, /E2E only while mflow's E2E guard/);
  const r = p.read(".agents/skills/mflow-review/SKILL.md");
  assert.match(r, /node "\.agents\/skills\/mflow-review\/scripts\/discuss\.mjs" checks --change <name>/);
  assert.match(r, /`Reviewer:` \(claude, codex or opencode\) and `Author:`/);
  assert.match(r, /self-review/);
  assert.ok(p.exists(".agents/skills/mflow-review/scripts/lib.mjs"));
  for (const s of ["mflow-test", "mflow-review"]) {
    assert.ok(p.exists(`.agents/skills/${s}/scripts/pending.mjs`) && p.exists(`.agents/skills/${s}/scripts/lib.mjs`), `${s} carries pending.mjs`);
    assert.match(p.read(`.agents/skills/${s}/SKILL.md`), new RegExp(`node "\\.agents/skills/${s}/scripts/pending\\.mjs"`));
  }
  const e = p.read(".agents/skills/mflow-e2e/SKILL.md");
  assert.match(e, /`\.agents\/skills\/mflow-e2e\/references\/chain\.md`/, "the chain sketch is named from the repository root");
  assert.ok(p.exists(".agents/skills/mflow-e2e/references/chain.md") && p.exists(GUARD) && p.exists(".agents/skills/mflow-e2e/scripts/lib.mjs"));
  assert.match(e, /E2E guard check/);
  assert.match(e, /`playwright-cli -s=mflow-e2e open <url>`/, "the page is looked at with Playwright CLI, in one named session");
  assert.match(e, /`playwright-cli -s=mflow-e2e close`/);
  assert.match(e, /never from the refs/);
  assert.match(e, /git check-ignore -q \.playwright-cli/);
  assert.match(e, /The one Playwright CLI session of section 2 .* is not a test run/);
  assert.match(e, /^- In this tool, first: in Codex, run nothing below until the E2E guard check.*\n- Only this screen's or this flow's test files/m, "the stop sits at the top of Run");
  assert.match(e, /In OpenCode, write the tests \(sections 1 and 2\) and stop before section 3/);
  assert.match(front(e).description, /OpenCode writes them but never runs them/);
  assert.equal(w.hook.state, "create");
  assert.deepEqual(JSON.parse(p.read(".codex/hooks.json")), { hooks: { PreToolUse: [ENTRY] } });
});

test("a second write changes nothing, and status reads the version", () => {
  p = project();
  skills("write");
  const again = skills("plan");
  assert.deepEqual(again.skills.map((s) => [s.state, s.write.length]), NAMES.map(() => ["unchanged", 0]));
  assert.equal(again.hook.state, "unchanged");
  const st = skills("status");
  assert.deepEqual(st.skills.map((s) => s.state), ["current", "current", "current"]);
  assert.equal(st.hook.state, "current");
});

test("an older copy is updated, and a file mflow no longer makes is removed", () => {
  p = project();
  skills("write");
  const file = ".agents/skills/mflow-test/SKILL.md";
  p.write(file, p.read(file).replace(`mflow/generated: "${version}"`, 'mflow/generated: "0.1.0"'));
  p.write(".agents/skills/mflow-test/references/old.md", "gone\n");
  assert.equal(skills("status").skills[0].state, "outdated");
  const w = skills("write");
  assert.equal(w.skills[0].state, "update");
  assert.equal(w.skills[0].from, "0.1.0");
  assert.deepEqual(w.skills[0].remove, [".agents/skills/mflow-test/references/old.md"]);
  assert.ok(!p.exists(".agents/skills/mflow-test/references/old.md"));
  assert.equal(skills("status").skills[0].state, "current");
});

test("the user's own skill of the same name is never touched", () => {
  p = project();
  p.write(".agents/skills/mflow-review/SKILL.md", "---\nname: mflow-review\ndescription: mine\n---\nmy own review\n");
  const w = skills("write");
  assert.equal(w.skills[1].state, "foreign");
  assert.equal(p.read(".agents/skills/mflow-review/SKILL.md"), "---\nname: mflow-review\ndescription: mine\n---\nmy own review\n");
  assert.equal(w.skills[0].state, "create", "the other skill is still written");
  assert.equal(skills("status").skills[1].state, "foreign");
});

test("nothing is written through a folder that a junction takes outside the project", () => {
  p = project();
  const outside = path.join(p.base, "outside");
  fs.mkdirSync(outside);
  fs.mkdirSync(p.file(".agents"), { recursive: true });
  fs.symlinkSync(outside, p.file(".agents/skills"), "junction");
  const w = skills("write");
  assert.deepEqual(w.skills.map((s) => s.state), ["refused", "refused", "refused"]);
  assert.equal(w.hook.state, "skipped", "no hook for a guard copy that was not written");
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.ok(!p.exists(".codex/hooks.json"));
});

test("discuss.mjs runs from its copy in the review skill", () => {
  p = project();
  skills("write");
  const out = spawnSync(process.execPath, [p.file(".agents/skills/mflow-review/scripts/discuss.mjs"), "checks"], { cwd: p.root, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: p.root } });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(JSON.parse(out.stdout), "checks answers in JSON from the copy");
});

test("pending.mjs runs from its copy in the test skill", () => {
  p = project();
  skills("write");
  const out = spawnSync(process.execPath, [p.file(".agents/skills/mflow-test/scripts/pending.mjs"), "status"], { cwd: p.root, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: p.root } });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).file, "docs/reviews/pending.md");
});

test("the doctor warns when the copies are older than the plugin, and knows the asBuilt setting", () => {
  p = project({ asBuilt: { openapi: "openapi.yaml" } });
  skills("write");
  const file = ".agents/skills/mflow-review/SKILL.md";
  p.write(file, p.read(file).replace(`mflow/generated: "${version}"`, 'mflow/generated: "0.1.0"'));
  const d = run(p, "doctor.mjs").json;
  const c = d.checks.find((x) => x.id === "agent-skills");
  assert.equal(c.status, "warn");
  assert.match(c.detail, /mflow-review 0\.1\.0/);
  assert.match(c.fix, /\/mflow:init/);
  assert.ok(!d.checks.some((x) => x.id === "config" && /does not use/.test(x.detail)), "asBuilt is a known setting");
});

test("the guard entry joins the project's own hooks in .codex/hooks.json and replaces an older one of mflow's", () => {
  p = project();
  const other = { matcher: "apply_patch", hooks: [{ type: "command", command: "node tools/lint-hook.mjs" }] };
  const stop = [{ hooks: [{ type: "command", command: "node tools/stop.mjs", timeout: 3 }] }];
  p.write(".codex/hooks.json", JSON.stringify({ description: "ours", hooks: { PreToolUse: [other], Stop: stop } }, null, 2));
  assert.equal(skills("status").hook.state, "missing");
  assert.equal(skills("write").hook.state, "update");
  assert.deepEqual(JSON.parse(p.read(".codex/hooks.json")), { description: "ours", hooks: { PreToolUse: [other, ENTRY], Stop: stop } });
  assert.equal(skills("plan").hook.state, "unchanged");
  // An entry of mflow's that differs (an older command, or two of them) is replaced in place by one.
  const older = { matcher: "Bash", hooks: [{ type: "command", command: `node ./${GUARD}`, timeout: 5 }] };
  p.write(".codex/hooks.json", JSON.stringify({ hooks: { PreToolUse: [older, other, older] } }));
  assert.equal(skills("status").hook.state, "outdated");
  assert.equal(skills("write").hook.state, "update");
  assert.deepEqual(JSON.parse(p.read(".codex/hooks.json")).hooks.PreToolUse, [ENTRY, other]);
});

test("a .codex/hooks.json that is not valid JSON is left alone, and the skills are still written", () => {
  p = project();
  p.write(".codex/hooks.json", "{ not json");
  const w = skills("write");
  assert.equal(w.hook.state, "refused");
  assert.match(w.hook.note, /not valid JSON.*by hand/);
  assert.equal(p.read(".codex/hooks.json"), "{ not json");
  assert.deepEqual(w.skills.map((s) => s.state), ["create", "create", "create"]);
  assert.equal(skills("status").hook.state, "unreadable");
});

test("no hook entry when mflow-e2e is the user's own skill", () => {
  p = project();
  p.write(".agents/skills/mflow-e2e/SKILL.md", "---\nname: mflow-e2e\ndescription: mine\n---\nmine\n");
  const w = skills("write");
  assert.equal(w.skills[2].state, "foreign");
  assert.equal(w.hook.state, "skipped");
  assert.ok(!p.exists(".codex/hooks.json"));
});

test("the guard copy blocks what Codex sends it: no --workers, and the guard check; --workers=2 passes", () => {
  p = project();
  skills("write");
  // What Codex 0.169 sends a PreToolUse hook for a shell command; it sets no CLAUDE_PROJECT_DIR.
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  const ask = (command) => {
    const input = { session_id: "s", turn_id: "t", cwd: p.root, hook_event_name: "PreToolUse", model: "m", permission_mode: "default", tool_name: "Bash", tool_input: { command }, tool_use_id: "u" };
    const out = spawnSync(process.execPath, [p.file(GUARD)], { cwd: p.root, input: JSON.stringify(input), encoding: "utf8", env });
    assert.equal(out.status, 0, out.stderr);
    return out.stdout ? JSON.parse(out.stdout).hookSpecificOutput : null;
  };
  const check = ask('node -e "process.exit(1)" && npx playwright test');
  assert.equal(check.permissionDecision, "deny");
  assert.match(check.permissionDecisionReason, /This Playwright run sets no --workers/);
  assert.match(check.permissionDecisionReason, /\$mflow-e2e/);
  assert.equal(ask("npx playwright test --workers=3").permissionDecision, "deny");
  assert.equal(ask("npx playwright test tests/e2e/orders.spec.ts --workers=2"), null);
  assert.equal(ask("playwright-cli -s=mflow-e2e open http://localhost:3000/orders"), null, "a Playwright CLI look is not a test run");
});

test("the doctor warns when mflow-e2e is there but .codex/hooks.json does not run the guard", () => {
  p = project();
  skills("write");
  assert.ok(!run(p, "doctor.mjs").json.checks.some((x) => x.id === "codex-e2e-guard"));
  p.write(".codex/hooks.json", JSON.stringify({ hooks: {} }));
  const c = run(p, "doctor.mjs").json.checks.find((x) => x.id === "codex-e2e-guard");
  assert.equal(c?.status, "warn");
  assert.match(c.detail, /no entry for mflow's E2E guard/);
  assert.match(c.fix, /\/mflow:init.*\/hooks/);
});
