// Runs by Codex and Antigravity cannot commit from their sandboxes (.git read-only, tried 2026-11-25 with
// codex-cli 0.172 and agy 1.5.16 on Windows). The user chose "1 a": the tool runs Claude Code on Sonnet outside the
// sandbox to commit, or prints that command; Claude Code's briefing names what is still uncommitted.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { git, hasGit, project, run } from "./helpers.mjs";
import { ALLOWED, command } from "../plugins/mflow/scripts/results.mjs";
import { SKILLS, build } from "../plugins/mflow/scripts/agent-skills.mjs";

let p;
afterEach(() => p?.cleanup());
const needsGit = { skip: !hasGit && "git not installed" };

function repo() {
  p = project();
  p.write("STATUS.md", "# STATUS\n\n## Now\n- start\n");
  p.write("src/a.txt", "a\n");
  git(p, "init", "-q", "-b", "main");
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "baseline");
}

test("uncommitted lists the run's files with the tool its record names, and nothing else", needsGit, () => {
  repo();
  p.write("docs/reviews/tests/2026-11-25-abc1234.md", "Tested: main at abc\nBy: codex\nResult: fail\n");
  p.write("docs/reviews/code/2026-11-25-add-x.md", "Reviewed: add-x\nReviewer: antigravity\n");
  p.write("docs/reviews/pending.md", "| Change |\n");
  p.write("src/b.txt", "not a result\n");
  const r = run(p, "results.mjs", ["uncommitted"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json.files.map((f) => [f.file, f.by]), [
    ["docs/reviews/code/2026-11-25-add-x.md", "antigravity"],
    ["docs/reviews/pending.md", null],
    ["docs/reviews/tests/2026-11-25-abc1234.md", "codex"],
  ]);
});

test("command runs Claude Code on Sonnet with git status, diff, log, add and commit only, in text PowerShell and sh read alike", () => {
  for (const kind of ["test", "review", "e2e"]) {
    const c = command({ tool: "codex", kind });
    assert.match(c.command, /^claude -p "Commit what the codex \w+ run left uncommitted in this folder: /);
    assert.match(c.command, /" --model sonnet --allowedTools "Bash\(git status:\*\)" "Bash\(git diff:\*\)" "Bash\(git log:\*\)" "Bash\(git add:\*\)" "Bash\(git commit:\*\)"$/);
    assert.ok(!/[`$]/.test(c.prompt) && !c.prompt.includes('"'), "no backtick, dollar or double quote in the prompt");
    assert.match(c.prompt, /never with git add -A/);
    assert.match(c.prompt, /do not push/);
  }
  assert.match(command({ tool: "antigravity", kind: "e2e" }).prompt, /the E2E test files it changed/);
  assert.deepEqual(ALLOWED.filter((a) => /push|reset|checkout|rm/.test(a)), []);
  assert.throws(() => command({ tool: "gemini", kind: "test" }));
});

test("the skills for Codex and Antigravity carry the script and say to run the command outside the sandbox, or print it", () => {
  for (const [name, kind] of [["mflow-test", "test"], ["mflow-review", "review"], ["mflow-e2e", "e2e"]]) {
    const files = build(SKILLS.find((s) => s.name === name));
    assert.ok(files[`.agents/skills/${name}/scripts/results.mjs`], `${name} carries results.mjs`);
    const text = files[`.agents/skills/${name}/SKILL.md`];
    assert.ok(text.includes(`node ".agents/skills/${name}/scripts/results.mjs" command --tool <codex, antigravity or opencode, whichever you are> --kind ${kind}`), name);
    assert.match(text, /outside the sandbox \(in Codex, ask the user to approve it\): Claude Code on Sonnet commits the run's files by name/);
    assert.match(text, /end the final message with that command and the files left uncommitted/);
  }
});

test("the briefing names a run of another tool left uncommitted and asks once; a worktree and Claude's own records stay quiet", needsGit, () => {
  repo();
  const brief = () => run(p, "session-start.mjs", [], { input: { session_id: "t-res", cwd: p.root, source: "startup" } }).json.hookSpecificOutput.additionalContext;
  p.write("docs/reviews/tests/2026-11-25-own.md", "By: claude\nResult: pass\n");
  assert.ok(!/## Results of/.test(brief()), "a record by Claude is Claude's to commit");
  p.write("docs/reviews/tests/2026-11-25-abc1234.md", "By: codex\nResult: fail\n");
  const text = brief();
  assert.match(text, /## Results of codex not committed\n- \?\? docs\/reviews\/tests\/2026-11-25-abc1234\.md \(codex\)/);
  assert.match(text, /Ask the user in one line whether to commit them[^\n]*Never commit them unasked, and push nothing\./);
});
