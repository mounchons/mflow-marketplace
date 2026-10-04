// Text versions of binary sources (.mflow/cache): one per file and version, so a consult never hands
// other tools the text of an older version, and two files with one name never share a cache.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { project, run } from "./helpers.mjs";

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
