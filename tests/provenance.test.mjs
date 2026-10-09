// Work handed between tools and sessions names the snapshot it came from: golden data its source file
// and hash, a brief and its report the commit they read, so stale results are caught instead of trusted.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { git, hasGit, project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());
const needsGit = { skip: !hasGit && "git not installed" };

const hashOf = (file) => {
  const r = run(p, "source-index.mjs", ["hash", file]);
  assert.equal(r.status, 0, r.stderr);
  return r.json.files[0].hash;
};

test("hash gives the same value the registry records", () => {
  p = project();
  p.write("docs/source/fees.xlsx", "fees v1");
  run(p, "source-index.mjs", ["mark", "docs/source/fees.xlsx"]);
  const recorded = JSON.parse(p.read(".mflow/sources.json")).files["docs/source/fees.xlsx"].hash;
  assert.equal(hashOf("docs/source/fees.xlsx"), recorded);
});

/** A repo with one committed source file and a report that read it at that commit. */
function reported() {
  p = project();
  p.write("src/Fee.cs", "class Fee { }\n");
  p.write("src/Other.cs", "class Other { }\n");
  git(p, "init", "-q");
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "base");
  const base = git(p, "rev-parse", "HEAD").trim();
  p.write("docs/ai/inbox/r.md", `---\nstatus: new\nfrom: codex\nmode: review\nbrief: b\nbase: ${base}\n---\n# r\n\n## Understanding\nok\n\n## Files read\n- \`src/Fee.cs\` (partial)\n- src/Other.cs:1-3\n\n## Findings\n- F1 src/Fee.cs:1\n`);
  return base;
}
const normalize = () => {
  const r = run(p, "inbox-normalize.mjs", [p.file("docs/ai/inbox/r.md")]);
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};

test("files the report read that changed since its base are listed", needsGit, () => {
  const base = reported();
  assert.deepEqual(normalize().stale, { base, filesRead: 2, changedSince: [] });
  p.write("src/Fee.cs", "class Fee { decimal Rate; }\n");
  assert.deepEqual(normalize().stale.changedSince, ["src/Fee.cs"]);
  git(p, "commit", "-q", "-am", "later");
  assert.deepEqual(normalize().stale.changedSince, ["src/Fee.cs"], "a committed change counts too");
});

test("a base this repository does not have is said, not guessed", needsGit, () => {
  reported();
  p.write("docs/ai/inbox/r.md", p.read("docs/ai/inbox/r.md").replace(/base: [0-9a-f]+/, "base: 0123456789abcdef0123456789abcdef01234567"));
  const stale = normalize().stale;
  assert.equal(stale.changedSince, null);
  assert.match(stale.note, /not in this repository/);
});

test("a report with no base has no staleness to report", () => {
  p = project();
  p.write("docs/ai/inbox/r.md", "---\nstatus: new\n---\n# r\n");
  assert.equal(normalize().stale, null);
});

test("the context pack names the commit it was read at", needsGit, () => {
  p = project();
  p.write("docs/vision.md", "# Vision\n");
  git(p, "init", "-q");
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "base");
  const head = git(p, "rev-parse", "HEAD").trim();
  const r = run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "docs"]);
  assert.equal(r.json.base, head);
  assert.equal(r.json.dirty, false);
  assert.match(p.read(".mflow/briefs/x.pack.md"), new RegExp(`Snapshot: commit ${head}\\.`));
  p.write("docs/vision.md", "# Vision, edited\n");
  const edited = run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "docs"]);
  assert.equal(edited.json.dirty, true);
  assert.match(p.read(".mflow/briefs/x.pack.md"), /with uncommitted changes/);
});

test("outside git, the context pack says so", () => {
  p = project();
  p.write("docs/vision.md", "# Vision\n");
  const r = run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "docs"]);
  assert.equal(r.json.base, null);
  assert.match(p.read(".mflow/briefs/x.pack.md"), /Snapshot: not a git repository/);
});

test("doctor warns when golden data was made from an older version of its source", () => {
  p = project();
  p.write("docs/source/fees.xlsx", "fees v1");
  const golden = "tests/Billing.Domain.Tests/Golden/fee.source.json";
  p.write(golden, JSON.stringify({ source: "docs/source/fees.xlsx", sourceHash: hashOf("docs/source/fees.xlsx"), sheet: "Fees", range: "A2:F40" }));
  const check = () => run(p, "doctor.mjs").json.checks.find((c) => c.id === "golden");
  assert.equal(check().status, "ok");
  p.write("docs/source/fees.xlsx", "fees v2");
  const stale = check();
  assert.equal(stale.status, "warn");
  assert.match(stale.fix, /\/mflow:golden @docs\/source\/fees\.xlsx fee/);
});
