// mtest scaffold: creates AGENTS.md, CLAUDE.md, mtest/ and the marker in a new project, never overwrites
// the agent files a project already has (it suggests a merge instead), offers only changed templates on a
// rerun, and stays out of a project the mflow plugin drives.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { project, run } from "./mtest-helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const scaffold = (...extra) => {
  const r = run(p, "scaffold.mjs", ["--root", p.root, "--name", "ระบบบัญชี", ...extra]);
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};

test("a new project gets every file, the marker and the record", () => {
  p = project({ marker: false });
  const r = scaffold();
  for (const f of ["AGENTS.md", "CLAUDE.md", "mtest/README.md", "mtest/STATUS.md", "mtest/flows/README.md", "mtest/runs/README.md",
    "mtest/reviews/README.md", ".mtest/.gitignore", ".mtest/config.json"]) {
    assert.ok(r.created.includes(f), `created ${f}`);
    assert.ok(p.exists(f), `${f} on disk`);
  }
  assert.match(p.read("AGENTS.md"), /^# ระบบบัญชี$/m);
  assert.match(p.read("AGENTS.md"), /^## Testing \(mtest\)$/m);
  assert.match(p.read("CLAUDE.md"), /^@AGENTS\.md$/m);
  assert.doesNotMatch(p.read("mtest/STATUS.md"), /\{\{/);
  const cfg = JSON.parse(p.read(".mtest/config.json"));
  assert.equal(cfg.e2eMaxWorkers, 4);
  assert.deepEqual(cfg.parts, []);
  assert.match(p.read(".mtest/.gitignore"), /^logs\/$/m);
});

test("an existing AGENTS.md stays as it is and the template is suggested beside it", () => {
  p = project({ marker: false });
  p.write("AGENTS.md", "# Theirs\n\n## Non-negotiable rules\n- Money is decimal.\n");
  const r = scaffold();
  assert.equal(p.read("AGENTS.md"), "# Theirs\n\n## Non-negotiable rules\n- Money is decimal.\n");
  assert.deepEqual(r.suggested.map((s) => s.existing), ["AGENTS.md"]);
  assert.ok(p.exists(".mtest/suggested/AGENTS.md"));
  assert.ok(r.created.includes("CLAUDE.md"), "CLAUDE.md created when missing");
});

test("a rerun suggests nothing the project already decided on, and keeps its config", () => {
  p = project({ marker: false });
  p.write("AGENTS.md", "# Theirs\n");
  scaffold();
  p.config({ e2eMaxWorkers: 2, parts: [{ name: "unit", kind: "unit", command: "x" }] });
  const r = scaffold();
  assert.deepEqual(r.suggested, []);
  assert.ok(r.kept.includes("AGENTS.md"));
  assert.equal(JSON.parse(p.read(".mtest/config.json")).e2eMaxWorkers, 2);
});

test("--dry-run writes nothing", () => {
  p = project({ marker: false });
  const r = scaffold("--dry-run");
  assert.ok(r.created.length > 5);
  assert.equal(p.exists("AGENTS.md"), false);
  assert.equal(p.exists(".mtest/config.json"), false);
});

test("a project the mflow plugin drives is refused before anything is written", () => {
  p = project({ marker: false });
  p.write(".mflow/config.json", "{}\n");
  const r = run(p, "scaffold.mjs", ["--root", p.root]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /mflow/);
  assert.equal(p.exists("AGENTS.md"), false);
});
