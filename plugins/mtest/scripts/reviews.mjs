#!/usr/bin/env node
// Review reports (mtest/reviews/<date>-<target>.md) and what is still unreviewed.
//
// Each report starts with `Reviewed: <target> <base>..<end>`, `Verdict: …` and the other header lines
// /mtest:review writes. `since` finds the newest report whose end commit is an ancestor of HEAD and
// lists the commits and files after it: the diff `/mtest:review since` takes, so every commit that
// reached the branch is reviewed once, whatever branch or tool it came from.
//
// Usage: node reviews.mjs last | since
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PATHS, defaultBranch, findRoot, git, loadConfig, recordHeader } from "./lib.mjs";

export function listReviews(root) {
  const dir = path.join(root, PATHS.reviews);
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f)); } catch { return []; }
  return names.map((name) => {
    const h = recordHeader(fs.readFileSync(path.join(dir, name), "utf8"));
    const range = /([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})/.exec(h.Reviewed ?? "");
    const at = /\bat ([0-9a-f]{7,40})/.exec(h.Reviewed ?? "");
    return {
      file: `${PATHS.reviews}/${name}`,
      target: (h.Reviewed ?? "").split(" ")[0] || null,
      base: range?.[1] ?? null,
      end: range?.[2] ?? at?.[1] ?? null,
      dirty: /with uncommitted changes/.test(h.Reviewed ?? ""),
      verdict: h.Verdict ?? "",
      level: h.Level ?? "",
      reviewer: h.Reviewer ?? "",
      author: h.Author ?? "",
      tests: h.Tests ?? "",
      date: name.slice(0, 10),
    };
  }).sort((a, b) => b.file.localeCompare(a.file));
}

export function reviewSince(root, cfg) {
  const head = git(root, "rev-parse", "HEAD");
  const branch = git(root, "rev-parse", "--abbrev-ref", "HEAD");
  const last = listReviews(root).find((r) => r.end && !r.dirty && (r.end === head || git(root, "merge-base", "--is-ancestor", r.end, "HEAD") !== null));
  const def = defaultBranch(root, cfg);
  let base = last?.end ?? null;
  let why = last ? `the end of ${last.file}` : null;
  if (!base && def && def !== branch) {
    base = git(root, "merge-base", def, "HEAD");
    why = base ? `where this branch left ${def} (no review on this line yet)` : null;
  }
  if (!base) return { head, branch, defaultBranch: def, base: null, why: "no review yet and no default branch to start from: name a range (<from>..<to>)", commits: [], files: [] };
  const commits = (git(root, "log", "--format=%h %an %s", `${base}..HEAD`) ?? "").split(/\r?\n/).filter(Boolean);
  const files = (git(root, "diff", "--name-only", `${base}..HEAD`) ?? "").split(/\r?\n/).filter(Boolean)
    .filter((f) => !f.startsWith(`${PATHS.vendor}/`));
  return { head, branch, defaultBranch: def, base, why, lastReview: last ?? null, commits, files };
}

function main() {
  const cmd = process.argv[2] ?? "last";
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (!root) {
    process.stderr.write("no .mtest/config.json here or above: run /mtest:init first\n");
    process.exit(2);
  }
  const cfg = loadConfig(root);
  const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + "\n");
  if (cmd === "last") return out(listReviews(root)[0] ?? null);
  if (cmd === "since") return out(reviewSince(root, cfg));
  process.stderr.write("usage: reviews.mjs last | since\n");
  process.exit(2);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
