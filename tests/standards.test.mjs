// 0.60.0, the user's word 2026-11-26 (Claude's usage running out) and answers "1 a, 2 a": one coding standard per
// project in docs/standards/coding.md that every tool writes code to and every review checks, and an applied change
// whose code Codex writes in the change's worktree while Claude checks it. Synthetic projects only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { LINES, yamlItem } from "../plugins/mflow/scripts/openspec-config.mjs";
import { project, run, SCRIPTS } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());
const read = (rel) => fs.readFileSync(path.join(SCRIPTS, "..", rel), "utf8").replace(/\r\n/g, "\n");

test("a new project gets docs/standards/coding.md with numbered rules, and AGENTS.md points to it", () => {
  p = project();
  fs.rmSync(p.file(".mflow/config.json"));
  const r = run(p, "scaffold.mjs", ["--root", p.root, "--name", "demo"]);
  assert.equal(r.status, 0, r.stderr);
  const std = p.read("docs/standards/coding.md");
  assert.match(std, /^# Coding standard/);
  assert.match(std, /- STD-01 /);
  assert.match(std, /a departure is written in the change's tasks\.md with the reason|A departure is written in the change's tasks\.md with the reason/);
  const agents = p.read("AGENTS.md");
  assert.match(agents, /- Code follows `docs\/standards\/coding\.md`: read it before writing code, in any tool\./);
  assert.match(agents, /\| How code is written here: the rules every tool follows and every review checks \| `docs\/standards\/coding\.md` \(`STD-<nn>`\)/);
  assert.match(agents, /in `code` mode, write the code to `docs\/standards\/coding\.md`/);
});

test("every tool's apply reads the standard first, a review checks it by rule id, and approve and init fill it", () => {
  const line = LINES["operations.apply.guidance"].find((l) => l.includes("docs/standards/coding.md"));
  assert.ok(line, "the apply guidance line");
  assert.match(line, /^Before the first task, read docs\/standards\/coding\.md when it exists/);
  assert.match(line, /a departure goes in tasks\.md with the rule id and the reason/);
  assert.equal(yamlItem(line), line, "a plain YAML item");
  assert.match(read("skills/review/SKILL.md"), /8\. \*\*Coding standard:\*\* the diff against each rule of `docs\/standards\/coding\.md` it touches; a finding names the rule \(`STD-07`\)/);
  assert.match(read("skills/discuss/SKILL.md"), /a `STD-<nn>` line in `docs\/standards\/coding\.md` under its heading, pointing to this doc and its D/);
  assert.match(read("skills/init/SKILL.md"), /- Coding standard: in `docs\/standards\/coding\.md`, replace a TODO line with a `STD-<nn>` rule only where the code already shows it for certain/);
});

test("Codex builds a change when the user says so or applyBy is codex; Claude runs it and checks the work", () => {
  const claude = read("templates/CLAUDE.md");
  assert.match(claude, /When the user said Codex builds it \("ให้ codex เขียน"\), or `\.mflow\/config\.json` has `"applyBy": "codex"`, Codex writes the code instead and Claude checks it/);
  const delegate = read("skills/delegate/SKILL.md");
  assert.match(delegate, /## Apply by Codex/);
  assert.match(delegate, /worktree\.mjs" new <change>` makes `\.claude\/worktrees\/<change>` on `feat\/<change>`/);
  assert.match(delegate, /no archive, no commit \(the sandbox cannot write `\.git`\), no E2E/);
  assert.match(delegate, /only an entry marked `mflowOwn: true` is run, in the background/);
  assert.match(delegate, /Blockers and majors go back to Codex once/);
  assert.match(delegate, /a\) Claude applies it now, b\) wait and run Codex again later/);

  p = project();
  p.write(".mflow/briefs/b.md", "# brief\n");
  const r = run(p, "delegate-cmd.mjs", ["--mode", "code", "--tool", "codex", "--brief", ".mflow/briefs/b.md", "--out", "docs/ai/inbox/r.md", "--worktree", ".claude/worktrees/x"]);
  assert.equal(r.status, 0, r.stderr);
  const entry = r.json.commands ? r.json.commands[0] : r.json;
  assert.equal(entry.mflowOwn, true);
  assert.match(entry.bash, /codex exec -s workspace-write -C /);

  p.write(".mflow/config.json", JSON.stringify({ version: 1, applyBy: "agy" }));
  const bad = run(p, "discuss.mjs", ["list"]);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /"applyBy" must be "claude" or "codex"/);
});
