#!/usr/bin/env node
// What /mflow:init would write on this run, in one call, and what the user said before about its optional
// parts, so a rerun after an mflow upgrade asks nothing it was told already. The answers live in
// .mflow/config.json "setup" (committed, so every machine and every tool sees them):
//
//   node setup.mjs plan [--root <dir>]                 -> JSON: one entry per part with its state, and `ask`
//   node setup.mjs record <part> <yes|no> [--root <dir>] -> keep the user's answer for that part
//
// Parts:
//   agentSkills    .agents/skills/mflow-* for Codex, OpenCode and Antigravity, and the E2E guard in
//                  .codex/hooks.json (agent-skills.mjs)
//   worktree       .claude/worktrees/ ignored, pending.md merged line by line, .worktreeinclude (worktree.mjs setup)
//   webCopy        the copy for Claude Code on the web in .claude/skills/mflow/ (vendor.mjs)
//   openspecConfig mflow's lines in openspec/config.yaml (openspec-config.mjs); never optional, never asked
//
// States:
//   current    nothing to write
//   write      the user said yes before, or the part is already in the project: write it without asking
//   ask        never offered (no answer kept, nothing there yet): ask once, with the other questions of the run
//   declined   the user said no before: write nothing and do not ask; the user's word changes it (record … yes)
//   foreign    a folder of the project's own holds the name; it stays as it is
//   problem    something only a person can fix (a file mflow cannot merge, OpenSpec not initialised); see `note`
// The plan writes nothing; `record` changes only the "setup" key of .mflow/config.json.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MARKER, findRoot, loadConfig, readJsonFile, writeFileAtomic } from "./lib.mjs";
import { plan as skillsPlan } from "./agent-skills.mjs";
import { setup as worktreeSetup } from "./worktree.mjs";
import { vendorPlan, vendorStatus } from "./vendor.mjs";
import { plan as openspecPlan } from "./openspec-config.mjs";

export const PARTS = ["agentSkills", "worktree", "webCopy"];

/** The answers kept in .mflow/config.json "setup": true, false, or undefined when never given. */
export function answers(root) {
  const json = readJsonFile(path.join(root, MARKER), { allowEmpty: true, label: ".mflow/config.json" }) ?? {};
  const setup = json.setup && typeof json.setup === "object" && !Array.isArray(json.setup) ? json.setup : {};
  return Object.fromEntries(PARTS.map((p) => [p, typeof setup[p] === "boolean" ? setup[p] : undefined]));
}

/** The state of an optional part from its answer, whether it is in the project already, and whether anything would change. */
function stateOf(answer, present, changes) {
  if (answer === false) return "declined";
  if (!changes) return "current";
  return answer === true || present ? "write" : "ask";
}

function agentSkillsPart(root, answer) {
  const p = skillsPlan(root);
  const foreign = p.skills.filter((s) => s.state === "foreign" || s.state === "refused");
  const changing = p.skills.filter((s) => s.state === "create" || s.state === "update");
  const present = p.skills.some((s) => s.state !== "create" && s.state !== "foreign" && s.state !== "refused");
  const hookChanges = p.hook.state === "create" || p.hook.state === "update";
  const state = stateOf(answer, present, changing.length > 0 || hookChanges);
  const part = {
    part: "agentSkills",
    state,
    skills: changing.map((s) => `${s.name}: ${s.state}${s.from ? ` (from ${s.from})` : ""}`),
    hook: p.hook.state,
  };
  const notes = [...foreign.map((s) => s.note), ...(p.hook.note ? [p.hook.note] : [])];
  if (notes.length) part.note = notes.join("; ");
  if (state === "current" && foreign.length) part.state = "foreign";
  // A hook file mflow cannot merge into needs a person even when nothing else changes.
  if (part.state === "current" && (p.hook.state === "refused" || p.hook.state === "unreadable")) part.state = "problem";
  return part;
}

function worktreePart(root, answer) {
  const r = worktreeSetup(root, { dryRun: true });
  const add = [...r.gitignore.map((l) => `.gitignore: ${l}`), ...r.gitattributes.map((l) => `.gitattributes: ${l}`)];
  if (r.worktreeinclude) add.push(`.worktreeinclude: ${r.worktreeinclude.length ? r.worktreeinclude.join(", ") : "(new, empty)"}`);
  // The union merge of the review list means mflow set worktrees up here before. An ignore rule alone does not, since
  // many projects ignore all of .claude/, nor a .worktreeinclude, which Claude Code's own --worktree also uses.
  const present = r.gitattributes.length === 0;
  return { part: "worktree", state: stateOf(answer, present, add.length > 0), add };
}

function webCopyPart(root, answer) {
  const st = vendorStatus(root);
  if (st.foreign) return { part: "webCopy", state: "foreign", note: ".claude/skills/mflow/ is the project's own folder and stays as it is" };
  const p = vendorPlan(root);
  if (p.self) return { part: "webCopy", state: "current", note: p.note };
  const changes = p.create.length + p.update.length + p.remove.length;
  const part = { part: "webCopy", state: stateOf(answer, st.present, changes > 0), present: st.present };
  if (st.present) part.version = st.version;
  if (changes) part.files = { create: p.create.length, update: p.update.length, remove: p.remove.length };
  // The recommendation's evidence (references/cloud.md): branches a web session made.
  if (!st.present && answer === undefined) part.webBranches = hasWebBranches(root);
  return part;
}

function hasWebBranches(root) {
  const r = spawnSync("git", ["for-each-ref", "--format=%(refname)", "refs/remotes"], { cwd: root, encoding: "utf8", timeout: 20_000 });
  return r.status === 0 && /^refs\/remotes\/[^/\n]+\/claude\//m.test(r.stdout || "");
}

function openspecConfigPart(root) {
  // On a first run OpenSpec is initialised in the same step, just before its lines are written.
  if (!fs.existsSync(path.join(root, "openspec"))) return { part: "openspecConfig", state: "write", after: "openspec init" };
  try {
    const p = openspecPlan(root);
    if (p.problems.length) return { part: "openspecConfig", state: "problem", note: p.problems.join("; ") };
    return { part: "openspecConfig", state: p.changed ? "write" : "current", added: p.added.length, removed: p.removed.length };
  } catch (err) {
    return { part: "openspecConfig", state: "problem", note: err.message };
  }
}

/** Every part's state; `ask` lists the parts to ask about, in the one message of the run. */
export function plan(root) {
  // A config.json whose settings are wrong stops here as it stops every other script.
  loadConfig(root);
  const a = answers(root);
  const guard = (part, fn) => {
    try {
      return fn();
    } catch (err) {
      return { part, state: "problem", note: err.message };
    }
  };
  const parts = [
    guard("agentSkills", () => agentSkillsPart(root, a.agentSkills)),
    guard("worktree", () => worktreePart(root, a.worktree)),
    guard("webCopy", () => webCopyPart(root, a.webCopy)),
    openspecConfigPart(root),
  ];
  return {
    parts,
    ask: parts.filter((p) => p.state === "ask").map((p) => p.part),
    write: parts.filter((p) => p.state === "write").map((p) => p.part),
    declined: parts.filter((p) => p.state === "declined").map((p) => p.part),
  };
}

/** Keep the user's answer for one part in .mflow/config.json "setup"; every other key stays as it is. */
export function record(root, part, answer) {
  if (!PARTS.includes(part)) throw new Error(`unknown part ${JSON.stringify(part)} (parts: ${PARTS.join(", ")})`);
  if (answer !== "yes" && answer !== "no") throw new Error(`answer must be yes or no, not ${JSON.stringify(answer)}`);
  const file = path.join(root, MARKER);
  const json = readJsonFile(file, { allowEmpty: true, label: ".mflow/config.json" }) ?? {};
  const setup = json.setup && typeof json.setup === "object" && !Array.isArray(json.setup) ? json.setup : {};
  const value = answer === "yes";
  const changed = setup[part] !== value;
  if (changed) {
    json.setup = { ...setup, [part]: value };
    writeFileAtomic(file, JSON.stringify(json, null, 2) + "\n");
  }
  return { part, answer: value, changed, file: ".mflow/config.json" };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--root");
  const start = i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const rest = args.filter((x, j) => x !== "--root" && args[j - 1] !== "--root");
  try {
    let out;
    // A first /mflow:init plans before step 3 has written .mflow/config.json: the folder itself is the project,
    // and no answer is kept yet. An answer is kept only once the file exists.
    // --root is the project itself, as scaffold.mjs takes it, never a parent project found above it.
    const given = i >= 0 && args[i + 1];
    const at = given ? start : findRoot(start);
    if (rest[0] === "plan" || !rest[0]) out = plan(at || start);
    else if (rest[0] === "record") {
      const root = at && fs.existsSync(path.join(at, MARKER)) ? at : null;
      if (!root) throw new Error("no .mflow/config.json here or above; run scaffold.mjs (step 3 of /mflow:init) first");
      out = record(root, rest[1], rest[2]);
    }
    else throw new Error("usage: setup.mjs plan | record <agentSkills|worktree|webCopy> <yes|no> [--root <dir>]");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
