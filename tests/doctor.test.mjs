// Doctor: a read-only report that names what is broken, out of date or untested, each with a fix.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const doctor = (env) => {
  const r = run(p, "doctor.mjs", [], { env });
  assert.equal(r.status, 0, r.stderr);
  return Object.fromEntries(r.json.checks.map((c) => [c.id, c]));
};
/** A scaffolded project, as /mflow:init leaves it before OpenSpec and Backlog are wired. */
function initialised() {
  p = project();
  fs.rmSync(path.join(p.root, ".mflow"), { recursive: true });
  assert.equal(run(p, "scaffold.mjs", ["--root", p.root, "--name", "demo"]).status, 0);
}

test("a freshly set up project has no fail in its own files, and every warn carries a fix", () => {
  initialised();
  const c = doctor();
  for (const id of ["config", "folders", "sources", "subagent", "status", "templates"]) {
    assert.ok(c[id], `missing check ${id}`);
    assert.notEqual(c[id].status, "fail", `${id}: ${c[id].detail}`);
  }
  assert.equal(c.agents.status, "warn"); // the stack profile is still TODO
  for (const check of Object.values(c)) if (["warn", "fail"].includes(check.status)) assert.ok(check.fix, `${check.id} has no fix`);
  assert.ok(Object.keys(doctor()).length, "a second run gives the same report");
  assert.equal(p.exists(".mflow/suggested"), false, "doctor wrote nothing");
});

test("a broken config.json is a fail, and the rest of the report still arrives", () => {
  initialised();
  p.write(".mflow/config.json", '{ "sourceDir": "docs/source", }');
  const c = doctor();
  assert.equal(c.config.status, "fail");
  assert.ok(c.subagent && c.agents && c.node);
});

test("an unknown setting is named as a likely typo", () => {
  initialised();
  const cfg = JSON.parse(p.read(".mflow/config.json"));
  p.write(".mflow/config.json", JSON.stringify({ ...cfg, sourcedir: "docs/customer" }));
  const c = doctor();
  assert.equal(c.config.status, "warn");
  assert.match(c.config.detail, /sourcedir/);
});

test("templates from an older plugin, pending merges and old caches are upgrade warnings", () => {
  initialised();
  const rec = JSON.parse(p.read(".mflow/templates.json"));
  p.write(".mflow/templates.json", JSON.stringify({ ...rec, pluginVersion: "0.1.0" }));
  p.write(".mflow/suggested/AGENTS.md", "# template\n");
  p.write(".mflow/cache/tor.md", "old text version\n");
  const c = doctor();
  assert.equal(c.templates.status, "warn");
  assert.match(c.templates.fix, /\/mflow:init/);
  assert.equal(c.suggested.status, "warn");
  assert.equal(c.cache.status, "warn");
});

test("a project set up before the record is reported, not failed", () => {
  initialised();
  fs.rmSync(p.file(".mflow/templates.json"));
  assert.equal(doctor().templates.status, "info");
});

test("prototype mode without the startup check is a warning; with it, ok", () => {
  initialised();
  p.write("src/App.Web/Program.cs", 'var fake = builder.Configuration.GetValue<bool>("Prototype:UseFakeData");\n');
  assert.equal(doctor()["prototype-mode"].status, "warn");
  p.write("src/App.Web/Program.cs", 'var fake = builder.Configuration.GetValue<bool>("Prototype:UseFakeData");\nif (fake && !builder.Environment.IsDevelopment() && !builder.Environment.IsEnvironment("Prototype")) throw new InvalidOperationException("x");\n');
  assert.equal(doctor()["prototype-mode"].status, "ok");
});

test("config.yaml set up before 0.26 is a warning until it names /mflow:e2e; the current one is ok", () => {
  initialised();
  const old = "rules:\n  tasks:\n    - Every task ends with the test that proves it (xUnit for rules, Playwright for user flows).\n    - tasks.md has no gate task; /mflow:test runs the whole suite.\noperations:\n  apply:\n    guidance:\n      - hand each task to mflow:dev when it is on.\n";
  p.write("openspec/config.yaml", old);
  const c = doctor();
  assert.equal(c["openspec-guidance"].status, "warn");
  assert.match(c["openspec-guidance"].detail, /0\.26/);
  assert.match(c["openspec-guidance"].fix, /\/mflow:init/);
  p.write("openspec/config.yaml", old.replace("Playwright for user flows).", "no E2E; /mflow:e2e <screen> writes them)."));
  assert.equal(doctor()["openspec-guidance"].status, "ok");
});

test("a Playwright config with no top-level workers is a warning; a project's own workers does not count", () => {
  initialised();
  const config = (top) => `import { defineConfig } from "@playwright/test";
// One worker for the stack project; the rest use the default.
export default defineConfig({
  timeout: 30_000,
  fullyParallel: true,${top}
  use: { baseURL: "http://localhost:4173" },
  projects: [
    { name: "buyer", testDir: "./buyer" },
    { name: "stack", testDir: "./stack", dependencies: ["buyer"], fullyParallel: false, workers: 1 },
  ],
});
`;
  p.write("tests/e2e/playwright.config.ts", config(""));
  const c = doctor();
  assert.equal(c["e2e-workers"].status, "warn");
  assert.match(c["e2e-workers"].detail, /tests\/e2e\/playwright\.config\.ts/);
  assert.match(c["e2e-workers"].fix, /workers: 2/);
  p.write("tests/e2e/playwright.config.ts", config("\n  workers: 2,"));
  assert.equal(doctor()["e2e-workers"].status, "ok");
  assert.match(doctor()["e2e-workers"].detail, /at 2$/);
});

test("missing CLIs are failures with the install line, not silence", () => {
  initialised();
  // PATH with only Node on it. Windows spells the variable Path, so both spellings get the same value.
  const nodeOnly = path.dirname(process.execPath);
  const c = doctor({ PATH: nodeOnly, Path: nodeOnly });
  assert.equal(c.openspec.status, "fail");
  assert.match(c.openspec.fix, /npm i -g @fission-ai\/openspec/);
  assert.equal(c.backlog.status, "fail");
  assert.ok(c.config, "the project checks still ran");
});

test("outside an mflow project the report says so", () => {
  p = project();
  fs.rmSync(path.join(p.root, ".mflow"), { recursive: true });
  assert.equal(doctor().project.status, "fail");
});
