#!/usr/bin/env node
// Smoke run of the skills mflow generates for Codex (.agents/skills/mflow-test and mflow-review) against
// a real Codex CLI. Not part of `node --test` or CI: it needs a signed-in Codex and spends its tokens
// (about 30-40k per case). Run it by hand on any machine that has Codex:
//
//   node tests/smoke/codex-skills.mjs [--cases test,review,e2e,self] [--dir <parent folder>] [--keep]
//                                     [--timeout <minutes per case, default 15>]
//
// It builds a small Node project in a new temp folder (under --dir when given), generates the skills
// from this checkout's plugin, runs Codex on each case and checks what Codex wrote:
//   test    $mflow-test                         a whole-suite record with By: codex, a STATUS.md entry
//   review  $mflow-review agent/claude/sub      a report with Reviewer: codex, Author: claude, a verdict
//   e2e     $mflow-test e2e                     no E2E run, the user sent to Claude Code
//   self    $mflow-review agent/codex/self      Author: codex, named a self-review
// Prints one line per check and a JSON summary; exits 1 when a check fails. The folder (project/, and
// logs/ with Codex's transcript and last message per case) is removed on success unless --keep, and
// kept on failure. A failing case also prints Codex's last message: a shell that would not start or an
// approval service at capacity is Codex's environment, not the skill, and is worth one rerun.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GENERATOR = path.join(REPO, "plugins", "mflow", "scripts", "agent-skills.mjs");
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const CASES = opt("--cases", "test,review,e2e,self").split(",").map((c) => c.trim()).filter(Boolean);
const TIMEOUT = Number(opt("--timeout", "15")) * 60_000;
const KEEP = args.includes("--keep");
const WIN = process.platform === "win32";

const fail = (msg) => { process.stderr.write(msg + "\n"); process.exit(2); };
let base = os.tmpdir(); // the run's folder once made; git looks no higher than it
const unknown = CASES.filter((c) => !["test", "review", "e2e", "self"].includes(c));
if (unknown.length) fail(`unknown case(s): ${unknown.join(", ")} (test, review, e2e, self)`);

/** A command through the shell on Windows, where codex is an npm .cmd shim; arguments quoted. */
function sh(cmd, argv, { cwd, input, timeout = 60_000 } = {}) {
  const q = (a) => (WIN ? `"${String(a).replace(/"/g, '""')}"` : a);
  const r = spawnSync(WIN ? [cmd, ...argv.map(q)].join(" ") : cmd, WIN ? [] : argv, {
    cwd, input, timeout, encoding: "utf8", shell: WIN, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_CEILING_DIRECTORIES: base },
  });
  return { status: r.status, out: `${r.stdout || ""}${r.stderr || ""}`, timedOut: r.error?.code === "ETIMEDOUT" };
}

const version = sh("codex", ["--version"]);
if (version.status !== 0) fail("codex is not on PATH: install the Codex CLI and run `codex login` first");

const parent = path.resolve(opt("--dir", os.tmpdir()));
if (!fs.existsSync(parent)) fail(`--dir ${parent} does not exist`);
base = fs.mkdtempSync(path.join(parent, "mflow-codex-smoke-"));
const dir = path.join(base, "project");
const logs = path.join(base, "logs");
fs.mkdirSync(dir);
fs.mkdirSync(logs);
const file = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const read = (rel) => { try { return fs.readFileSync(path.join(dir, rel), "utf8"); } catch { return ""; } };
const list = (rel) => { try { return fs.readdirSync(path.join(dir, rel)).filter((f) => f.endsWith(".md")).sort(); } catch { return []; } };
const git = (...a) => {
  const r = sh("git", ["-c", "user.name=mflow-smoke", "-c", "user.email=smoke@example.invalid", "-c", "core.autocrlf=false", ...a], { cwd: dir });
  if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.out}`);
  return r.out.trim();
};

// The project: plain Node, one test command, a session ritual that asks for a STATUS.md entry.
file(".mflow/config.json", '{ "version": 1 }\n');
file("AGENTS.md", [
  "# Smoke", "", "## Stack", "Project name (code): Smoke", "Profile: custom", "",
  "| Seam | Value |", "|---|---|", "| Runtime | Node 20 or newer, no dependencies |", "",
  "## Commands",
  "- Build: none (plain Node, nothing to build)",
  "- Unit + domain tests: `node --test`",
  "- E2E (only on the user's call): `npx playwright test --workers=2` in `tests/e2e`", "",
  "## Session ritual",
  "At the start read STATUS.md. At the end append one entry under `## Log` in STATUS.md: date, what was done, next step.", "",
].join("\n"));
file("STATUS.md", "# Status\n\n## Now\n- nothing yet\n\n## Log\n");
file("sum.mjs", "export const sum = (a, b) => a + b;\n");
file("sum.test.mjs", 'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { sum } from "./sum.mjs";\ntest("adds two numbers", () => assert.equal(sum(2, 3), 5));\n');
git("init", "-q", "-b", "main");
git("add", "-A");
git("commit", "-q", "-m", "smoke project");
const gen = spawnSync(process.execPath, [GENERATOR, "write", "--root", dir], { encoding: "utf8" });
if (gen.status !== 0) fail(`agent-skills.mjs write failed: ${gen.stderr}`);
git("add", "-A");
git("commit", "-q", "-m", "mflow skills for Codex");

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}\n`);
};

/** One Codex run in the project; the prompt goes on stdin. */
function codex(caseName, prompt) {
  const last = path.join(logs, `${caseName}-last.md`);
  process.stdout.write(`\n== ${caseName}: codex exec ${prompt}\n`);
  const r = sh("codex", ["exec", "-s", "workspace-write", "-C", dir, "-o", last, "-"], { cwd: dir, input: prompt, timeout: TIMEOUT });
  fs.writeFileSync(path.join(logs, `${caseName}-log.txt`), r.out);
  const tokens = /tokens used\s*\r?\n\s*([\d,]+)/.exec(r.out)?.[1] || null;
  const message = (() => { try { return fs.readFileSync(last, "utf8"); } catch { return ""; } })();
  check(`${caseName}: codex finished`, r.status === 0 && !r.timedOut, r.timedOut ? "timed out" : `exit ${r.status}${tokens ? `, ${tokens} tokens` : ""}`);
  return { ...r, tokens, message };
}
/** The commands Codex ran: each `exec` block of its log, up to the line that reports how it ended. */
function commandsRun(log) {
  const out = [];
  const lines = log.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== "exec") continue;
    const cmd = [];
    for (let j = i + 1; j < lines.length && !/^\s*(succeeded|exited -?\d+) in \d+ms:/.test(lines[j]); j++) cmd.push(lines[j]);
    out.push(cmd.join("\n"));
  }
  return out;
}
/** Commit what Codex wrote (records, reports, STATUS.md), so the next case starts clean. */
const settle = (msg) => { if (git("status", "--porcelain")) { git("add", "-A"); git("commit", "-q", "-m", msg); } };
const newer = (rel, before) => list(rel).filter((f) => !before.includes(f));
// Without the test case first there is no record for a review to reuse, and a review asks before it runs
// the whole suite; Codex in exec mode cannot be answered, so the prompt answers it (option a).
const TESTS_HINT = CASES.includes("test") ? "" : " (if no test record covers it, run the whole suite now)";
/** After a case: when one of its checks failed, show what Codex said last. */
function explain(caseName, run) {
  if (!results.some((r) => !r.ok && r.name.startsWith(`${caseName}:`))) return;
  const said = (run.message || "(none)").trim().replace(/\s+/g, " ").slice(0, 600);
  process.stdout.write(`   Codex's last message: ${said}\n`);
}

if (CASES.includes("test")) {
  const before = list("docs/reviews/tests");
  const head = git("rev-parse", "HEAD");
  const statusBefore = read("STATUS.md");
  const run = codex("test", "$mflow-test");
  const rec = newer("docs/reviews/tests", before).map((f) => read(`docs/reviews/tests/${f}`))[0] || "";
  check("test: wrote a record in docs/reviews/tests", rec, rec ? "" : "none");
  check("test: record says By: codex", /^By:\s*codex\b/m.test(rec));
  check("test: record is the whole suite at the commit", /^Scope:\s*whole suite/m.test(rec) && rec.includes(head), head.slice(0, 7));
  check("test: record passes", /^Result:\s*pass/m.test(rec));
  check("test: wrote a STATUS.md entry", read("STATUS.md") !== statusBefore);
  explain("test", run);
  settle("smoke: test record");
}

if (CASES.includes("review")) {
  git("checkout", "-q", "-b", "agent/claude/sub", "main");
  file("sum.mjs", "export const sum = (a, b) => a + b;\nexport const sub = (a, b) => a - b;\n");
  file("sum.test.mjs", read("sum.test.mjs").replace("import { sum }", "import { sum, sub }") + 'test("subtracts", () => assert.equal(sub(5, 3), 2));\n');
  git("add", "-A");
  git("commit", "-q", "-m", "add sub");
  const before = list("docs/reviews/code");
  const run = codex("review", `$mflow-review agent/claude/sub --short${TESTS_HINT}`);
  const rep = newer("docs/reviews/code", before).map((f) => read(`docs/reviews/code/${f}`))[0] || "";
  check("review: wrote a report in docs/reviews/code", rep, rep ? "" : "none");
  check("review: report says Reviewer: codex", /^Reviewer:\s*codex\b/m.test(rep));
  check("review: report says Author: claude (from the branch name)", /^Author:\s*claude\b/m.test(rep));
  check("review: report gives a verdict", /\b(approve|changes-requested|none)\b/.test(rep));
  check("review: report rests on a test record", /docs\/reviews\/tests\/[\w.-]+\.md/.test(rep));
  explain("review", run);
  settle("smoke: review");
  git("checkout", "-q", "main");
}

if (CASES.includes("e2e")) {
  const before = list("docs/reviews/tests");
  const run = codex("e2e", "$mflow-test e2e");
  const recs = newer("docs/reviews/tests", before).map((f) => read(`docs/reviews/tests/${f}`));
  check("e2e: no E2E record written", !recs.some((r) => /^Scope:.*e2e/im.test(r) && /^Result:\s*pass/m.test(r)));
  check("e2e: sends the user to Claude Code", /Claude Code/.test(run.message) && /\/mflow:test e2e/.test(run.message));
  const ran = commandsRun(run.out);
  check("e2e: Playwright never started", !ran.some((c) => /playwright\s+test/i.test(c) && !/\b(rg|grep|Select-String|findstr|Get-Content|cat|type)\b/.test(c)), `${ran.length} command(s) run`);
  explain("e2e", run);
  settle("smoke: e2e");
}

if (CASES.includes("self")) {
  git("checkout", "-q", "-b", "agent/codex/self", "main");
  file("sum.mjs", read("sum.mjs") + "export const twice = (a) => sum(a, a);\n");
  file("sum.test.mjs", read("sum.test.mjs").replace(/import \{ ([^}]*) \} from "\.\/sum\.mjs"/, (m, names) => `import { ${names.trim()}, twice } from "./sum.mjs"`) + 'test("twice", () => assert.equal(twice(4), 8));\n');
  git("add", "-A");
  git("commit", "-q", "-m", "add twice");
  const before = list("docs/reviews/code");
  const run = codex("self", `$mflow-review agent/codex/self --short${TESTS_HINT}`);
  const rep = newer("docs/reviews/code", before).map((f) => read(`docs/reviews/code/${f}`))[0] || "";
  check("self: wrote a report", rep, rep ? "" : "none");
  check("self: report says Author: codex", /^Author:\s*codex\b/m.test(rep));
  check("self: report names it a self-review that does not count", /self-review/i.test(rep));
  explain("self", run);
  settle("smoke: self review");
  git("checkout", "-q", "main");
}

const failed = results.filter((r) => !r.ok);
const summary = { codex: version.out.trim(), os: `${os.type()} ${os.release()}`, cases: CASES, passed: results.length - failed.length, failed: failed.length, folder: base };
if (failed.length || KEEP) summary.kept = true;
else fs.rmSync(base, { recursive: true, force: true });
process.stdout.write(`\n${JSON.stringify(summary, null, 2)}\n`);
if (summary.kept) process.stdout.write(`Transcripts: ${logs}${path.sep}<case>-log.txt; project: ${dir}\n`);
process.exit(failed.length ? 1 : 0);
