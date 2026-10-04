// Stop hook: asks for a STATUS.md handoff when work changed during the session.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { git, hasGit, project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

/** A git project with a committed baseline, STATUS.md older than the session, and a session record. */
function session() {
  p = project({ stopGuard: { enabled: true, graceMinutes: 0, repeatMinutes: 0 } });
  p.write("STATUS.md", "# Status\n\n## Now\n- start\n");
  p.write("src/a.txt", "a\n");
  p.write("src/b.txt", "b\n");
  git(p, "init", "-q");
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "baseline");
  const hourAgo = new Date(Date.now() - 3_600_000);
  fs.utimesSync(p.file("STATUS.md"), hourAgo, hourAgo);
  const dir = path.join(p.temp, "mflow-sessions");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "t-stop.json"), JSON.stringify({ root: p.root, startedAt: Date.now() - 1_800_000, lastBlockAt: 0 }));
}
const stop = () => {
  const r = run(p, "stop-guard.mjs", [], { input: { session_id: "t-stop", cwd: p.root, stop_hook_active: false } });
  assert.equal(r.status, 0, r.stderr);
  return r.json?.decision ?? "pass";
};

test("an edited file asks for the handoff", { skip: !hasGit && "git not installed" }, () => {
  session();
  p.write("src/a.txt", "changed\n");
  assert.equal(stop(), "block");
});

test("nothing changed: no handoff", { skip: !hasGit && "git not installed" }, () => {
  session();
  assert.equal(stop(), "pass");
});

test("stop_hook_active never blocks again", { skip: !hasGit && "git not installed" }, () => {
  session();
  p.write("src/a.txt", "changed\n");
  const r = run(p, "stop-guard.mjs", [], { input: { session_id: "t-stop", cwd: p.root, stop_hook_active: true } });
  assert.equal(r.stdout, "");
});

test("a deleted file asks for the handoff (T06)", { todo: "F06", skip: !hasGit && "git not installed" }, () => {
  session();
  fs.rmSync(p.file("src/b.txt"));
  assert.equal(stop(), "block");
});
