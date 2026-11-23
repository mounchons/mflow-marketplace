// mclip's doctor.mjs (/mclip:help check setup): the machine checks with a stand-in for the commands it runs, the
// project checks on throwaway folders (the recorder's version, build, secrets, stack, voice; the plan), and the CLI's
// JSON. Read-only: nothing it checks is installed or changed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCTOR = path.join(REPO, "plugins", "mclip", "scripts", "doctor.mjs");
const { checkMachine, checkProject, playwrightCache } = await import(`file://${DOCTOR.replace(/\\/g, "/")}`);
const byId = (checks) => Object.fromEntries(checks.map((c) => [c.id, c]));

function tempDir(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mclip-doctor-"));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

// a machine where every command answers as given; a missing key is a command that cannot run
const machine = (answers) => (cmd) => answers[cmd] ?? null;

test("a machine with everything passes; each missing tool fails or warns with its fix", () => {
  const cache = tempDir({ "chromium-1255/x": "" });
  try {
    const env = { PLAYWRIGHT_BROWSERS_PATH: cache.root };
    const all = { git: "git version 2.51.0", dotnet: "8.0.400 [/sdk]\n10.0.401 [/sdk]", pwsh: "7.6.10", ffmpeg: "ffmpeg version 7.1", py: "Python 3.13.1", python3: "Python 3.13.1" };
    const ok = byId(checkMachine({ run: machine(all), nodeVersion: "v24.22.2", env }));
    for (const id of ["node", "git", "dotnet", "pwsh", "ffmpeg", "chromium", "python"]) assert.equal(ok[id].status, "ok", id);
    assert.match(ok.dotnet.detail, /10\.0\.401/);

    const bare = byId(checkMachine({ run: machine({ dotnet: "8.0.400 [/sdk]", pwsh: "5.1.0" }), nodeVersion: "v18.19.0", env: { PLAYWRIGHT_BROWSERS_PATH: path.join(cache.root, "none") } }));
    for (const id of ["node", "git", "dotnet", "pwsh", "ffmpeg"]) {
      assert.equal(bare[id].status, "fail", id);
      assert.ok(bare[id].fix, `${id} has a fix`);
    }
    assert.match(bare.dotnet.detail, /no \.NET SDK 10 \(have: 8\.0\.400\)/);
    assert.equal(bare.chromium.status, "warn");
    assert.equal(bare.python.status, "warn", "the voice is optional");
    assert.equal(byId(checkMachine({ run: machine({ ...all, py: "Python 3.8.10", python3: "Python 3.8.10", python: "Python 3.8.10" }), env })).python.status, "warn");
  } finally { cache.cleanup(); }
});

test("Playwright's cache follows PLAYWRIGHT_BROWSERS_PATH, else the platform's place", () => {
  assert.equal(playwrightCache({ PLAYWRIGHT_BROWSERS_PATH: "/x/pw" }, "/home/u"), "/x/pw");
  assert.match(playwrightCache({}, "/home/u"), /ms-playwright$/);
});

test("project: no recorder and no plan warn with the command that fixes each", () => {
  const p = tempDir();
  try {
    const c = byId(checkProject(p.root, "0.3.1"));
    assert.deepEqual([c.recorder.status, c.recorder.fix], ["warn", "/mclip:init"]);
    assert.deepEqual([c.plan.status, c.plan.fix], ["warn", "/mclip:plan"]);
  } finally { p.cleanup(); }
});

test("project: an older recorder, unbuilt, without secrets, stack or voice; a plan with a problem", () => {
  const p = tempDir({ "tools/TutorialRecorder/.mclip-version": "0.2.0\n", "clips/plan.md": "# X\n\n## สารบัญ\n\n1. bad — A\n" });
  try {
    const c = byId(checkProject(p.root, "0.3.1"));
    assert.equal(c.recorder.fix, "/mclip:init --update");
    assert.match(c.recorder.detail, /recorder 0\.2\.0, the plugin is 0\.3\.1 \(no --shots/);
    for (const id of ["recorder-build", "secrets", "stack", "voice"]) assert.equal(c[id].status, "warn", id);
    assert.equal(c.plan.status, "warn");
    assert.match(c.plan.detail, /2 problem\(s\): clips\/plan\.md:5: lesson id 'bad'/);
  } finally { p.cleanup(); }
});

test("project: a current, built, set-up recorder and a clean plan pass", () => {
  const venv = process.platform === "win32" ? "tools/TutorialRecorder/tts/.venv/Scripts/python.exe" : "tools/TutorialRecorder/tts/.venv/bin/python";
  const p = tempDir({ "tools/TutorialRecorder/.mclip-version": "0.3.1", "tools/TutorialRecorder/bin/Debug/net10.0/TutorialRecorder.dll": "",
    "tools/TutorialRecorder/tutorial.secrets.json": "{}", "tools/TutorialRecorder/stack/reset.ps1": "", [venv]: "",
    "clips/plan.md": "# X\n\n## สารบัญ\n\n1. 01-a — A\n" });
  try {
    const checks = checkProject(p.root, "0.3.1");
    assert.deepEqual(checks.filter((c) => c.status !== "ok"), []);
    assert.match(byId(checks).plan.detail, /1 lessons/);
  } finally { p.cleanup(); }
});

test("the CLI prints the plugin's version, an overall status and every check", () => {
  const p = tempDir();
  try {
    const r = spawnSync(process.execPath, [DOCTOR, "--root", p.root], { encoding: "utf8", timeout: 120000 });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.plugin, JSON.parse(fs.readFileSync(path.join(REPO, "plugins", "mclip", ".claude-plugin", "plugin.json"), "utf8")).version);
    assert.ok(["ok", "warn", "fail"].includes(out.status));
    assert.ok(out.checks.some((c) => c.id === "node") && out.checks.some((c) => c.id === "plan"));
    assert.equal(fs.readdirSync(p.root).length, 0, "nothing written");
  } finally { p.cleanup(); }
});
