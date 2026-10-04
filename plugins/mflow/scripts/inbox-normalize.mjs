#!/usr/bin/env node
// Make an AI-inbox report assessable: ensure frontmatter, and report whether the
// mandatory "Understanding" and "Files read" sections are present.
// Non-destructive: existing frontmatter lines stay as written (only missing or empty keys are
// filled), the file is rewritten only when something changes, and the first original is kept
// in .mflow/cache/inbox-original/.
//
//   node inbox-normalize.mjs <file> [--from <tool>] [--mode analyze|review|code] [--brief <id>] [--base <commit>]
//
// With a `base` (the commit the brief was written at, which the report copies), it also lists the
// files under "Files read" that changed since then (`stale.changedSince`): findings resting on them may
// describe code or text that is no longer there, so they are checked against the current version.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findRoot, frontmatter } from "./lib.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!file || !fs.existsSync(file)) {
  process.stderr.write("usage: inbox-normalize.mjs <file> [--from tool] [--mode m] [--brief id]\n");
  process.exit(1);
}

const original = fs.readFileSync(file, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
let text = original.replace(/^﻿/, "");

// Tools sometimes wrap the whole answer in a fence. A fence labelled markdown/md is unwrapped up to
// its last line, code blocks inside included. A bare fence is unwrapped only when no line inside
// closes it early, or when the content starts with frontmatter: a report that merely starts and
// ends with code blocks is left alone.
const fence = /^\s*(`{3,})(markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*\s*$/i.exec(text);
const closesEarly = fence && new RegExp(`^${fence[1]}[ \\t]*\\r?$`, "m").test(fence[3]);
const unwrapped = !!fence && (!!fence[2] || !closesEarly || /^---\r?\n/.test(fence[3]));
if (unwrapped) text = fence[3];

const fm = frontmatter(text);
const want = {
  status: fm.status || "new",
  from: fm.from || opt("--from") || "unknown",
  mode: fm.mode || opt("--mode") || "analyze",
  brief: fm.brief || opt("--brief") || "",
};
const base = fm.base || opt("--base") || "";
if (base) want.base = base;
const line = (k, v) => (v ? `${k}: ${v}` : `${k}:`);
const block = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
const fmLines = block ? block[1].split(/\r?\n/) : [];
for (const [k, v] of Object.entries(want)) {
  const i = fmLines.findIndex((l) => l.startsWith(`${k}:`));
  if (i < 0) fmLines.push(line(k, v));
  else if (!fm[k]) fmLines[i] = line(k, v);
}
const body = block ? text.slice(block[0].length) : text;
const next = ["---", ...fmLines, "---", ""].join(eol) + body;

let backup = null;
if (next !== original) {
  const root = findRoot(path.dirname(path.resolve(file))) || process.cwd();
  backup = path.join(root, ".mflow", "cache", "inbox-original", path.basename(file));
  if (!fs.existsSync(backup)) {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, original);
  }
  fs.writeFileSync(file, next);
}

const hasUnderstanding = /^##\s*Understanding\b/im.test(body);
const hasFilesRead = /^##\s*Files read\b/im.test(body);

/** Repo-relative paths listed under "## Files read", without backticks, line ranges or "(partial)". */
function filesRead(md) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s*Files read\b/i.test(l));
  if (start < 0) return [];
  const out = [];
  for (const l of lines.slice(start + 1)) {
    if (/^#/.test(l)) break;
    const item = /^\s*[-*]\s+(.*)$/.exec(l)?.[1];
    if (!item) continue;
    const p = item.replace(/`/g, "").replace(/\s*\(.*\)\s*$/, "").replace(/:\d[\d,-]*$/, "").trim();
    if (p) out.push(p);
  }
  return out;
}

let stale = null;
if (base) {
  const root = findRoot(path.dirname(path.resolve(file))) || process.cwd();
  const read = filesRead(body);
  try {
    if (!/^[0-9a-f]{7,64}$/i.test(base)) throw new Error("not a commit id");
    execFileSync("git", ["cat-file", "-e", `${base}^{commit}`], { cwd: root, stdio: "ignore" });
    const changed = read.length
      ? execFileSync("git", ["diff", "--name-only", "--relative", base, "--", ...read], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      : "";
    stale = { base, filesRead: read.length, changedSince: changed.split(/\r?\n/).filter(Boolean) };
  } catch {
    stale = { base, filesRead: read.length, changedSince: null, note: "the base commit is not in this repository: compare the cited files by hand" };
  }
}

process.stdout.write(JSON.stringify({
  file, changed: next !== original, backup, frontmatterAdded: !block, unwrappedFence: unwrapped,
  ...want, hasUnderstanding, hasFilesRead, stale,
  warning: hasUnderstanding && hasFilesRead ? null
    : "Missing Understanding and/or Files read: treat findings as unverified until checked.",
}, null, 2) + "\n");
