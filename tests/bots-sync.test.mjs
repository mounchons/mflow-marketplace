// The sync bot (0.62): a change merged into main that waits in pending.md is put in a checks batch and published by a bot,
// not only by Claude after the merge. A real git project under the OS temp dir; no remote, so publish only says so.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { apply, cleanup, dispatch, due, jobReady, mergeDecision, mergeReady, plan, loadConfig, ready, syncProject } from "../plugins/mflow/scripts/bots.mjs";
import { git, hasGit, project, run } from "./helpers.mjs";

const needsGit = { skip: !hasGit && "git not installed" };
const ID = { GIT_AUTHOR_NAME: "mflow-test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "mflow-test", GIT_COMMITTER_EMAIL: "test@example.invalid" };
let p, home;
const saved = {};
afterEach(() => {
  p?.cleanup();
  if (home) fs.rmSync(home, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
});

function repo() {
  for (const [k, v] of Object.entries(ID)) {
    saved[k] = process.env[k];
    process.env[k] = v; // sync and publish run in this process and commit
  }
  p = project({ checks: {} });
  p.write("STATUS.md", "# STATUS\n");
  p.write(".gitignore", ".claude/worktrees/\n");
  p.write(".gitattributes", "docs/reviews/pending.md merge=union\n");
  p.write("AGENTS.md", "# P\n\n## Commands\n- Build: `dotnet build`\n");
  git(p, "init", "-q", "-b", "main");
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", "baseline");
  home = fs.mkdtempSync(path.join(os.tmpdir(), "mflow-bots-sync-"));
  fs.writeFileSync(path.join(home, "bots.json"), JSON.stringify({ projects: { P: { path: p.root, kinds: { sync: { agent: "claude", effort: "low" }, test: { agent: "codex" } } } } }));
}
function merge(change, screens) {
  p.write(`openspec/changes/archive/2026-11-26-${change}/proposal.md`, `## Why\n${change}\n`);
  p.write(`src/${change}.cs`, `class X {}\n`);
  const r = run(p, "pending.mjs", ["add", change, "--level", "full", "--why", "rule", "--branch", "main", ...(screens ? ["--screens", screens] : [])], { env: ID });
  assert.equal(r.status, 0, r.stderr);
  git(p, "add", ".");
  git(p, "commit", "-q", "-m", `Merge ${change}`);
}

test("a merged change waits: ready says so, the sync bot puts it in a batch with its screens, then nothing waits", needsGit, () => {
  repo();
  assert.equal(jobReady(p.root, "sync").ok, false, "nothing merged yet");
  merge("add-a", "C:/Program Files/Git/reports/work,/_styleguide");
  const r = ready(home, { project: "P", kind: "sync", as: "claude" }, { codexHome: path.join(home, "none") });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.changes, ["add-a"]);
  const s = syncProject(home, { project: "P" });
  assert.deepEqual(s.added, ["add-a"]);
  assert.equal(s.created, true);
  assert.ok(s.published, "publish ran (with no remote it says so)");
  const doc = fs.readFileSync(path.join(s.published.dir || path.join(p.root, ".claude", "worktrees", `checks-${s.batch}`), "docs", "reviews", "checks", `${s.batch}.md`), "utf8");
  assert.match(doc, /\| e2e-write \| \/reports\/work \|/, "the screen Git Bash rewrote has its slash back");
  assert.doesNotMatch(doc, /Program Files/);
  assert.equal(jobReady(p.root, "sync").ok, false, "the change is in the batch now");
  assert.deepEqual(syncProject(home, { project: "P" }).added, []);
});

test("the plan has a sync bot whose prompt runs bots.mjs sync, and a project without one is warned", needsGit, () => {
  repo();
  const cfg = loadConfig(home);
  const out = plan(home, cfg);
  const s = out.automations.find((a) => a.kind === "sync");
  assert.match(s.command, /--provider claude/);
  assert.match(s.command, /--precheck "node [^"]*bots\.mjs ready --home [^ ]+ --project P --kind sync --as claude"/);
  assert.match(s.command, /bots\.mjs sync --home [^ ]+ --project P/);
  assert.ok(!out.warnings.some((w) => /no sync bot/.test(w)));
  fs.writeFileSync(path.join(home, "bots.json"), JSON.stringify({ projects: { P: { path: p.root, kinds: { test: { agent: "codex" } } } } }));
  assert.ok(plan(home, loadConfig(home)).warnings.some((w) => /no sync bot/.test(w)));
});

/** A stand-in for the orca CLI: state in a JSON file, every call logged. */
function fakeOrca(state) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-orca-"));
  const file = path.join(dir, "state.json");
  fs.writeFileSync(file, JSON.stringify(state));
  const script = path.join(dir, "orca.mjs");
  fs.writeFileSync(script, `import fs from "node:fs";
const file = ${JSON.stringify(file)};
const s = JSON.parse(fs.readFileSync(file, "utf8"));
const a = process.argv.slice(2).filter((x) => x !== "--json");
s.calls.push(a);
const out = (result) => { fs.writeFileSync(file, JSON.stringify(s)); process.stdout.write(JSON.stringify({ ok: true, result })); };
const opt = (f) => a[a.indexOf(f) + 1];
if (a[0] === "automations" && a[1] === "list") out({ automations: s.automations });
else if (a[0] === "automations" && a[1] === "run") out({ run: { id: "run-" + a[2] } });
else if (a[0] === "automations" && a[1] === "runs") out({ runs: s.runs[opt("--id")] || [] });
else if (a[0] === "automations" && a[1] === "create") { const id = "new-" + s.automations.length; s.automations.push({ id, name: opt("--name"), enabled: false }); out({ automation: { id } }); }
else if (a[0] === "terminal" && a[1] === "list") out({ terminals: s.terminals });
else if (a[0] === "bot" && a[1] === "list") out({ bots: s.bots || [] });
else if (a[0] === "terminal" && a[1] === "close") out({ closed: opt("--terminal") });
else { process.stdout.write(JSON.stringify({ ok: false, error: { message: "unknown " + a.join(" ") } })); process.exit(1); }
`);
  saved.MFLOW_ORCA_SCRIPT = process.env.MFLOW_ORCA_SCRIPT;
  process.env.MFLOW_ORCA_SCRIPT = script;
  return { calls: () => JSON.parse(fs.readFileSync(file, "utf8")).calls, state: () => JSON.parse(fs.readFileSync(file, "utf8")), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("dispatch starts the automation of the project whose job is ready, and only that", needsGit, () => {
  repo();
  const o = fakeOrca({ calls: [], automations: [{ id: "a-sync", name: "mflow sync P claude", enabled: false }, { id: "a-test", name: "mflow test P codex", enabled: false }, { id: "x", name: "someone else's", enabled: true }], runs: {}, terminals: [] });
  try {
    let d = dispatch(home, { kind: "sync" }, { codexHome: path.join(home, "none") });
    assert.equal(d.started, 0, "nothing merged: nothing started");
    merge("add-a");
    d = dispatch(home, { kind: "sync" }, { codexHome: path.join(home, "none") });
    assert.equal(d.started, 1);
    assert.deepEqual(o.calls().filter((c) => c[1] === "run"), [["automations", "run", "a-sync"]]);
    assert.equal(dispatch(home, { kind: "test" }, { codexHome: path.join(home, "none") }).started, 0, "no batch yet, so no test job");
  } finally {
    o.cleanup();
  }
});

test("cleanup closes the terminals of finished mflow runs only; a running one and the user's own stay", () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "mflow-bots-sync-"));
  const o = fakeOrca({
    calls: [],
    automations: [{ id: "a1", name: "mflow test P codex" }, { id: "u1", name: "my own automation" }],
    runs: { a1: [{ status: "completed", terminalPtyId: "pty-done" }, { status: "running", terminalPtyId: "pty-running" }], u1: [{ status: "completed", terminalPtyId: "pty-user-auto" }] },
    terminals: [{ handle: "t-done", ptyId: "pty-done", title: "done" }, { handle: "t-run", ptyId: "pty-running" }, { handle: "t-user", ptyId: "pty-user" }, { handle: "t-ua", ptyId: "pty-user-auto" }],
  });
  try {
    assert.deepEqual(cleanup().closed.map((c) => c.handle), ["t-done"]);
    assert.deepEqual(o.calls().filter((c) => c[1] === "close"), [["terminal", "close", "--terminal", "t-done", "--tab"]]);
    assert.ok(!o.calls().some((c) => c[1] === "runs" && c[3] === "u1"), "another automation's runs are not even read");
  } finally {
    o.cleanup();
  }
});

test("apply creates only the automations Orca lacks, disabled, with no shell in between", needsGit, () => {
  repo();
  const o = fakeOrca({ calls: [], automations: [{ id: "a-sync", name: "mflow sync P claude", enabled: false }], runs: {}, terminals: [], bots: [{ name: "mflow-sync" }] });
  try {
    const r = apply(home);
    assert.deepEqual(r.created.map((c) => c.name), ["mflow test P codex", "mflow-sync round"], "a bot's round once the user made the bot");
    assert.deepEqual(r.missingBots, ["mflow-test"], "a bot not made yet is named, not made");
    const round = o.calls().find((c) => c[1] === "create" && c.includes("--bot"));
    assert.equal(round[round.indexOf("--bot") + 1], "mflow-sync");
    assert.ok(!round.includes("--disabled"), "a bot's round runs on its schedule");
    const create = o.calls().find((c) => c[1] === "create");
    assert.equal(create[create.indexOf("--name") + 1], "mflow test P codex");
    assert.ok(create.includes("--disabled"));
    assert.match(create[create.indexOf("--prompt") + 1], /begin --home /, "the prompt goes over whole, as one argument");
    assert.equal(apply(home).created.length, 0, "a second apply creates nothing");
  } finally {
    o.cleanup();
  }
});

test("a bot per kind in use, woken by due: no job anywhere, no run", needsGit, () => {
  repo();
  const opts = { codexHome: path.join(home, "none") };
  assert.equal(due(home, { kind: "sync" }, opts).ok, false);
  merge("add-a");
  assert.deepEqual(due(home, { kind: "sync" }, opts).ready, ["P/claude"]);
  const bots = plan(home, loadConfig(home)).bots;
  assert.deepEqual(bots.map((b) => b.bot), ["mflow-sync", "mflow-test"], "only the kinds bots.json uses");
  const s = bots[0];
  assert.deepEqual(s.argv.slice(s.argv.indexOf("--bot"), s.argv.indexOf("--bot") + 2), ["--bot", "mflow-sync"]);
  assert.match(s.argv[s.argv.indexOf("--precheck") + 1], /bots\.mjs due --home \S+ --kind sync$/);
  assert.match(s.argv[s.argv.indexOf("--prompt") + 1], /dispatch --home \S+ --kind sync .*cleanup/);
  assert.notEqual(bots[0].argv[bots[0].argv.indexOf("--trigger") + 1], bots[1].argv[bots[1].argv.indexOf("--trigger") + 1], "the bots wake in different minutes");
});

// The user's answer 4 a (2026-11-28): a bot merges a batch only when every job passed and only results changed.
test("mergeDecision: all done and passed with only docs/reviews changed merges; anything else waits for the user", () => {
  const b = (jobs, extra = {}) => ({ name: "x", pr: "https://example.invalid/pr/3", heldBy: null, jobs, ...extra });
  const pass = [{ id: "T1", state: "done", result: "docs/reviews/tests/a.md pass" }, { id: "R1", state: "done", result: "docs/reviews/code/a.md approve" }];
  const results = ["docs/reviews/checks/x.md", "docs/reviews/tests/a.md", "docs/reviews/code/a.md", "docs/reviews/pending.md"];
  assert.equal(mergeDecision(b(pass), results).ok, true);
  assert.match(mergeDecision(b(pass), [...results, "src/fix.cs"]).reason, /changes more than results \(src\/fix\.cs\)/, "a fix an agent wrote");
  assert.match(mergeDecision(b(pass), [...results, "e2e/login.spec.ts"]).reason, /the user merges it/, "an E2E test an agent wrote");
  assert.match(mergeDecision(b([...pass, { id: "R2", state: "open", result: null }]), results).reason, /1 job\(s\) not done: R2 open/);
  assert.match(mergeDecision(b([{ id: "R1", state: "done", result: "docs/reviews/code/a.md changes-requested" }]), results).reason, /not all passed/);
  assert.match(mergeDecision(b([{ id: "T1", state: "blocked", result: null }]), results).reason, /not done: T1 blocked/);
  assert.match(mergeDecision(b(pass, { pr: null }), results).reason, /no pull request/);
  assert.match(mergeDecision(b(pass, { heldBy: "older" }), results).reason, /waits for older/);
});

test("the sync bot merges a finished batch through gh, and leaves one with a code change", needsGit, () => {
  repo();
  merge("add-a");
  const s = syncProject(home, { project: "P" });
  // finish the batch by hand: T1 passed, R1 approved, both recorded on its branch
  const dir = path.join(p.root, ".claude", "worktrees", `checks-${s.batch}`);
  const file = path.join(dir, "docs", "reviews", "checks", `${s.batch}.md`);
  let doc = fs.readFileSync(file, "utf8").replace(/\| open \| — \|/g, "| done | docs/reviews/x.md pass |").replace(/^PR: .*$/m, "PR: https://example.invalid/pr/9");
  fs.writeFileSync(file, doc);
  git({ ...p, root: dir }, "add", "-A");
  git({ ...p, root: dir }, "commit", "-qm", "checks: done");
  const sha = git({ ...p, root: dir }, "rev-parse", "HEAD").trim();
  const ghLog = path.join(home, "gh.log");
  const ghScript = path.join(home, "gh.mjs");
  const ghAs = (view) => fs.writeFileSync(ghScript, `import fs from "node:fs"; const a = process.argv.slice(2); fs.appendFileSync(${JSON.stringify(ghLog)}, a.join(" ") + String.fromCharCode(10)); if (a[0] === "pr" && a[1] === "view") process.stdout.write(${JSON.stringify(JSON.stringify(view))});`);
  saved.MFLOW_GH_SCRIPT = process.env.MFLOW_GH_SCRIPT;
  process.env.MFLOW_GH_SCRIPT = ghScript;
  assert.deepEqual(mergeReady(p.root, { dryRun: true }).map((m) => m.ready), [true]);
  // the checklist's PR line is free text an agent can edit: it is never what gets merged
  ghAs({ number: 9, headRefName: "checks/other", baseRefName: "main", headRefOid: sha, state: "OPEN" });
  assert.match(mergeReady(p.root)[0].reason, /head is checks\/other/);
  ghAs({ number: 9, headRefName: s.branch, baseRefName: "main", headRefOid: "0".repeat(40), state: "OPEN" });
  assert.match(mergeReady(p.root)[0].reason, /not the checked commit/, "a push after the check is not merged unseen");
  ghAs({ number: 9, headRefName: s.branch, baseRefName: "release", headRefOid: sha, state: "OPEN" });
  assert.match(mergeReady(p.root)[0].reason, /goes into release/);
  assert.ok(!/pr merge/.test(fs.readFileSync(ghLog, "utf8")), "nothing merged so far");
  ghAs({ number: 9, headRefName: s.branch, baseRefName: "main", headRefOid: sha, state: "OPEN" });
  const r = mergeReady(p.root);
  assert.equal(r[0].merged, true, JSON.stringify(r));
  assert.match(fs.readFileSync(ghLog, "utf8"), new RegExp(`^pr view ${s.branch} --json [^\\n]+\\npr ready -- 9\\npr merge --merge --match-head-commit ${sha} --subject [^\\n]+ -- 9$`, "m"));
  // now a fix an agent wrote: the same batch would wait
  fs.writeFileSync(path.join(dir, "src-fix.cs"), "x\n");
  git({ ...p, root: dir }, "add", "-A");
  git({ ...p, root: dir }, "commit", "-qm", "fix(checks): x");
  assert.match(mergeReady(p.root, { dryRun: true })[0].reason, /changes more than results/);
});
