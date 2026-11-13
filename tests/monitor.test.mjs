// /mflow:monitor shows every piece of work in a project on one page: the features of the story map with their
// discussion documents, the documents, the branches against main, the merges, the changes, the rows waiting for test
// and review, and what waits for the user. It reads only: the tree, the index and every file stay as they were, and
// its one file, the page, sits inside .git. Asked for on 2026-11-09 (factory proposal §11, phase 1 of §10); the way
// to call it (a command writing an HTML page and opening it) chosen on 2026-11-13.
// Synthetic projects only; NIGHT_NOW stands in for the clock.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { git, hasGit, project, run } from "./helpers.mjs";
import { featureRefs, opener, storyMap } from "../plugins/mflow/scripts/monitor.mjs";

const needsGit = { skip: !hasGit && "git not installed" };
const PLUGIN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "plugins", "mflow");
const NOW = { NIGHT_NOW: "2026-11-13T07:00:00.000Z", CLAUDE_CODE_REMOTE: "" };
const DIR = "docs/decisions/discuss";

let p;
afterEach(() => p?.cleanup());

/** A commit dated `date` (author and committer), with these files written first. */
function commitAt(date, msg, files = {}) {
  for (const [rel, text] of Object.entries(files)) p.write(rel, text);
  git(p, "add", "-A");
  const r = spawnSync("git", ["-c", "user.name=mflow-test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", msg], {
    cwd: p.root, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: p.base, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  assert.equal(r.status, 0, r.stderr);
}
const doc = (id, slug, status, extra = "") => ({
  [`${DIR}/${id}-${slug}.md`]: `---\nid: ${id}\nslug: ${slug}\ntitle: ${slug} title\nstatus: ${status}\nrevision: 1\n${extra}---\n# x\n`,
});
const VISION = `# demo: vision

## Scope (story map, top level)
<!-- 9. a comment is not a feature -->
**P1: platform**
1. Tenants and roles
2. Packages (\`${DIR}/02-packages.md\`)

── first release ──

**P2: transport** (old system: doc 03)
3. Jobs
3a. Job stops

**Add-ons** (by package, no phase yet): payroll, stock

## Out of scope (this release)
- 4. not a feature either
`;

test("the story map gives phases, ids with their phase, the release line and an add-on line of its own", () => {
  const m = storyMap(VISION, DIR);
  assert.equal(m.problem, null);
  assert.deepEqual(m.phases.map((ph) => [ph.title, ph.code, ph.steps.map((s) => s.key)]), [
    ["P1: platform", "P1", ["P1-1", "P1-2"]],
    ["P2: transport (old system: doc 03)", "P2", ["P2-3", "P2-3a"]],
    ["Add-ons", "", ["Add-ons"]],
  ]);
  const steps = m.phases.flatMap((ph) => ph.steps);
  assert.deepEqual(steps.find((s) => s.key === "P1-2").cites, ["02"]);
  assert.deepEqual(steps.filter((s) => s.release).map((s) => s.key), ["P1-2"]);
});

test("a story map that cannot be read says why instead of guessing", () => {
  assert.match(storyMap(null, DIR).problem, /no docs\/vision\.md/);
  assert.match(storyMap("# v\n\n## Users\n1. x\n", DIR).problem, /no ## Scope/);
  assert.match(storyMap("## Scope (story map, top level)\n<!-- Mark the first release line. -->\n1. TODO\n\n## Out of scope\n", DIR).problem, /template/);
  assert.match(storyMap("## Scope\nprose only\n", DIR).problem, /no numbered line/);
});

test("feature: in a discussion's frontmatter names features as one value, a list or comma-separated", () => {
  assert.deepEqual(featureRefs("---\nfeature: P1-6a\n---\n"), ["P1-6a"]);
  assert.deepEqual(featureRefs("---\nfeature: [6a, \"6b\"]\n---\n"), ["6a", "6b"]);
  assert.deepEqual(featureRefs("---\nfeature:\n  - P1-1\n  - 2\ntitle: x\n---\n"), ["P1-1", "2"]);
  assert.deepEqual(featureRefs("---\nfeature: 1, 2\n---\n"), ["1", "2"]);
  assert.deepEqual(featureRefs("---\ntitle: x\n---\n"), []);
});

/** A project on main with a story map, discussions, a built change, branches, a waiting row, a CR and STATUS. */
function fixture() {
  p = project();
  git(p, "init", "-q", "-b", "main");
  commitAt("2026-10-01T10:00:00Z", "first", {
    "docs/vision.md": VISION,
    ...doc("01", "tenants", "approved", "feature: P1-1\n"),
    ...doc("02", "packages", "draft"),
    ...doc("03", "jobs", "approved", "feature: [3, P9-9]\n"),
    [`${DIR}/AGENDA.md`]: "# Agenda\n\n| # | หัวข้อ (`slug`) | ทำไมควรคุย | ควรคุยก่อน | สถานะ |\n|---|---|---|---|---|\n| 1 | Uploads (`file-upload`) | x | | ยังไม่เริ่ม |\n",
    "openspec/changes/archive/2026-10-02-jobs/proposal.md": `Built from \`${DIR}/03-jobs.md\`.\n`,
    "openspec/changes/archive/2026-10-02-jobs/tasks.md": "- [x] 1\n",
    "openspec/changes/tenants/proposal.md": `From \`${DIR}/01-tenants.md\`.\n`,
    "openspec/changes/tenants/tasks.md": "- [x] 1\n- [ ] 2\n",
    "docs/reviews/pending.md": "# Waiting\n\n| Change | Branch | Applied | Review level | Test | Review | E2E screens |\n|---|---|---|---|---|---|---|\n| jobs | main | 2026-10-02 | full | — | — | — |\n",
    "docs/reviews/change-requests/CR-001-exports.md": "# CR-001 Exports\n\nApproved:\n",
    "docs/decisions/hotspots/billing/map.md": "# billing\n",
    "STATUS.md": "# Status\n\n## Now\n- Waiting for the user: answer D2 of `02-packages`\n- Blocked on: none\n- Next step: chart hotspot billing\n\n## Log\n",
    "src/app.txt": "1\n",
  });
  git(p, "branch", "chore/merged");
  git(p, "switch", "-q", "-c", "chore/old");
  commitAt("2026-10-05T10:00:00Z", "old work", { "src/old.txt": "x\n" });
  git(p, "switch", "-q", "-c", "change/tenants", "main");
  commitAt("2026-11-12T10:00:00Z", "new work", { "src/new.txt": "x\n" });
  git(p, "switch", "-q", "main");
}

const monitor = (args = [], env = {}) => run(p, "monitor.mjs", args, { env: { ...NOW, ...env } });
const tracked = () => Object.fromEntries(git(p, "ls-files").split("\n").filter(Boolean).map((f) => [f, p.read(f)]));
/** `git status` that leaves the index alone, so the check itself writes nothing. */
const statusNoLock = () => spawnSync("git", ["status", "--porcelain"], { cwd: p.root, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }).stdout;

test("the page goes inside .git, and the tree, the index and every file stay as they were", needsGit, () => {
  fixture();
  // Same bytes, a new mtime: a plain `git status` would refresh the index here and write it.
  p.write("src/app.txt", "1\n");
  const future = new Date(Date.now() + 60_000);
  fs.utimesSync(p.file("src/app.txt"), future, future);
  const before = { index: fs.readFileSync(p.file(".git/index")), status: statusNoLock(), files: tracked() };
  // Locks allowed from outside, so only the script's own setting keeps the index as it was.
  const r = monitor([], { GIT_OPTIONAL_LOCKS: "1" });
  assert.equal(r.status, 0, r.stdout);
  assert.equal(path.resolve(r.json.file), path.resolve(p.file(".git/mflow/monitor.html")));
  assert.equal(r.json.opened, false);
  assert.ok(fs.readFileSync(p.file(".git/mflow/monitor.html"), "utf8").startsWith("<!doctype html>"));
  assert.ok(fs.readFileSync(p.file(".git/index")).equals(before.index), "the index is not rewritten");
  assert.equal(statusNoLock(), before.status);
  assert.deepEqual(tracked(), before.files);
});

test("features take the documents that name them, else the ones their line cites, marked as an estimate", needsGit, () => {
  fixture();
  const [proj] = monitor(["--json"]).json.projects;
  const f = Object.fromEntries(proj.storyMap.phases.flatMap((ph) => ph.features).map((x) => [x.key, x]));
  assert.deepEqual([f["P1-1"].docs, f["P1-1"].how, f["P1-1"].state], [["01"], "feature", "building"]);
  assert.deepEqual([f["P1-2"].docs, f["P1-2"].how, f["P1-2"].state], [["02"], "cited", "draft"]);
  assert.deepEqual([f["P2-3"].docs, f["P2-3"].how, f["P2-3"].state], [["03"], "feature", "built"]);
  assert.deepEqual([f["P2-3a"].docs, f["P2-3a"].state], [[], "no-doc"]);
  assert.deepEqual(proj.docs.find((d) => d.id === "03").unknownFeatures, ["P9-9"]);
  assert.deepEqual(proj.counts.docs, { approved: 2, draft: 1 });
  assert.deepEqual(proj.changes, [{ name: "tenants", done: 1, total: 2 }]);
});

test("branches are grouped by ahead/behind against main, and what waits for the user comes most urgent first", needsGit, () => {
  fixture();
  const [proj] = monitor(["--json"]).json.projects;
  assert.deepEqual(proj.branches.map((b) => [b.name, b.group, b.ahead, b.behind]), [
    ["change/tenants", "open", 1, 0],
    ["chore/old", "stale", 1, 0],
    ["chore/merged", "merged", 0, 0],
  ]);
  assert.deepEqual(proj.waiting.map((w) => w.kind), ["status", "discuss", "discuss", "pending", "cr", "branch", "hotspot", "feature", "agenda"]);
  assert.match(proj.waiting[0].text, /answer D2/);
  assert.ok(!proj.waiting.some((w) => w.kind === "blocked"), "Blocked on: none is not a wait");
  assert.match(proj.waiting.find((w) => w.kind === "feature").text, /P2-3a, Add-ons/);
});

test("off main with uncommitted work, the list says so, since /mflow:apply-all starts only from a clean main", needsGit, () => {
  fixture();
  git(p, "switch", "-q", "change/tenants");
  p.write("notes.txt", "draft\n");
  const [proj] = monitor(["--json"]).json.projects;
  assert.deepEqual(proj.waiting.filter((w) => w.kind === "checkout").map((w) => w.text), [
    "checkout อยู่บน change/tenants ไม่ใช่ main (/mflow:apply-all เริ่มได้จาก main เท่านั้น)",
    "มีไฟล์ที่ยังไม่ commit 1 รายการ",
  ]);
  assert.ok(!fs.existsSync(p.file(".git/mflow/monitor.html")), "--json writes no page");
});

test("text from the project's files is escaped on the page", needsGit, () => {
  fixture();
  commitAt("2026-11-12T11:00:00Z", "odd title", { [`${DIR}/04-odd.md`]: "---\nid: 04\nslug: odd\ntitle: <script>alert(1)</script>\nstatus: draft\nrevision: 1\n---\n" });
  const r = monitor(["--out", path.join(p.base, "page.html")]);
  assert.equal(r.status, 0, r.stdout);
  const html = fs.readFileSync(path.join(p.base, "page.html"), "utf8");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(!/<script|<link|https?:\/\//i.test(html), "no script, stylesheet or network address");
  assert.ok(!fs.existsSync(p.file(".git/mflow/monitor.html")), "--out writes only there");
});

test("the page opens with no shell: a path with & or ^ is one argument, never a command (0.46.1)", () => {
  const file = "D:\\R&D ^x\\proj\\.git\\mflow\\monitor.html";
  assert.deepEqual(opener(file, "win32"), ["explorer.exe", [file]]);
  assert.deepEqual(opener(file, "darwin"), ["open", [file]]);
  assert.deepEqual(opener(file, "linux"), ["xdg-open", [file]]);
  const source = fs.readFileSync(path.join(PLUGIN, "scripts", "monitor.mjs"), "utf8");
  assert.ok(!/["']cmd(\.exe)?["']|shell:\s*true/.test(source), "no cmd.exe and no shell option");
});

test("outside an mflow project it refuses and says why", () => {
  p = project();
  fs.rmSync(p.file(".mflow"), { recursive: true });
  const r = run(p, "monitor.mjs", [], { env: NOW });
  assert.equal(r.status, 1);
  assert.match(r.json.error, /not an mflow project/);
});

test("the skill runs the script, opens the page, and reads only", () => {
  const skill = fs.readFileSync(path.join(PLUGIN, "skills", "monitor", "SKILL.md"), "utf8");
  assert.match(skill, /^name: monitor$/m);
  assert.match(skill, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/monitor\.mjs" --open/);
  assert.match(fs.readFileSync(path.join(PLUGIN, "skills", "help", "SKILL.md"), "utf8"), /\/mflow:monitor/);
});
