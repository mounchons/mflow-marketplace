// The sync bot (0.62): a change merged into main that waits in pending.md is put in a checks batch and published by a bot,
// not only by Claude after the merge. A real git project under the OS temp dir; no remote, so publish only says so.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { apply, cleanup, dispatch, due, jobReady, plan, loadConfig, ready, syncProject } from "../plugins/mflow/scripts/bots.mjs";
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
  const o = fakeOrca({ calls: [], automations: [{ id: "a-sync", name: "mflow sync P claude", enabled: false }], runs: {}, terminals: [] });
  try {
    const r = apply(home);
    assert.deepEqual(r.created.map((c) => c.name), ["mflow test P codex"]);
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
