// What to build next (0.61.0, the user's word 2026-11-26 from ThawSi: after a feature was merged nothing said what
// came next): next.mjs lists open changes, unmerged feat/* branches and the Later changes of the proposals that were
// not built since, and CLAUDE.md has Claude offer them as options after every merge. Synthetic projects only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { laterLines } from "../plugins/mflow/scripts/next.mjs";
import { SCRIPTS, git, hasGit, project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

test("Later lines: top-level bullets under the heading only, None left out", () => {
  const text = "# P\n\n## Why\n- not this\n\n## Later changes\n\n- `export-staff`: Excel export.\n  - a detail of it\n- None split off.\n- A leave menu key.\n\n## Impact\n- not this\n";
  assert.deepEqual(laterLines(text), ["`export-staff`: Excel export.", "A leave menu key."]);
  assert.deepEqual(laterLines("## Later changes\n\n- ไม่มี\n"), []);
  assert.deepEqual(laterLines("# no heading\n- x\n"), []);
});

test("next lists open changes, unmerged feat branches and Later lines not built yet, newest first", { skip: !hasGit }, () => {
  p = project();
  git(p, "init", "-q", "-b", "main");
  git(p, "commit", "-q", "--allow-empty", "-m", "init");
  git(p, "branch", "feat/add-export");
  git(p, "switch", "-q", "feat/add-export");
  git(p, "commit", "-q", "--allow-empty", "-m", "export");
  git(p, "switch", "-q", "main");
  p.write("openspec/changes/archive/2026-11-20-add-staff/proposal.md", "## Later changes\n\n- `manage-departments`: HR edits departments.\n- `add-export`: Excel export of the staff list.\n");
  p.write("openspec/changes/archive/2026-11-25-manage-departments/proposal.md", "## Later changes\n\n- A leave menu key, when /leave is built.\n");
  p.write("openspec/changes/add-export/proposal.md", "# open\n");
  p.write("openspec/changes/add-export/tasks.md", "- [x] 1.1 a\n- [ ] 1.2 b\n");
  const r = run(p, "next.mjs");
  assert.equal(r.status, 0, r.stderr);
  const out = r.json;
  assert.deepEqual(out.open, [{ name: "add-export", tasks: { done: 1, all: 2 } }]);
  assert.deepEqual(out.branches, ["feat/add-export"]);
  assert.deepEqual(out.later.map((l) => [l.archived, l.from, l.item]), [["2026-11-25", "manage-departments", "A leave menu key, when /leave is built."]], "built ones are left out, newest first");
  assert.equal(out.laterBuilt, 2);
  assert.deepEqual(out.changes.sort(), ["add-export", "add-staff", "manage-departments"]);
});

test("CLAUDE.md offers the next feature after every merge, and the briefing names the script", () => {
  const claude = fs.readFileSync(path.join(SCRIPTS, "..", "templates", "CLAUDE.md"), "utf8");
  assert.match(claude, /- After every merge into main, and whenever the user asks what to do next \("ทำอะไรต่อดี"\), offer the next feature: run `next\.mjs`/);
  assert.match(claude, /ask one numbered question with up to three options a\) b\) c\) and d\) something else, the recommended one first with one line why/);
  assert.match(claude, /a Later line that `changes` shows was built since is not offered/);
  p = project();
  const brief = run(p, "session-start.mjs", [], { input: { session_id: "t-next", cwd: p.root, source: "startup" } }).json.hookSpecificOutput.additionalContext;
  assert.ok(brief.includes(path.join(SCRIPTS, "next.mjs")), "the briefing names next.mjs");
});
