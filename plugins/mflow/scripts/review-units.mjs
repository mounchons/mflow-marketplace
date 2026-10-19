#!/usr/bin/env node
// Review units for /mflow:analyze on the system as built. The plan in .mflow/review-units.json puts
// every file git tracks in one unit, or in a notReviewed group with its reason, so other AI tools can
// review one part at a time and nothing is left out because nobody thought of it. Claude writes the
// plan from `draft`; this script only reads, except `facts --out`, which writes one file.
//
//   node review-units.mjs draft                       -> JSON: a first split from the folder layout, to edit into the plan
//   node review-units.mjs check                       -> JSON: files in no unit or in two, groups without a reason, specs no unit claims
//   node review-units.mjs files <unit>                -> JSON: the files of one unit
//   node review-units.mjs facts <unit> --out <file>   -> write the facts file: files, test names, routes and endpoints, schema
//
// Globs match the whole repo-relative path: `*` stays inside one folder, `**` crosses folders, `{a,b}`
// is either. A joins unit holds no files of its own; its files are those of the units its flows name.
// The facts file is lifted from the code by pattern and never interpreted, so a tool reading it learns
// what the code holds, not what Claude thinks of it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, gitStatus, insideProject, loadConfig, readJsonFile, realInside, run, writeFileAtomic } from "./lib.mjs";

export const PLAN = ".mflow/review-units.json";
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const KINDS = ["feature", "shared", "joins"];
const LIST_MAX = 200;
const toPosix = (p) => p.split(path.sep).join("/");

/** A glob over repo-relative paths as a RegExp; see the header for the syntax. */
export function globToRegExp(glob) {
  let re = "";
  const g = toPosix(String(glob).trim()).replace(/^\.\//, "");
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") {
      const slashAfter = g[i + 2] === "/";
      re += slashAfter ? "(?:.*/)?" : ".*";
      i += slashAfter ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = g.indexOf("}", i);
      if (end < 0) { re += "\\{"; continue; }
      re += "(?:" + g.slice(i + 1, end).split(",").map((s) => s.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")).join("|") + ")";
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

const matcher = (globs) => {
  const res = (globs || []).map(globToRegExp);
  return (file) => res.some((r) => r.test(file));
};

/** Every file git tracks under root, repo-relative to root. Throws outside a git repository. */
export function trackedFiles(root) {
  const out = run("git -c core.quotePath=false ls-files -z", root, 30_000);
  if (out === null) throw new Error("review units need git: no repository here, or git is missing");
  return out.split("\0").filter(Boolean).sort();
}

/** The plan, checked for shape. Throws with what to fix when it is missing or malformed. */
export function readPlan(root) {
  const plan = readJsonFile(path.join(root, PLAN), { label: PLAN });
  if (!plan) throw new Error(`no ${PLAN}: run /mflow:analyze units first`);
  const bad = (what) => { throw new Error(`${PLAN} ${what}; fix it by hand`); };
  if (!Array.isArray(plan.units)) bad("has no units list");
  const seen = new Set();
  for (const u of plan.units) {
    if (!u || typeof u !== "object" || !NAME.test(u.name || "")) bad(`has a unit without a lower-case name (letters, digits, -): ${JSON.stringify(u?.name)}`);
    if (seen.has(u.name)) bad(`names unit ${u.name} twice`);
    seen.add(u.name);
    if (u.kind !== undefined && !KINDS.includes(u.kind)) bad(`gives unit ${u.name} kind ${JSON.stringify(u.kind)} (feature, shared or joins)`);
    if (u.kind === "joins") {
      if (!Array.isArray(u.flows)) bad(`gives joins unit ${u.name} no flows list`);
    } else if (!Array.isArray(u.globs) || !u.globs.every((g) => typeof g === "string" && g.trim())) bad(`gives unit ${u.name} no globs list`);
    for (const key of ["specs", "neighbours"]) if (u[key] !== undefined && !Array.isArray(u[key])) bad(`gives unit ${u.name} a ${key} that is not a list`);
  }
  if (plan.notReviewed !== undefined && !Array.isArray(plan.notReviewed)) bad("has a notReviewed that is not a list");
  return { ...plan, notReviewed: plan.notReviewed || [] };
}

/** Spec capabilities: openspec/specs/<cap>/ and the specs of changes not yet archived. */
export function specCapabilities(root) {
  const caps = new Map();
  const add = (cap, where) => { if (!caps.has(cap)) caps.set(cap, []); caps.get(cap).push(where); };
  const dirs = (rel) => {
    const abs = path.join(root, rel);
    return fs.existsSync(abs) ? fs.readdirSync(abs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
  };
  for (const cap of dirs("openspec/specs")) if (fs.existsSync(path.join(root, "openspec/specs", cap, "spec.md"))) add(cap, `openspec/specs/${cap}/spec.md`);
  for (const change of dirs("openspec/changes").filter((c) => c !== "archive")) {
    for (const cap of dirs(`openspec/changes/${change}/specs`)) add(cap, `openspec/changes/${change}/specs/${cap}/spec.md`);
  }
  return caps;
}

/** Which unit (or notReviewed group) holds each file; a joins unit holds none of its own. */
function assign(plan, files) {
  const units = plan.units.filter((u) => u.kind !== "joins").map((u) => ({ name: u.name, match: matcher(u.globs) }));
  const groups = plan.notReviewed.map((g, i) => ({ i, reason: typeof g?.reason === "string" ? g.reason.trim() : "", match: matcher(g?.globs) }));
  const byUnit = new Map(plan.units.map((u) => [u.name, []]));
  const byGroup = new Map(groups.map((g) => [g.i, []]));
  const unassigned = [];
  const overlaps = [];
  for (const f of files) {
    const inUnits = units.filter((u) => u.match(f)).map((u) => u.name);
    const inGroups = groups.filter((g) => g.match(f)).map((g) => g.i);
    for (const n of inUnits) byUnit.get(n).push(f);
    for (const i of inGroups) byGroup.get(i).push(f);
    if (inUnits.length + inGroups.length === 0) unassigned.push(f);
    else if (inUnits.length > 1 || (inUnits.length && inGroups.length)) {
      overlaps.push({ file: f, units: inUnits, ...(inGroups.length ? { notReviewed: inGroups } : {}) });
    }
  }
  return { byUnit, byGroup, groups, unassigned, overlaps };
}

/** The files of one unit; for a joins unit, the files of the units its flows name. */
export function unitFiles(root, plan, name, files = trackedFiles(root)) {
  const unit = plan.units.find((u) => u.name === name);
  if (!unit) throw new Error(`no unit ${name} in ${PLAN} (units: ${plan.units.map((u) => u.name).join(", ") || "none"})`);
  const { byUnit } = assign(plan, files);
  if (unit.kind !== "joins") return { unit, files: byUnit.get(name) };
  const members = [...new Set(unit.flows.flatMap((f) => (Array.isArray(f?.units) ? f.units : [])))];
  return { unit, files: [...new Set(members.flatMap((m) => byUnit.get(m) || []))].sort() };
}

const capped = (list) => (list.length > LIST_MAX ? { count: list.length, first: list.slice(0, LIST_MAX) } : list);

export function check(root) {
  const plan = readPlan(root);
  const files = trackedFiles(root);
  const { byUnit, byGroup, groups, unassigned, overlaps } = assign(plan, files);
  const caps = specCapabilities(root);
  const claimed = new Set(plan.units.flatMap((u) => u.specs || []));
  const names = new Set(plan.units.map((u) => u.name));
  const unknownSpecs = plan.units.flatMap((u) => (u.specs || []).filter((s) => !caps.has(s)).map((spec) => ({ unit: u.name, spec })));
  const badNeighbours = plan.units.flatMap((u) => (u.neighbours || []).filter((n) => !names.has(n)).map((neighbour) => ({ unit: u.name, neighbour })));
  const badFlows = plan.units.filter((u) => u.kind === "joins").flatMap((u) => u.flows
    .flatMap((f) => (Array.isArray(f?.units) ? f.units : []).filter((m) => !names.has(m)).map((m) => ({ unit: u.name, flow: f?.name || "", missing: m }))));
  const emptyUnits = plan.units.filter((u) => u.kind !== "joins" && !byUnit.get(u.name).length).map((u) => u.name);
  const withoutReason = groups.filter((g) => !g.reason).map((g) => g.i);
  const unmappedSpecs = [...caps.keys()].filter((c) => !claimed.has(c));
  const ok = !unassigned.length && !overlaps.length && !withoutReason.length && !unmappedSpecs.length
    && !unknownSpecs.length && !badNeighbours.length && !badFlows.length && !emptyUnits.length;
  return {
    plan: PLAN,
    ok,
    files: files.length,
    units: plan.units.map((u) => ({
      name: u.name,
      kind: u.kind || "feature",
      files: u.kind === "joins" ? null : byUnit.get(u.name).length,
      specs: u.specs || [],
      ...(u.kind === "joins" ? { flows: u.flows.length } : {}),
    })),
    notReviewed: groups.map((g) => ({ group: g.i, reason: g.reason || null, files: byGroup.get(g.i).length })),
    unassigned: capped(unassigned),
    overlaps: capped(overlaps),
    notReviewedWithoutReason: withoutReason,
    emptyUnits,
    specs: { all: [...caps.keys()], unmapped: unmappedSpecs, unknown: unknownSpecs },
    badNeighbours,
    badFlows,
  };
}

// Files that are never logic: a draft suggests them for notReviewed, and the user reads the reason.
const NOT_LOGIC = [
  { globs: ["**/*.{png,jpg,jpeg,gif,webp,ico,svg,bmp}"], reason: "images" },
  { globs: ["**/*.{woff,woff2,ttf,otf,eot}"], reason: "fonts" },
  { globs: ["**/{package-lock.json,yarn.lock,pnpm-lock.yaml,packages.lock.json,poetry.lock,Cargo.lock,composer.lock}"], reason: "lockfiles" },
  { globs: ["**/.gitkeep"], reason: "empty-folder markers" },
  { globs: ["openspec/**"], reason: "specs: the yardstick the review reads, not code under review" },
  { globs: ["docs/**"], reason: "documents, not code" },
  { globs: ["backlog/**"], reason: "work tracking, not code" },
  { globs: [".claude/**", ".agents/**", ".codex/**", ".opencode/**", ".mflow/**"], reason: "AI tool settings and mflow state" },
];
const MODULE_DIR = /(?:^|\/)(?:Modules|modules|Features|features)\/([^/]+)\//;
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

/** A first split: module folders by name, and the rest grouped by folder, for Claude to edit into the plan. */
export function draft(root) {
  const files = trackedFiles(root);
  const notLogic = NOT_LOGIC.map((g) => ({ ...g, match: matcher(g.globs) }));
  const modules = new Map();
  for (const f of files) {
    const m = MODULE_DIR.exec(f);
    if (m) modules.set(kebab(m[1]), m[1]);
  }
  const units = [...modules].map(([name, folder]) => ({ name, kind: "feature", folder, globs: [`**/Modules/${folder}/**`, `**/modules/${folder}/**`, `**/Features/${folder}/**`, `**/features/${folder}/**`], files: [] }));
  // A name prefix (SupplierApiTests.cs, lib/suppliers.ts) is trusted only under the top folders that
  // hold module folders and the usual test folders, so a document or spec named after a module stays out.
  const codeRoots = new Set([...files.filter((f) => MODULE_DIR.test(f)).map((f) => f.split("/")[0]), "tests", "test", "e2e", "__tests__"]);
  const rest = new Map();
  const suggested = notLogic.map((g) => ({ globs: g.globs, reason: g.reason, files: 0 }));
  for (const f of files) {
    const lg = notLogic.findIndex((g) => g.match(f));
    if (lg >= 0) { suggested[lg].files++; continue; }
    const base = path.posix.basename(f).toLowerCase();
    const inCode = codeRoots.has(f.split("/")[0]);
    const u = units.find((x) => matcher(x.globs)(f))
      || (inCode && units.find((x) => base.startsWith(x.folder.toLowerCase()) || f.toLowerCase().split("/").slice(1).some((seg) => seg.startsWith(x.folder.toLowerCase()))));
    if (u) { u.files.push(f); continue; }
    const dir = path.posix.dirname(f).split("/").slice(0, 4).join("/");
    rest.set(dir, (rest.get(dir) || 0) + 1);
  }
  return {
    files: files.length,
    note: "A draft only: module folders matched by name, test and web files matched by a name prefix (check them), the rest grouped by folder. Write the plan to " + PLAN + " and run check.",
    units: units.map((u) => ({
      name: u.name,
      kind: u.kind,
      globs: u.globs,
      byNamePrefix: capped(u.files.filter((f) => !matcher(u.globs)(f))),
      files: u.files.length,
    })),
    rest: [...rest].sort((a, b) => a[0].localeCompare(b[0])).map(([dir, n]) => ({ dir, files: n })),
    notReviewedSuggested: suggested.filter((g) => g.files),
    specs: [...specCapabilities(root).keys()],
  };
}

// ---- facts ------------------------------------------------------------------------------------------

// A cloned repository can track a link, or have a folder replaced by a junction, that leads outside
// the project: such a file is never read, so a pattern in the repository's own config cannot lift a
// file from elsewhere into the facts that the brief sends to another tool.
const read = (root, f) => {
  if (!realInside(root, f)) return null;
  try { return fs.readFileSync(path.join(root, f), "utf8"); } catch { return null; }
};
const lines = (text) => text.split(/\r?\n/);
// A name or route is one line of the facts file, however much a pattern captured.
const clip = (s) => (s.length > 200 ? `${s.slice(0, 200)}…` : s);

/** Test names in one file: C#/Java attributes and the method after them, JS/TS it()/test(), Python test_. */
function testNames(file, text, extra) {
  const ext = path.posix.extname(file).toLowerCase();
  const out = [];
  const ls = lines(text);
  if ([".cs", ".java", ".kt"].includes(ext)) {
    // After a test attribute, the next method declaration is the test; other attributes ([InlineData]
    // rows) and blank lines in between do not count against the lookahead.
    let pending = 0;
    for (const l of ls) {
      if (/^\s*(\[(Fact|Theory|Test|TestMethod|TestCase|SkippableFact)\b|@(Test|ParameterizedTest)\b)/.test(l)) { pending = 4; continue; }
      if (pending > 0) {
        const m = /\b(?:void|Task|ValueTask|fun)\s+(?:<[^>]*>\s*)?([A-Za-z_]\w*)\s*\(/.exec(l) || /\bfun\s+`([^`]+)`/.exec(l);
        if (m) { out.push(m[1]); pending = 0; } else if (!/^\s*(\[|@|\/\/|$)/.test(l)) pending--;
      }
    }
  } else if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext)) {
    for (const l of ls) {
      const m = /\b(?:it|test)(?:\.(?:only|skip|todo|concurrent))?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/.exec(l);
      if (m) out.push(m[2]);
    }
  } else if (ext === ".py") {
    for (const l of ls) { const m = /^\s*(?:async\s+)?def\s+(test_\w+)/.exec(l); if (m) out.push(m[1]); }
  }
  for (const re of extra) for (const l of ls) { const m = re.exec(l); if (m?.[1]) out.push(m[1]); }
  return out;
}

/**
 * Web routes and API endpoints declared in one file, with the line they are on. Next.js routes count
 * only under a folder that holds a next.config.* (`nextRoots`), so a folder merely named pages/ or app/
 * in another kind of app adds nothing.
 */
function routes(file, text, extra, nextRoots) {
  const out = [];
  for (const r of nextRoots) {
    const within = r ? (file.startsWith(`${r}/`) ? file.slice(r.length + 1) : null) : file;
    if (within === null) continue;
    const local = within.replace(/^src\//, "");
    const app = /^app\/(?:(.*)\/)?page\.(?:tsx|jsx|ts|js|mdx)$/.exec(local);
    if (app) {
      const segs = (app[1] || "").split("/").filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@"));
      out.push({ route: "/" + segs.join("/"), line: null });
    }
    const pages = /^pages\/(.+)\.(?:tsx|jsx|ts|js)$/.exec(local);
    if (pages && !/(^|\/)(_app|_document|_error)$/.test(pages[1]) && !pages[1].startsWith("api/")) {
      out.push({ route: "/" + pages[1].replace(/(^|\/)index$/, ""), line: null });
    }
  }
  const ls = lines(text);
  const ext = path.posix.extname(file).toLowerCase();
  if (ext === ".cshtml" && ls.some((l) => /^\s*@page\b/.test(l))) {
    const decl = ls.findIndex((l) => /^\s*@page\b/.test(l));
    const own = /@page\s+"([^"]*)"/.exec(ls[decl])?.[1];
    out.push({ route: own || "/" + file.replace(/^.*?Pages\//, "").replace(/\.cshtml$/, "").replace(/(^|\/)Index$/, ""), line: decl + 1 });
  }
  if (ext === ".cs") {
    let prefix = null;
    let classSeen = false;
    ls.forEach((l, i) => {
      if (/\bclass\s+\w+/.test(l)) classSeen = true;
      const route = /\[Route\(\s*"([^"]*)"\s*\)\]/.exec(l);
      if (route && !classSeen) prefix = route[1];
      else if (route) out.push({ route: `ANY ${join(prefix, route[1])}`, line: i + 1 });
      const verb = /\[Http(Get|Post|Put|Patch|Delete)(?:\(\s*"([^"]*)"[^)]*\))?\]/.exec(l);
      if (verb) out.push({ route: `${verb[1].toUpperCase()} ${join(prefix, verb[2] || "")}`, line: i + 1 });
      const minimal = /\.Map(Get|Post|Put|Patch|Delete|Group|Methods)\s*\(\s*\$?"([^"]*)"/.exec(l);
      if (minimal) out.push({ route: `${minimal[1].toUpperCase()} ${minimal[2]}`, line: i + 1 });
    });
  }
  if ([".js", ".ts", ".mjs", ".cjs"].includes(ext)) {
    ls.forEach((l, i) => {
      const m = /\b(?:app|router|server)\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/.exec(l);
      if (m) out.push({ route: `${m[1].toUpperCase()} ${m[3]}`, line: i + 1 });
    });
  }
  if (ext === ".py") {
    ls.forEach((l, i) => {
      const m = /@\w+\.(get|post|put|patch|delete|route)\(\s*['"]([^'"]+)/.exec(l);
      if (m) out.push({ route: `${m[1] === "route" ? "ANY" : m[1].toUpperCase()} ${m[2]}`, line: i + 1 });
    });
  }
  for (const re of extra) ls.forEach((l, i) => { const m = re.exec(l); if (m?.[1]) out.push({ route: m[1], line: i + 1 }); });
  return out;
}
const join = (a, b) => [a, b].filter((s) => s !== null && s !== undefined && s !== "").join("/").replace(/\/+/g, "/") || "/";

/** Entities and tables from the schema files an ORM keeps: EF model snapshots, Prisma, SQL migrations. */
function schema(root, files) {
  const out = [];
  for (const f of files.filter((x) => /ModelSnapshot\.cs$/.test(x))) {
    let entity = null;
    lines(read(root, f) || "").forEach((l, i) => {
      const e = /modelBuilder\.Entity\(\s*"([^"]+)"/.exec(l);
      if (e) { entity = { name: e[1], table: null, file: f, line: i + 1 }; out.push(entity); }
      const t = /\bToTable\(\s*"([^"]+)"/.exec(l);
      if (t && entity && !entity.table) entity.table = t[1];
    });
  }
  for (const f of files.filter((x) => /(^|\/)schema\.prisma$/.test(x))) {
    let model = null;
    lines(read(root, f) || "").forEach((l, i) => {
      const m = /^\s*model\s+(\w+)\s*\{/.exec(l);
      if (m) { model = { name: m[1], table: null, file: f, line: i + 1 }; out.push(model); }
      const t = /@@map\(\s*"([^"]+)"/.exec(l);
      if (t && model) model.table = t[1];
    });
  }
  if (!out.length) {
    for (const f of files.filter((x) => /(^|\/)migrations?\/.*\.sql$/i.test(x))) {
      lines(read(root, f) || "").forEach((l, i) => {
        const m = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?[`"[]?([\w.]+)[`"\]]?/i.exec(l);
        if (m) out.push({ name: null, table: m[1], file: f, line: i + 1 });
      });
    }
  }
  return out;
}

const regexes = (list, key) => (Array.isArray(list) ? list : []).map((s) => {
  try { return new RegExp(s); } catch { throw new Error(`.mflow/config.json asBuilt.facts.${key}: ${JSON.stringify(s)} is not a valid regular expression`); }
});

/** The facts file of one unit, as Markdown. */
export function facts(root, name, plan = readPlan(root)) {
  const all = trackedFiles(root);
  const { unit, files } = unitFiles(root, plan, name, all);
  const cfg = loadConfig(root).asBuilt || {};
  const extraTests = regexes(cfg.facts?.tests, "tests");
  const extraRoutes = regexes(cfg.facts?.routes, "routes");
  const nextRoots = all.filter((f) => /(^|\/)next\.config\.(?:js|mjs|cjs|ts)$/.test(f)).map((f) => path.posix.dirname(f)).map((d) => (d === "." ? "" : d));
  const tests = [];
  const found = [];
  for (const f of files) {
    const text = read(root, f);
    if (text === null || text.includes("\0")) continue;
    const t = testNames(f, text, extraTests).map(clip);
    if (t.length) tests.push({ file: f, names: t });
    for (const r of routes(f, text, extraRoutes, nextRoots)) found.push({ ...r, route: clip(r.route), file: f });
  }
  const entities = schema(root, all);
  const head = run("git rev-parse HEAD", root, 8000)?.trim() || "(no commit)";
  const dirty = gitStatus(root)?.entries.length || 0;
  const date = new Date().toISOString().slice(0, 10);
  const openapi = typeof cfg.openapi === "string" && cfg.openapi.trim() ? cfg.openapi.trim() : null;
  const md = [
    `# Facts: unit ${unit.name}`,
    "",
    `Generated by review-units.mjs from commit ${head}${dirty ? `, with ${dirty} uncommitted file(s)` : ""}, on ${date}. Lifted from the code by pattern, not written by anyone: names and paths are as the code has them. Where this file and a document disagree, the code is what runs.`,
    "",
    `## Files in the unit (${files.length})`,
    "",
    ...(unit.kind === "joins" ? [`A joins unit: the files of ${[...new Set(unit.flows.flatMap((f) => f?.units || []))].join(", ")}. Flows:`, ...unit.flows.map((f) => `- ${f?.name || "(unnamed)"}: ${(f?.units || []).join(" → ")}${f?.note ? ` (${f.note})` : ""}`), ""] : []),
    ...files.map((f) => `- ${f}`),
    "",
    `## Tests (${tests.reduce((n, t) => n + t.names.length, 0)})`,
    "",
    ...(tests.length ? tests.flatMap((t) => [`### ${t.file}`, ...t.names.map((n) => `- ${n}`), ""]) : ["None found in this unit's files (looked for [Fact]/[Theory]/[Test]/@Test methods, it()/test() calls and def test_; add patterns under asBuilt.facts.tests).", ""]),
    `## Routes and endpoints (${found.length}), as declared`,
    "",
    ...(found.length ? found.map((r) => `- \`${r.route}\` — ${r.file}${r.line ? `:${r.line}` : ""}`) : ["None found in this unit's files (looked for app/**/page.*, pages/**, Razor @page, [Route]/[Http*], Map*(), app.get() and @app.get(); add patterns under asBuilt.facts.routes)."]),
    "",
    `## Schema, whole system (${entities.length})`,
    "",
    ...(entities.length ? entities.map((e) => `- ${e.name ? `\`${e.name}\`` : "(table)"}${e.table ? ` → \`${e.table}\`` : ""} — ${e.file}:${e.line}`) : ["None found (looked for *ModelSnapshot.cs, schema.prisma and CREATE TABLE in migrations/*.sql)."]),
    "",
    "## OpenAPI",
    "",
    openapi
      ? (insideProject(openapi) && realInside(root, openapi) && fs.existsSync(path.join(root, openapi)) ? `- Read ${openapi} (exported by the project; check its date against the commit above).` : `- .mflow/config.json names ${openapi}, but it is not a file inside the project.`)
      : "- Not set: the project has no exported OpenAPI file in .mflow/config.json (asBuilt.openapi). mflow never starts the app to make one.",
    "",
  ].join("\n");
  return { unit: unit.name, files: files.length, tests: tests.reduce((n, t) => n + t.names.length, 0), routes: found.length, schema: entities.length, openapi, md };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()) || process.cwd();
  const [cmd, name, ...rest] = process.argv.slice(2);
  const opt = (flag) => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    let out;
    if (cmd === "draft") out = draft(root);
    else if (cmd === "check") out = check(root);
    else if (cmd === "files") {
      if (!name) throw new Error("files: name the unit");
      const r = unitFiles(root, readPlan(root), name);
      out = { unit: r.unit.name, kind: r.unit.kind || "feature", files: r.files };
    } else if (cmd === "facts") {
      if (!name) throw new Error("facts: name the unit");
      const target = opt("--out");
      if (!target) throw new Error("facts: --out <file> names where the facts file goes, e.g. .mflow/briefs/AN-001-r1.facts.md");
      const rel = toPosix(path.relative(root, path.resolve(root, target)));
      if (!insideProject(rel) || !realInside(root, rel)) throw new Error(`facts: --out ${target} is outside the project`);
      const f = facts(root, name);
      writeFileAtomic(path.join(root, rel), f.md);
      const { md, ...summary } = f;
      out = { written: rel, ...summary };
    } else throw new Error("usage: review-units.mjs draft | check | files <unit> | facts <unit> --out <file>");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
