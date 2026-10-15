// The SessionStart briefing and the doctor: silent or failing outside an mreq project, and on a freshly
// set-up project they show STATUS.md, the foundation topics and a kit not built yet.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { project, run } from "./mreq-helpers.mjs";

let p;
afterEach(() => p?.cleanup());

/** A project as /mreq:init leaves it: scaffolded, with the agenda created. */
function initialised() {
  p = project({ marker: false });
  assert.equal(run(p, "scaffold.mjs", ["--root", p.root, "--name", "demo", "--code-name", "Demo"]).status, 0);
  assert.equal(run(p, "discuss.mjs", ["agenda", "init"]).status, 0);
}
const briefing = () => {
  const r = run(p, "session-start.mjs", [], { input: { source: "startup", session_id: "t1", cwd: p.root } });
  assert.equal(r.status, 0, r.stderr);
  return r;
};

test("outside an mreq project the hook says nothing", () => {
  p = project({ marker: false });
  const r = briefing();
  assert.equal(r.stdout, "");
});

test("a fresh project's briefing shows STATUS.md, the foundation topics and the kit to build", () => {
  initialised();
  const r = briefing();
  assert.equal(r.json.hookSpecificOutput.hookEventName, "SessionStart");
  const text = r.json.hookSpecificOutput.additionalContext;
  assert.match(text, /mreq\/project\/STATUS\.md: Now/);
  assert.match(text, /\/mreq:discuss tech-stack/);
  assert.match(text, /4 recommended topic\(s\) not started: tech-stack, code-structure, nfr, security-privacy/);
  assert.match(text, /not built yet → \/mreq:theme/);
  assert.doesNotMatch(text, /mreq upgrade/);
});

test("a draft discussion doc and an approved kit show up", () => {
  initialised();
  assert.equal(run(p, "discuss.mjs", ["new", "tech-stack"]).status, 0);
  assert.equal(run(p, "theme-status.mjs", ["init"]).status, 0);
  assert.equal(run(p, "theme-status.mjs", ["approve", "--date", "2026-10-13"]).status, 0);
  const text = briefing().json.hookSpecificOutput.additionalContext;
  assert.match(text, /01-tech-stack \(rev 1, \d+ open item\(s\)\)/);
  assert.match(text, /approved 2026-10-13, revision 1; \d+ kit file\(s\) missing/);
});

test("the doctor fails outside a project and finds nothing failing in a fresh one", () => {
  p = project({ marker: false });
  let r = run(p, "doctor.mjs");
  assert.equal(r.status, 0);
  assert.ok(r.json.checks.some((c) => c.id === "marker" && c.level === "fail"));
  p.cleanup();
  initialised();
  r = run(p, "doctor.mjs");
  assert.equal(r.json.summary.fail, 0, JSON.stringify(r.json.checks));
  assert.ok(r.json.checks.some((c) => c.id === "project-name" && c.level === "ok"));
});

test("the doctor fails a project the other workflow plugin also drives", () => {
  initialised();
  p.write(".mflow/config.json", "{}\n");
  const r = run(p, "doctor.mjs");
  assert.ok(r.json.checks.some((c) => c.id === "other-plugin" && c.level === "fail"));
});
