// mreq scaffold: creates the project files and the marker, never overwrites, offers only changed
// templates on a rerun, and stays out of a project another workflow plugin drives.
import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, test } from "node:test";
import { project, run } from "./mreq-helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const scaffold = (...extra) => {
  const r = run(p, "scaffold.mjs", ["--root", p.root, "--name", "ระบบทดสอบ", ...extra]);
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};

test("the first run creates every project file, the marker and the record", () => {
  p = project({ marker: false });
  const r = scaffold("--code-name", "SchoolHr");
  for (const f of ["AGENTS.md", "CLAUDE.md", "mreq/project/README.md", "mreq/project/STATUS.md", "mreq/project/vision.md",
    "mreq/project/followups.md", "mreq/source/README.md", "mreq/ui/README.md", "mreq/discuss/README.md", ".mreq/config.json"]) {
    assert.ok(r.created.includes(f), `created ${f}`);
    assert.ok(p.exists(f), `${f} on disk`);
  }
  assert.match(p.read("AGENTS.md"), /^# ระบบทดสอบ$/m);
  assert.match(p.read("AGENTS.md"), /^Project name \(code\): SchoolHr$/m);
  assert.doesNotMatch(p.read("mreq/project/STATUS.md"), /\{\{/);
  const rec = JSON.parse(p.read(".mreq/templates.json"));
  assert.equal(rec.pluginVersion, r.pluginVersion);
  assert.match(rec.files["AGENTS.md"], /^[0-9a-f]{16}$/);
});

test("without --code-name the project name in code stays TODO", () => {
  p = project({ marker: false });
  scaffold();
  assert.match(p.read("AGENTS.md"), /^Project name \(code\): TODO$/m);
});

test("a project name in code that is not PascalCase ASCII is refused before anything is written", () => {
  p = project({ marker: false });
  const r = run(p, "scaffold.mjs", ["--root", p.root, "--code-name", "school-hr"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /PascalCase/);
  assert.equal(p.exists("AGENTS.md"), false);
});

test("a project driven by the other workflow plugin is left alone", () => {
  p = project({ marker: false });
  p.write(".mflow/config.json", "{}\n");
  const r = run(p, "scaffold.mjs", ["--root", p.root]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /nothing was written/);
  assert.equal(p.exists("AGENTS.md"), false);
  assert.equal(p.exists(".mreq"), false);
});

test("an existing file is never overwritten: the template goes to .mreq/suggested once", () => {
  p = project({ marker: false });
  p.write("AGENTS.md", "# Our own agents file\n");
  const r = scaffold();
  assert.deepEqual(r.suggested.map((s) => s.existing), ["AGENTS.md"]);
  assert.equal(p.read("AGENTS.md"), "# Our own agents file\n");
  assert.ok(p.exists(".mreq/suggested/AGENTS.md"));
  fs.rmSync(p.file(".mreq/suggested"), { recursive: true }); // merged by hand
  const again = scaffold();
  assert.deepEqual(again.suggested, []);
  assert.ok(again.kept.includes("AGENTS.md"));
});

test("an existing marker is the project's and stays as it is", () => {
  p = project({ config: { statusLogEntriesInContext: 5 } });
  const r = scaffold();
  assert.ok(!r.created.includes(".mreq/config.json"));
  assert.equal(JSON.parse(p.read(".mreq/config.json")).statusLogEntriesInContext, 5);
});

test("--dry-run writes nothing, not even the marker", () => {
  p = project({ marker: false });
  const r = scaffold("--dry-run");
  assert.ok(r.created.length >= 9);
  assert.equal(p.exists(".mreq"), false);
  assert.equal(p.exists("AGENTS.md"), false);
});

test("a broken record stops the run and is left as it was", () => {
  p = project({ marker: false });
  p.write(".mreq/templates.json", "{broken");
  const r = run(p, "scaffold.mjs", ["--root", p.root]);
  assert.equal(r.status, 1);
  assert.equal(p.read(".mreq/templates.json"), "{broken");
  assert.equal(p.exists("AGENTS.md"), false);
});
