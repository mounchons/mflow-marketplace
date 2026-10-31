// status-trim.mjs: /mflow:handoff moves the earlier ## Now blocks, the sections between ## Now and ## Log, and
// the log entries past the newest 10 to docs/status-log.md, word for word. StemHub 2026-10-31: STATUS.md was
// 565 KB (## Now 180 blocks, one per earlier session), and each edit to it took about a minute.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const trim = (...args) => run(p, "status-trim.mjs", args);
const ok = (...args) => {
  const r = trim(...args);
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};
const entries = (n, from = 1) => Array.from({ length: n }, (_, i) => `### 2026-10-${String(30 - i - from + 1).padStart(2, "0")}: entry ${i + from}\n- Did: thing ${i + from}\n- Next: step ${i + from}\n`).join("\n");
const STATUS = [
  "# STATUS",
  "",
  "## Now",
  "- **Focus (today):** change C",
  "  - **Next:** /mflow:test on main",
  "",
  "- Yesterday's block: change B merged",
  "  - **Next:** deploy when asked",
  "  - **Blocked on:** nothing",
  "",
  "- Older block: change A",
  "  - **Next:**",
  "    1. review the batch",
  "    2. deploy the dev server",
  "  - **Blocked on:** nothing.",
  "",
  "## Previous session context (historical)",
  "- an old note",
  "",
  "## Log",
  "<!-- Newest first. Keep 10 entries. -->",
  "",
  entries(12),
].join("\n");

const nonBlank = (...texts) => texts.join("\n").replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim()).sort();

test("plan lists the Now blocks with their Next and Blocked lines, the sections between, and the log", () => {
  p = project();
  p.write("STATUS.md", STATUS);
  const r = ok("plan");
  assert.equal(r.now.blocks.length, 3);
  assert.match(r.now.blocks[0].first, /Focus \(today\)/);
  assert.match(r.now.blocks[1].next, /deploy when asked/);
  assert.match(r.now.blocks[1].blocked, /nothing/);
  assert.equal(r.now.blocks[2].next, "- **Next:** 1. review the batch 2. deploy the dev server", "items under a Next header come with it");
  assert.deepEqual(r.sections, ["## Previous session context (historical)"]);
  assert.equal(r.log.entries, 12);
  assert.equal(r.archiveKb, null);
  assert.equal(p.read("STATUS.md"), STATUS, "plan writes nothing");
});

test("move keeps the current block and the newest log entries, and moves the rest word for word", () => {
  p = project();
  p.write("STATUS.md", STATUS);
  const r = ok("move", "--keep", "1", "--log", "10");
  assert.equal(r.moved, true);
  assert.equal(r.blocks, 2);
  assert.equal(r.sections, 1);
  assert.equal(r.logEntries, 2);
  const s = p.read("STATUS.md");
  const a = p.read("docs/status-log.md");
  assert.match(s, /^# STATUS\n\n## Now\n- \*\*Focus \(today\):\*\* change C\n {2}- \*\*Next:\*\* \/mflow:test on main\n\n## Log\n<!-- Newest first/);
  assert.doesNotMatch(s, /Yesterday's block|Previous session context|entry 11|entry 12/);
  assert.equal((s.match(/^### /gm) || []).length, 10);
  assert.match(a, /^# STATUS log archive\n\n### 2026-10-20: entry 11\n[\s\S]*### 2026-10-19: entry 12\n/, "log entries at the top, newest first as they stood");
  assert.match(a, /## Now blocks moved on \d{4}-\d{2}-\d{2}\n\n<!-- From STATUS.md ## Now[^\n]*-->\n\n- Yesterday's block: change B merged\n {2}- \*\*Next:\*\* deploy when asked\n {2}- \*\*Blocked on:\*\* nothing\n- Older block: change A\n {2}- \*\*Next:\*\*\n {4}1\. review the batch\n {4}2\. deploy the dev server\n {2}- \*\*Blocked on:\*\* nothing\.\n\n## Previous session context \(historical\)\n- an old note\n$/);
  const added = ["## Now blocks moved on", "<!-- From STATUS.md", "# STATUS log archive"];
  assert.deepEqual(nonBlank(s, a).filter((l) => !added.some((x) => l.startsWith(x))), nonBlank(STATUS), "every line kept or moved, none changed");
  assert.equal(ok("move", "--keep", "1", "--log", "10").moved, false, "a second run has nothing to move");
});

test("an existing archive keeps its title and note, and gets the entries below them", () => {
  p = project();
  p.write("STATUS.md", STATUS);
  p.write("docs/status-log.md", "# STATUS log archive\n\n<!-- Entries moved from STATUS.md. -->\n\n### 2026-09-01: very old\n- Did: x\n");
  ok("move", "--keep", "3", "--log", "11");
  const a = p.read("docs/status-log.md");
  assert.match(a, /^# STATUS log archive\n\n<!-- Entries moved from STATUS.md. -->\n\n### 2026-10-19: entry 12\n[\s\S]*### 2026-09-01: very old\n- Did: x\n\n## Now blocks moved on/);
  assert.doesNotMatch(a, /Yesterday's block/, "--keep 3 keeps every Now block");
  assert.match(p.read("STATUS.md"), /- \*\*Blocked on:\*\* nothing\.\n\n## Log/);
});

test("a template-style Now keeps all its lines with --keep, and Windows line endings stay", () => {
  p = project();
  const crlf = "# STATUS\r\n\r\n## Now\r\n- Focus: setup\r\n- Next step: fill AGENTS.md\r\n- Blocked on: nothing\r\n\r\n## Log\r\n### 2026-10-31: init\r\n- Did: x\r\n";
  p.write("STATUS.md", crlf);
  assert.equal(ok("move", "--keep", "3").moved, false);
  assert.equal(p.read("STATUS.md"), crlf);
  p.write("STATUS.md", crlf.replace("## Log", "## Old notes\r\n- y\r\n\r\n## Log"));
  ok("move", "--keep", "3");
  assert.equal(p.read("STATUS.md"), crlf.replace("- Blocked on: nothing\r\n\r\n## Log", "- Blocked on: nothing\r\n\r\n## Log"));
  assert.match(p.read("docs/status-log.md"), /\r\n## Old notes\r\n- y\r\n$/);
});

test("move needs --keep, and a STATUS.md without ## Now is refused", () => {
  p = project();
  p.write("STATUS.md", STATUS);
  assert.match(trim("move").stderr, /--keep <n>/);
  p.write("STATUS.md", "# STATUS\n\n## Log\n");
  assert.match(trim("plan").stderr, /no ## Now section/);
});
