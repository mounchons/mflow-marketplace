#!/usr/bin/env node
// Keep STATUS.md small: /mflow:handoff moves what is no longer current, word for word, to docs/status-log.md.
// An edit to a STATUS.md of about 565 KB took 64–72 s (median) in StemHub on 2026-10-31, against about 5 s for
// files under 200 KB; its `## Now` had grown to 180 blocks, one per earlier session, because each session wrote
// a new block above the old ones. Copying that text through an editor is out of reach for a model, so this
// script moves it: nothing is shortened, merged or summarised.
//
// What moves:
//   - the blocks of `## Now` after the first <keep> (a block is a line at column 0 that starts with "- ", with
//     every line under it up to the next such line); the lines before the first block stay;
//   - every section between `## Now` and `## Log` (such as `## Previous session context`), headings and all;
//   - the log entries (`### ` under `## Log`) after the newest <log>.
// Where to: log entries to the top of docs/status-log.md, newest first, as /mflow:handoff always did; the Now
// blocks and the sections to its end, under `## Now blocks moved on <date>`, so they never sit among the
// log entries.
//
//   node status-trim.mjs plan                          -> JSON: sizes, the Now blocks (first line, its Next and Blocked lines), sections, log entries
//   node status-trim.mjs move --keep <n> [--log <n>]   -> move; JSON: what moved, sizes before and after
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, readText, realInside, writeFileAtomic } from "./lib.mjs";

export const STATUS = "STATUS.md";
export const ARCHIVE = "docs/status-log.md";
const HEADING = /^##\s/;
const NOW = /^##\s*Now\b/i;
const LOG = /^##\s*Log\b/i;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const kb = (s) => Math.round(Buffer.byteLength(s) / 1024);
const excerpt = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** STATUS.md as parts: before Now, Now's preamble and blocks, the sections in between, Log's preamble and entries, after. */
export function split(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const L = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const now = L.findIndex((l) => NOW.test(l));
  const log = L.findIndex((l) => LOG.test(l));
  if (now < 0) throw new Error("STATUS.md has no ## Now section");
  const nowEnd = L.findIndex((l, i) => i > now && HEADING.test(l));
  const nowBody = L.slice(now + 1, nowEnd < 0 ? L.length : nowEnd);
  const pre = [];
  const blocks = [];
  for (const line of nowBody) {
    if (/^- /.test(line)) blocks.push([line]);
    else if (blocks.length) blocks[blocks.length - 1].push(line);
    else pre.push(line);
  }
  // Sections between Now and Log (or to the end, when there is no Log).
  const midFrom = nowEnd < 0 ? L.length : nowEnd;
  const midTo = log > now ? log : L.length;
  const middle = L.slice(midFrom, midTo);
  let logPre = [];
  const entries = [];
  let after = [];
  if (log > now) {
    const logEnd = L.findIndex((l, i) => i > log && HEADING.test(l));
    const body = L.slice(log + 1, logEnd < 0 ? L.length : logEnd);
    after = logEnd < 0 ? [] : L.slice(logEnd);
    for (const line of body) {
      if (/^###\s/.test(line)) entries.push([line]);
      else if (entries.length) entries[entries.length - 1].push(line);
      else logPre.push(line);
    }
  } else if (log >= 0) {
    after = L.slice(log); // a Log above Now: leave it where it is
  }
  return { eol, head: L.slice(0, now + 1), pre, blocks, middle, logHead: log > now ? [L[log]] : [], logPre, entries, after, hasLog: log > now };
}

const trimEnd = (lines) => { const c = [...lines]; while (c.length && !c[c.length - 1].trim()) c.pop(); return c; };

function join(parts) {
  const out = [...parts.head, ...parts.pre];
  for (const b of parts.blocks) out.push(...b);
  out.push(...parts.middle);
  if (parts.hasLog) {
    while (out.length && !out[out.length - 1].trim()) out.pop();
    out.push("", ...parts.logHead, ...parts.logPre);
    for (const e of parts.entries) out.push(...e);
  }
  out.push(...parts.after);
  return trimEnd(out).join(parts.eol) + parts.eol;
}

function load(root) {
  for (const rel of [STATUS, ARCHIVE]) if (!realInside(root, rel)) throw new Error(`${rel} leads outside the project through a link`);
  const text = readText(path.join(root, STATUS));
  if (text === null) throw new Error("STATUS.md not found");
  return { text, parts: split(text) };
}

export function plan(root) {
  const { text, parts } = load(root);
  // The line, with the lines under it that are indented deeper (a `**Next:**` header with numbered items below).
  const lineOf = (block, re) => {
    const i = block.findIndex((l) => re.test(l.trim()));
    if (i < 0) return undefined;
    const indent = block[i].length - block[i].trimStart().length;
    const out = [block[i].trim()];
    for (let k = i + 1; k < block.length; k++) {
      const l = block[k];
      if (!l.trim()) continue;
      if (l.length - l.trimStart().length <= indent) break;
      out.push(l.trim());
    }
    return out.join(" ");
  };
  return {
    file: STATUS,
    kb: kb(text),
    archive: ARCHIVE,
    archiveKb: (() => { const a = readText(path.join(root, ARCHIVE)); return a === null ? null : kb(a); })(),
    now: {
      kb: kb([...parts.pre, ...parts.blocks.flat()].join("\n")),
      blocks: parts.blocks.map((b, i) => ({
        n: i + 1,
        lines: b.length,
        kb: kb(b.join("\n")),
        first: excerpt(b[0], 200),
        next: excerpt(lineOf(b, /^-\s*\*{0,2}Next\b/i) || "", 300) || undefined,
        blocked: excerpt(lineOf(b, /^-\s*\*{0,2}Blocked on\b/i) || "", 200) || undefined,
      })),
    },
    sections: parts.middle.filter((l) => HEADING.test(l)).map((l) => excerpt(l, 120)),
    sectionsKb: kb(parts.middle.join("\n")),
    log: { entries: parts.entries.length, kb: kb(parts.entries.flat().join("\n")) },
  };
}

export function move(root, { keep, log = 10 } = {}) {
  if (!Number.isInteger(keep) || keep < 0) throw new Error("move: --keep <n> is how many of the first ## Now blocks are the current state (see plan)");
  if (!Number.isInteger(log) || log < 0) throw new Error("move: --log <n> is how many newest log entries stay");
  const { text, parts } = load(root);
  const movedBlocks = parts.blocks.slice(keep);
  const movedMiddle = trimEnd(parts.middle);
  const movedEntries = parts.entries.slice(log);
  if (!movedBlocks.length && !movedMiddle.length && !movedEntries.length) {
    return { moved: false, kb: kb(text), reason: "nothing to move" };
  }
  const kept = { ...parts, blocks: parts.blocks.slice(0, keep), middle: [], entries: parts.entries.slice(0, log) };
  // A kept last block ends with the blank line that separated it from the next section.
  if (kept.blocks.length) {
    const last = trimEnd(kept.blocks[kept.blocks.length - 1]);
    kept.blocks[kept.blocks.length - 1] = [...last, ""];
  } else if (kept.pre.length && kept.pre[kept.pre.length - 1].trim()) kept.pre.push("");
  const newStatus = join(kept);

  const eol = parts.eol;
  const old = readText(path.join(root, ARCHIVE));
  let A = old === null ? ["# STATUS log archive", ""] : old.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  if (movedEntries.length) {
    const h1 = A.findIndex((l) => /^#\s/.test(l));
    let at = h1 < 0 ? 0 : h1 + 1;
    while (at < A.length && (!A[at].trim() || /^<!--/.test(A[at].trim()))) at++; // past blanks and comments under the title
    const lines = movedEntries.map((e) => trimEnd(e)).flatMap((e) => [...e, ""]);
    A.splice(at, 0, ...lines);
  }
  if (movedBlocks.length || movedMiddle.length) {
    A = trimEnd(A);
    A.push("", `## Now blocks moved on ${today()}`, "", `<!-- From STATUS.md ## Now by /mflow:handoff, word for word: ${movedBlocks.length} block(s), newest first${movedMiddle.length ? ", then the sections that stood between ## Now and ## Log" : ""}. -->`, "");
    for (const b of movedBlocks) A.push(...trimEnd(b));
    if (movedMiddle.length) A.push("", ...movedMiddle);
  }
  const newArchive = trimEnd(A).join(eol) + eol;
  // The archive first: if the second write fails, the text is in both files, never in neither.
  writeFileAtomic(path.join(root, ARCHIVE), newArchive);
  writeFileAtomic(path.join(root, STATUS), newStatus);
  return {
    moved: true,
    blocks: movedBlocks.length,
    sections: movedMiddle.filter((l) => HEADING.test(l)).length,
    logEntries: movedEntries.length,
    kb: { before: kb(text), after: kb(newStatus) },
    archiveKb: { before: old === null ? 0 : kb(old), after: kb(newArchive) },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()) || process.cwd();
  const [cmd, ...rest] = process.argv.slice(2);
  const num = (flag) => { const i = rest.indexOf(flag); return i >= 0 ? Number(rest[i + 1]) : undefined; };
  try {
    let out;
    if (cmd === "plan") out = plan(root);
    else if (cmd === "move") out = move(root, { keep: num("--keep"), log: num("--log") ?? 10 });
    else throw new Error("usage: status-trim.mjs plan | move --keep <n> [--log <n>]");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
