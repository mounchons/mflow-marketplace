// Shared fixtures for the mtest regression tests. Every test builds a throwaway project under the OS temp
// folder and runs the plugin scripts as separate processes, the way hooks and skills do. Synthetic data
// only; nothing here talks to another service.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PLUGIN = path.join(REPO, "plugins", "mtest");
export const SCRIPTS = path.join(PLUGIN, "scripts");

/** A new project (with .mtest/config.json unless `marker` is false), optionally a git repository. */
export function project({ marker = true, config = {}, git = false } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "mtest-test-"));
  const root = path.join(base, "proj");
  const temp = path.join(base, "temp");
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(temp);
  const p = {
    base,
    root,
    temp,
    file: (rel) => path.join(root, rel),
    write(rel, text) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text);
      return full;
    },
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    exists: (rel) => fs.existsSync(path.join(root, rel)),
    config(cfg) {
      p.write(".mtest/config.json", JSON.stringify({ version: 1, ...cfg }, null, 2) + "\n");
    },
    git: (...args) => {
      const r = spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: base } });
      if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
      return r.stdout.trim();
    },
    commit(message = "change") {
      p.git("add", "-A");
      p.git("commit", "-q", "-m", message, "--allow-empty");
      return p.git("rev-parse", "HEAD");
    },
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
  if (marker) p.config(config);
  if (git) {
    p.git("init", "-q", "-b", "main");
    p.git("config", "user.email", "test@example.com");
    p.git("config", "user.name", "Test");
    p.git("config", "commit.gpgsign", "false");
    p.write(".gitignore", ".mtest/logs/\n.mtest/tmp/\n.mtest/run-open.json\n");
    p.commit("init");
  }
  return p;
}

// GIT_CEILING_DIRECTORIES stops git from finding a repository above the test project.
const scriptEnv = (p, env) => ({
  ...process.env, CLAUDE_PROJECT_DIR: p.root, TEMP: p.temp, TMP: p.temp, TMPDIR: p.temp, GIT_CEILING_DIRECTORIES: p.base, ...env,
});

function result(status, stdout, stderr) {
  let json = null;
  try { json = JSON.parse(stdout); } catch { /* not JSON */ }
  return { status, stdout, stderr, json };
}

/** Run a plugin script from `cwd` (default: the project root) with CLAUDE_PROJECT_DIR set to the root. */
export function run(p, script, args = [], { input, cwd, env = {} } = {}) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd: cwd || p.root,
    input: input === undefined ? "" : typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env: scriptEnv(p, env),
    timeout: 120_000,
  });
  return result(r.status, r.stdout, r.stderr);
}

/** Every file under `dir`, relative to it with forward slashes. */
export function walk(dir, base = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

/**
 * A fake test tool, written into the project as `fake.mjs`: it writes the results file its mode names
 * where the runner asked for it, prints its arguments, and exits as told.
 *   node fake.mjs trx <passed> <failed>        a TRX file in --results-directory
 *   node fake.mjs junit <passed> <failed> <out>
 *   node fake.mjs pw <passed> <failed>         Playwright JSON at PLAYWRIGHT_JSON_OUTPUT_NAME
 *   node fake.mjs jest <passed> <failed>       Jest JSON at --outputFile=
 *   node fake.mjs console <passed> <failed>    only a dotnet console summary
 *   node fake.mjs exit <code>
 *   node fake.mjs sleep <ms>
 */
export const FAKE = `
import fs from "node:fs";
import path from "node:path";
const [mode, a, b, c] = process.argv.slice(2);
const passed = Number(a ?? 0), failed = Number(b ?? 0);
console.log("ARGS " + JSON.stringify(process.argv.slice(2)));
const after = (flag) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : null; };
if (mode === "trx") {
  const dir = after("--results-directory");
  const results = Array.from({ length: failed }, (_, i) => '<UnitTestResult testName="Ns.Tests.Fails' + i + '" outcome="Failed"><Output><ErrorInfo><Message>Assert.Equal() Failure: expected 1 &amp; got 2</Message></ErrorInfo></Output></UnitTestResult>').join("");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "x.trx"), '<TestRun><Results>' + results + '</Results><ResultSummary><Counters total="' + (passed + failed + 1) + '" executed="' + (passed + failed) + '" passed="' + passed + '" failed="' + failed + '" error="0" timeout="0" aborted="0" notExecuted="1" /></ResultSummary></TestRun>');
  process.exit(failed ? 1 : 0);
}
if (mode === "junit") {
  fs.writeFileSync(c, '<testsuites><testsuite name="s" tests="' + (passed + failed) + '" failures="' + failed + '" errors="0" skipped="0">' + (failed ? '<testcase classname="mod" name="test_bad"><failure message="assert 1 == 2"/></testcase>' : '') + '</testsuite></testsuites>');
  process.exit(failed ? 1 : 0);
}
if (mode === "pw") {
  const out = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;
  const specs = failed ? [{ title: "AC-19 upload", tests: [{ status: "unexpected", results: [{ error: { message: "expect(locator).toBeVisible() failed" } }] }] }] : [];
  fs.writeFileSync(out, JSON.stringify({ suites: [{ title: "flows.spec.ts", specs }], stats: { expected: passed, unexpected: failed, flaky: 0, skipped: 0 } }));
  process.exit(failed ? 1 : 0);
}
if (mode === "jest") {
  const out = process.argv.find((x) => x.startsWith("--outputFile="))?.slice(13);
  fs.writeFileSync(out, JSON.stringify({ numPassedTests: passed, numFailedTests: failed, numPendingTests: 0, testResults: [{ assertionResults: failed ? [{ status: "failed", fullName: "cart adds", failureMessages: ["expected 2"] }] : [] }] }));
  process.exit(failed ? 1 : 0);
}
if (mode === "console") {
  console.log((failed ? "Failed!" : "Passed!") + "  - Failed:     " + failed + ", Passed:    " + passed + ", Skipped:     0, Total:    " + (passed + failed) + ", Duration: 1 s - X.dll (net10.0)");
  process.exit(failed ? 1 : 0);
}
if (mode === "exit") process.exit(Number(a));
if (mode === "sleep") setTimeout(() => process.exit(0), Number(a));
`;
