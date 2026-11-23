// mclip for Codex and Google Antigravity: the skills written into a project's .agents/skills (both tools read that
// folder) and the copy of what they run in .agents/mclip. No Codex, no Antigravity: what the files say and do.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(REPO, "plugins", "mclip", "scripts", "agent-skills.mjs");
const { convert, plan, write, status, SKILLS, VERSION } = await import(`file://${SCRIPT.replace(/\\/g, "/")}`);

const project = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mclip-agents-"));
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
};
const run = (args, cwd) => spawnSync(process.execPath, args, { cwd, encoding: "utf8" });

test("every skill but finish, made for Codex and Antigravity: no Claude Code command, path or tool left in it", () => {
  assert.deepEqual(SKILLS, ["help", "init", "plan", "record", "manual"], "finish needs WeftCut's MCP: Claude Code only");
  for (const s of SKILLS) {
    const text = convert(s, fs.readFileSync(path.join(REPO, "plugins", "mclip", "skills", s, "SKILL.md"), "utf8"));
    const [, front, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
    assert.match(front, new RegExp(`^name: mclip-${s}$`, "m"));
    assert.match(front, /^description: ".+\(mclip; Codex: \$mclip-\w+, Antigravity: \/mclip-\w+\)"$/m);
    assert.match(front, new RegExp(`mclip/generated: "${VERSION.replace(/\./g, "\\.")}"`));
    assert.doesNotMatch(front, /disable-model-invocation|argument-hint/);
    const rest = body.slice(body.indexOf("\n\n", body.indexOf("never by hand")));
    assert.doesNotMatch(rest, /CLAUDE_PLUGIN_ROOT|AskUserQuestion|\$ARGUMENTS|\/mclip:/, `skills/${s} after the preamble`);
    assert.match(body, /^## Running in Codex or Antigravity/);
  }
  const plan_ = convert("plan", fs.readFileSync(path.join(REPO, "plugins", "mclip", "skills", "plan", "SKILL.md"), "utf8"));
  assert.match(plan_, /node \.agents\/mclip\/scripts\/clips\.mjs page --open/);
  assert.match(plan_, /\.agents\/skills\/mclip-record\/SKILL\.md/, "a skill's pointer to another skill follows it");
  assert.match(plan_, /`mclip-plan edit/);
});

test("write: the skills and the runtime copy, then nothing to do; the copy runs on its own", () => {
  const p = project();
  try {
    const first = write(p.root);
    assert.deepEqual(first.skills.map((s) => s.action), SKILLS.map(() => "create"));
    assert.equal(first.runtime.action, "create");
    const rt = path.join(p.root, ".agents", "mclip");
    for (const f of ["scripts/clips.mjs", "scripts/serve.mjs", "scripts/doctor.mjs", "scripts/install.mjs", "lexicon.txt",
      ".claude-plugin/plugin.json", "templates/TutorialRecorder/Program.cs", "templates/scenarios/example.yaml"]) {
      assert.ok(fs.existsSync(path.join(rt, f)), f);
    }
    assert.ok(!fs.existsSync(path.join(rt, "skills")) && !fs.existsSync(path.join(rt, "templates", "weftcut")), "only what the skills run");
    assert.equal(fs.readFileSync(path.join(rt, ".mclip-agents"), "utf8").trim(), VERSION);

    const again = plan(p.root);
    assert.deepEqual([...again.skills.map((s) => s.action), again.runtime.action], [...SKILLS.map(() => "same"), "same"]);
    assert.deepEqual(status(p.root).skills.map((s) => s.version), SKILLS.map(() => VERSION));

    // the copy works without the plugin: a plan, its page
    fs.mkdirSync(path.join(p.root, "clips", "01-in"), { recursive: true });
    fs.writeFileSync(path.join(p.root, "clips", "plan.md"), "# Shop\n\n## สารบัญ\n\n1. 01-in — เข้า\n");
    fs.writeFileSync(path.join(p.root, "clips", "01-in", "lesson.md"), "# เข้า\n\n## 1. เปิด\n- ทำ: open /\n- บนจอ: เปิดหน้า\n");
    const r = run([".agents/mclip/scripts/clips.mjs", "page"], p.root);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(fs.existsSync(path.join(p.root, "clips", "index.html")));
    const copy = run([".agents/mclip/scripts/agent-skills.mjs", "write"], p.root);
    assert.equal(copy.status, 2);
    assert.match(JSON.parse(copy.stdout).error, /project's copy of mclip/);
  } finally { p.cleanup(); }
});

test("a skill folder of the user's own is never touched; an old version is updated", () => {
  const p = project();
  try {
    const mine = path.join(p.root, ".agents", "skills", "mclip-plan");
    fs.mkdirSync(mine, { recursive: true });
    fs.writeFileSync(path.join(mine, "SKILL.md"), "---\nname: mclip-plan\ndescription: mine\n---\nmy own\n");
    const r = run([SCRIPT, "write", "--root", p.root], p.root);
    assert.equal(r.status, 2, "refused, said in the answer");
    assert.match(JSON.parse(r.stdout).refused.join(), /mclip-plan: the user's own skill/);
    assert.equal(fs.readFileSync(path.join(mine, "SKILL.md"), "utf8"), "---\nname: mclip-plan\ndescription: mine\n---\nmy own\n");
    assert.ok(fs.existsSync(path.join(p.root, ".agents", "skills", "mclip-help", "SKILL.md")), "the others are written");

    const help = path.join(p.root, ".agents", "skills", "mclip-help", "SKILL.md");
    fs.writeFileSync(help, fs.readFileSync(help, "utf8").replace(`"${VERSION}"`, '"0.0.1"'));
    assert.equal(plan(p.root).skills.find((s) => s.name === "mclip-help").action, "update");
    fs.writeFileSync(path.join(p.root, ".agents", "mclip", "scripts", "clips.mjs"), "// changed by hand");
    assert.equal(plan(p.root).runtime.action, "update", "the copy is mclip's: a changed file is put back");
  } finally { p.cleanup(); }
});

test("doctor: an older copy of the skills is a warning with how to update", async () => {
  const { checkProject } = await import(`file://${path.join(REPO, "plugins", "mclip", "scripts", "doctor.mjs").replace(/\\/g, "/")}`);
  const p = project();
  try {
    write(p.root);
    assert.equal(checkProject(p.root, VERSION).find((c) => c.id === "agents").status, "ok");
    fs.writeFileSync(path.join(p.root, ".agents", "mclip", ".mclip-agents"), "0.1.0\n");
    const c = checkProject(p.root, VERSION).find((x) => x.id === "agents");
    assert.equal(c.status, "warn");
    assert.match(c.fix, /agent-skills\.mjs write/);
  } finally { p.cleanup(); }
});
