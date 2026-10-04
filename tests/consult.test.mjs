// Consultations (/mflow:analyze, /mflow:design, /mflow:challenge): optional rounds of other AI tools.
// Their state is read from disk, a rerun does not open a second session, and the briefing shows them
// apart from the main work, which never waits for them.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const consult = (...args) => {
  const r = run(p, "consult.mjs", args);
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};
const fails = (...args) => {
  const r = run(p, "consult.mjs", args);
  assert.equal(r.status, 1, r.stdout);
  return r.stderr;
};
const report = (name, front = "status: new\nfrom: codex") => p.write(`docs/ai-inbox/${name}`, `---\n${front}\n---\n# report\n`);
const briefing = () => run(p, "session-start.mjs", [], { input: { session_id: "t-consult", cwd: p.root, source: "startup" } }).json.hookSpecificOutput.additionalContext;

test("a new analysis gets an id, a snapshot and the paths for its brief, reports and summary", () => {
  p = project();
  const s = consult("new", "analyze", "--scope", "ระบบรับงานและจัดรถ", "--to", "codex,gemini", "--focus", "workflow,data");
  assert.equal(s.created, true);
  assert.equal(s.id, "AN-001");
  assert.equal(s.state, "prepared");
  assert.deepEqual(s.focus, ["workflow", "data"]);
  assert.equal(s.brief, ".mflow/briefs/AN-001-r1.md");
  assert.equal(s.out, "docs/ai-inbox/AN-001-r1-{tool}.md");
  assert.equal(s.summary, "docs/analysis/AN-001/summary.md");
  assert.deepEqual(JSON.parse(p.read(".mflow/consultations/AN-001/session.json")).participants, ["codex", "gemini"]);
});

test("the same intent and scope while open returns that session; --again or another intent opens a new one", () => {
  p = project();
  consult("new", "analyze", "--scope", "system");
  const again = consult("new", "analyze", "--scope", "  System ");
  assert.equal(again.existing, true);
  assert.equal(again.id, "AN-001");
  assert.equal(consult("new", "analyze", "--scope", "system", "--again").id, "AN-002");
  const design = consult("new", "design", "--scope", "system");
  assert.equal(design.id, "DS-001");
  assert.equal(design.summary, "docs/design/DS-001/proposal.md");
});

test("state follows the files: brief written, reports in, partial, summarized", () => {
  p = project();
  consult("new", "analyze", "--scope", "system", "--to", "codex,gemini");
  p.write(".mflow/briefs/AN-001-r1.md", "# brief\n");
  assert.equal(consult("status", "AN-001").state, "awaiting-reports");
  report("AN-001-r1-codex.md");
  let s = consult("status", "AN-001");
  assert.equal(s.state, "assessing");
  assert.equal(s.completeness, "partial");
  assert.deepEqual(s.missing, ["gemini"]);
  assert.match(s.next, /partial: gemini not in yet/);
  p.write("docs/analysis/AN-001/summary.md", "---\nid: AN-001\nrevision: 1\nreports: docs/ai-inbox/AN-001-r1-codex.md\n---\n# summary\n");
  s = consult("status", "AN-001");
  assert.equal(s.state, "summarized");
  assert.equal(s.summaryRevision, 1);
  report("2026-10-05-gemini-late.md", "status: new\nfrom: gemini\nbrief: AN-001-r1");
  s = consult("status", "AN-001");
  assert.equal(s.state, "assessing", "a late report reopens the summary");
  assert.equal(s.completeness, "complete");
});

test("a second round needs a report first and names the disputed findings", () => {
  p = project();
  consult("new", "design", "--scope", "multi-company permissions", "--to", "codex");
  assert.match(fails("round", "DS-001", "--issues", "F3"), /no report for round 1/);
  report("DS-001-r1-codex.md");
  assert.match(fails("round", "DS-001"), /--issues/);
  const s = consult("round", "DS-001", "--issues", "F3, C2");
  assert.equal(s.round, 2);
  assert.equal(s.brief, ".mflow/briefs/DS-001-r2.md");
  assert.deepEqual(JSON.parse(p.read(".mflow/consultations/DS-001/session.json")).rounds[1].issues, ["F3", "C2"]);
});

test("a challenge pins its target, and an edited target is reported stale", () => {
  p = project();
  assert.match(fails("new", "challenge", "--scope", "x"), /--target/);
  p.write("docs/design/DS-001/proposal.md", "# proposal v1\n");
  const s = consult("new", "challenge", "--target", "@docs/design/DS-001/proposal.md");
  assert.equal(s.id, "CH-001");
  assert.equal(s.scope, "docs/design/DS-001/proposal.md");
  assert.match(s.snapshot.target.hash, /^[0-9a-f]{16}$/);
  assert.deepEqual(s.stale.changed, []);
  p.write("docs/design/DS-001/proposal.md", "# proposal v2\n");
  assert.deepEqual(consult("status", "CH-001").stale.changed, ["docs/design/DS-001/proposal.md"]);
});

test("a design started from an analysis summary pins it, and sees it change", () => {
  p = project();
  p.write("docs/analysis/AN-001/summary.md", "---\nid: AN-001\n---\n# summary v1\n");
  const s = consult("new", "design", "--scope", "data model for jobs and costs", "--from", "@docs/analysis/AN-001/summary.md");
  assert.equal(s.snapshot.from.path, "docs/analysis/AN-001/summary.md");
  p.write("docs/analysis/AN-001/summary.md", "---\nid: AN-001\nrevision: 2\n---\n# summary v2\n");
  assert.deepEqual(consult("status", "DS-001").stale.changed, ["docs/analysis/AN-001/summary.md"]);
});

test("files outside the project or missing are refused", () => {
  p = project();
  p.write("../outside.md", "x\n");
  assert.match(fails("new", "challenge", "--target", "../outside.md"), /outside the project/);
  assert.match(fails("new", "design", "--scope", "x", "--from", "docs/none.md"), /not found/);
  assert.match(fails("status", "AN-999"), /no consultation AN-999/);
});

test("the briefing shows an open consultation apart from the waiting work, and nothing once it is summarized", () => {
  p = project();
  p.write("STATUS.md", "# Status\n\n## Now\n- focus\n");
  assert.doesNotMatch(briefing(), /Consultations/, "a project that never consulted sees nothing");
  consult("new", "analyze", "--scope", "system", "--to", "codex,gemini");
  report("AN-001-r1-codex.md");
  report("2026-10-04-codex-other.md");
  let context = briefing();
  assert.match(context, /## Consultations \(optional; the main work does not wait for them\)/);
  assert.match(context, /AN-001 analyze "system": round 1, 1\/2 report\(s\), assessing → \/mflow:analyze AN-001/);
  assert.match(context, /1 AI-inbox item\(s\) not assessed: 2026-10-04-codex-other\.md/, "the consultation report is not waiting work");
  p.write("docs/analysis/AN-001/summary.md", "---\nreports: docs/ai-inbox/AN-001-r1-codex.md\n---\n");
  context = briefing();
  assert.doesNotMatch(context, /## Consultations/);
});
