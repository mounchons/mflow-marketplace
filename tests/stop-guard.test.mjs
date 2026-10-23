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
/**
 * The guard's decision. With MFLOW_DEBUG it names why it let a stop through, and the assertion carries
 * that reason. A git command that times out on a loaded machine lets the stop through on purpose (a
 * reminder is best effort), so that one reason gets a second try; any other reason is the result.
 */
let why = "";
const stop = () => {
  for (let attempt = 1; ; attempt++) {
    const r = run(p, "stop-guard.mjs", [], { input: { session_id: "t-stop", cwd: p.root, stop_hook_active: false }, env: { MFLOW_DEBUG: "1" } });
    assert.equal(r.status, 0, r.stderr);
    why = r.stderr.trim() || "blocked";
    if (attempt === 1 && /git status unavailable/.test(why)) continue;
    return r.json?.decision ?? "pass";
  }
};
const expectStop = (decision) => assert.equal(stop(), decision, why);

test("an edited file asks for the handoff", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  expectStop("block");
});

test("nothing changed: no handoff", needsGit, () => {
  repo(); start();
  expectStop("pass");
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
  expectStop("block");
});

test("a file deleted before the session started does not", needsGit, () => {
  repo();
  fs.rmSync(p.file("src/b.txt"));
  start();
  expectStop("pass");
});

test("a renamed file asks for the handoff, though it keeps its old mtime", needsGit, () => {
  repo(); start();
  git(p, "mv", "src/a.txt", "src/c.txt");
  expectStop("block");
});

test("work committed during the session asks for the handoff", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  git(p, "commit", "-q", "-am", "work");
  expectStop("block");
});

test("work committed before STATUS.md was updated does not", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  git(p, "commit", "-q", "-am", "work");
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(p.file("STATUS.md"), later, later);
  expectStop("pass");
});

// StemHub 2026-10-23: the work was committed, STATUS.md written, then committed on its own; the guard
// saw a commit newer than STATUS.md and counted every file since the session began (141), then asked
// to trim the log, and nine entries were folded into one line.
test("committing the handoff after the work does not ask again", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  git(p, "commit", "-q", "-am", "work");
  p.write("STATUS.md", "# Status\n\n## Now\n- work committed\n");
  git(p, "commit", "-q", "-am", "handoff");
  expectStop("pass");
});

test("work committed together with its STATUS.md entry does not ask", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  p.write("STATUS.md", "# Status\n\n## Now\n- work and entry\n");
  git(p, "commit", "-q", "-am", "work with entry");
  expectStop("pass");
});

test("work committed after the handoff asks, and counts only that work", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  p.write("STATUS.md", "# Status\n\n## Now\n- a done\n");
  git(p, "commit", "-q", "-am", "a with entry");
  p.write("src/b.txt", "changed\n");
  git(p, "commit", "-q", "-am", "b");
  expectStop("block");
  const reason = run(p, "stop-guard.mjs", [], { input: { session_id: "t-stop", cwd: p.root, stop_hook_active: false } }).json?.reason;
  assert.match(reason, /: 1 file\(s\) changed .*\(src\/b\.txt\)/);
});

test("older entries moved to docs/status-log.md after STATUS.md do not ask", needsGit, () => {
  repo(); start();
  p.write("STATUS.md", "# Status\n\n## Now\n- trimmed\n");
  p.write("docs/status-log.md", "# STATUS log archive\n\n### old entry\n");
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "handoff and archive");
  p.write("docs/status-log.md", "# STATUS log archive\n\n### older entry\n### old entry\n");
  expectStop("pass");
});

// The names come from git's own paths minus the project's prefix, so they hold below the top level of
// a monorepo, and on Windows when the temp folder is an 8.3 short name (RUNNER~1 on CI).
test("a project below the git top level names its own files, and only those", needsGit, () => {
  p = project();
  const sub = "apps/web";
  p.write(`${sub}/.mflow/config.json`, JSON.stringify({ version: 1, stopGuard: { enabled: true, graceMinutes: 0, repeatMinutes: 0 } }));
  p.write(`${sub}/STATUS.md`, "# Status\n\n## Now\n- start\n");
  p.write(`${sub}/src/a.txt`, "a\n");
  p.write("other/x.txt", "x\n");
  git(p, "init", "-q");
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "baseline");
  const cwd = p.file(sub);
  const env = { CLAUDE_PROJECT_DIR: cwd };
  assert.equal(run(p, "session-start.mjs", [], { cwd, env, input: { session_id: "t-sub", cwd, source: "startup" } }).status, 0);
  p.write(`${sub}/STATUS.md`, "# Status\n\n## Now\n- handoff\n");
  p.write(`${sub}/docs/status-log.md`, "# STATUS log archive\n");
  p.write("other/x.txt", "changed\n");
  const guard = () => run(p, "stop-guard.mjs", [], { cwd, env, input: { session_id: "t-sub", cwd, stop_hook_active: false } }).json;
  assert.equal(guard()?.decision, undefined, "the archive and a file outside the project do not ask");
  p.write(`${sub}/src/a.txt`, "changed\n");
  git(p, "commit", "-q", "-m", "work", "--", `${sub}/src/a.txt`);
  assert.match(guard()?.reason ?? "", /: 1 file\(s\) changed .*\(src\/a\.txt\)/);
});

test("the request leaves older log entries alone", needsGit, () => {
  repo(); start();
  p.write("src/a.txt", "changed\n");
  const r = run(p, "stop-guard.mjs", [], { input: { session_id: "t-stop", cwd: p.root, stop_hook_active: false } });
  assert.equal(r.json?.decision, "block");
  assert.match(r.json.reason, /Leave the older log entries as they are/);
  assert.doesNotMatch(r.json.reason, /fold|newest 10/);
});

test("a session record from an older mflow, with no baseline, still catches a deletion", needsGit, () => {
  repo();
  const dir = path.join(p.temp, "mflow-sessions");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "t-stop.json"), JSON.stringify({ root: p.root, startedAt: Date.now() - 1_800_000, lastBlockAt: 0 }));
  fs.rmSync(p.file("src/b.txt"));
  expectStop("block");
});

test("the briefing's ritual asks for numbered questions with options a) b) c)", () => {
  p = project();
  p.write("STATUS.md", "# Status\n\n## Now\n- focus\n");
  const r = run(p, "session-start.mjs", [], { input: { session_id: "t-ask", cwd: p.root, source: "startup" } });
  assert.ok(r.json.hookSpecificOutput.additionalContext.includes("label the options a), b), c), never ก ข ค, so the answer is one line such as `1 a, 2 b, 3 a`"));
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
