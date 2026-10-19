// Skills for Codex and OpenCode (/mflow:test and /mflow:review as .agents/skills/mflow-test and
// mflow-review): frontmatter both tools accept, no plugin path left, the user's own skill never touched,
// no write through a link that leaves the project, and a second write changes nothing.
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

test("write creates both skills with frontmatter Codex and OpenCode accept and no plugin path left", () => {
  p = project();
  const w = skills("write");
  assert.deepEqual(w.skills.map((s) => [s.name, s.state]), [["mflow-test", "create"], ["mflow-review", "create"]]);
  for (const name of ["mflow-test", "mflow-review"]) {
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
    assert.equal(p.read(`.agents/skills/${name}/agents/openai.yaml`), "policy:\n  allow_implicit_invocation: false\n");
    for (const ref of fs.readdirSync(p.file(`.agents/skills/${name}/references`))) {
      assert.ok(!p.read(`.agents/skills/${name}/references/${ref}`).includes("${CLAUDE_PLUGIN_ROOT}"), `${name}/${ref}: a plugin path is left`);
    }
  }
  const t = p.read(".agents/skills/mflow-test/SKILL.md");
  assert.match(t, /references\/stacks\.md/);
  assert.match(t, /- E2E never runs here: no hook in this tool caps the browsers/, "the E2E step is replaced");
  assert.ok(!/at most 2 browsers at a time/.test(t), "the Claude-only E2E step is gone");
  assert.ok(!/open a second Claude Code session/.test(t), "the Claude-only advice is gone");
  assert.match(t, /By: claude \| codex \| opencode/);
  assert.match(front(t).description, /never runs E2E/);
  const r = p.read(".agents/skills/mflow-review/SKILL.md");
  assert.match(r, /node "\.agents\/skills\/mflow-review\/scripts\/discuss\.mjs" checks --change <name>/);
  assert.match(r, /`Reviewer:` \(claude, codex or opencode\) and `Author:`/);
  assert.match(r, /self-review/);
  assert.ok(p.exists(".agents/skills/mflow-review/scripts/lib.mjs"));
  assert.ok(!p.exists(".agents/skills/mflow-test/scripts"), "the test skill needs no script");
});

test("a second write changes nothing, and status reads the version", () => {
  p = project();
  skills("write");
  const again = skills("plan");
  assert.deepEqual(again.skills.map((s) => [s.state, s.write.length]), [["unchanged", 0], ["unchanged", 0]]);
  assert.deepEqual(skills("status").skills.map((s) => s.state), ["current", "current"]);
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
  assert.deepEqual(w.skills.map((s) => s.state), ["refused", "refused"]);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("discuss.mjs runs from its copy in the review skill", () => {
  p = project();
  skills("write");
  const out = spawnSync(process.execPath, [p.file(".agents/skills/mflow-review/scripts/discuss.mjs"), "checks"], { cwd: p.root, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: p.root } });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(JSON.parse(out.stdout), "checks answers in JSON from the copy");
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
