// Text versions of binary sources (.mflow/cache): one per file and version, so a consult never hands
// other tools the text of an older version, and two files with one name never share a cache.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { git, hasGit, project, run } from "./helpers.mjs";

const needsGit = { skip: !hasGit && "git not installed" };

let p;
afterEach(() => p?.cleanup());

const cache = (...files) => {
  const r = run(p, "source-index.mjs", ["cache", ...files]);
  assert.equal(r.status, 0, r.stderr);
  return r.json.files;
};

test("files with one name in different folders, or of different types, get different caches", () => {
  p = project();
  p.write("docs/source/v1/tor.docx", "one");
  p.write("docs/source/v2/tor.docx", "two");
  p.write("docs/source/v2/tor.pdf", "three");
  const paths = cache("docs/source/v1/tor.docx", "docs/source/v2/tor.docx", "docs/source/v2/tor.pdf").map((f) => f.cache);
  assert.equal(new Set(paths).size, 3);
  assert.match(paths[0], /^\.mflow\/cache\/docs\/source\/v1\/tor\.docx\.[0-9a-f]{16}\.md$/);
});

test("an edited source gets a new cache path, and the old conversion is deleted", () => {
  p = project();
  p.write("docs/source/fees.xlsx", "version 1");
  const [first] = cache("docs/source/fees.xlsx");
  assert.equal(first.exists, false);
  p.write(first.cache, "# fees v1\n");
  assert.equal(cache("docs/source/fees.xlsx")[0].exists, true);

  p.write("docs/source/fees.xlsx", "version 2");
  const [second] = cache("docs/source/fees.xlsx");
  assert.notEqual(second.cache, first.cache);
  assert.equal(second.exists, false);
  assert.deepEqual(second.removed, [first.cache]);
  assert.equal(p.exists(first.cache), false);
});

test("a cache of a file whose name starts the same is left alone", () => {
  p = project();
  p.write("docs/source/tor.docx", "a");
  p.write("docs/source/tor.docx.old.docx", "b");
  const [other] = cache("docs/source/tor.docx.old.docx");
  p.write(other.cache, "# old\n");
  cache("docs/source/tor.docx");
  assert.equal(p.exists(other.cache), true);
});

test("plain text needs no cache", () => {
  p = project();
  p.write("docs/source/notes.md", "# notes\n");
  assert.equal(cache("docs/source/notes.md")[0].cache, null);
});

test("a file outside the project or missing is refused", () => {
  p = project();
  p.write("../outside.docx", "x");
  assert.notEqual(run(p, "source-index.mjs", ["cache", "../outside.docx"]).status, 0);
  assert.notEqual(run(p, "source-index.mjs", ["cache", "docs/source/none.docx"]).status, 0);
});

// LA-NetSuite 2026-11-20: its customer workbooks (drivers, plates, contacts) sit in a gitignored docs/raw.
// Their text versions must stay out of git too; a tracked source's cache stays committable as before.
const ignored = (rel) => {
  try { git(p, "check-ignore", "-q", "--", rel); return true; } catch { return false; }
};

test("the text version of a source git ignores is ignored too; a tracked source's is not", needsGit, () => {
  p = project();
  git(p, "init", "-q");
  p.write(".gitignore", "docs/raw/\n");
  p.write("docs/raw/[v2] drivers #1.xlsx", "real data");
  p.write("docs/source/tor.docx", "tor");
  const r = run(p, "source-index.mjs", ["cache", "docs/raw/[v2] drivers #1.xlsx", "docs/source/tor.docx"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.gitignored, ".mflow/cache/.gitignore");
  const [raw, tor] = r.json.files;
  assert.equal(raw.sourceIgnored, true);
  assert.equal(tor.sourceIgnored, undefined);
  p.write(raw.cache, "# text\n");
  p.write(tor.cache, "# text\n");
  assert.equal(ignored(raw.cache), true);
  assert.equal(ignored(tor.cache), false);
  // An edited source gets a new hash; the pattern covers it without a second line.
  p.write("docs/raw/[v2] drivers #1.xlsx", "real data, week 2");
  const again = run(p, "source-index.mjs", ["cache", "docs/raw/[v2] drivers #1.xlsx"]);
  assert.equal(again.json.gitignored, undefined);
  p.write(again.json.files[0].cache, "# text\n");
  assert.equal(ignored(again.json.files[0].cache), true);
  assert.equal(p.read(".mflow/cache/.gitignore").split("\n").filter((l) => l.startsWith("/")).length, 1);
});

test("without git, or when no source is ignored, no .gitignore is written", needsGit, () => {
  p = project();
  p.write("docs/source/tor.docx", "tor");
  cache("docs/source/tor.docx");
  assert.equal(p.exists(".mflow/cache/.gitignore"), false);
  git(p, "init", "-q");
  cache("docs/source/tor.docx");
  assert.equal(p.exists(".mflow/cache/.gitignore"), false);
});
