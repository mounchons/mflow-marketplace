// The 0.20 layout: documents grouped under docs/decisions, docs/ai and docs/reviews. A project set up
// before it keeps working through its folder settings until migrate-layout.mjs moves it, which shows its
// plan first, rewrites every path that names a moved folder (never in the customer's own files), and can
// run again safely.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fileHash } from "../plugins/mflow/scripts/source-index.mjs";
import { git, hasGit, project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const LEGACY = { hotspotsDir: "docs/hotspots", sourceDir: "docs/source", inboxDir: "docs/ai-inbox", discussDir: "docs/discuss" };

/** A project set up before 0.20.0, with one of each document mflow writes and paths naming them. */
function legacyProject() {
  p = project(LEGACY);
  p.write("docs/discuss/03-access-control.md", "# สิทธิ์\n\nภาพ: ![รายการงาน](../ui/screens/job-list.admin.png)\nกฎ: docs/hotspots/freight-rate/rules.md\n");
  p.write("docs/hotspots/INDEX.md", "| freight-rate | docs/hotspots/freight-rate/map.md |\n");
  p.write("docs/hotspots/freight-rate/rules.md", "# rules\nดู [สิทธิ์](../../discuss/03-access-control.md)\n");
  p.write("docs/ai-inbox/AN-001-r1-codex.md", "---\nstatus: new\nfrom: codex\n---\n# report\n");
  p.write("docs/analysis/AN-001/summary.md", "---\nid: AN-001\nreports: docs/ai-inbox/AN-001-r1-codex.md\n---\n# สรุป\n");
  p.write("docs/design/DS-001/proposal.md", "# แบบ\nอ้าง docs/discuss/03-access-control.md\n");
  p.write("docs/design/brand-board.md", "# ของโปรเจกต์เอง\n");
  p.write("docs/change-requests/CR-001-fuel.md", "# CR-001\n");
  p.write("docs/ui/screens.md", "สิทธิ์จาก [doc 03](../discuss/03-access-control.md) และ `docs/ui/design-system.md`\n");
  p.write("docs/source/tor.md", "ลูกค้าเขียนถึง docs/discuss ไว้เอง\n");
  p.write("AGENTS.md", "| Discussions | `docs/discuss/` |\n| Inbox | docs/ai-inbox/ |\n| Change requests | `docs/change-requests/` |\n");
  p.write("backlog/tasks/task-7 - rule.md", "ref: docs/hotspots/freight-rate/rules.md\n");
  p.write("src/App/FakeRate.cs", "// PROTOTYPE: rate — see docs/hotspots/INDEX.md freight-rate\n");
  p.write("openspec/config.yaml", "context: |\n  Rules are in docs/hotspots/<slug>/rules.md.\n  Designs agreed are in docs/discuss/NN-*.md.\n");
  const target = "docs/design/DS-001/proposal.md";
  p.write(".mflow/consultations/CH-001/session.json", JSON.stringify({
    id: "CH-001", intent: "challenge", scope: "แบบ", participants: ["codex"], rounds: [{ n: 1 }],
    snapshot: { commit: null, target: { path: target, hash: fileHash(p.file(target)) } },
  }, null, 2) + "\n");
}

const migrate = (...args) => {
  const r = run(p, "migrate-layout.mjs", args);
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};

test("the plan lists every move and setting, and changes nothing", () => {
  legacyProject();
  const plan = migrate();
  assert.equal(plan.layout, "legacy");
  assert.equal(plan.applied, false);
  assert.deepEqual(plan.moves.map((m) => `${m.from} -> ${m.to}`), [
    "docs/discuss -> docs/decisions/discuss",
    "docs/hotspots -> docs/decisions/hotspots",
    "docs/ai-inbox -> docs/ai/inbox",
    "docs/analysis/AN-001 -> docs/ai/analysis/AN-001",
    "docs/design/DS-001 -> docs/ai/design/DS-001",
    "docs/change-requests/CR-001-fuel.md -> docs/reviews/change-requests/CR-001-fuel.md",
  ]);
  assert.deepEqual(plan.settings.map((s) => s.setting), ["discussDir", "hotspotsDir", "inboxDir"]);
  assert.deepEqual(plan.kept, [{ path: "docs/design", reason: "not written by mflow: brand-board.md" }]);
  assert.ok(plan.rewrites.some((r) => r.file === "AGENTS.md"));
  assert.ok(!plan.rewrites.some((r) => r.file.startsWith("docs/source/")), "customer files are never rewritten");
  assert.ok(!plan.rewrites.some((r) => "text" in r), "the report carries no file contents");
  assert.match(plan.next, /--apply/);
  assert.equal(p.exists("docs/discuss/03-access-control.md"), true);
  assert.equal(JSON.parse(p.read(".mflow/config.json")).discussDir, "docs/discuss");
});

test("--apply moves the folders, the settings and every path that names them", () => {
  legacyProject();
  const done = migrate("--apply");
  assert.equal(done.applied, true);
  assert.equal(done.layout, "current");
  const cfg = JSON.parse(p.read(".mflow/config.json"));
  assert.equal(cfg.discussDir, "docs/decisions/discuss");
  assert.equal(cfg.hotspotsDir, "docs/decisions/hotspots");
  assert.equal(cfg.inboxDir, "docs/ai/inbox");
  assert.equal(cfg.sourceDir, "docs/source");
  for (const gone of ["docs/discuss", "docs/hotspots", "docs/ai-inbox", "docs/analysis", "docs/change-requests"]) assert.equal(p.exists(gone), false, gone);
  assert.equal(p.exists("docs/design/brand-board.md"), true, "a file mflow did not write stays");
  assert.equal(p.exists("docs/reviews/change-requests/CR-001-fuel.md"), true);

  assert.equal(p.read("AGENTS.md"), "| Discussions | `docs/decisions/discuss/` |\n| Inbox | docs/ai/inbox/ |\n| Change requests | `docs/reviews/change-requests/` |\n");
  assert.match(p.read("backlog/tasks/task-7 - rule.md"), /ref: docs\/decisions\/hotspots\/freight-rate\/rules\.md/);
  assert.match(p.read("src/App/FakeRate.cs"), /see docs\/decisions\/hotspots\/INDEX\.md/);
  assert.match(p.read("openspec/config.yaml"), /docs\/decisions\/hotspots\/<slug>\/rules\.md[\s\S]*docs\/decisions\/discuss\/NN-\*\.md/);
  assert.match(p.read("docs/ai/analysis/AN-001/summary.md"), /reports: docs\/ai\/inbox\/AN-001-r1-codex\.md/);
  assert.match(p.read("docs/ai/design/DS-001/proposal.md"), /อ้าง docs\/decisions\/discuss\/03-access-control\.md/);
  assert.match(p.read("docs/ui/screens.md"), /`docs\/ui\/design-system\.md`/, "a path that did not move stays");
  assert.equal(p.read("docs/source/tor.md"), "ลูกค้าเขียนถึง docs/discuss ไว้เอง\n");

  // Relative links: from a moved file to one that stayed, between two moved files, and into a moved one.
  const doc = p.read("docs/decisions/discuss/03-access-control.md");
  assert.match(doc, /\]\(\.\.\/\.\.\/ui\/screens\/job-list\.admin\.png\)/);
  assert.match(doc, /กฎ: docs\/decisions\/hotspots\/freight-rate\/rules\.md/);
  assert.match(p.read("docs/decisions/hotspots/freight-rate/rules.md"), /\]\(\.\.\/\.\.\/discuss\/03-access-control\.md\)/);
  assert.match(p.read("docs/ui/screens.md"), /\]\(\.\.\/decisions\/discuss\/03-access-control\.md\)/);

  // The consultation's pinned file moved and was rewritten by this run, not by someone else.
  const s = JSON.parse(p.read(".mflow/consultations/CH-001/session.json"));
  assert.equal(s.snapshot.target.path, "docs/ai/design/DS-001/proposal.md");
  assert.equal(s.snapshot.target.hash, fileHash(p.file("docs/ai/design/DS-001/proposal.md")));
});

test("a second run finds nothing to do", () => {
  legacyProject();
  migrate("--apply");
  const again = migrate();
  assert.equal(again.layout, "current");
  assert.deepEqual(again.moves, []);
  assert.deepEqual(again.rewrites, []);
  assert.equal(again.next, null);
});

test("a new folder that already holds files is a conflict and keeps its old setting", () => {
  legacyProject();
  p.write("docs/decisions/discuss/01-other.md", "# made by hand\n");
  const done = migrate("--apply");
  assert.equal(done.layout, "mixed");
  assert.deepEqual(done.conflicts.map((c) => c.from), ["docs/discuss"]);
  assert.equal(p.exists("docs/discuss/03-access-control.md"), true);
  const cfg = JSON.parse(p.read(".mflow/config.json"));
  assert.equal(cfg.discussDir, "docs/discuss");
  assert.equal(cfg.hotspotsDir, "docs/decisions/hotspots");
  assert.match(p.read("AGENTS.md"), /`docs\/discuss\/`/, "references to a folder that did not move stay");
});

test("a folder setting changed by hand is kept", () => {
  p = project({ ...LEGACY, discussDir: "requirements/agreed" });
  p.write("requirements/agreed/01-tech-stack.md", "# stack\n");
  p.write("docs/hotspots/INDEX.md", "# hotspots\n");
  const plan = migrate();
  assert.deepEqual(plan.kept, [{ path: "requirements/agreed", reason: "discussDir is set by hand" }]);
  assert.deepEqual(plan.moves.map((m) => m.from), ["docs/hotspots"]);
});

test("a project in the 0.20 layout has nothing to move", () => {
  p = project();
  p.write("docs/decisions/discuss/01-tech-stack.md", "# stack\n");
  const plan = migrate();
  assert.equal(plan.layout, "current");
  assert.deepEqual(plan.moves, []);
  assert.deepEqual(plan.settings, []);
});

test("the doctor and the briefing name the old layout until it moves", () => {
  legacyProject();
  const layout = () => run(p, "doctor.mjs").json.checks.find((c) => c.id === "layout");
  assert.equal(layout().status, "warn");
  assert.match(layout().detail, /docs\/discuss, docs\/hotspots, docs\/ai-inbox/);
  assert.match(layout().fix, /\/mflow:init/);
  const briefing = () => run(p, "session-start.mjs", [], { input: { session_id: "t-layout", cwd: p.root, source: "startup" } }).json.hookSpecificOutput.additionalContext;
  assert.match(briefing(), /documents are in the layout before 0\.20\.0/);
  migrate("--apply");
  assert.equal(layout().status, "ok");
  assert.doesNotMatch(briefing(), /layout before 0\.20\.0/);
});

test("scaffold writes its templates into the folders an old project's settings name", () => {
  p = project(LEGACY);
  const r = run(p, "scaffold.mjs", ["--root", p.root, "--name", "demo"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.json.created.includes("docs/discuss/README.md"));
  assert.ok(r.json.created.includes("docs/hotspots/INDEX.md"));
  assert.ok(r.json.created.includes("docs/ai-inbox/README.md"));
  assert.equal(p.exists("docs/decisions"), false, "no second copy in the new folders");
  assert.equal(p.exists("docs/ai"), false);
});

test("a consultation from before the move still finds its summary in the old folder", () => {
  p = project(LEGACY);
  p.write(".mflow/consultations/AN-001/session.json", JSON.stringify({
    id: "AN-001", intent: "analyze", scope: "system", participants: ["codex"], rounds: [{ n: 1 }], snapshot: { commit: null },
  }, null, 2) + "\n");
  p.write("docs/analysis/AN-001/summary.md", "---\nid: AN-001\n---\n# สรุป\n");
  const r = run(p, "consult.mjs", ["status", "AN-001"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.summary, "docs/analysis/AN-001/summary.md");
});

test("with git, files the project ignores are left alone", { skip: !hasGit }, () => {
  legacyProject();
  git(p, "init", "-q");
  p.write(".gitignore", "notes/\n");
  p.write("notes/scratch.md", "docs/discuss is mine\n");
  migrate("--apply");
  assert.equal(p.read("notes/scratch.md"), "docs/discuss is mine\n");
  assert.match(p.read("AGENTS.md"), /docs\/decisions\/discuss/);
});
