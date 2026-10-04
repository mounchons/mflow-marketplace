// Stop hook: asks for a STATUS.md handoff when work changed during the session, including files
// deleted, renamed or committed, which the old mtime-only check missed.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { git, hasGit, project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());
const needsGit = { skip: !hasGit && "git not installed" };
const hourAgo = () => new Date(Date.now() - 3_600_000);

/** A git project with a committed baseline and STATUS.md older than the session. */
function repo() {
  p = project({ stopGuard: { enabled: true, graceMinutes: 0, repeatMinutes: 0 } });
  p.write("STATUS.md", "# Status\n\n## Now\n- start\n");
  p.write("src/a.txt", "a\n");
  p.write("src/b.txt", "b\n");
  git(p, "init", "-q");
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "baseline");
  fs.utimesSync(p.file("STATUS.md"), hourAgo(), hourAgo());
}
/** Start the session the way Claude Code does, so SessionStart records its baseline. */
function start() {
  const r = run(p, "session-start.mjs", [], { input: { session_id: "t-stop", cwd: p.root, source: "startup" } });
  assert.equal(r.status, 0, r.stderr);
}
const stop = () => {
  const r = run(p, "stop-guard.mjs", [], { input: { session_id: "t-stop", cwd: p.root, stop_hook_active: false } });
  assert.equal(r.status, 0, r.stderr);
  return r.json?.decision ?? "pass";
};

test("an edited file asks for the handoff", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  assert.equal(stop(), "block");
});

test("nothing changed: no handoff", needsGit, () => {
  repo(); start();
  assert.equal(stop(), "pass");
});

test("stop_hook_active never blocks again", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  const r = run(p, "stop-guard.mjs", [], { input: { session_id: "t-stop", cwd: p.root, stop_hook_active: true } });
  assert.equal(r.stdout, "");
});

test("a deleted file asks for the handoff (T06)", needsGit, () => {
  repo(); start();
  fs.rmSync(p.file("src/b.txt"));
  assert.equal(stop(), "block");
});

test("a file deleted before the session started does not", needsGit, () => {
  repo();
  fs.rmSync(p.file("src/b.txt"));
  start();
  assert.equal(stop(), "pass");
});

test("a renamed file asks for the handoff, though it keeps its old mtime", needsGit, () => {
  repo(); start();
  git(p, "mv", "src/a.txt", "src/c.txt");
  assert.equal(stop(), "block");
});

test("work committed during the session asks for the handoff", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  git(p, "commit", "-q", "-am", "work");
  assert.equal(stop(), "block");
});

test("work committed before STATUS.md was updated does not", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  git(p, "commit", "-q", "-am", "work");
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(p.file("STATUS.md"), later, later);
  assert.equal(stop(), "pass");
});

test("a session record from an older mflow, with no baseline, still catches a deletion", needsGit, () => {
  repo();
  const dir = path.join(p.temp, "mflow-sessions");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "t-stop.json"), JSON.stringify({ root: p.root, startedAt: Date.now() - 1_800_000, lastBlockAt: 0 }));
  fs.rmSync(p.file("src/b.txt"));
  assert.equal(stop(), "block");
});

test("a long STATUS.md is shortened in the briefing, and what is waiting and the ritual still arrive", () => {
  p = project();
  const long = Array.from({ length: 400 }, (_, i) => `- note ${i}: ${"รายละเอียด ".repeat(3)}`).join("\n");
  p.write("STATUS.md", `# Status\n\n## Now\n- focus first\n${long}\n`);
  p.write("docs/source/tor.md", "# TOR\n");
  const r = run(p, "session-start.mjs", [], { input: { session_id: "t-long", cwd: p.root, source: "startup" } });
  const context = r.json.hookSpecificOutput.additionalContext;
  assert.ok(context.length <= 9000, `briefing is ${context.length} characters`);
  assert.match(context, /- focus first/);
  assert.match(context, /shortened to fit the briefing/);
  assert.match(context, /1 new source doc\(s\) not processed/);
  assert.match(context, /## Session ritual/);
});
