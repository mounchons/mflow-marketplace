#!/usr/bin/env node
// The test runner: runs the parts in .mtest/config.json one at a time, in the foreground, reads each
// tool's own results file (TRX, JUnit XML, Playwright JSON, Vitest/Jest JSON) rather than its console,
// and writes one record per run in mtest/runs/, tied to the commit it tested. No AI is needed: the same
// script runs from a Claude Code session part by part (`start`, `part`, `finish`, each within the
// shell's time limit) or from a terminal or a scheduler in one go (`all`).
//
// Rules carried over from real use: parts never run in parallel or in the background (a suite that did
// ran the machine out of memory); a part whose prerequisite is missing (a database that is not up) is
// recorded as skipped, never as a silent failure; Playwright never starts more browsers at once than
// `e2eMaxWorkers`; E2E parts stay out of the whole suite and run only in the `e2e` scope.
//
// Usage:
//   node run.mjs plan [--scope whole|e2e]
//   node run.mjs start [--scope whole|e2e|since|<label>] [--base <record>] [--by <who>] [--replace]
//   node run.mjs part <name> [--args "<extra arguments>"] [--label <row name>] [--timeout-min <n>]
//   node run.mjs finish
//   node run.mjs abort
//   node run.mjs all [--scope whole|e2e] [--by <who>]
//   node run.mjs since
//   node run.mjs last [--whole]
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PATHS, defaultBranch, duration, findRoot, git, loadConfig, matchesAny, pluginVersion, readJsonFile, recordHeader,
  toPosix, today, writeFileAtomic,
} from "./lib.mjs";

// ---------------------------------------------------------------------------------------------------
// Results files

const decode = (s) => String(s ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");
const attrs = (s) => Object.fromEntries([...String(s).matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], decode(m[2])]));
const firstLine = (s) => String(s ?? "").replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 240) ?? "";
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function filesIn(dir, ext) {
  const out = [];
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.toLowerCase().endsWith(ext)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

export function parseTrx(texts) {
  const r = { passed: 0, failed: 0, skipped: 0, failures: [] };
  for (const text of texts) {
    const c = attrs(/<Counters\b([^>]*)\/?>/.exec(text)?.[1] ?? "");
    r.passed += num(c.passed);
    r.failed += num(c.failed) + num(c.error) + num(c.timeout) + num(c.aborted);
    r.skipped += c.notExecuted !== undefined ? num(c.notExecuted) : Math.max(0, num(c.total) - num(c.executed));
    for (const m of text.matchAll(/<UnitTestResult\b([^>]*?)(?:\/>|>([\s\S]*?)<\/UnitTestResult>)/g)) {
      const a = attrs(m[1]);
      if (!/^(Failed|Error|Timeout|Aborted)$/i.test(a.outcome ?? "")) continue;
      r.failures.push({ test: a.testName ?? "?", message: firstLine(decode(/<Message>([\s\S]*?)<\/Message>/.exec(m[2] ?? "")?.[1] ?? a.outcome)) });
    }
  }
  return r;
}

export function parseJunit(texts) {
  const r = { passed: 0, failed: 0, skipped: 0, failures: [] };
  for (const text of texts) {
    let suites = [...text.matchAll(/<testsuite\b(?!s)([^>]*)>/g)].map((m) => attrs(m[1]));
    if (!suites.length) suites = [...text.matchAll(/<testsuites\b([^>]*)>/g)].map((m) => attrs(m[1]));
    for (const s of suites) {
      const failed = num(s.failures) + num(s.errors);
      const skipped = num(s.skipped ?? s.disabled);
      r.failed += failed;
      r.skipped += skipped;
      r.passed += Math.max(0, num(s.tests) - failed - skipped);
    }
    for (const m of text.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const body = m[2] ?? "";
      const f = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(body);
      if (!f) continue;
      const a = attrs(m[1]);
      const fa = attrs(f[2]);
      r.failures.push({ test: [a.classname, a.name].filter(Boolean).join(" › ") || "?", message: firstLine(fa.message || decode(f[3])) });
    }
  }
  return r;
}

export function parsePlaywrightJson(texts) {
  const r = { passed: 0, failed: 0, skipped: 0, flaky: 0, failures: [] };
  for (const text of texts) {
    const j = JSON.parse(text);
    const s = j.stats ?? {};
    r.passed += num(s.expected) + num(s.flaky);
    r.flaky += num(s.flaky);
    r.failed += num(s.unexpected);
    r.skipped += num(s.skipped);
    const walk = (suite, trail) => {
      const here = suite.title ? [...trail, suite.title] : trail;
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
          if (t.status !== "unexpected") continue;
          const last = (t.results ?? []).at(-1) ?? {};
          const msg = last.error?.message ?? last.errors?.[0]?.message ?? t.status;
          r.failures.push({ test: [...here, spec.title].join(" › "), message: firstLine(msg) });
        }
      }
      for (const child of suite.suites ?? []) walk(child, here);
    };
    for (const suite of j.suites ?? []) walk(suite, []);
  }
  return r;
}

export function parseJestJson(texts) {
  const r = { passed: 0, failed: 0, skipped: 0, failures: [] };
  for (const text of texts) {
    const j = JSON.parse(text);
    r.passed += num(j.numPassedTests);
    r.failed += num(j.numFailedTests);
    r.skipped += num(j.numPendingTests) + num(j.numTodoTests);
    for (const file of j.testResults ?? []) {
      for (const a of file.assertionResults ?? []) {
        if (a.status === "failed") r.failures.push({ test: a.fullName || a.title || "?", message: firstLine(a.failureMessages?.[0]) });
      }
      if (!(file.assertionResults ?? []).length && file.status === "failed") r.failures.push({ test: file.name ?? "?", message: firstLine(file.message) });
    }
  }
  return r;
}

/** Counts from a console summary, for when a tool wrote no results file. Null when none is recognised. */
export function parseConsole(text) {
  const t = String(text).replace(/\x1b\[[0-9;]*m/g, "");
  let r = null;
  const add = (p, f, s) => {
    r ??= { passed: 0, failed: 0, skipped: 0, failures: [] };
    r.passed += p; r.failed += f; r.skipped += s;
  };
  for (const m of t.matchAll(/(?:Passed|Failed)!\s*-\s*Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*(\d+)/g)) add(num(m[2]), num(m[1]), num(m[3]));
  if (r) return r;
  for (const m of t.matchAll(/total:\s*\d+\s+failed:\s*(\d+)\s+succeeded:\s*(\d+)\s+skipped:\s*(\d+)/gi)) add(num(m[2]), num(m[1]), num(m[3]));
  if (r) return r;
  const vit = /Tests\s+(?:(\d+) failed\s*\|\s*)?(?:(\d+) passed)?(?:\s*\|\s*(\d+) skipped)?\s*\((\d+)\)/.exec(t);
  if (vit) { add(num(vit[2]), num(vit[1]), num(vit[3])); return r; }
  const pw = { passed: /^\s*(\d+) passed\b/m, failed: /^\s*(\d+) failed\b/m, skipped: /^\s*(\d+) skipped\b/m, flaky: /^\s*(\d+) flaky\b/m };
  const got = Object.fromEntries(Object.entries(pw).map(([k, re]) => [k, num(re.exec(t)?.[1])]));
  if (got.passed || got.failed || got.flaky) { add(got.passed + got.flaky, got.failed, got.skipped); return r; }
  const py = /=+ (.*?(?:passed|failed).*?) in [\d.]+s/.exec(t);
  if (py) {
    const n = (w) => num(new RegExp(`(\\d+) ${w}`).exec(py[1])?.[1]);
    add(n("passed"), n("failed") + n("error"), n("skipped"));
  }
  return r;
}

const PARSERS = {
  trx: { ext: ".trx", parse: parseTrx },
  junit: { ext: ".xml", parse: parseJunit },
  "playwright-json": { ext: ".json", parse: parsePlaywrightJson },
  "vitest-json": { ext: ".json", parse: parseJestJson },
  "jest-json": { ext: ".json", parse: parseJestJson },
};

// ---------------------------------------------------------------------------------------------------
// Commands

const q = (p) => `"${p}"`;

/** The command line to run, the environment it needs, and where its results land. */
export function buildCommand(part, extra, dir) {
  const results = part.results ?? "exit";
  const out = path.join(dir, results === "trx" ? "results.trx" : results === "junit" ? "results.xml" : "results.json");
  let cmd = part.command.trim();
  if (extra) cmd += ` ${extra}`;
  const env = {};
  const hasPlaceholder = /\{(out|dir)\}/.test(cmd) || part.resultsArgs;
  if (part.resultsArgs) cmd += ` ${part.resultsArgs}`;
  if (!hasPlaceholder) {
    if (results === "trx") cmd += ` --logger trx --results-directory ${q(dir)}`;
    else if (results === "playwright-json") cmd += " --reporter=list,json";
    else if (results === "vitest-json") cmd += ` --reporter=default --reporter=json --outputFile.json=${q(out)}`;
    else if (results === "jest-json") cmd += ` --json --outputFile=${q(out)}`;
  }
  if (results === "playwright-json") {
    env.PLAYWRIGHT_JSON_OUTPUT_NAME = out;
    env.PLAYWRIGHT_JSON_OUTPUT_FILE = out;
  }
  cmd = cmd.replaceAll("{out}", q(out)).replaceAll("{dir}", q(dir));
  return { cmd, env, out };
}

/** The workers a Playwright command asks for: a number, null when it sets none, NaN when unreadable. */
export function workersArg(cmd) {
  const m = /(?:^|\s)(?:--workers(?:=|\s+)|-j\s*)(\S+)/.exec(cmd);
  if (!m) return null;
  const n = Number(m[1].replace(/^["']|["']$/g, ""));
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

/** `workers:` set to a plain number in the Playwright config of `dir`, or null. */
export function configWorkers(dir) {
  for (const name of ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs", "playwright.config.cjs", "playwright.config.mts", "playwright.config.cts"]) {
    let text;
    try { text = fs.readFileSync(path.join(dir, name), "utf8"); } catch { continue; }
    return workersInConfig(text);
  }
  return null;
}

/** `workers:` as a plain number in the text of a Playwright config, comments left out; null otherwise. */
export function workersInConfig(text) {
  const code = String(text).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  const m = /(?:^|[{,\s])workers\s*:\s*(\d+)\s*(?=[,}\r\n]|$)/m.exec(code);
  return m ? Number(m[1]) : null;
}

/** For an E2E part: the command with a workers cap, or why it may not run. */
export function capWorkers(cmd, cwd, cap) {
  if (!/playwright/i.test(cmd)) return { cmd };
  const asked = workersArg(cmd);
  if (Number.isNaN(asked)) return { refused: `the command's --workers value cannot be read; give a whole number of at most ${cap}` };
  if (asked !== null) return asked > cap ? { refused: `the command asks for ${asked} browsers at once; the project allows at most ${cap} (e2eMaxWorkers)` } : { cmd };
  const fromConfig = configWorkers(cwd);
  if (fromConfig !== null && fromConfig <= cap) return { cmd };
  return { cmd: `${cmd} --workers=${cap}` };
}

/** Whether every requirement holds; each entry is alternatives separated by `|`. */
export async function checkRequires(requires = [], cwd) {
  const missing = [];
  for (const entry of requires) {
    const alts = entry.split(/\s+\|\s+/).map((s) => s.trim()).filter(Boolean);
    let ok = false;
    for (const alt of alts) {
      if (await holds(alt, cwd)) { ok = true; break; }
    }
    if (!ok) missing.push(entry);
  }
  return missing;
}

async function holds(req, cwd) {
  const m = /^(tcp|env|cmd|file):(.+)$/.exec(req);
  if (!m) return false;
  const [, kind, what] = m;
  if (kind === "env") return Boolean(process.env[what.trim()]);
  if (kind === "file") return fs.existsSync(path.resolve(cwd, what.trim()));
  if (kind === "cmd") return spawnSync(what, { shell: true, cwd, stdio: "ignore", timeout: 15000, windowsHide: true }).status === 0;
  const hp = /^(.*):(\d+)$/.exec(what.trim());
  if (!hp) return false;
  return new Promise((resolve) => {
    const sock = net.connect({ host: hp[1] || "localhost", port: Number(hp[2]) });
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(2000, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

function killTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else {
    try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch { /* gone */ } }
  }
}

/** Run a shell command to completion, its output into `logFile`. */
function runShell(cmd, { cwd, env, logFile, timeoutMs }) {
  return new Promise((resolve) => {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const log = fs.createWriteStream(logFile);
    log.write(`$ ${cmd}\n(cwd: ${cwd})\n\n`);
    const started = Date.now();
    let tail = "";
    const child = spawn(cmd, {
      cwd,
      shell: true,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", ...env },
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const take = (d) => {
      log.write(d);
      tail = (tail + d.toString()).slice(-200000);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    child.on("error", (err) => take(Buffer.from(`\n[mtest] could not start: ${err.message}\n`)));
    child.on("close", (code) => {
      clearTimeout(timer);
      const seconds = (Date.now() - started) / 1000;
      log.end(`\n[mtest] exit ${code}${timedOut ? " (timed out)" : ""} after ${duration(seconds)}\n`);
      resolve({ code, timedOut, seconds, output: tail });
    });
  });
}

// ---------------------------------------------------------------------------------------------------
// Runs and records

const gitInfo = (root) => {
  const commit = git(root, "rev-parse", "HEAD");
  const branch = git(root, "rev-parse", "--abbrev-ref", "HEAD");
  const status = git(root, "status", "--porcelain");
  const changed = (status ?? "").split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).split(" -> ").pop().replace(/^"|"$/g, ""))
    .filter((f) => !/^mtest\//.test(f) && !(/^\.mtest\//.test(f) && f !== ".mtest/config.json"));
  return { commit: commit ?? "none", branch: branch ?? "none", dirty: changed.length > 0, uncommitted: changed };
};

/** Which parts a scope expects: the whole suite is every part but E2E; `e2e` is the build and the E2E parts. */
export function expectedParts(cfg, scope) {
  if (scope === "whole") return cfg.parts.filter((p) => p.kind !== "e2e").map((p) => p.name);
  if (scope === "e2e") return cfg.parts.filter((p) => p.kind === "build" || p.kind === "e2e").map((p) => p.name);
  return [];
}

const scopeLabel = (scope, base) => (scope === "whole" ? "whole suite" : scope === "since" ? `since ${base?.short ?? "?"}` : scope);

export function listRecords(root) {
  const dir = path.join(root, PATHS.runs);
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f)); } catch { return []; }
  return names.map((name) => {
    const text = fs.readFileSync(path.join(dir, name), "utf8");
    const h = recordHeader(text);
    const table = text.replace(/\\\|/g, "\u0000");
    const tested = /^(.*) at ([0-9a-f]{7,40}|none)( with uncommitted changes)?$/.exec(h.Tested ?? "") ?? [];
    const rows = [...table.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*`?([^|]*?)`?\s*\|\s*([^|]+?)\s*\|/gm)]
      .map((m) => ({ part: m[1], kind: m[2], result: m[4] })).filter((r) => r.part !== "Part" && !/^-+$/.test(r.part));
    return {
      file: `${PATHS.runs}/${name}`,
      branch: tested[1] ?? null,
      commit: tested[2] ?? null,
      dirty: Boolean(tested[3]),
      scope: h.Scope ?? "",
      result: h.Result ?? "",
      duration: h.Duration ?? "",
      started: h.Started ?? "",
      by: h.By ?? "",
      rows,
      failures: (/## Failures\r?\n([\s\S]*?)(?:\r?\n## |$)/.exec(text)?.[1] ?? "").split(/\r?\n/).filter((l) => l.startsWith("- ")).map((l) => l.slice(2)),
    };
  }).sort((a, b) => (b.started || b.file).localeCompare(a.started || a.file));
}

const isWhole = (r) => r.scope === "whole suite" || r.scope.startsWith("since ");

function recordName(root, commit) {
  const short = commit === "none" ? "nogit" : commit.slice(0, 7);
  const base = `${today()}-${short}`;
  let name = `${base}.md`;
  for (let i = 2; fs.existsSync(path.join(root, PATHS.runs, name)); i++) name = `${base}-${i}.md`;
  return `${PATHS.runs}/${name}`;
}

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function overall(run, expected) {
  const ran = run.parts;
  const notRun = expected.filter((n) => !ran.some((p) => p.name === n));
  if (ran.some((p) => ["fail", "timeout", "refused"].includes(p.result))) return { result: "fail", notRun };
  if (!ran.length || notRun.length || ran.some((p) => p.result !== "pass")) return { result: "incomplete", notRun };
  return { result: "pass", notRun };
}

function renderRecord(run) {
  const expected = run.expected ?? [];
  const { result, notRun } = overall(run, expected);
  const total = run.parts.reduce((n, p) => n + (p.seconds ?? 0), 0);
  const lines = [
    `Tested: ${run.branch} at ${run.commit}${run.dirty ? " with uncommitted changes" : ""}`,
    `By: ${run.by}`,
    `Scope: ${run.scopeLabel}`,
  ];
  if (run.base) lines.push(`Base: ${run.base.file}`);
  lines.push(`Result: ${result}`, `Duration: ${duration(total)}`, `Started: ${run.startedAt}`, `Tool: mtest ${pluginVersion()}`, "");
  lines.push("| Part | Kind | Command | Result | Passed | Failed | Skipped | Duration |", "|---|---|---|---|---|---|---|---|");
  for (const p of run.parts) {
    const n = (v) => (v === null || v === undefined ? "" : String(v));
    lines.push(`| ${cell(p.label)} | ${p.kind} | \`${cell(p.command)}\` | ${cell(p.result + (p.note ? ` (${p.note})` : ""))} | ${n(p.passed)} | ${n(p.failed)} | ${n(p.skipped)} | ${duration(p.seconds ?? 0)} |`);
  }
  lines.push("", "## Failures");
  const failures = run.parts.flatMap((p) => (p.failures ?? []).map((f) => `- ${p.label} › ${f.test}: ${f.message}`));
  lines.push(...(failures.length ? failures.slice(0, 200) : ["none"]));
  if (failures.length > 200) lines.push(`- …and ${failures.length - 200} more (see the logs)`);
  const skipped = run.parts.filter((p) => p.result !== "pass" && p.result !== "fail");
  if (notRun.length || skipped.length) {
    lines.push("", "## Not run or not finished");
    for (const p of skipped) lines.push(`- ${p.label}: ${p.result}${p.note ? ` — ${p.note}` : ""}`);
    for (const n of notRun) lines.push(`- ${n}: not run in this record`);
  }
  if (run.changedFiles?.length) lines.push("", "## Changed since the base", run.changedFiles.slice(0, 60).map((f) => `\`${f}\``).join(", "));
  lines.push("", `Logs: \`${PATHS.logs}/${run.id}/\` (not committed)`);
  return { text: lines.join("\n") + "\n", result, notRun, seconds: total };
}

function openRun(root) {
  return readJsonFile(path.join(root, PATHS.openRun));
}

function saveRun(root, run) {
  writeFileAtomic(path.join(root, PATHS.openRun), JSON.stringify(run, null, 2) + "\n");
}

export function start(root, cfg, { scope = "whole", by, base = null, replace = false, changedFiles = [] } = {}) {
  const existing = openRun(root);
  if (existing && !replace) throw new Error(`a run started ${existing.startedAt} is still open (${existing.scopeLabel}); finish it, abort it, or start with --replace`);
  const info = gitInfo(root);
  const id = `${today()}-${info.commit.slice(0, 7)}-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`;
  const baseRec = base ? listRecords(root).find((r) => r.file === base || r.file.endsWith(`/${base}`)) : null;
  if (base && !baseRec) throw new Error(`no record ${base} in ${PATHS.runs}/`);
  const run = {
    id,
    scope,
    scopeLabel: scopeLabel(scope, baseRec ? { short: baseRec.commit?.slice(0, 7) } : null),
    by: by || process.env.MTEST_BY || (process.env.CLAUDECODE ? "claude" : "user"),
    branch: info.branch,
    commit: info.commit,
    dirty: info.dirty,
    startedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    expected: expectedParts(cfg, scope),
    base: baseRec ? { file: baseRec.file, commit: baseRec.commit } : null,
    changedFiles,
    parts: [],
  };
  saveRun(root, run);
  return run;
}

export async function runPart(root, cfg, name, { extra = "", label, timeoutMin } = {}) {
  const run = openRun(root);
  if (!run) throw new Error("no open run: start one first (run.mjs start)");
  const part = cfg.parts.find((p) => p.name === name);
  if (!part) throw new Error(`no part named ${name} in .mtest/config.json (parts: ${cfg.parts.map((p) => p.name).join(", ") || "none"})`);
  const head = git(root, "rev-parse", "HEAD") ?? "none";
  if (head !== run.commit) throw new Error(`HEAD moved from ${run.commit.slice(0, 7)} to ${head.slice(0, 7)} since this run started; abort it and start again`);
  let rowLabel = label || name;
  for (let i = 2; run.parts.some((p) => p.label === rowLabel); i++) rowLabel = `${label || name}-${i}`;
  const cwd = path.join(root, part.cwd ?? ".");
  const dir = path.join(root, PATHS.tmp, run.id, rowLabel);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let { cmd, env, out } = buildCommand(part, extra, dir);
  const row = { name, label: rowLabel, kind: part.kind, command: cmd.replaceAll(dir, "<results>"), result: "pass", passed: null, failed: null, skipped: null, seconds: 0, failures: [] };
  const finish = (r) => {
    run.parts.push(r);
    saveRun(root, run);
    return r;
  };

  if (part.kind !== "build" && run.parts.some((p) => p.kind === "build" && p.result !== "pass")) {
    return finish({ ...row, result: "not run", note: "the build failed in this run" });
  }
  const missing = await checkRequires(part.requires, cwd);
  if (missing.length) return finish({ ...row, result: "skipped", note: `prerequisite not met: ${missing.join("; ")}` });
  if (part.kind === "e2e") {
    const capped = capWorkers(cmd, cwd, cfg.e2eMaxWorkers);
    if (capped.refused) return finish({ ...row, result: "refused", note: capped.refused });
    cmd = capped.cmd;
    row.command = cmd.replaceAll(dir, "<results>");
  }

  const minutes = timeoutMin ?? part.timeoutMin ?? (process.env.CLAUDECODE ? 9 : 60);
  const logFile = path.join(root, PATHS.logs, run.id, `${rowLabel}.log`);
  const res = await runShell(cmd, { cwd, env, logFile, timeoutMs: minutes * 60000 });
  row.seconds = Math.round(res.seconds);
  row.log = toPosix(path.relative(root, logFile));

  const results = part.results ?? "exit";
  let counts = null;
  if (PARSERS[results]) {
    const files = results === "trx" ? filesIn(dir, ".trx") : fs.existsSync(out) ? [out] : filesIn(dir, PARSERS[results].ext);
    try {
      if (files.length) counts = PARSERS[results].parse(files.map((f) => fs.readFileSync(f, "utf8")));
    } catch (err) {
      row.note = `results file unreadable: ${err.message.slice(0, 120)}`;
    }
    if (!counts) {
      counts = parseConsole(res.output);
      if (counts) row.note = row.note ?? "counts from the console, no results file";
    }
  }
  if (counts) Object.assign(row, { passed: counts.passed, failed: counts.failed, skipped: counts.skipped, failures: counts.failures });
  if (counts?.flaky) row.note = [row.note, `${counts.flaky} flaky`].filter(Boolean).join("; ");

  if (res.timedOut) Object.assign(row, { result: "timeout", note: `stopped after ${minutes} min: split this part (see partMinutes)` });
  else if (res.code !== 0 || (counts && counts.failed > 0)) {
    row.result = "fail";
    if (counts && counts.failed === 0) row.note = [row.note, `exit ${res.code}: see ${row.log}`].filter(Boolean).join("; ");
    if (!counts && results !== "exit") row.note = `exit ${res.code}, no results: see ${row.log}`;
    if (!counts && results === "exit") row.failures = [{ test: name, message: firstLine(res.output.split(/\r?\n/).filter((l) => /error|fail/i.test(l)).slice(-1)[0] ?? `exit ${res.code}`) }];
  }
  return finish(row);
}

export function finishRun(root, cfg) {
  const run = openRun(root);
  if (!run) throw new Error("no open run to finish");
  const rel = recordName(root, run.commit);
  const r = renderRecord(run);
  writeFileAtomic(path.join(root, rel), r.text);
  fs.rmSync(path.join(root, PATHS.openRun), { force: true });
  fs.rmSync(path.join(root, PATHS.tmp, run.id), { recursive: true, force: true });
  return { record: rel, result: r.result, scope: run.scopeLabel, duration: duration(r.seconds), notRun: r.notRun, parts: run.parts.map((p) => ({ part: p.label, result: p.result, passed: p.passed, failed: p.failed, skipped: p.skipped, note: p.note ?? null })) };
}

/** What a later commit needs since the newest whole-suite record that is an ancestor of HEAD. */
export function since(root, cfg) {
  const info = gitInfo(root);
  const records = listRecords(root);
  const base = records.find((r) => isWhole(r) && !r.dirty && r.commit && r.commit !== "none" &&
    (r.commit === info.commit || git(root, "merge-base", "--is-ancestor", r.commit, "HEAD") !== null));
  if (!base) return { decision: "whole", why: "no whole-suite record on an ancestor of HEAD", base: null, changedFiles: [] };
  const committed = base.commit === info.commit ? [] : (git(root, "diff", "--name-only", `${base.commit}..HEAD`) ?? "").split(/\r?\n/).filter(Boolean);
  const changedFiles = [...new Set([...committed, ...info.uncommitted])].filter((f) => !/^(mtest|\.mtest)\//.test(f) || f === ".mtest/config.json");
  // Every part the base did not prove: failed, timed out, skipped, not run, or missing from it.
  const passed = new Set(base.rows.filter((r) => r.result === "pass").map((r) => r.part));
  const known = new Set(cfg.parts.map((p) => p.name));
  const rerunParts = [...new Set([
    ...base.rows.filter((r) => r.result !== "pass" && known.has(r.part)).map((r) => r.part),
    ...(base.scope === "whole suite" ? expectedParts(cfg, "whole").filter((n) => !passed.has(n)) : []),
  ])];
  const out = { base: { file: base.file, commit: base.commit, result: base.result }, changedFiles, rerunParts, failedTests: base.failures };
  // Checked before the documents, so `requirements.txt` counts as a dependency, not as text.
  const global = changedFiles.filter((f) => matchesAny(f, cfg.wholeSuiteOn));
  if (global.length) return { decision: "whole", why: `changes whose effect is not local: ${global.slice(0, 8).join(", ")}`, ...out };
  const code = changedFiles.filter((f) => !matchesAny(f, cfg.docsOnly));
  if (!code.length && !rerunParts.length) return { decision: "none", why: changedFiles.length ? "documents only" : "nothing changed", ...out };
  const partsHit = cfg.parts.filter((p) => p.kind !== "e2e" && p.paths?.length && code.some((f) => matchesAny(f, p.paths))).map((p) => p.name);
  const unmapped = cfg.parts.filter((p) => p.kind !== "e2e" && p.kind !== "build" && !p.paths?.length).map((p) => p.name);
  return { decision: "targeted", why: "code changed locally: the build, the failed parts, the changed tests and the tests of the changed code", codeFiles: code, partsHit, partsWithoutPaths: unmapped, ...out };
}

/**
 * The parts some record shows passing (a row named after the part, or a repeat of it such as `unit-2`).
 * A part counts as verified once it has, so nothing writes to .mtest/config.json after a run: a config
 * change would make the next `since` run the whole suite.
 */
export function verifiedParts(root, cfg, records = listRecords(root)) {
  const names = cfg.parts.map((p) => p.name);
  const out = new Set();
  for (const r of records) {
    for (const row of r.rows) {
      if (row.result !== "pass") continue;
      const name = names.find((n) => row.part === n || new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+$`).test(row.part));
      if (name) out.add(name);
    }
  }
  return out;
}

/** The runner as a terminal would call it: this script, and the project's copy when there is one. */
function runnerPaths(root) {
  const self = toPosix(fileURLToPath(import.meta.url));
  const copy = path.join(root, PATHS.vendor, "scripts", "run.mjs");
  return { runner: self, copy: fs.existsSync(copy) ? toPosix(path.relative(root, copy)) : null };
}

async function plan(root, cfg, scope) {
  const expected = expectedParts(cfg, scope);
  const records = listRecords(root);
  const lastWhole = records.find((r) => (scope === "e2e" ? r.scope.startsWith("e2e") : isWhole(r)));
  const verified = verifiedParts(root, cfg, records);
  const parts = [];
  for (const p of cfg.parts) {
    const cwd = path.join(root, p.cwd ?? ".");
    const missing = expected.includes(p.name) ? await checkRequires(p.requires, cwd) : [];
    parts.push({ name: p.name, kind: p.kind, inScope: expected.includes(p.name), verified: verified.has(p.name), command: p.command, cwd: p.cwd ?? ".", prerequisitesMissing: missing });
  }
  const open = openRun(root);
  return {
    scope, git: gitInfo(root), defaultBranch: defaultBranch(root, cfg), parts,
    last: lastWhole ? { file: lastWhole.file, result: lastWhole.result, duration: lastWhole.duration } : null,
    open: open ? { startedAt: open.startedAt, scope: open.scopeLabel } : null,
    ...runnerPaths(root),
  };
}

// ---------------------------------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const opt = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (!root) {
    process.stderr.write("no .mtest/config.json here or above: run /mtest:init first\n");
    process.exit(2);
  }
  const cfg = loadConfig(root);
  const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + "\n");
  const scope = opt("--scope") ?? "whole";
  try {
    switch (cmd) {
      case "plan":
        return out(await plan(root, cfg, scope));
      case "start": {
        let changedFiles = [];
        let base = opt("--base");
        if (scope === "since" && !base) {
          const s = since(root, cfg);
          if (!s.base) throw new Error("no whole-suite record to start `since` from: run the whole suite");
          base = s.base.file;
          changedFiles = s.changedFiles;
        }
        const run = start(root, cfg, { scope, by: opt("--by"), base, replace: argv.includes("--replace"), changedFiles });
        return out({ started: run.id, scope: run.scopeLabel, commit: run.commit, dirty: run.dirty, expected: run.expected });
      }
      case "part": {
        const name = argv[1];
        const t = opt("--timeout-min");
        return out(await runPart(root, cfg, name, { extra: opt("--args") ?? "", label: opt("--label"), timeoutMin: t ? Number(t) : undefined }));
      }
      case "finish":
        return out(finishRun(root, cfg));
      case "abort": {
        const run = openRun(root);
        fs.rmSync(path.join(root, PATHS.openRun), { force: true });
        if (run) fs.rmSync(path.join(root, PATHS.tmp, run.id), { recursive: true, force: true });
        return out({ aborted: run ? run.id : null });
      }
      case "all": {
        if (!["whole", "e2e"].includes(scope)) throw new Error("all runs the whole suite or e2e");
        const run = start(root, cfg, { scope, by: opt("--by"), replace: argv.includes("--replace") });
        for (const name of run.expected) {
          process.stderr.write(`[mtest] ${name}…\n`);
          const r = await runPart(root, cfg, name, { timeoutMin: opt("--timeout-min") ? Number(opt("--timeout-min")) : undefined });
          process.stderr.write(`[mtest] ${name}: ${r.result}${r.passed !== null ? ` (${r.passed} passed, ${r.failed} failed, ${r.skipped} skipped)` : ""} in ${duration(r.seconds)}\n`);
        }
        const done = finishRun(root, cfg);
        out(done);
        if (done.result !== "pass") process.exitCode = 1;
        return;
      }
      case "since":
        return out(since(root, cfg));
      case "last": {
        const recs = listRecords(root).filter((r) => !argv.includes("--whole") || isWhole(r));
        return out(recs[0] ?? null);
      }
      default:
        process.stderr.write("usage: run.mjs plan|start|part <name>|finish|abort|all|since|last (see the header of this file)\n");
        process.exit(2);
    }
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
