// Packaging and install checks for the mclip plugin: the version reads the same in the manifest, the marketplace and
// the README; every skill is user-invoked and listed; every plugin-root path a skill names ships with the plugin; the
// recorder template names no project of its own and carries no secrets; the example scenario only uses actions,
// modes and highlights the recorder accepts; and install.mjs copies the recorder without overwriting what the project
// owns. Static checks and a throwaway folder only: no .NET, browser or ffmpeg needed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = path.join(REPO, "plugins", "mclip");
const TEMPLATE = path.join(PLUGIN, "templates", "TutorialRecorder");
const INSTALL = path.join(PLUGIN, "scripts", "install.mjs");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const version = JSON.parse(read("plugins/mclip/.claude-plugin/plugin.json")).version;

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}
const files = walk(PLUGIN);
const skills = fs.readdirSync(path.join(PLUGIN, "skills"));

function tempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mclip-test-"));
  return { root, file: (rel) => path.join(root, rel), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const run = (...args) => spawnSync(process.execPath, [INSTALL, ...args], { encoding: "utf8" });

test("the manifest, the marketplace and the README name the same version", () => {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const entry = JSON.parse(read(".claude-plugin/marketplace.json")).plugins.find((x) => x.name === "mclip");
  assert.ok(entry, "mclip in marketplace.json");
  assert.equal(entry.source, "./plugins/mclip");
  assert.equal(entry.version, version, "marketplace.json version");
  const minor = version.split(".").slice(0, 2).join(".");
  assert.match(read("plugins/mclip/README.md"), new RegExp(`## คำสั่ง \\(v${esc(minor)}\\)`), "README commands heading");
});

test("every skill is user-invoked, named after its folder and listed in the README", () => {
  const readme = read("plugins/mclip/README.md");
  assert.deepEqual([...skills].sort(), ["finish", "init", "plan", "record"]);
  for (const name of skills) {
    const front = read(`plugins/mclip/skills/${name}/SKILL.md`).split(/^---$/m)[1] ?? "";
    assert.match(front, new RegExp(`^name: ${esc(name)}$`, "m"), `${name}: name`);
    assert.match(front, /^description: \S/m, `${name}: description`);
    assert.match(front, /^disable-model-invocation: true$/m, `${name}: user-invoked only`);
    assert.match(front, /^argument-hint: /m, `${name}: argument-hint`);
    assert.ok(readme.includes(`/mclip:${name}`), `${name}: README lists the command`);
  }
});

test("every plugin-root path in the skills exists", () => {
  const missing = [];
  for (const rel of files.filter((f) => f.startsWith("skills/") && f.endsWith(".md"))) {
    const body = fs.readFileSync(path.join(PLUGIN, rel), "utf8");
    for (const m of body.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9_./-]+)/g)) {
      const target = m[1].replace(/[.]+$/, "");
      if (!fs.existsSync(path.join(PLUGIN, target))) missing.push(`${rel}: \${CLAUDE_PLUGIN_ROOT}/${target}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("the README tree lists every script and every template folder", () => {
  const readme = read("plugins/mclip/README.md");
  for (const s of fs.readdirSync(path.join(PLUGIN, "scripts"))) assert.ok(readme.includes(`─ ${s}`), `${s} in the README tree`);
  for (const d of fs.readdirSync(path.join(PLUGIN, "templates"))) assert.ok(readme.includes(`─ ${d}`), `templates/${d} in the README tree`);
});

test("the recorder template names no project of its own and ships no secrets or build output", () => {
  const rels = walk(TEMPLATE);
  assert.ok(!rels.includes("tutorial.secrets.json"), "no secrets file");
  assert.ok(!rels.some((f) => /^(bin|obj|Output)\/|\.venv\/|__pycache__/.test(f)), "no build output, venv or cache");
  assert.ok(!rels.includes("stack/reset.ps1"), "the stack script is the project's, written by /mclip:init");
  const hits = [];
  for (const rel of [...rels.map((f) => `templates/TutorialRecorder/${f}`), "templates/scenarios/example.yaml"]) {
    const body = fs.readFileSync(path.join(PLUGIN, rel), "utf8");
    for (const re of [/banchi/i, /\bfirm/i, /:8095\b/, /:8080\b/, /@demo\.local/i]) if (re.test(body)) hits.push(`${rel} ${re}`);
  }
  assert.deepEqual(hits, []);
});

test("no file carries a credential-looking value", () => {
  const everywhere = [/AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /"password"\s*:\s*"(?!change-me|Temp-change-me1)[^"]+"/];
  // `password = ...` is an assignment in code (a locator), a value only in text and config files
  const inText = [/(password|pwd)\s*=\s*[^\s;"'<>{}$]{6,}/i];
  const hits = [];
  for (const rel of files.filter((f) => /\.(md|mjs|cs|js|json|yaml|ps1|py|svg)$/.test(f))) {
    const body = fs.readFileSync(path.join(PLUGIN, rel), "utf8");
    const patterns = /\.(cs|mjs|js|py)$/.test(rel) ? everywhere : [...everywhere, ...inText];
    for (const re of patterns) if (re.test(body)) hits.push(`${rel} ${re}`);
  }
  assert.deepEqual(hits, []);
});

test("the template's .gitignore keeps the secrets, build output, recordings and the venv out", () => {
  const ignore = fs.readFileSync(path.join(TEMPLATE, ".gitignore"), "utf8").split(/\r?\n/);
  for (const entry of ["bin/", "obj/", "Output/", "tutorial.secrets.json", "tts/.venv/"]) assert.ok(ignore.includes(entry), entry);
});

test("the example scenario uses only actions, modes and highlights the recorder accepts", () => {
  const loader = fs.readFileSync(path.join(TEMPLATE, "Scenario", "ScenarioLoader.cs"), "utf8");
  const set = (name) => new Set([...new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`, "s").exec(loader)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  const actions = set("Actions"), modes = set("Modes"), highlights = set("Highlights");
  assert.ok(actions.has("click") && modes.has("clean") && highlights.has("box"), "read the recorder's lists");
  const example = read("plugins/mclip/templates/scenarios/example.yaml");
  assert.match(example, /^clip: [a-z0-9-]+$/m);
  assert.ok(modes.has(/^mode: (\S+)/m.exec(example)[1]), "mode");
  for (const m of example.matchAll(/^\s*-?\s*action: (\S+)/gm)) assert.ok(actions.has(m[1]), `action ${m[1]}`);
  for (const m of example.matchAll(/^\s*highlight: (\S+)/gm)) assert.ok(highlights.has(m[1]), `highlight ${m[1]}`);
  assert.doesNotMatch(example, /ครับ/, "the voice is female: ค่ะ, not ครับ");
});

test("install copies the recorder and the example, stamps the version and writes no project-owned file", () => {
  const p = tempProject();
  try {
    const r = run("--project", p.root);
    assert.equal(r.status, 0, r.stderr);
    for (const rel of walk(TEMPLATE)) assert.ok(fs.existsSync(p.file(`tools/TutorialRecorder/${rel}`)), rel);
    assert.equal(fs.readFileSync(p.file("tools/TutorialRecorder/.mclip-version"), "utf8").trim(), version);
    assert.ok(fs.existsSync(p.file("scenarios/example.yaml")));
    for (const rel of ["tutorial.secrets.json", "stack/reset.ps1", "stack/docker-compose.tutorial.yml"]) {
      assert.ok(!fs.existsSync(p.file(`tools/TutorialRecorder/${rel}`)), `${rel} is the project's to write`);
    }
    assert.match(r.stdout, /next: tutorial\.secrets\.json/);
  } finally { p.cleanup(); }
});

test("a rerun changes nothing; --update replaces tool files and keeps the project's settings, secrets and stack", () => {
  const p = tempProject();
  try {
    assert.equal(run("--project", p.root).status, 0);
    const again = run("--project", p.root);
    assert.equal(again.status, 0);
    assert.match(again.stdout, /nothing differs/);

    const overlay = p.file("tools/TutorialRecorder/Overlay/overlay.js");
    const settings = p.file("tools/TutorialRecorder/tutorial.settings.json");
    fs.writeFileSync(overlay, "// edited\n");
    fs.writeFileSync(settings, "{ \"crf\": 20 }\n");
    fs.writeFileSync(p.file("tools/TutorialRecorder/tutorial.secrets.json"), "{}\n");
    fs.writeFileSync(p.file("tools/TutorialRecorder/stack/reset.ps1"), "# the project's\n");
    fs.writeFileSync(p.file("scenarios/example.yaml"), "clip: mine\n");

    const report = run("--project", p.root);
    assert.equal(report.status, 0);
    assert.match(report.stdout, /differs from this plugin: Overlay\/overlay\.js/);
    assert.equal(fs.readFileSync(overlay, "utf8"), "// edited\n", "no change without --update");

    const upd = run("--project", p.root, "--update");
    assert.equal(upd.status, 0, upd.stderr);
    assert.equal(fs.readFileSync(overlay, "utf8"), fs.readFileSync(path.join(TEMPLATE, "Overlay", "overlay.js"), "utf8"));
    assert.equal(fs.readFileSync(settings, "utf8"), "{ \"crf\": 20 }\n", "settings kept");
    assert.equal(fs.readFileSync(p.file("tools/TutorialRecorder/tutorial.secrets.json"), "utf8"), "{}\n", "secrets kept");
    assert.equal(fs.readFileSync(p.file("tools/TutorialRecorder/stack/reset.ps1"), "utf8"), "# the project's\n", "stack kept");
    assert.equal(fs.readFileSync(p.file("scenarios/example.yaml"), "utf8"), "clip: mine\n", "scenarios kept");
  } finally { p.cleanup(); }
});

test("install refuses a recorder folder mclip did not put there, and a missing project", () => {
  const p = tempProject();
  try {
    fs.mkdirSync(p.file("tools/TutorialRecorder"), { recursive: true });
    fs.writeFileSync(p.file("tools/TutorialRecorder/Program.cs"), "// someone else's\n");
    const r = run("--project", p.root);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /was not installed by mclip/);
    assert.equal(fs.readFileSync(p.file("tools/TutorialRecorder/Program.cs"), "utf8"), "// someone else's\n");
    assert.equal(run("--project", path.join(p.root, "nope")).status, 2);
    assert.equal(run("--bogus").status, 2);
  } finally { p.cleanup(); }
});

test("--dry-run reports and writes nothing", () => {
  const p = tempProject();
  try {
    const r = run("--project", p.root, "--dry-run");
    assert.equal(r.status, 0);
    assert.match(r.stdout, /would install the recorder/);
    assert.ok(!fs.existsSync(p.file("tools")));
    assert.ok(!fs.existsSync(p.file("scenarios")));
  } finally { p.cleanup(); }
});
