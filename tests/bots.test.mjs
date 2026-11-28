// Machine-level control of the checks automations (0.62): usage per agent, the cap on jobs at once, the config, the plan.
// Synthetic folders under the OS temp dir only; no Orca and no real agent is started or read.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, test } from "node:test";
import { agentAllowed, begin, claudeSnapshot, end, extraArgs, finished, jobReady, loadConfig, plan, ready, report, resolveModel, roundWindow, routeWarnings, staggered, usage } from "../plugins/mflow/scripts/bots.mjs";
import { SCRIPTS } from "./helpers.mjs";

let base, home, codexHome;
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "mflow-bots-"));
  home = path.join(base, "home");
  codexHome = path.join(base, "codex");
  fs.mkdirSync(home);
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

const cfgOf = (extra = {}) => {
  const proj = (n) => ({ path: path.join(base, n), kinds: { test: { agent: "codex", model: "m1", effort: "high" }, review: [{ agent: "claude", effort: "high" }, { agent: "antigravity" }], e2e: { agent: "claude" } } });
  fs.writeFileSync(path.join(home, "bots.json"), JSON.stringify({ projects: { A: proj("a"), B: proj("b") }, ...extra }));
  return loadConfig(home);
};
const rl = (ts, primary, secondary) => JSON.stringify({ timestamp: ts, payload: { type: "token_count", rate_limits: primary ? { limit_id: "codex", primary, secondary, plan_type: "plus" } : null } });
const session = (name, lines) => {
  const d = path.join(codexHome, "sessions", "2026", "11", "28");
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, name), lines.join("\n") + "\n");
};
const NOW = Date.parse("2026-11-28T12:00:00Z");
const at = (h) => Math.floor((NOW + h * 3600_000) / 1000);

test("codex usage: the newest reading by timestamp wins, null readings are skipped, an expired window is flagged", () => {
  session("rollout-1.jsonl", [
    rl("2026-11-28T10:00:00Z", { used_percent: 20, window_minutes: 300, resets_at: at(2) }, { used_percent: 5, window_minutes: 10080, resets_at: at(100) }),
    rl("2026-11-28T11:00:00Z", { used_percent: 68, window_minutes: 300, resets_at: at(1) }, { used_percent: 11, window_minutes: 10080, resets_at: at(90) }),
    rl("2026-11-28T11:30:00Z", null),
  ]);
  const u = usage(home, { codexHome, now: NOW });
  assert.equal(u.codex.known, true);
  assert.equal(u.codex.fiveHour.pct, 68);
  assert.equal(u.codex.fiveHour.expired, false);
  const later = usage(home, { codexHome, now: NOW + 2 * 3600_000 });
  assert.equal(later.codex.fiveHour.expired, true, "a window whose reset has passed no longer counts");
  assert.equal(usage(home, { codexHome: path.join(base, "none"), now: NOW }).codex.known, false);
});

test("claude usage comes from the statusline snapshot and goes stale", () => {
  const input = JSON.stringify({ rate_limits: { five_hour: { used_percentage: 91, resets_at: at(1) }, seven_day: { used_percentage: 30, resets_at: at(80) } } });
  assert.equal(usage(home, { codexHome, now: NOW }).claude.known, false);
  assert.equal(claudeSnapshot(home, input, NOW).written, true);
  const u = usage(home, { codexHome, now: NOW + 60_000 });
  assert.equal(u.claude.known, true);
  assert.equal(u.claude.fiveHour.pct, 91);
  assert.equal(usage(home, { codexHome, now: NOW + 3 * 3600_000 }).claude.known, false, "an old snapshot is unknown, not trusted");
  assert.equal(claudeSnapshot(home, JSON.stringify({ model: "x" }), NOW).written, false);
});

test("an agent over the stop line is held; with no live reading the jobs counted decide", () => {
  const cfg = cfgOf({ usage: { stopAtPercent: 80, maxJobsPer5h: { antigravity: 2 } } });
  const known = { claude: { known: true, fiveHour: { pct: 91, resetsAt: "x", expired: false }, jobsStartedLast5h: 0 } };
  assert.equal(agentAllowed(cfg, known, "claude").ok, false);
  assert.match(agentAllowed(cfg, known, "claude").reason, /91%/);
  const expired = { claude: { known: true, fiveHour: { pct: 91, resetsAt: "x", expired: true }, jobsStartedLast5h: 0 } };
  assert.equal(agentAllowed(cfg, expired, "claude").ok, true, "an expired window is not a reading");
  const unknown = { antigravity: { known: false, jobsStartedLast5h: 2 } };
  assert.equal(agentAllowed(cfg, unknown, "antigravity").ok, false);
  assert.equal(agentAllowed(cfg, { antigravity: { known: false, jobsStartedLast5h: 1 } }, "antigravity").ok, true);
});

test("one job at a time per project of any kind; across projects heavy and light jobs have their own caps", () => {
  const kinds = { test: { agent: "codex" }, review: { agent: "claude" }, e2e: { agent: "claude" } };
  fs.writeFileSync(path.join(home, "bots.json"), JSON.stringify({ maxHeavy: 2, maxLight: 1, projects: Object.fromEntries(["A", "B", "C", "D"].map((n) => [n, { path: path.join(base, n), kinds }])) }));
  const opts = { codexHome, now: NOW };
  const a = begin(home, { project: "A", kind: "test", as: "codex" }, opts);
  assert.equal(a.ok, true);
  const review = begin(home, { project: "A", kind: "review", as: "claude" }, opts);
  assert.equal(review.ok, false, "a review of the same project waits: checks.mjs runs one job at a time in a batch");
  assert.match(review.reason, /already runs a test job \(codex\); one job at a time per project/);
  assert.equal(begin(home, { project: "B", kind: "test", as: "codex" }, opts).ok, true, "a second project runs at the same time");
  const third = begin(home, { project: "C", kind: "test", as: "codex" }, opts);
  assert.equal(third.ok, false, "the heavy cap holds across projects");
  assert.match(third.reason, /cap 2/);
  assert.equal(begin(home, { project: "C", kind: "review", as: "claude" }, opts).ok, true, "a review of another project does not wait for the heavy jobs");
  assert.equal(begin(home, { project: "D", kind: "review", as: "claude" }, opts).ok, false, "the light cap holds");
  assert.equal(end(home, { slot: a.slot }).ended, true);
  assert.equal(begin(home, { project: "A", kind: "e2e", as: "claude" }, opts).ok, true, "the slot is free again");
  const lines = fs.readFileSync(path.join(home, "runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.filter((l) => l.event === "begin").length, 4, "every started job is logged, a refused one is not");
  assert.equal(usage(home, { codexHome }).codex.jobsStartedLast5h, 2, "an end line is not another start");
});

test("a slot nobody ended goes stale", () => {
  cfgOf({ maxHeavy: 1, slotStaleMinutes: 5 });
  const slots = { "A/test/codex/x": { project: "A", kind: "test", tool: "codex", at: new Date(Date.now() - 10 * 60_000).toISOString() } };
  fs.writeFileSync(path.join(home, "slots.json"), JSON.stringify({ slots }));
  assert.equal(begin(home, { project: "B", kind: "test", as: "codex" }, { codexHome }).ok, true);
});

test("ready says why a job cannot start, and refuses an agent the project does not route to", () => {
  cfgOf();
  fs.mkdirSync(path.join(base, "a"));
  const r = ready(home, { project: "A", kind: "test", as: "codex" }, { codexHome, now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.reason, /checks/);
  assert.throws(() => ready(home, { project: "A", kind: "test", as: "claude" }, { codexHome }), /sends test to codex, not claude/);
  assert.throws(() => ready(home, { project: "Z", kind: "test", as: "codex" }, { codexHome }), /not in bots.json/);
  assert.equal(jobReady(path.join(base, "missing"), "test", "codex").ok, false);
});

test("bots.json is checked", () => {
  fs.writeFileSync(path.join(home, "bots.json"), JSON.stringify({ projects: { A: { path: base, kinds: { e2e: { agent: "antigravity" } } } } }));
  assert.equal(loadConfig(home).projects.A.kinds.e2e[0].agent, "antigravity", "Antigravity takes E2E since 0.63.0");
  fs.writeFileSync(path.join(home, "bots.json"), JSON.stringify({ projects: { A: { path: "rel", kinds: {} } } }));
  assert.throws(() => loadConfig(home), /absolute/);
  fs.writeFileSync(path.join(home, "bots.json"), JSON.stringify({ maxHeavy: 0, projects: {} }));
  assert.throws(() => loadConfig(home), /maxHeavy/);
});

test("plan prints one disabled automation per project, kind and agent, with the repo, effort and precheck", () => {
  const cfg = cfgOf();
  const p = plan(home, cfg);
  assert.equal(p.automations.length, 2 * (1 + 2 + 1));
  const t = p.automations.find((x) => x.project === "A" && x.kind === "test");
  assert.match(t.command, /--provider codex/);
  assert.match(t.command, /--workspace "?path:[^" ]+"? --workspace-mode existing/, "the checkout already there, no worktree per run");
  assert.deepEqual(t.argv.slice(t.argv.indexOf("--workspace"), t.argv.indexOf("--workspace") + 4), ["--workspace", `path:${path.join(base, "a").replace(/\\/g, "/")}`, "--workspace-mode", "existing"]);
  assert.doesNotMatch(t.command, /--repo /);
  assert.match(t.command, /--extra-agent-args="--model m1 -c model_reasoning_effort=high"/);
  assert.match(t.command, /--precheck "node [^" ]*bots\.mjs ready --home [^ "]+ --project A --kind test --as codex"/);
  assert.doesNotMatch(t.command, /\\/, "no backslash reaches the shell");
  assert.match(t.command, /--disabled$/);
  const mins = p.automations.filter((x) => x.project === "A").map((x) => /--trigger "([\d,]+) \* \* \* \*"/.exec(x.command)[1]);
  assert.equal(new Set(mins).size, mins.length, "no two bots of one project wake in the same minute");
  assert.equal(staggered(0, 10), "0,10,20,30,40,50");
  assert.equal(staggered(1, 10), "2,12,22,32,42,52");
  assert.equal(staggered(5, 10), "0,10,20,30,40,50", "wraps past the poll window");
  const r = p.automations.find((x) => x.project === "B" && x.kind === "review" && x.agent === "claude");
  assert.match(r.command, /--extra-agent-args="--effort high"/);
  assert.match(r.command, /node [^ ]*\/checks\.mjs next --as claude --kind review/, "the real path of checks.mjs, not a placeholder");
  assert.doesNotMatch(r.command, /<mflow plugin>/);
  assert.equal(extraArgs({ agent: "claude" }), "");
  assert.match(p.statusline, /claude-snapshot/);
  assert.ok(p.warnings.some((w) => /^A: (checks is not enabled|cannot read its checks config)/.test(w)), "a project without checks is named");
});

test("route warnings: a job routed to an agent with no bot, a bot the route never feeds, any with no bot", () => {
  const dir = path.join(base, "r");
  fs.mkdirSync(path.join(dir, ".mflow"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".mflow", "config.json"), JSON.stringify({ version: 1, checks: { route: { test: "any", review: "claude", reviewMerge: "claude", fix: "claude", e2e: "claude" } } }));
  const w = routeWarnings("R", { path: dir, kinds: { test: [{ agent: "codex" }], review: [{ agent: "antigravity" }], e2e: [{ agent: "claude" }] } });
  assert.ok(w.some((x) => /checks\.route\.review is claude but bots\.json has no review bot for claude/.test(x)));
  assert.ok(w.some((x) => /review bot for antigravity gets no job/.test(x)));
  assert.ok(w.some((x) => /checks\.route\.fix is claude but bots\.json has no fix bot/.test(x)), "fix jobs need a bot too");
  assert.ok(!w.some((x) => /test/.test(x)), "test goes to any and has a bot");
  assert.ok(!w.some((x) => /e2e/.test(x)));
});

test("the command line needs a state folder and runs outside any project", () => {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, "bots.mjs"), "usage"], { encoding: "utf8", cwd: base, env: { ...process.env, MFLOW_BOTS_HOME: "" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--home/);
  cfgOf();
  const ok = spawnSync(process.execPath, [path.join(SCRIPTS, "bots.mjs"), "usage", "--home", home], { encoding: "utf8", cwd: base, env: { ...process.env, CODEX_HOME: codexHome } });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).antigravity.known, false);
});

test("end writes the agent, model, effort, minutes and result of the job, and report groups them", () => {
  cfgOf();
  const opts = { codexHome, now: NOW };
  const a = begin(home, { project: "A", kind: "test", as: "codex" }, opts);
  const b = begin(home, { project: "B", kind: "review", as: "claude" }, opts);
  const e = end(home, { slot: a.slot, result: "fail", job: "T1", note: "2 tests failed" });
  assert.equal(e.ended, true);
  assert.deepEqual([e.tool, e.model, e.effort, e.kind, e.result, e.job], ["codex", "m1", "high", "test", "fail", "T1"]);
  assert.equal(typeof e.minutes, "number");
  const noFlags = end(home, { slot: b.slot });
  assert.equal(noFlags.result, "unreported", "an end without a result is still recorded");
  assert.equal(noFlags.model, "default", "no model in bots.json is written as default");
  assert.throws(() => end(home, { slot: "any", result: "great" }), /--result must be/);
  assert.equal(end(home, { slot: "nope" }).ended, false, "an unknown slot writes nothing");
  // a slot taken before model and effort were recorded: asked from the config
  fs.writeFileSync(path.join(home, "slots.json"), JSON.stringify({ slots: { old: { project: "A", kind: "test", tool: "codex", at: new Date().toISOString() } } }));
  assert.equal(end(home, { slot: "old", result: "pass" }).effort, "high");
  const rows = report(home);
  const codex = rows.find((r) => r.tool === "codex" && r.kind === "test");
  assert.equal(codex.jobs, 2);
  assert.deepEqual(codex.results, { fail: 1, pass: 1 });
  assert.equal(codex.model, "m1");
});


test("runs.jsonl keeps the fields its readers use: a separate Tamra digest bot reads only this file", () => {
  cfgOf();
  const b = begin(home, { project: "A", kind: "test", as: "codex" }, { codexHome, now: NOW });
  end(home, { slot: b.slot, result: "pass", job: "T1" });
  const [first, last] = fs.readFileSync(path.join(home, "runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(Object.keys(first).sort(), ["at", "effort", "event", "kind", "model", "project", "slot", "tool"]);
  assert.equal(first.event, "begin");
  for (const k of ["event", "at", "tool", "model", "effort", "project", "kind", "minutes", "result"]) assert.ok(k in last, `end line has ${k}`);
  assert.equal(last.event, "end");
  assert.ok(["pass", "fail", "released", "blocked", "unreported"].includes(last.result));
  assert.equal(typeof last.minutes, "number");
  assert.ok(!Number.isNaN(Date.parse(last.at)));
});

// The user 2026-11-28: "when a bot's job is done, report in the chat what it did and on what model and effort".
test("finished: the jobs that ended in this round's window, with the model and effort read from the agent's own log", () => {
  const proj = path.join(base, "proj");
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(home, "bots.json"), JSON.stringify({ pollMinutes: 10, projects: { P: { path: proj, kinds: { test: { agent: "codex", effort: "high" }, review: { agent: "claude" } } } } }));
  const cfg = loadConfig(home);
  const local = (h, m, s = 0) => new Date(2026, 10, 28, h, m, s).getTime();
  // test is the first kind in use (minutes 0,10,…), review the second (2,12,…)
  assert.deepEqual(roundWindow(cfg, "review", local(12, 15, 30)), { from: local(12, 2), to: local(12, 12) });
  assert.deepEqual(roundWindow(cfg, "test", local(12, 0, 0)), { from: local(11, 50), to: local(12, 0) });
  const end = (kind, at, x) => JSON.stringify({ event: "end", at: new Date(at).toISOString(), tool: kind === "test" ? "codex" : "claude", model: "default", effort: kind === "test" ? "high" : "default", project: "P", kind, minutes: 5, result: "pass", ...x });
  fs.writeFileSync(path.join(home, "runs.jsonl"), [end("review", local(12, 5), { job: "R1" }), end("review", local(12, 13), { job: "R2" }), end("test", local(12, 5), { job: "T1" })].join("\n") + "\n");
  // the agents' logs: a Codex session in the project, a Claude transcript in its projects folder
  const user = path.join(base, "user");
  const sess = path.join(user, ".codex", "sessions", "2026", "11", "28");
  fs.mkdirSync(sess, { recursive: true });
  fs.writeFileSync(path.join(sess, "rollout-x.jsonl"), JSON.stringify({ timestamp: new Date(local(12, 2)).toISOString(), type: "turn_context", payload: { cwd: proj.replace(/\//g, "\\"), model: "gpt-6.2-sol", collaboration_mode: { settings: { reasoning_effort: "high" } } } }) + "\n");
  const cdir = path.join(user, ".claude", "projects", path.resolve(proj).replace(/[^A-Za-z0-9]/g, "-"));
  fs.mkdirSync(cdir, { recursive: true });
  fs.writeFileSync(path.join(cdir, "s.jsonl"), [1, 2, 3].map((i) => JSON.stringify({ timestamp: new Date(local(12, 1 + i)).toISOString(), message: { model: "claude-opus-5-5" }, effort: "high" })).join("\n") + "\n");
  const opts = { now: local(12, 15, 30), userHome: user, codexHome: path.join(user, ".codex") };
  const r = finished(home, { kind: "review" }, opts);
  assert.deepEqual(r.jobs.map((j) => j.job), ["R1"], "R2 ended after 12:12: the next round reports it");
  assert.equal(r.jobs[0].model, "claude-opus-5-5");
  assert.equal(r.jobs[0].effort, "high", "the effort the transcript shows, not bots.json's default");
  assert.match(r.jobs[0].line, /^P R1 \(review\): pass · claude · model claude-opus-5-5 · effort high · 5 min$/);
  const t = finished(home, { kind: "test" }, { ...opts, now: local(12, 10, 20) });
  assert.equal(t.jobs[0].model, "gpt-6.2-sol");
  const blind = finished(home, { kind: "test" }, { ...opts, now: local(12, 10, 20), skipLogs: true });
  assert.equal(blind.jobs[0].model, "default (not in the agent's log)");
  assert.equal(blind.jobs[0].effort, "high (as asked)", "with no log, what was asked, said so");
});

// The user 2026-11-28: "กำหนด model ได้ เช่น claude - model opus, codex - model sol".
test("a model per kind: codex's short name becomes its newest full id, claude's alias stays, an unknown one is warned", () => {
  const codexHome = path.join(base, "cx");
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, "models_cache.json"), JSON.stringify({ models: [{ slug: "gpt-6.2-sol" }, { slug: "gpt-6.2-astra" }, { slug: "gpt-6.1-sol" }] }));
  assert.deepEqual(resolveModel("codex", "sol", { codexHome }), { model: "gpt-6.2-sol", from: "sol" });
  assert.deepEqual(resolveModel("codex", "gpt-6.1-sol", { codexHome }), { model: "gpt-6.1-sol" });
  assert.match(resolveModel("codex", "nova", { codexHome }).warning, /no model "nova"/);
  assert.deepEqual(resolveModel("claude", "opus", { codexHome }), { model: "opus" });
  fs.writeFileSync(path.join(home, "bots.json"), JSON.stringify({ projects: { A: { path: path.join(base, "a"), kinds: { test: { agent: "codex", model: "sol", effort: "high" }, review: { agent: "claude", model: "opus", effort: "high" }, fix: { agent: "codex", model: "nova" } } } } }));
  const cfg = loadConfig(home, { codexHome });
  const p = plan(home, cfg);
  const t = p.automations.find((a) => a.kind === "test");
  assert.ok(t.argv.includes("--extra-agent-args=--model gpt-6.2-sol -c model_reasoning_effort=high"));
  const r = p.automations.find((a) => a.kind === "review");
  assert.ok(r.argv.includes("--extra-agent-args=--model opus --effort high"));
  assert.ok(p.warnings.some((w) => /A\.fix: codex has no model "nova"/.test(w)));
});
