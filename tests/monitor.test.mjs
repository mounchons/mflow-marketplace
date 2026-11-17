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
import { featureRefs, opener, screenKey, screensOf, storyMap } from "../plugins/mflow/scripts/monitor.mjs";

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

test("an E2E screens cell splits at commas outside parentheses, each screen without its note", () => {
  assert.deepEqual(screensOf("firm/users (new: list, filters, add), /firm/roles (as the second tab), the menu"), ["firm/users", "/firm/roles", "the menu"]);
  assert.deepEqual(screensOf("`Jobs list`; Job detail"), ["Jobs list", "Job detail"]);
  assert.deepEqual(screensOf("—"), []);
  assert.deepEqual(screensOf(""), []);
  assert.equal(screenKey("/Firm/Roles"), screenKey("firm/roles"), "a leading slash and the case do not count");
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

/** The guide as [topic, [kinds]], to compare its order. */
const kinds = (proj) => proj.guide.map((t) => [t.id, t.items.map((i) => i.kind)]);
const item = (proj, kind) => proj.guide.flatMap((t) => t.items).find((i) => i.kind === kind);

test("branches are grouped by ahead/behind against main, and the guide lists what is left by topic, in order, each with its command (0.47)", needsGit, () => {
  fixture();
  const [proj] = monitor(["--json"]).json.projects;
  assert.deepEqual(proj.branches.map((b) => [b.name, b.group, b.ahead, b.behind]), [
    ["change/tenants", "open", 1, 0],
    ["chore/old", "stale", 1, 0],
    ["chore/merged", "merged", 0, 0],
  ]);
  assert.deepEqual(kinds(proj), [
    ["blocked", []],
    ["changes", ["apply", "branch"]],
    ["test", ["pending"]],
    ["review", ["after-test"]],
    ["e2e", []],
    ["decide", ["status", "discuss", "feature-ref", "cr"]],
    ["other", ["branch", "merged", "hotspot", "feature", "agenda"]],
  ]);
  const all = proj.guide.flatMap((t) => t.items);
  assert.deepEqual(all.map((i) => i.n), all.map((_, i) => i + 1), "numbered across topics, in order");
  assert.equal(proj.counts.todo, all.length);
  assert.equal(item(proj, "apply").command, "/opsx:apply tenants");
  assert.equal(item(proj, "branch").command, "/mflow:review change/tenants แล้ว merge");
  assert.equal(item(proj, "pending").command, "/mflow:test");
  assert.match(item(proj, "after-test").command, /^\/mflow:test ก่อน แล้ว \/mflow:review pending$/);
  assert.equal(item(proj, "discuss").command, "/mflow:discuss 02");
  assert.match(item(proj, "status").text, /answer D2/);
  assert.ok(!all.some((i) => i.kind === "blocked"), "Blocked on: none blocks nothing");
  assert.match(item(proj, "feature").text, /P2-3a, Add-ons/);
  assert.equal(item(proj, "merged").command, "git branch -d chore/merged");
});

test("off main with uncommitted work, the guide says so: the files block, the checkout is noted", needsGit, () => {
  fixture();
  git(p, "switch", "-q", "change/tenants");
  p.write("notes.txt", "draft\n");
  const [proj] = monitor(["--json"]).json.projects;
  assert.deepEqual(proj.guide[0].items.map((i) => i.kind), ["dirty"]);
  assert.match(proj.guide[0].items[0].text, /^มีไฟล์ที่ยังไม่ commit 1 รายการ/);
  assert.equal(item(proj, "checkout").command, "git switch main");
  assert.ok(!fs.existsSync(p.file(".git/mflow/monitor.html")), "--json writes no page");
});

const RECORD = (scope, result, commit = "abcdef1") => `Tested: main at ${commit}\nBy: claude\nScope: ${scope}\nResult: ${result}\nDuration: 1m\n`;

test("test, review and E2E: one /mflow:test for the rows HEAD holds, review only after it, changes-requested stays open, screens with no E2E record", needsGit, () => {
  fixture();
  const ticked = "docs/reviews/tests/2026-11-01-abcdef1.md";
  commitAt("2026-11-12T12:00:00Z", "more rows", {
    "openspec/changes/archive/2026-10-03-stops/tasks.md": "- [x] 1\n",
    "openspec/changes/archive/2026-10-04-docs-only/tasks.md": "- [x] 1\n",
    "openspec/changes/archive/2026-10-05-extra/tasks.md": "- [x] 1\n",
    "docs/reviews/pending.md": "# Waiting\n\n| Change | Branch | Applied | Review level | Test | Review | E2E screens |\n|---|---|---|---|---|---|---|\n"
      + `| jobs | main | 2026-10-02 | full | ${ticked} | — | Jobs list, Job detail |\n`
      + `| stops | main | 2026-10-03 | short | ${ticked} | changes-requested docs/reviews/code/2026-11-02-stops.md | — |\n`
      + "| docs-only | main | 2026-10-04 | skip: documents | — | — | — |\n"
      + "| feature-x | change/x | 2026-11-10 | full | — | — | — |\n",
    [ticked]: RECORD("whole suite", "pass"),
    "docs/reviews/tests/2026-11-02-abcdef1.md": RECORD("e2e jobs list", "pass"),
    "docs/ui/screens.md": "# Screens\n\n| Screen | Route | Role(s) | Shows | Actions | Calculations / rules | Status |\n|---|---|---|---|---|---|---|\n| Jobs list | /jobs | admin | | | | prototype |\n| Job detail | /jobs/1 | admin | | | | prototype |\n| Settings | /settings | admin | | | | prototype |\n",
  });
  git(p, "switch", "-q", "-c", "change/x");
  commitAt("2026-11-12T13:00:00Z", "x", { "openspec/changes/feature-x/tasks.md": "- [x] 1\n" });
  git(p, "switch", "-q", "main");
  const [proj] = monitor(["--json"]).json.projects;
  const topic = (id) => proj.guide.find((t) => t.id === id).items;

  assert.deepEqual(topic("test").map((i) => i.kind), ["pending", "elsewhere", "missing"]);
  assert.match(item(proj, "pending").text, /^1 change รอ test ทั้งชุด: docs-only$/, "only the open row HEAD holds");
  assert.match(item(proj, "elsewhere").text, /feature-x .*change\/x/);
  assert.equal(item(proj, "elsewhere").command, "/mflow:review change/x แล้ว merge เข้า main");
  assert.match(item(proj, "missing").text, /extra/);

  assert.deepEqual(topic("review").map((i) => [i.kind, i.text.replace(/:.*$/, "")]), [
    ["fix", "change stops review ขอให้แก้ (changes-requested) ไม่พบ branch fix/stops-review แถวจึงยังไม่ปิด"],
    ["pending", "1 change test ผ่านแล้ว รอ review"],
    ["after-test", "1 change รอ review หลัง test"],
  ], "skip needs no review; changes-requested is not settled");
  assert.match(topic("review")[2].text, /feature-x$/, "docs-only (skip) is not there");
  assert.equal(topic("review")[0].command, "อ่าน docs/reviews/code/2026-11-02-stops.md แล้วแก้ตาม finding หรือ /mflow:review pending stops", "no fix branch: no command that names one");
  assert.ok(!topic("changes").some((i) => i.text.includes("change/x")), "the branch the test item names is not listed again");
  assert.equal(topic("review")[0].ref, "docs/reviews/code/2026-11-02-stops.md");
  assert.match(topic("review")[1].text, /jobs$/);

  assert.deepEqual(topic("e2e").map((i) => [i.kind, i.command]), [
    ["screen", "/mflow:e2e Job detail"],
    ["screens", "/mflow:e2e (ไม่ใส่ชื่อ: บอกว่าหน้าไหนยังไม่มี test หรือแก้หลัง test)"],
    ["all", "/mflow:test e2e"],
  ], "Jobs list has its record; Settings has none; no run of every E2E test yet");
  assert.match(topic("e2e")[0].text, /^change jobs: หน้าจอ 1 หน้ายังไม่พบ record ของ \/mflow:e2e ตั้งแต่ 2026-10-02: Job detail$/);
  assert.match(topic("e2e")[1].text, /1 จาก 3 หน้า.*Settings$/);
  assert.deepEqual(topic("blocked"), []);
});

test("a changes-requested row with its fix branch points at it; a fix branch no row names is still listed", needsGit, () => {
  fixture();
  commitAt("2026-11-12T12:00:00Z", "reviewed", {
    "docs/reviews/pending.md": "# Waiting\n\n| Change | Branch | Applied | Review level | Test | Review | E2E screens |\n|---|---|---|---|---|---|---|\n| jobs | main | 2026-10-02 | full | docs/reviews/tests/x.md | changes-requested docs/reviews/code/2026-11-12-jobs.md | — |\n",
  });
  git(p, "switch", "-q", "-c", "fix/jobs-review");
  commitAt("2026-11-12T13:00:00Z", "fix(jobs): review fixes", { "src/fix.txt": "x\n" });
  git(p, "switch", "-q", "-c", "fix/old-review", "main");
  commitAt("2026-11-12T14:00:00Z", "fix(old): review fixes", { "src/old-fix.txt": "x\n" });
  git(p, "switch", "-q", "main");
  const [proj] = monitor(["--json"]).json.projects;
  const fix = item(proj, "fix");
  assert.equal(fix.command, "/mflow:test since บน fix/jobs-review แล้ว /mflow:review fix/jobs-review --short");
  assert.equal(fix.ref, "docs/reviews/code/2026-11-12-jobs.md");
  const branches = proj.guide.find((t) => t.id === "changes").items.filter((i) => i.kind === "branch").map((i) => i.text.split(" ")[1]);
  assert.deepEqual(branches.sort(), ["change/tenants", "fix/old-review"], "fix/jobs-review is named by the review item; fix/old-review by nothing, so it is listed");
});

test("the newest run is the one whose commit is newest, not the file name; an E2E record counts for the longest screen name it starts with", needsGit, () => {
  fixture();
  commitAt("2026-11-12T12:00:00Z", "older", { "src/a.txt": "a\n" });
  const older = git(p, "rev-parse", "HEAD").trim();
  commitAt("2026-11-12T13:00:00Z", "newer", { "src/b.txt": "b\n" });
  const newer = git(p, "rev-parse", "HEAD").trim();
  // Same day: the fail at the newer commit gets the name that sorts first.
  const [failName, passName] = ["2026-11-12-0000000.md", "2026-11-12-fffffff.md"];
  commitAt("2026-11-12T15:00:00Z", "runs", {
    [`docs/reviews/tests/${failName}`]: RECORD("whole suite", "fail", newer),
    [`docs/reviews/tests/${passName}`]: RECORD("whole suite", "pass", older),
    "docs/reviews/tests/2026-11-12-e2e.md": RECORD("e2e billing/notices detail", "pass", newer),
    "docs/ui/screens.md": "# Screens\n\n| หน้าจอ | Route |\n|---|---|\n| billing/notices | /n |\n| billing/notices detail | /n/1 |\n",
  });
  const [proj] = monitor(["--json"]).json.projects;
  assert.equal(item(proj, "test-fail")?.ref, `docs/reviews/tests/${failName}`, "the run at the newer commit is the latest");
  assert.match(item(proj, "test-fail").text, /fail บน main/);
  assert.deepEqual(proj.screens, ["billing/notices", "billing/notices detail"], "a Thai header is still a header");
  assert.match(item(proj, "screens").text, /1 จาก 2 หน้า.*: billing\/notices$/, "the detail screen's record does not count for billing/notices");
});

test("a failing last whole-suite run blocks everything else, and a failing run of every E2E test is in the E2E topic", needsGit, () => {
  fixture();
  commitAt("2026-11-12T12:00:00Z", "runs", {
    "docs/reviews/tests/2026-11-01-abcdef1.md": RECORD("whole suite", "pass"),
    "docs/reviews/tests/2026-11-03-abcdef2.md": RECORD("since abcdef1", "fail", "abcdef2"),
    "docs/reviews/tests/2026-11-04-abcdef2.md": RECORD("e2e", "fail", "abcdef2"),
  });
  const [proj] = monitor(["--json"]).json.projects;
  assert.deepEqual(proj.guide[0].items.map((i) => [i.n, i.kind, i.command]), [[1, "test-fail", "แก้ test ที่ fail แล้ว commit จากนั้น /mflow:test since"]]);
  assert.equal(proj.guide[0].items[0].ref, "docs/reviews/tests/2026-11-03-abcdef2.md");
  assert.deepEqual(proj.guide.find((t) => t.id === "e2e").items.map((i) => i.kind), ["fail"]);
});

test("with no pending list, no screens and no records, every topic is still there", needsGit, () => {
  p = project();
  git(p, "init", "-q", "-b", "main");
  commitAt("2026-11-01T10:00:00Z", "first", { "README.md": "x\n" });
  const [proj] = monitor(["--json"]).json.projects;
  assert.deepEqual(proj.guide.map((t) => t.id), ["blocked", "changes", "test", "review", "e2e", "decide", "other"]);
  for (const id of ["blocked", "changes", "test", "review", "e2e"]) assert.deepEqual(proj.guide.find((t) => t.id === id).items, [], id);
  assert.equal(proj.pending, null);
  assert.equal(proj.screens, null);
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
  assert.match(skill, /\*\*ลำดับงาน\*\*/, "the reply gives the guide");
  assert.match(skill, /Run none of the commands in the guide/);
  assert.match(fs.readFileSync(path.join(PLUGIN, "skills", "help", "SKILL.md"), "utf8"), /\/mflow:monitor/);
});
