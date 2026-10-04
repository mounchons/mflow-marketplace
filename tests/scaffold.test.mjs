// Scaffold: never overwrites, and a rerun after an upgrade offers only the templates that changed
// (.mflow/templates.json), so the files a user merged or kept are not suggested again and again.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

/** A folder with no mflow files yet (project() writes a config.json, which scaffold should create itself). */
function emptyProject() {
  p = project();
  fs.rmSync(path.join(p.root, ".mflow"), { recursive: true });
}
const scaffold = (...extra) => {
  const r = run(p, "scaffold.mjs", ["--root", p.root, "--name", "demo", ...extra]);
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};
const record = () => JSON.parse(p.read(".mflow/templates.json"));

test("the first run creates every template and records what it offered", () => {
  emptyProject();
  const r = scaffold();
  assert.ok(r.created.length >= 5);
  assert.deepEqual(r.suggested, []);
  const rec = record();
  assert.equal(rec.pluginVersion, r.pluginVersion);
  assert.match(rec.files["AGENTS.md"], /^[0-9a-f]{16}$/);
});

test("a file the user edited is kept on a rerun, not suggested again", () => {
  emptyProject();
  scaffold();
  p.write("AGENTS.md", p.read("AGENTS.md") + "\n- a rule of this project\n");
  const again = scaffold();
  assert.deepEqual(again.suggested, []);
  assert.ok(again.kept.includes("AGENTS.md"));
  assert.equal(p.exists(".mflow/suggested"), false);
  assert.match(p.read("AGENTS.md"), /a rule of this project/);
});

test("a template that changed since it was offered is suggested once", () => {
  emptyProject();
  scaffold();
  p.write("AGENTS.md", p.read("AGENTS.md") + "\n- a rule of this project\n");
  const rec = record();
  rec.files["AGENTS.md"] = "0000000000000000"; // as if an older plugin had offered a different template
  p.write(".mflow/templates.json", JSON.stringify(rec));
  const upgraded = scaffold();
  assert.deepEqual(upgraded.suggested.map((s) => s.existing), ["AGENTS.md"]);
  assert.equal(p.exists(".mflow/suggested/AGENTS.md"), true);
  fs.rmSync(p.file(".mflow/suggested"), { recursive: true }); // merged by hand
  assert.deepEqual(scaffold().suggested, []);
});

test("a project set up before the record gets each differing template once", () => {
  emptyProject();
  p.write("AGENTS.md", "# Our own agents file\n");
  assert.deepEqual(scaffold().suggested.map((s) => s.existing), ["AGENTS.md"]);
  fs.rmSync(p.file(".mflow/suggested"), { recursive: true });
  assert.deepEqual(scaffold().suggested, []);
});

test("--dry-run writes nothing, not even the record", () => {
  emptyProject();
  const r = scaffold("--dry-run");
  assert.ok(r.created.length >= 5);
  assert.equal(p.exists(".mflow/templates.json"), false);
  assert.equal(p.exists("AGENTS.md"), false);
});

test("a broken record stops the run and is left as it was", () => {
  emptyProject();
  p.write(".mflow/templates.json", "{broken");
  const r = run(p, "scaffold.mjs", ["--root", p.root]);
  assert.equal(r.status, 1);
  assert.equal(p.read(".mflow/templates.json"), "{broken");
  assert.equal(p.exists("AGENTS.md"), false);
});
