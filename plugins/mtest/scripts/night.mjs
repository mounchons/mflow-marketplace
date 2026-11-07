#!/usr/bin/env node
// The state of one night run (/mtest:night), in a file the run writes after every step, so a run whose context
// was compacted, or whose session was restarted, goes on from the first step that is not finished, and the morning
// finds what happened, step by step. The run is started by the user; nothing here schedules it.
//
// A run: mtest/night/<date>-<HHMM>.md, open until it has a `Finished:` line. Its steps, in order:
// preflight, test, test-fix, review, review-fix, e2e-write, e2e, verify, report. A step is finished when its last
// event without a target is done, skipped or stopped. Events with a target (a change, a fix branch, a screen) count
// the rounds spent on that target: `round` adds one, and `roundsLeft` is the run's --rounds minus them.
//
//   node night.mjs start [--until HH:MM] [--rounds <n>]                    -> JSON { file, started, until, rounds, where, branch, commit }
//   node night.mjs log <step> <state> [--target <name>] [--note <text>]   -> JSON { file, event }
//   node night.mjs status                                                 -> JSON { open, file, until, minutesLeft, overtime, next, steps, targets, ... }
//   node night.mjs finish [--result done|stopped]                         -> JSON { file, finished, result }
//
// --until is local time (default 06:00), the next time the clock shows it; --rounds is 1–10 (default 3).
// `where` is cloud when CLAUDE_CODE_REMOTE is set (Claude Code on the web), cli otherwise. NIGHT_NOW (an ISO time)
// stands in for the clock in tests.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, readText, writeFileAtomic } from "./lib.mjs";

export const DIR = "mtest/night";
export const STEPS = ["preflight", "test", "test-fix", "review", "review-fix", "e2e-write", "e2e", "verify", "report"];
export const STATES = ["started", "round", "done", "skipped", "stopped"];
const FINISHED = new Set(["done", "skipped", "stopped"]);
const ROW = /^\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*(.*?)\s*\|\s*$/;

const now = () => (process.env.NIGHT_NOW ? new Date(process.env.NIGHT_NOW) : new Date());
const pad = (n) => String(n).padStart(2, "0");
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const local = (d) => `${localDay(d)} ${localTime(d)}`;
const cell = (s) => String(s ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
const uncell = (s) => s.replace(/\\\|/g, "|");

function git(root, ...args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** The next moment the local clock shows HH:MM, after `from`. */
export function untilFrom(from, hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`--until takes a local time HH:MM, not "${hhmm}"`);
  const at = new Date(from);
  at.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (at <= from) at.setDate(at.getDate() + 1);
  return at;
}

/** A run file as data: its header lines, its events and whether it finished. */
export function parse(text) {
  const head = {};
  const events = [];
  let finished = null;
  let inTable = false;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const h = /^(Started|Until|Rounds|Where|Branch|Commit): (.*)$/.exec(line);
    if (h) head[h[1].toLowerCase()] = h[2].trim();
    const f = /^Finished: (\S+)(?: \(([^)]*)\))?/.exec(line);
    if (f) finished = { at: f[1], result: f[2] ?? "done" };
    if (/^\|\s*Time\s*\|/.test(line)) { inTable = true; continue; }
    if (!inTable || /^\|\s*-/.test(line)) continue;
    const r = ROW.exec(line);
    if (!r) { if (line.trim() && !line.startsWith("|")) inTable = false; continue; }
    events.push({ time: r[1], step: r[2], target: uncell(r[3]), state: r[4], note: uncell(r[5]) });
  }
  return { head, events, finished };
}

/** The open run (the newest file without a Finished line), or null; the newest run either way. */
function runs(root) {
  const dir = path.join(root, DIR);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?\.md$/.test(f)).sort() : [];
  const newest = files.length ? path.join(dir, files[files.length - 1]) : null;
  for (const f of [...files].reverse()) {
    const full = path.join(dir, f);
    if (!parse(readText(full)).finished) return { open: full, newest };
  }
  return { open: null, newest };
}

/** What the run file says now: the next step, each step's state, the rounds per target, the time left. */
export function summary(file, at = now()) {
  const { head, events, finished } = parse(readText(file));
  const rounds = Number(head.rounds) || 3;
  const until = head.until ? new Date(head.until.split(" ")[0]) : null;
  const steps = Object.fromEntries(STEPS.map((s) => [s, "open"]));
  const targets = {};
  for (const e of events) {
    if (!STEPS.includes(e.step)) continue;
    if (!e.target) { steps[e.step] = e.state; continue; }
    const key = `${e.step} ${e.target}`;
    const t = (targets[key] ??= { step: e.step, target: e.target, rounds: 0, state: "open", note: "" });
    if (e.state === "round") t.rounds += 1;
    t.state = e.state;
    if (e.note) t.note = e.note;
  }
  for (const t of Object.values(targets)) t.roundsLeft = Math.max(0, rounds - t.rounds);
  const minutesLeft = until ? Math.floor((until - at) / 60000) : null;
  return {
    open: !finished,
    file,
    started: head.started ?? null,
    until: head.until ?? null,
    minutesLeft,
    overtime: minutesLeft !== null && minutesLeft <= 0,
    rounds,
    where: head.where ?? null,
    branch: head.branch ?? null,
    commit: head.commit ?? null,
    next: finished ? null : STEPS.find((s) => !FINISHED.has(steps[s])) ?? null,
    steps,
    targets: Object.values(targets),
    events: events.length,
    finished,
  };
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[i + 1];
      // A flag with no value (such as --no-e2e, which the skill reads) is true, and the script ignores it.
      if (value === undefined || value.startsWith("--")) { out[key] = true; continue; }
      out[key] = value;
      i++;
    } else out._.push(a);
  }
  return out;
}

function start(root, opts) {
  const { open } = runs(root);
  if (open) {
    const s = summary(open);
    const err = new Error(`a night run is open: ${path.relative(root, open)} (next step: ${s.next}); go on from it, or end it with \`night.mjs finish --result stopped\``);
    err.json = { open: path.relative(root, open).replaceAll("\\", "/"), next: s.next };
    throw err;
  }
  const rounds = opts.rounds === undefined ? 3 : opts.rounds === true ? NaN : Number(opts.rounds);
  if (opts.until === true) throw new Error("--until takes a local time HH:MM");
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new Error(`--rounds takes a whole number from 1 to 10, not "${opts.rounds}"`);
  const at = now();
  const until = untilFrom(at, opts.until ?? "06:00");
  const where = /^(1|true|yes|on)$/i.test(process.env.CLAUDE_CODE_REMOTE ?? "") ? "cloud" : "cli";
  const branch = git(root, "rev-parse", "--abbrev-ref", "HEAD") ?? "none";
  const commit = git(root, "rev-parse", "HEAD") ?? "none";
  const stem = `${localDay(at)}-${localTime(at).replace(":", "")}`;
  let file = path.join(root, DIR, `${stem}.md`);
  for (let n = 2; fs.existsSync(file); n++) file = path.join(root, DIR, `${stem}-${n}.md`);
  const text = [
    `# Night run ${local(at)}`,
    "",
    `Started: ${at.toISOString()} (${local(at)})`,
    `Until: ${until.toISOString()} (${local(until)})`,
    `Rounds: ${rounds}`,
    `Where: ${where}`,
    `Branch: ${branch}`,
    `Commit: ${commit}`,
    "",
    `Written by /mtest:night after every step. \`node night.mjs status\` names the step to go on from. Steps: ${STEPS.join(", ")}.`,
    "",
    "| Time | Step | Target | State | Note |",
    "|---|---|---|---|---|",
    "",
  ].join("\n");
  writeFileAtomic(file, text);
  return { file: path.relative(root, file).replaceAll("\\", "/"), started: at.toISOString(), until: until.toISOString(), untilLocal: local(until), rounds, where, branch, commit };
}

function log(root, step, state, opts) {
  const { open } = runs(root);
  if (!open) throw new Error("no night run is open; start one with `night.mjs start`");
  if (!STEPS.includes(step)) throw new Error(`step "${step}" is not one of ${STEPS.join(", ")}`);
  if (!STATES.includes(state)) throw new Error(`state "${state}" is not one of ${STATES.join(", ")}`);
  if (state === "round" && !opts.target) throw new Error("a round counts against a target: add --target <name>");
  const at = now();
  const row = `| ${localTime(at)} | ${step} | ${cell(opts.target)} | ${state} | ${cell(opts.note)} |`;
  const text = readText(open).replace(/\s*$/, "\n");
  writeFileAtomic(open, text + row + "\n");
  return { file: path.relative(root, open).replaceAll("\\", "/"), event: { time: localTime(at), step, target: opts.target ?? "", state, note: opts.note ?? "" } };
}

function finish(root, opts) {
  const { open } = runs(root);
  if (!open) throw new Error("no night run is open");
  const result = opts.result ?? "done";
  if (!["done", "stopped"].includes(result)) throw new Error(`--result is done or stopped, not "${result}"`);
  const at = now();
  const text = readText(open).replace(/\s*$/, "\n");
  writeFileAtomic(open, `${text}\nFinished: ${at.toISOString()} (${result}) ${local(at)}\n`);
  return { file: path.relative(root, open).replaceAll("\\", "/"), finished: at.toISOString(), result };
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const out = (o, code = 0) => { process.stdout.write(JSON.stringify(o, null, 2) + "\n"); process.exit(code); };
  try {
    if (!root) throw new Error("no .mtest/config.json here or above; run /mtest:init first");
    const opts = args(rest);
    if (cmd === "start") return out(start(root, opts));
    if (cmd === "log") return out(log(root, opts._[0], opts._[1], opts));
    if (cmd === "finish") return out(finish(root, opts));
    if (cmd === "status") {
      const { open, newest } = runs(root);
      if (open) {
        const s = summary(open);
        return out({ ...s, file: path.relative(root, open).replaceAll("\\", "/") });
      }
      return out({ open: false, file: null, newest: newest ? path.relative(root, newest).replaceAll("\\", "/") : null });
    }
    throw new Error("usage: night.mjs start [--until HH:MM] [--rounds <n>] | log <step> <state> [--target <name>] [--note <text>] | status | finish [--result done|stopped]");
  } catch (err) {
    out({ error: err.message, ...(err.json ?? {}) }, 1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
