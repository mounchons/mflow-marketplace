#!/usr/bin/env node
// Flow docs (mtest/flows/<flow>.md) and how completely tests cover them.
//
// A flow doc lists the Steps of a flow (1, 2, 3, 3a…), its Branches (B1…: where it leaves the straight
// path, and where it goes back), optionally the state Transitions it must allow or refuse (T1…), and
// the Cases that walk it: each case has a Path over those ids (`1-2-B1-2-3`, loops allowed), a Kind, a
// Level and the Test that proves it. `check` reports what is not covered: a step, branch or transition
// that no case walks, a case without a test, a test that cannot be found in the test files, and a path
// token that names nothing. E2E cases without a test are listed apart: E2E is written on request.
//
// Usage:
//   node flows.mjs list                       one line of coverage per flow
//   node flows.mjs check [<flow>] [--strict]  every gap; --strict exits 1 when there is one
//   node flows.mjs new <flow> [--title <t>]   a new flow doc from the template (never overwrites)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PATHS, PLUGIN_ROOT, findRoot, frontmatter, isTestFile, loadConfig, toPosix, today, walkFiles, writeFileAtomic } from "./lib.mjs";

export const KINDS = ["happy", "alt", "error", "permission", "boundary", "idempotency", "concurrency", "isolation", "time", "recovery"];
export const LEVELS = ["unit", "integration", "e2e", "manual"];
const STEP_ID = /^\d+(\.\d+)*[a-z]?$/;
const BRANCH_ID = /^B\d+[a-z]?$/;
const TRANSITION_ID = /^T\d+[a-z]?$/;
const EMPTY = /^(|todo|-|—|none|tbd)$/i;

/** Sections of a markdown doc by `## ` heading (lowercased), HTML comments removed. */
function sections(text) {
  const out = {};
  let name = null;
  for (const line of text.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      name = h[1].toLowerCase().replace(/\s*\(.*\)\s*$/, "");
      out[name] = [];
    } else if (name) out[name].push(line);
  }
  return out;
}

/** The first markdown table in `lines`: rows of trimmed cells, the header row dropped. */
function table(lines = []) {
  const rows = [];
  let header = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("|")) {
      if (header && rows.length) break;
      continue;
    }
    const cells = line.replace(/\\\|/g, "\u0000").replace(/^\||\|$/g, "").split("|").map((c) => c.replaceAll("\u0000", "|").trim());
    if (!header) {
      header = cells.map((c) => c.toLowerCase());
      continue;
    }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) continue;
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    row._id = (cells[0] ?? "").replace(/`/g, "").trim();
    rows.push(row);
  }
  return { header: header ?? [], rows };
}

const col = (row, ...names) => {
  for (const n of names) if (row[n] !== undefined) return row[n];
  return "";
};

/** Path tokens: ids separated by -, →, ->, >, commas or spaces. */
export const pathTokens = (p) => String(p).replace(/`/g, "").split(/\s*(?:->|→|>|,|\s|-)\s*/).map((t) => t.trim()).filter(Boolean);

/** Test references in a Test cell, separated by `;` or `<br>`. */
export const testRefs = (cell) => String(cell).split(/;|<br\s*\/?>/i)
  .map((r) => r.replace(/`/g, "").trim().replace(/^(["'])(.*)\1$/, "$2").trim()).filter((r) => !EMPTY.test(r));

export function parseFlow(text, file = "") {
  const fm = frontmatter(text);
  const sec = sections(text);
  const problems = [];
  const warnings = [];
  const id = fm.flow || path.basename(file, ".md");
  if (!sec.steps) problems.push("no `## Steps` section");
  if (!sec.cases) problems.push("no `## Cases` section");

  const steps = table(sec.steps).rows.filter((r) => r._id);
  const branches = table(sec.branches).rows.filter((r) => r._id);
  const transitions = table(sec.transitions ?? sec.states).rows.filter((r) => r._id);
  const rules = table(sec.rules).rows.filter((r) => r._id).map((r) => ({ id: r._id, test: col(r, "unit test", "test", "tests") }));
  const cases = table(sec.cases).rows.filter((r) => r._id).map((r) => ({
    id: r._id,
    path: pathTokens(col(r, "path", "steps")),
    kind: col(r, "kind", "type").toLowerCase(),
    level: col(r, "level").toLowerCase(),
    test: col(r, "test", "tests"),
    expect: col(r, "expect", "expected"),
  }));

  const seen = new Set();
  for (const [rows, re, what] of [[steps, STEP_ID, "step"], [branches, BRANCH_ID, "branch"], [transitions, TRANSITION_ID, "transition"]]) {
    for (const r of rows) {
      if (!re.test(r._id)) problems.push(`${what} id "${r._id}" does not read as a ${what} id (${what === "step" ? "1, 2, 3a, 4.1" : what === "branch" ? "B1, B2" : "T1, T2"})`);
      if (seen.has(r._id)) problems.push(`id "${r._id}" is used twice`);
      seen.add(r._id);
    }
  }
  const caseIds = new Set();
  for (const c of cases) {
    if (caseIds.has(c.id)) problems.push(`case "${c.id}" is used twice`);
    caseIds.add(c.id);
    if (!c.path.length) problems.push(`case ${c.id} has no path`);
    if (!LEVELS.includes(c.level)) problems.push(`case ${c.id}: level "${c.level}" is not one of ${LEVELS.join(", ")}`);
    if (c.kind && !KINDS.includes(c.kind)) warnings.push(`case ${c.id}: kind "${c.kind}" is not one of ${KINDS.join(", ")}`);
  }
  return {
    file: toPosix(file),
    flow: id,
    title: fm.title || id,
    status: fm.status || "draft",
    steps: steps.map((r) => ({ id: r._id, actor: col(r, "actor", "role", "who") })),
    branches: branches.map((r) => ({ id: r._id, at: col(r, "at", "from step", "at step").replace(/`/g, ""), back: col(r, "back to", "back", "returns to").replace(/`/g, "") })),
    transitions: transitions.map((r) => ({ id: r._id })),
    rules,
    cases,
    problems,
    warnings,
  };
}

/** Finds test references in the project's test files, reading each file once. */
export class TestIndex {
  constructor(root, cfg) {
    this.root = root;
    const roots = cfg.testRoots.filter((d) => fs.existsSync(path.join(root, d)));
    this.files = [...new Set(roots.flatMap((d) => walkFiles(root, d)).filter(isTestFile))];
    this.cache = new Map();
  }

  text(rel) {
    if (!this.cache.has(rel)) {
      let t = "";
      try { t = fs.readFileSync(path.join(this.root, rel), "utf8"); } catch { /* unreadable: no match */ }
      this.cache.set(rel, t);
    }
    return this.cache.get(rel);
  }

  /** The test files that hold `ref` (`file::name`, `name`, or `Class.Method`); empty when none. */
  resolve(ref) {
    const sep = ref.indexOf("::");
    if (sep > 0) {
      const file = toPosix(ref.slice(0, sep).trim());
      const name = ref.slice(sep + 2).trim();
      if (!fs.existsSync(path.join(this.root, file))) return [];
      return !name || this.text(file).includes(name) ? [file] : [];
    }
    const hits = this.files.filter((f) => this.text(f).includes(ref));
    if (hits.length) return hits;
    const parts = ref.split(".");
    if (parts.length >= 2) {
      const method = parts.at(-1);
      const cls = parts.at(-2);
      return this.files.filter((f) => {
        const t = this.text(f);
        return t.includes(cls) && t.includes(method);
      });
    }
    return [];
  }
}

/** Coverage of one parsed flow against the test index. */
export function coverage(flow, index, cfg) {
  const walked = new Set(flow.cases.flatMap((c) => c.path));
  const known = new Set([...flow.steps, ...flow.branches, ...flow.transitions].map((x) => x.id));
  const gaps = {
    stepsUncovered: flow.steps.map((s) => s.id).filter((id) => !walked.has(id)),
    branchesUncovered: flow.branches.map((b) => b.id).filter((id) => !walked.has(id)),
    transitionsUncovered: flow.transitions.map((t) => t.id).filter((id) => !walked.has(id)),
    unknownTokens: [],
    casesWithoutTest: [],
    rulesWithoutTest: [],
    testsNotFound: [],
  };
  for (const r of flow.rules) {
    const refs = testRefs(r.test);
    if (!refs.length) gaps.rulesWithoutTest.push(r.id);
    for (const ref of refs) if (!index.resolve(ref).length) gaps.testsNotFound.push({ rule: r.id, ref });
  }
  const e2ePending = [];
  const warnings = [...flow.warnings];
  let casesWithTest = 0;
  for (const c of flow.cases) {
    for (const t of c.path) if (!known.has(t)) gaps.unknownTokens.push({ case: c.id, token: t });
    c.path.forEach((t, i) => {
      const b = flow.branches.find((x) => x.id === t);
      if (b?.at && i > 0 && c.path[i - 1] !== b.at) warnings.push(`case ${c.id}: ${b.id} starts at step ${b.at} but follows ${c.path[i - 1]}`);
      if (b?.back && /^\d/.test(b.back) && i < c.path.length - 1 && c.path[i + 1] !== b.back && !BRANCH_ID.test(c.path[i + 1])) {
        warnings.push(`case ${c.id}: ${b.id} goes back to step ${b.back} but is followed by ${c.path[i + 1]}`);
      }
    });
    const refs = testRefs(c.test);
    if (!refs.length) {
      (c.level === "e2e" ? e2ePending : gaps.casesWithoutTest).push({ case: c.id, level: c.level, kind: c.kind });
      continue;
    }
    if (c.level === "manual") {
      casesWithTest++;
      continue;
    }
    const missing = refs.filter((r) => !index.resolve(r).length);
    for (const ref of missing) gaps.testsNotFound.push({ case: c.id, ref });
    if (!missing.length) casesWithTest++;
  }
  const system = new Set(cfg.systemActors.map((a) => a.toLowerCase()));
  const people = [...new Set(flow.steps.map((s) => s.actor).filter((a) => a && !system.has(a.toLowerCase())))];
  if (people.length && !flow.cases.some((c) => c.kind === "permission")) {
    warnings.push(`no case of kind permission, though people act in it (${people.join(", ")}): who may not take a step?`);
  }
  const gapCount = Object.values(gaps).reduce((n, list) => n + list.length, 0);
  return {
    file: flow.file,
    flow: flow.flow,
    title: flow.title,
    status: flow.status,
    counts: {
      steps: flow.steps.length,
      stepsCovered: flow.steps.length - gaps.stepsUncovered.length,
      branches: flow.branches.length,
      branchesCovered: flow.branches.length - gaps.branchesUncovered.length,
      transitions: flow.transitions.length,
      transitionsCovered: flow.transitions.length - gaps.transitionsUncovered.length,
      rules: flow.rules.length,
      rulesWithTest: flow.rules.length - gaps.rulesWithoutTest.length,
      cases: flow.cases.length,
      casesWithTest,
      e2ePending: e2ePending.length,
    },
    ok: !flow.problems.length && gapCount === 0,
    problems: flow.problems,
    gaps,
    e2ePending,
    warnings,
  };
}

export function flowFiles(root) {
  const dir = path.join(root, PATHS.flows);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md").sort().map((f) => `${PATHS.flows}/${f}`);
}

/** Coverage of every flow doc (or the one named), with totals. */
export function checkAll(root, cfg, only = null) {
  const index = new TestIndex(root, cfg);
  let files = flowFiles(root);
  if (only) files = files.filter((f) => path.basename(f, ".md") === only || f === only);
  const flows = files.map((f) => coverage(parseFlow(fs.readFileSync(path.join(root, f), "utf8"), f), index, cfg));
  const sum = (k) => flows.reduce((n, f) => n + f.counts[k], 0);
  return {
    ok: flows.every((f) => f.ok),
    testFiles: index.files.length,
    flows,
    totals: {
      flows: flows.length,
      flowsWithGaps: flows.filter((f) => !f.ok).length,
      cases: sum("cases"),
      casesWithTest: sum("casesWithTest"),
      e2ePending: sum("e2ePending"),
    },
  };
}

/** One line per flow, for briefings and lists. */
export function summaryLine(f) {
  const c = f.counts;
  const gapCount = Object.values(f.gaps).reduce((n, l) => n + l.length, 0) + f.problems.length;
  const parts = [`steps ${c.stepsCovered}/${c.steps}`];
  if (c.branches) parts.push(`branches ${c.branchesCovered}/${c.branches}`);
  if (c.transitions) parts.push(`transitions ${c.transitionsCovered}/${c.transitions}`);
  if (c.rules) parts.push(`rules with a test ${c.rulesWithTest}/${c.rules}`);
  parts.push(`cases with a test ${c.casesWithTest}/${c.cases - c.e2ePending}`);
  if (c.e2ePending) parts.push(`E2E on request ${c.e2ePending}`);
  return `${f.flow} (${f.status}): ${parts.join(", ")}${gapCount ? ` — ${gapCount} gap(s)` : " — complete"}`;
}

function newFlow(root, slug, title) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug || "")) throw new Error(`flow name must be lowercase letters, digits and hyphens, got "${slug ?? ""}"`);
  const rel = `${PATHS.flows}/${slug}.md`;
  const dest = path.join(root, rel);
  if (fs.existsSync(dest)) throw new Error(`${rel} already exists; edit it instead`);
  const tpl = fs.readFileSync(path.join(PLUGIN_ROOT, "skills", "flow", "assets", "flow.md"), "utf8");
  writeFileAtomic(dest, tpl.replaceAll("{{FLOW}}", slug).replaceAll("{{TITLE}}", title || slug).replaceAll("{{DATE}}", today()));
  return { created: rel };
}

function main() {
  const [cmd = "list", ...rest] = process.argv.slice(2);
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (!root) {
    process.stderr.write("no .mtest/config.json here or above: run /mtest:init first\n");
    process.exit(2);
  }
  const cfg = loadConfig(root);
  const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + "\n");
  if (cmd === "list") {
    const r = checkAll(root, cfg);
    out({ ok: r.ok, totals: r.totals, flows: r.flows.map((f) => ({ flow: f.flow, file: f.file, status: f.status, ok: f.ok, summary: summaryLine(f) })) });
  } else if (cmd === "check") {
    const only = rest.find((a) => !a.startsWith("--")) ?? null;
    const r = checkAll(root, cfg, only);
    if (only && !r.flows.length) {
      process.stderr.write(`no flow doc named ${only} in ${PATHS.flows}/\n`);
      process.exit(2);
    }
    out(r);
    if (rest.includes("--strict") && !r.ok) process.exitCode = 1;
  } else if (cmd === "new") {
    const i = rest.indexOf("--title");
    const title = i >= 0 ? rest[i + 1] : null;
    try {
      out(newFlow(root, rest[0], title));
    } catch (err) {
      process.stderr.write(`${err.message}\n`);
      process.exit(2);
    }
  } else {
    process.stderr.write("usage: flows.mjs list | check [<flow>] [--strict] | new <flow> [--title <title>]\n");
    process.exit(2);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
