#!/usr/bin/env node
// One change, one branch, one folder: a git worktree per change lets several sessions and tools (Claude Code,
// Codex, Antigravity, OpenCode) work at the same time, each on its own branch `feat/<change>`, without
// moving each other's checkout. What mflow needs is committed (AGENTS.md, CLAUDE.md, openspec/config.yaml,
// .agents/skills/, .claude/skills/, .mflow/config.json), so it is in the worktree already; Claude Code also
// loads project-scope plugins of the main checkout in its worktrees and shares its auto memory. What git
// ignores is not there: the files `.worktreeinclude` names (the same file Claude Code's --worktree reads)
// are copied from the main checkout, and dependencies are installed as AGENTS.md `## Commands` says.
//
//   node worktree.mjs where                              this checkout: linked or main, branch, main folder
//   node worktree.mjs setup [--dry-run]                  .gitignore, .gitattributes and .worktreeinclude (by /mflow:init)
//   node worktree.mjs list                               every worktree with its branch and change
//   node worktree.mjs new <change> [--from main] [--dir <path>]
//   node worktree.mjs remove <change> [--dir <path>]     only when clean and merged into main
//
// The default folder is `.claude/worktrees/<change>` in the main checkout, where Claude Code's --worktree
// and EnterWorktree put theirs, kept out of git by a `.gitignore` line this script adds when missing.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, worktreeInfo } from "./lib.mjs";

export const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
export const WORKTREES = ".claude/worktrees";
export const INCLUDE = ".worktreeinclude";
export const branchOf = (change) => `feat/${change}`;
// Folders deeper than this on Windows leave little room under the 260-character limit when long paths are off.
const LONG_ROOT = 100;

function git(args, cwd, { input } = {}) {
  const r = spawnSync("git", ["-c", "core.quotePath=false", ...args], { cwd, encoding: "utf8", input, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout || "", err: (r.stderr || "").trim() };
}

function mainOf(root) {
  const info = worktreeInfo(root);
  if (!info) throw new Error("not a git repository");
  if (!info.main) throw new Error("the main checkout of this repository was not found (a bare repository?)");
  return info;
}

/** Every worktree of the repository: folder, branch, whether it is the main checkout, and the change a `feat/` branch names. */
export function list(root) {
  const info = mainOf(root);
  const r = git(["worktree", "list", "--porcelain"], root);
  if (!r.ok) throw new Error(r.err || "git worktree list failed");
  const out = [];
  let cur = null;
  for (const line of r.out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) out.push((cur = { dir: path.resolve(line.slice(9)), branch: "", main: false }));
    else if (cur && line.startsWith("branch ")) cur.branch = line.slice(7).replace(/^refs\/heads\//, "");
    else if (cur && line === "detached") cur.branch = "";
  }
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  for (const w of out) {
    w.main = same(w.dir, info.main);
    w.here = same(w.dir, info.top);
    const m = /^feat\/(.+)$/.exec(w.branch);
    w.change = m ? m[1] : null;
  }
  return { main: info.main, here: info.top, linked: info.linked, worktrees: out };
}

/** Adds `.claude/worktrees/` to the main checkout's .gitignore unless git already ignores it. */
export function ignoreWorktrees(main) {
  if (git(["check-ignore", "-q", `${WORKTREES}/x`], main).ok) return false;
  const file = path.join(main, ".gitignore");
  const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const eol = old.includes("\r\n") ? "\r\n" : "\n";
  const sep = old && !old.endsWith("\n") ? eol : "";
  fs.writeFileSync(file, `${old}${sep}# git worktrees of this repository, one per change (mflow, Claude Code --worktree)${eol}${WORKTREES}/${eol}`);
  return true;
}

/** The files git ignores that `.worktreeinclude` names, as paths relative to the main checkout. */
export function includedFiles(main) {
  if (!fs.existsSync(path.join(main, INCLUDE))) return [];
  const named = git(["ls-files", "-z", "--others", "--ignored", `--exclude-from=${INCLUDE}`], main);
  if (!named.ok) return [];
  const files = named.out.split("\0").filter(Boolean).filter((f) => !f.startsWith(`${WORKTREES}/`));
  if (!files.length) return [];
  // Only what git ignores: a file it tracks or would add is in the worktree's checkout already.
  const ignored = git(["check-ignore", "-z", "--stdin"], main, { input: files.join("\0") + "\0" });
  const set = new Set(ignored.out.split("\0").filter(Boolean));
  return files.filter((f) => set.has(f));
}

export const UNION = "docs/reviews/pending.md merge=union";
// Git-ignored files a worktree needs to build and run: settings that never go into git.
const NEEDED = /(^|\/)(\.env(\.[^/]*)?|settings\.local\.json)$/;

/** Appends lines to a file unless each is there already; returns the ones added. */
function appendLines(file, lines, heading) {
  const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const have = new Set(old.split(/\r?\n/).map((l) => l.trim()));
  const add = lines.filter((l) => !have.has(l));
  if (!add.length) return [];
  const eol = old.includes("\r\n") ? "\r\n" : "\n";
  const sep = old && !old.endsWith("\n") ? eol : "";
  fs.writeFileSync(file, `${old}${sep}${heading ? `${heading}${eol}` : ""}${add.join(eol)}${eol}`);
  return add;
}

/**
 * What parallel branches need in the main checkout, written once by /mflow:init: `.claude/worktrees/`
 * ignored, `docs/reviews/pending.md` merged line by line (rows added on two branches both land), and a
 * `.worktreeinclude` naming the git-ignored settings found (.env files, .claude/settings.local.json).
 * Never rewrites what is there; reports what it added.
 */
export function setup(root, { dryRun = false } = {}) {
  const { main } = mainOf(root);
  const result = { gitignore: [], gitattributes: [], worktreeinclude: null };
  if (!git(["check-ignore", "-q", `${WORKTREES}/x`], main).ok) result.gitignore.push(`${WORKTREES}/`);
  const attrs = fs.existsSync(path.join(main, ".gitattributes")) ? fs.readFileSync(path.join(main, ".gitattributes"), "utf8") : "";
  if (!/^\s*docs\/reviews\/pending\.md\s+.*\bmerge=union\b/m.test(attrs)) result.gitattributes.push(UNION);
  if (!fs.existsSync(path.join(main, INCLUDE))) {
    const ignored = git(["ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--directory"], main);
    const found = ignored.out.split("\0").filter(Boolean).filter((f) => NEEDED.test(f) && !f.startsWith(`${WORKTREES}/`)).sort();
    result.worktreeinclude = found.length ? found.map((f) => `/${f}`) : [];
  }
  if (dryRun) return { ...result, dryRun: true };
  if (result.gitignore.length) ignoreWorktrees(main);
  if (result.gitattributes.length) appendLines(path.join(main, ".gitattributes"), result.gitattributes, "# mflow: rows added to the review list on parallel branches all land when they merge");
  if (result.worktreeinclude) {
    const body = ["# Git-ignored files copied into each new worktree (mflow /mflow:worktree, Claude Code --worktree).", "# Same syntax as .gitignore; only files git ignores are copied.", ...result.worktreeinclude];
    fs.writeFileSync(path.join(main, INCLUDE), body.join("\n") + "\n");
  }
  return result;
}

export function create(root, change, { from = "main", dir } = {}) {
  if (!NAME_RE.test(change || "")) throw new Error(`change name must be kebab-case (${NAME_RE}): ${JSON.stringify(change)}`);
  const info = mainOf(root);
  const main = info.main;
  const branch = branchOf(change);
  const target = path.resolve(main, dir || path.join(WORKTREES, change));
  if (fs.existsSync(target)) throw new Error(`folder already exists: ${target}`);
  const warnings = [];
  const holder = list(root).worktrees.find((w) => w.branch === branch);
  if (holder) throw new Error(`${branch} is already checked out in ${holder.dir}; work there`);

  const exists = git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], main).ok;
  if (!exists && !git(["rev-parse", "--verify", "--quiet", `${from}^{commit}`], main).ok) throw new Error(`no commit named ${from} to start ${branch} from`);
  // The worktree holds committed files only: a proposal still uncommitted in the main checkout stays behind.
  const pending = git(["status", "--porcelain", "--", `openspec/changes/${change}`], main).out.trim();
  if (pending) warnings.push(`openspec/changes/${change}/ has uncommitted files in the main checkout; commit them on ${info.branch || "its branch"} first, or the worktree goes without them`);

  const gitignored = !dir ? ignoreWorktrees(main) : false;
  const add = exists ? git(["worktree", "add", target, branch], main) : git(["worktree", "add", "-b", branch, target, from], main);
  if (!add.ok) throw new Error(add.err || "git worktree add failed");

  const copied = [];
  for (const rel of includedFiles(main)) {
    const to = path.join(target, rel);
    if (fs.existsSync(to)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(main, rel), to);
    copied.push(rel);
  }
  if (!fs.existsSync(path.join(main, INCLUDE))) warnings.push(`no ${INCLUDE} in the main checkout: no git-ignored file (.env and the like) was copied`);
  if (process.platform === "win32" && target.length > LONG_ROOT) warnings.push(`the folder path is ${target.length} characters; with Windows long paths off, files deeper than ${260 - target.length} characters below it (node_modules) fail: use --dir with a shorter path`);

  return {
    change,
    branch,
    dir: target,
    branchCreated: !exists,
    from: exists ? null : from,
    gitignored: gitignored ? `${WORKTREES}/ added to .gitignore in the main checkout: commit it` : null,
    copied,
    warnings,
    setup: "Install the dependencies there as AGENTS.md ## Commands says (package restore, npm install, local tools) before the first build.",
    start: {
      claude: `cd "${target}"; claude`,
      codex: `codex -C "${target}"`,
      antigravity: `cd "${target}"; agy`,
      opencode: `cd "${target}"; opencode`,
    },
  };
}

export function remove(root, change, { dir } = {}) {
  if (!NAME_RE.test(change || "")) throw new Error(`change name must be kebab-case: ${JSON.stringify(change)}`);
  const info = mainOf(root);
  const branch = branchOf(change);
  const w = list(root).worktrees.find((x) => x.branch === branch || (dir && x.dir.toLowerCase() === path.resolve(info.main, dir).toLowerCase()));
  if (!w) throw new Error(`no worktree holds ${branch}`);
  if (w.main) throw new Error("that is the main checkout; it is never removed");
  if (w.here) throw new Error("this session works in that worktree; remove it from the main checkout");
  if (git(["status", "--porcelain"], w.dir).out.trim()) throw new Error(`${w.dir} has uncommitted changes; commit or drop them first`);
  if (!git(["merge-base", "--is-ancestor", branch, "main"], info.main).ok) throw new Error(`${branch} is not merged into main; merge it first`);
  const rm = git(["worktree", "remove", w.dir], info.main);
  if (!rm.ok) throw new Error(rm.err || "git worktree remove failed");
  const del = git(["branch", "-d", branch], info.main);
  return { change, dir: w.dir, removed: true, branchDeleted: del.ok, note: del.ok ? null : del.err };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()) || process.cwd();
  const [cmd, ...rest] = process.argv.slice(2);
  const name = rest[0] && !rest[0].startsWith("--") ? rest[0] : undefined;
  const opt = (flag) => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    let out;
    if (cmd === "where") out = worktreeInfo(root);
    else if (cmd === "setup") out = setup(root, { dryRun: rest.includes("--dry-run") });
    else if (cmd === "list") out = list(root);
    else if (cmd === "new") out = create(root, name, { from: opt("--from") || "main", dir: opt("--dir") });
    else if (cmd === "remove") out = remove(root, name, { dir: opt("--dir") });
    else throw new Error("usage: worktree.mjs where | setup [--dry-run] | list | new <change> [--from main] [--dir <path>] | remove <change> [--dir <path>]");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
