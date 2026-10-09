// Source registry (.mflow/sources.json) and project config: a broken file must stop the script with a
// clear message and stay byte for byte as it was, never be read as "no data yet" and overwritten.
import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, test } from "node:test";
import { project, run, runAsync } from "./helpers.mjs";

const BOM = String.fromCharCode(0xfeff); // what Windows Notepad puts before UTF-8 text
let p;
afterEach(() => p?.cleanup());

test("mark records a new source and scan then sees it unchanged", () => {
  p = project();
  p.write("docs/source/tor.md", "# TOR\n");
  const marked = run(p, "source-index.mjs", ["mark", "docs/source/tor.md", "--status", "reference", "--used-by", "hs-fee"]);
  assert.equal(marked.status, 0, marked.stderr);
  const db = JSON.parse(p.read(".mflow/sources.json"));
  assert.equal(db.files["docs/source/tor.md"].status, "reference");
  assert.deepEqual(db.files["docs/source/tor.md"].usedBy, ["hs-fee"]);
  assert.match(p.read("docs/source/INDEX.md"), /docs\/source\/tor\.md/);

  const scan = run(p, "source-index.mjs", ["scan"]);
  assert.equal(scan.status, 0, scan.stderr);
  assert.deepEqual(scan.json.new, []);
  assert.equal(scan.json.unchanged.length, 1);
});

test("scan reports an edited source as changed", () => {
  p = project();
  p.write("docs/source/tor.md", "# TOR\n");
  run(p, "source-index.mjs", ["mark", "docs/source/tor.md"]);
  p.write("docs/source/tor.md", "# TOR v2\n");
  const scan = run(p, "source-index.mjs", ["scan"]);
  assert.deepEqual(scan.json.changed.map((c) => c.file), ["docs/source/tor.md"]);
});

test("a broken sources.json is never overwritten (T03)", () => {
  p = project();
  p.write("docs/source/new.md", "# new\n");
  const broken = "{broken";
  p.write(".mflow/sources.json", broken);
  const marked = run(p, "source-index.mjs", ["mark", "docs/source/new.md"]);
  assert.notEqual(marked.status, 0);
  assert.match(marked.stderr, /sources\.json/);
  assert.equal(p.read(".mflow/sources.json"), broken);
  const scan = run(p, "source-index.mjs", ["scan"]);
  assert.notEqual(scan.status, 0, "scan must not report every file as new");
});

test("an unknown --status is refused and nothing is written", () => {
  p = project();
  p.write("docs/source/tor.md", "# TOR\n");
  const marked = run(p, "source-index.mjs", ["mark", "docs/source/tor.md", "--status", "actve"]);
  assert.notEqual(marked.status, 0);
  assert.equal(p.exists(".mflow/sources.json"), false);
});

test("a file outside the project cannot be marked", () => {
  p = project();
  p.write("../outside.md", "# outside\n");
  const marked = run(p, "source-index.mjs", ["mark", "../outside.md"]);
  assert.notEqual(marked.status, 0);
  assert.equal(p.exists(".mflow/sources.json"), false);
});

test("a broken config.json stops the script instead of falling back to defaults", () => {
  p = project();
  p.write(".mflow/config.json", '{ "sourceDir": "docs/customer", }');
  p.write("docs/source/tor.md", "# TOR\n");
  const scan = run(p, "source-index.mjs", ["scan"]);
  assert.notEqual(scan.status, 0);
  assert.match(scan.stderr, /config\.json/);
});

test("a config.json saved with a UTF-8 BOM is read", () => {
  p = project();
  p.write(".mflow/config.json", BOM + '{ "version": 1, "sourceDir": "docs/customer" }');
  p.write("docs/customer/tor.md", "# TOR\n");
  const scan = run(p, "source-index.mjs", ["scan"]);
  assert.equal(scan.status, 0, scan.stderr);
  assert.equal(scan.json.sourceDir, "docs/customer");
  assert.deepEqual(scan.json.new, ["docs/customer/tor.md"]);
});

test("the briefing names a broken sources.json instead of listing every source as new", () => {
  p = project();
  p.write("docs/source/tor.md", "# TOR\n");
  p.write(".mflow/sources.json", "{broken");
  const r = run(p, "session-start.mjs", [], { input: { session_id: "t-brief", cwd: p.root, source: "startup" } });
  assert.equal(r.status, 0, r.stderr);
  const context = r.json.hookSpecificOutput.additionalContext;
  assert.match(context, /sources\.json/);
  assert.doesNotMatch(context, /new source doc\(s\) not processed/);
});

test("a healthy briefing lists new sources, draft discussions and the ritual", () => {
  p = project();
  p.write("STATUS.md", "# Status\n\n## Now\n- focus\n\n## Log\n\n### 2026-10-01\n- Did: x\n");
  p.write("docs/source/tor.md", "# TOR\n");
  p.write("docs/decisions/discuss/01-roles.md", "---\nid: 01\nslug: roles\nstatus: draft\nrevision: 1\n---\n\n### D1: ใคร\n- **เลือก:**\n");
  p.write("docs/decisions/hotspots/fee/map.md", "---\nstatus: active\ndestination: FeeCalculator\n---\n");
  const r = run(p, "session-start.mjs", [], { input: { session_id: "t-ok", cwd: p.root, source: "startup" } });
  assert.equal(r.status, 0, r.stderr);
  const context = r.json.hookSpecificOutput.additionalContext;
  assert.doesNotMatch(context, /config unreadable|registry unreadable/);
  assert.match(context, /- focus/);
  assert.match(context, /### 2026-10-01/);
  assert.match(context, /fee: FeeCalculator/);
  assert.match(context, /1 new source doc\(s\) not processed: docs\/source\/tor\.md/);
  assert.match(context, /01-roles \(rev 1, \d+ open item\(s\)\)/);
  assert.match(context, /## Session ritual/);
});

test("sessions marking at the same time keep every entry", async () => {
  p = project();
  const names = ["a", "b", "c", "d", "e", "f"];
  for (const n of names) p.write(`docs/source/${n}.md`, `# ${n}\n`);
  const results = await Promise.all(names.map((n) => runAsync(p, "source-index.mjs", ["mark", `docs/source/${n}.md`])));
  for (const r of results) assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(Object.keys(JSON.parse(p.read(".mflow/sources.json")).files).sort(), names.map((n) => `docs/source/${n}.md`));
  assert.equal(p.exists(".mflow/sources.json.lock"), false);
});

test("a lock left by a process that died is taken over", () => {
  p = project();
  p.write("docs/source/tor.md", "# TOR\n");
  const lock = p.write(".mflow/sources.json.lock", "");
  const old = new Date(Date.now() - 3_600_000);
  fs.utimesSync(lock, old, old);
  const marked = run(p, "source-index.mjs", ["mark", "docs/source/tor.md"]);
  assert.equal(marked.status, 0, marked.stderr);
  assert.equal(p.exists(".mflow/sources.json.lock"), false);
});

test("a registry entry with an unknown status is refused, not rewritten", () => {
  p = project();
  p.write("docs/source/tor.md", "# TOR\n");
  const odd = JSON.stringify({ version: 1, files: { "docs/source/tor.md": { status: "archived", usedBy: [] } } });
  p.write(".mflow/sources.json", odd);
  const marked = run(p, "source-index.mjs", ["mark", "docs/source/tor.md"]);
  assert.notEqual(marked.status, 0);
  assert.match(marked.stderr, /status "archived"/);
  assert.equal(p.read(".mflow/sources.json"), odd);
});

test("an option without a value is refused", () => {
  p = project();
  p.write("docs/source/tor.md", "# TOR\n");
  const marked = run(p, "source-index.mjs", ["mark", "docs/source/tor.md", "--title"]);
  assert.notEqual(marked.status, 0);
  assert.equal(p.exists(".mflow/sources.json"), false);
});

test("a broken config.json: the briefing says so, the Stop hook stays quiet, delegate-cmd stops", () => {
  p = project();
  p.write(".mflow/config.json", "<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> theirs\n");
  p.write("STATUS.md", "# Status\n\n## Now\n- focus\n");
  const r = run(p, "session-start.mjs", [], { input: { session_id: "t-cfg", cwd: p.root, source: "startup" } });
  assert.equal(r.status, 0, r.stderr);
  const context = r.json.hookSpecificOutput.additionalContext;
  assert.match(context, /mflow config unreadable/);
  assert.match(context, /merge conflict markers/);
  assert.match(context, /- focus/);
  const stop = run(p, "stop-guard.mjs", [], { input: { session_id: "t-cfg", cwd: p.root } });
  assert.equal(stop.status, 0);
  assert.equal(stop.stdout, "");
  const cmd = run(p, "delegate-cmd.mjs", ["--mode", "analyze", "--tool", "codex", "--brief", "b.md", "--out", "r.md"]);
  assert.equal(cmd.status, 1);
  assert.match(cmd.stderr, /config\.json/);
});

test("a config setting of the wrong type is named", () => {
  p = project({ sourceDir: 5 });
  const scan = run(p, "source-index.mjs", ["scan"]);
  assert.notEqual(scan.status, 0);
  assert.match(scan.stderr, /"sourceDir" must be a folder path/);
});
