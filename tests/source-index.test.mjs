// Source registry (.mflow/sources.json) and project config: a broken file must stop the script with a
// clear message and stay byte for byte as it was, never be read as "no data yet" and overwritten.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { project, run } from "./helpers.mjs";

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

test("a broken sources.json is never overwritten (T03)", { todo: "F01" }, () => {
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

test("an unknown --status is refused and nothing is written", { todo: "F01" }, () => {
  p = project();
  p.write("docs/source/tor.md", "# TOR\n");
  const marked = run(p, "source-index.mjs", ["mark", "docs/source/tor.md", "--status", "actve"]);
  assert.notEqual(marked.status, 0);
  assert.equal(p.exists(".mflow/sources.json"), false);
});

test("a file outside the project cannot be marked", { todo: "F01" }, () => {
  p = project();
  p.write("../outside.md", "# outside\n");
  const marked = run(p, "source-index.mjs", ["mark", "../outside.md"]);
  assert.notEqual(marked.status, 0);
  assert.equal(p.exists(".mflow/sources.json"), false);
});

test("a broken config.json stops the script instead of falling back to defaults", { todo: "F01" }, () => {
  p = project();
  p.write(".mflow/config.json", '{ "sourceDir": "docs/customer", }');
  p.write("docs/source/tor.md", "# TOR\n");
  const scan = run(p, "source-index.mjs", ["scan"]);
  assert.notEqual(scan.status, 0);
  assert.match(scan.stderr, /config\.json/);
});

test("a config.json saved with a UTF-8 BOM is read", { todo: "F01" }, () => {
  p = project();
  p.write(".mflow/config.json", BOM + '{ "version": 1, "sourceDir": "docs/customer" }');
  p.write("docs/customer/tor.md", "# TOR\n");
  const scan = run(p, "source-index.mjs", ["scan"]);
  assert.equal(scan.status, 0, scan.stderr);
  assert.equal(scan.json.sourceDir, "docs/customer");
  assert.deepEqual(scan.json.new, ["docs/customer/tor.md"]);
});

test("the briefing names a broken sources.json instead of listing every source as new", { todo: "F01" }, () => {
  p = project();
  p.write("docs/source/tor.md", "# TOR\n");
  p.write(".mflow/sources.json", "{broken");
  const r = run(p, "session-start.mjs", [], { input: { session_id: "t-brief", cwd: p.root, source: "startup" } });
  assert.equal(r.status, 0, r.stderr);
  const context = r.json.hookSpecificOutput.additionalContext;
  assert.match(context, /sources\.json/);
  assert.doesNotMatch(context, /new source doc\(s\) not processed/);
});
