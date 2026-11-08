#!/usr/bin/env node
// Packs: the team's settled answers to topics every system has (sign-in, accounts, permissions, e-mail,
// audit), one folder each under the plugin's packs/ (format in packs/README.md). /mflow:discuss reads the
// packs a project selected and asks only what a pack leaves to the project; approving the doc writes the
// filled pack into the project. This script lists and checks the packs, and keeps the project's selection.
//
//   node packs.mjs list                    -> { packs: [{ name, version, title, prefix, requires, topics, decisions, ask, stacks }] }
//   node packs.mjs check [<name>…]         -> { ok, checked, problems: [{ pack, file, line, problem }] }  exit 1 unless ok
//   node packs.mjs selected                -> { selected, required, unknown, order, topics, available, projectDir, packs: {name: {dir, discuss, approve, stack}} }
//   node packs.mjs use <name>[,<name>…]    -> adds them and what they require to .mflow/config.json "packs"
//   --dir <folder> reads packs from there instead of the plugin's packs/ (tests)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MARKER, findRoot, frontmatter, loadConfig, readJsonFile, readText, writeFileAtomic } from "./lib.mjs";

const PLUGIN_PACKS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "packs");
export const FILES = ["pack.md", "decisions.md", "params.md", "requirements.md", "data.md", "screens.md", "checks.md"];
export const DISCUSS_FILES = FILES.slice(0, 3);
export const APPROVE_FILES = FILES.slice(3);
// The stack layer: packs/<name>/stack/<stack>.md, how a pack is built on one back end. Optional, read at approve.
export const STACKS = ["dotnet"];
const NAME_RE = /^[a-z][a-z0-9-]*$/;
const toPosix = (p) => p.replace(/\\/g, "/");

// What a pack may not carry: it ships in a public repository and serves any customer.
export const FORBIDDEN = [
  [/\bDR\d{3}\b/, "a customer screen ID"],
  [/\bNFR-[A-Z]+-\d+\b|\bBR\d{3}(?:\.\d+)?\b/, "a customer requirement ID"],
  [/\b(?:SRS|SDS|UAT)\b/, "a customer document name"],
  [/\bS\d{2}-\d{2}\b/, "a test-case ID from a customer document"],
  [/\bdecision-\d+\b/i, "a project decision number"],
  [/\bTASK-\d+\b/, "a project task number"],
  [/(?<![&\w])#\d{1,3}\b/, "a numbered template or item of one project"],
  [/discuss\/\d{2}-/, "a project's discuss document"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/, "an IP address"],
  [/[\w.+-]+@(?!example\.(?:com|org)\b)[\w-]+(?:\.[\w-]+)+/, "an e-mail address outside example.com and example.org"],
  [/\bSTEM\b|SANGO|StemPortal|StemHub/i, "a customer or project name"],
  [/Buyer web|Supplier web|Buyer ID|Owning Site|\bDMS\b/i, "a term of one project"],
  [/พี่/, "a personal name or nickname"],
];

const DECISION_FIELDS = ["คำตอบ", "เหตุผล", "ถ้าผิด", "ถามเมื่อ"];
const PARAMS_HEADER = /^\|\s*ค่า\s*\|\s*key\s*\|\s*เริ่มต้น\s*\|\s*ช่วง\s*\|\s*หมายเหตุ\s*\|\s*$/;
const DATA_HEADER = /^\|\s*Column\s*\|\s*Type\s*\|\s*Rule\s*\|\s*$/;

function packsDir(args) {
  const i = args.indexOf("--dir");
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : PLUGIN_PACKS;
}

/** `[a, b]`, `a, b` or `[]` as a list of trimmed names. */
function list(value) {
  const inner = String(value || "").trim().replace(/^\[/, "").replace(/\]$/, "");
  return inner.split(",").map((s) => s.trim()).filter(Boolean);
}

export function names(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && NAME_RE.test(e.name)).map((e) => e.name).sort();
}

/** One pack's frontmatter, decisions and parameter keys, read without judging them. */
export function readPack(dir, name) {
  const at = path.join(dir, name);
  const text = (f) => readText(path.join(at, f)) ?? "";
  const fm = frontmatter(text("pack.md"));
  const decisions = [];
  let cur = null;
  text("decisions.md").split(/\r?\n/).forEach((line, i) => {
    const h = /^###\s+([A-Z][A-Z0-9]*-D\d+)\s*:\s*(.*)$/.exec(line);
    if (h) {
      cur = { id: h[1], title: h[2].trim(), line: i + 1, fields: {} };
      decisions.push(cur);
      return;
    }
    if (/^#{1,3}\s/.test(line)) { cur = null; return; }
    const f = cur && /^-\s+\*\*([^*:]+):\*\*\s*(.*)$/.exec(line);
    if (f) cur.fields[f[1].trim()] = f[2].trim();
  });
  const params = [];
  for (const [i, line] of text("params.md").split(/\r?\n/).entries()) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length >= 2 && /^`?[a-z][a-z0-9-]*\.[a-z0-9_]+`?$/.test(cells[1])) params.push({ key: cells[1].replace(/`/g, ""), line: i + 1 });
  }
  const stackDir = path.join(at, "stack");
  const stackFiles = fs.existsSync(stackDir) ? fs.readdirSync(stackDir).filter((f) => !f.startsWith(".")).sort() : [];
  return {
    name,
    dir: at,
    stackFiles,
    stacks: stackFiles.filter((f) => STACKS.includes(f.replace(/\.md$/, "")) && f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")),
    version: fm.version,
    title: fm.title || "",
    prefix: fm.prefix || "",
    requires: list(fm.requires),
    topics: list(fm.topics),
    origin: fm.origin || "",
    frontmatter: fm,
    decisions,
    params,
  };
}

export function listPacks(dir) {
  return names(dir).map((n) => {
    const p = readPack(dir, n);
    const ask = p.decisions.filter((d) => (d.fields["ถามเมื่อ"] || "") === "ทุกโปรเจกต์").map((d) => d.id);
    return { name: p.name, version: Number(p.version) || p.version, title: p.title, prefix: p.prefix, requires: p.requires, topics: p.topics, decisions: p.decisions.length, ask, stacks: p.stacks };
  });
}

/** Every pack each of `start` needs, itself included, dependencies first; a cycle or a missing pack is reported. */
function closure(all, start) {
  const order = [];
  const missing = new Set();
  const cycles = [];
  const state = new Map();
  const visit = (n, trail) => {
    if (!all.has(n)) { missing.add(n); return; }
    if (state.get(n) === "done") return;
    if (state.get(n) === "open") { cycles.push([...trail.slice(trail.indexOf(n)), n].join(" → ")); return; }
    state.set(n, "open");
    for (const r of all.get(n).requires) visit(r, [...trail, n]);
    state.set(n, "done");
    order.push(n);
  };
  for (const n of start) visit(n, []);
  return { order, missing: [...missing], cycles };
}

export function check(dir, only = []) {
  const all = new Map(names(dir).map((n) => [n, readPack(dir, n)]));
  const problems = [];
  const add = (pack, file, line, problem) => problems.push({ pack, file, line, problem });
  const targets = only.length ? only : [...all.keys()];
  for (const n of only) if (!all.has(n)) add(n, "", 0, "no such pack");
  const owner = new Map();
  for (const p of all.values()) for (const t of p.topics) owner.set(t, [...(owner.get(t) || []), p.name]);

  for (const name of targets.filter((n) => all.has(n))) {
    const p = all.get(name);
    for (const f of FILES) if (!fs.existsSync(path.join(p.dir, f))) add(name, f, 0, "file missing");
    const fm = p.frontmatter;
    if (fm.name !== name) add(name, "pack.md", 0, `frontmatter name must be the folder name "${name}"`);
    if (!/^[1-9]\d*$/.test(String(fm.version || ""))) add(name, "pack.md", 0, "version must be a whole number from 1");
    if (!p.title) add(name, "pack.md", 0, "title missing");
    if (!/^[A-Z][A-Z0-9]*$/.test(p.prefix)) add(name, "pack.md", 0, "prefix must be upper-case letters");
    if (!p.topics.length) add(name, "pack.md", 0, "topics missing: the discuss slugs that use this pack");
    for (const t of p.topics) {
      if (!NAME_RE.test(t)) add(name, "pack.md", 0, `topic "${t}" is not a kebab-case slug`);
      if (owner.get(t).length > 1) add(name, "pack.md", 0, `topic "${t}" is claimed by ${owner.get(t).join(" and ")}`);
    }
    const graph = closure(all, [name]);
    for (const m of graph.missing) add(name, "pack.md", 0, `requires "${m}", which is not a pack`);
    for (const c of graph.cycles) add(name, "pack.md", 0, `requires make a cycle: ${c}`);

    // Decisions: the five lines, the prefix, unique IDs.
    const seen = new Set();
    if (!p.decisions.length) add(name, "decisions.md", 0, "no decisions");
    for (const d of p.decisions) {
      if (!new RegExp(`^${p.prefix}-D\\d{2}$`).test(d.id)) add(name, "decisions.md", d.line, `${d.id}: ID must be ${p.prefix}-D<two digits>`);
      if (seen.has(d.id)) add(name, "decisions.md", d.line, `${d.id} is used twice`);
      seen.add(d.id);
      if (!d.title) add(name, "decisions.md", d.line, `${d.id}: question missing`);
      for (const k of DECISION_FIELDS) if (!d.fields[k]) add(name, "decisions.md", d.line, `${d.id}: **${k}:** missing or empty`);
      const cost = d.fields["ถ้าผิด"];
      if (cost && !/^(แก้ยาก|แก้ทีหลังได้)\s*—/.test(cost)) add(name, "decisions.md", d.line, `${d.id}: **ถ้าผิด:** must start with "แก้ยาก —" or "แก้ทีหลังได้ —"`);
      const ask = d.fields["ถามเมื่อ"];
      if (ask && ask !== "ไม่ถาม" && !d.fields["ตัวเลือกอื่น"]) add(name, "decisions.md", d.line, `${d.id}: **ตัวเลือกอื่น:** missing; it is needed when the item can become a question`);
    }

    // Parameters: the header, keys under the pack's name, unique.
    const paramsText = readText(path.join(p.dir, "params.md")) ?? "";
    if (!paramsText.split(/\r?\n/).some((l) => PARAMS_HEADER.test(l))) add(name, "params.md", 0, "table header must be | ค่า | key | เริ่มต้น | ช่วง | หมายเหตุ |");
    const keys = new Set();
    for (const k of p.params) {
      if (!k.key.startsWith(`${name}.`)) add(name, "params.md", k.line, `key ${k.key} must start with "${name}."`);
      if (keys.has(k.key)) add(name, "params.md", k.line, `key ${k.key} is listed twice`);
      keys.add(k.key);
    }

    // Requirements: a scenario under each, placeholders and decision IDs that resolve.
    const reach = new Set(graph.order);
    const knownKeys = new Set([...reach].flatMap((n) => all.get(n)?.params.map((k) => k.key) || []));
    const knownIds = new Set([...reach].flatMap((n) => all.get(n)?.decisions.map((d) => d.id) || []));
    const packText = readText(path.join(p.dir, "pack.md")) ?? "";
    const reqLines = (readText(path.join(p.dir, "requirements.md")) ?? "").split(/\r?\n/);
    let req = null;
    const closeReq = () => { if (req && !req.scenarios) add(name, "requirements.md", req.line, `requirement "${req.title}" has no #### Scenario`); };
    let reqCount = 0;
    let inFence = false;
    reqLines.forEach((line, i) => {
      if (/^```/.test(line.trim())) inFence = !inFence;
      if (inFence) return;
      const h = /^###\s+Requirement:\s*(.*)$/.exec(line);
      if (h) { closeReq(); req = { title: h[1].trim(), line: i + 1, scenarios: 0 }; reqCount++; }
      else if (/^####\s+Scenario:/.test(line) && req) req.scenarios++;
      else if (/^#{1,2}\s/.test(line)) { closeReq(); req = null; }
      for (const m of line.matchAll(/\{([^{}\s]+)\}/g)) {
        const ph = m[1];
        if (ph.includes(".")) { if (!knownKeys.has(ph)) add(name, "requirements.md", i + 1, `{${ph}} is not a key in params.md of this pack or a pack it requires`); }
        else if (!packText.includes(`{${ph}}`)) add(name, "requirements.md", i + 1, `{${ph}} is not a project term named in pack.md`);
      }
      for (const m of line.matchAll(/\b([A-Z][A-Z0-9]*-D\d{2})\b/g)) {
        if (!knownIds.has(m[1])) add(name, "requirements.md", i + 1, `${m[1]} is not a decision of this pack or a pack it requires`);
      }
    });
    closeReq();
    if (!reqCount) add(name, "requirements.md", 0, "no ### Requirement");

    // Data: every table section carries the column header.
    const dataLines = (readText(path.join(p.dir, "data.md")) ?? "").split(/\r?\n/);
    const sections = [];
    dataLines.forEach((line, i) => {
      if (/^##\s+\S/.test(line)) sections.push({ title: line.replace(/^##\s+/, ""), line: i + 1, header: false });
      else if (DATA_HEADER.test(line) && sections.length) sections[sections.length - 1].header = true;
    });
    for (const s of sections) if (!s.header) add(name, "data.md", s.line, `table "${s.title}" has no | Column | Type | Rule | header`);

    for (const f of ["screens.md", "checks.md"]) if (!(readText(path.join(p.dir, f)) ?? "").trim()) add(name, f, 0, "empty");

    // Stack layer: known stacks only, frontmatter naming the pack and the stack, decision IDs that resolve.
    for (const sf of p.stackFiles) {
      const rel = `stack/${sf}`;
      const stack = sf.replace(/\.md$/, "");
      if (!sf.endsWith(".md") || !STACKS.includes(stack)) { add(name, rel, 0, `not a known stack file; known: ${STACKS.map((s) => s + ".md").join(", ")}`); continue; }
      const st = readText(path.join(p.dir, "stack", sf)) ?? "";
      const sfm = frontmatter(st);
      if (sfm.pack !== name) add(name, rel, 0, `frontmatter pack must be "${name}"`);
      if (sfm.stack !== stack) add(name, rel, 0, `frontmatter stack must be "${stack}"`);
      if (!/^##\s+Decision by decision\s*$/m.test(st)) add(name, rel, 0, "## Decision by decision missing");
      st.split(/\r?\n/).forEach((line, i) => {
        for (const m of line.matchAll(/\b([A-Z][A-Z0-9]*-D\d{2})\b/g)) {
          if (!knownIds.has(m[1])) add(name, rel, i + 1, `${m[1]} is not a decision of this pack or a pack it requires`);
        }
      });
    }

    // Content any customer may see.
    for (const f of [...FILES, ...p.stackFiles.map((sf) => `stack/${sf}`)]) {
      const t = readText(path.join(p.dir, f));
      if (t == null) continue;
      t.split(/\r?\n/).forEach((line, i) => {
        if (f === "pack.md" && /^origin:/.test(line)) return;
        for (const [re, what] of FORBIDDEN) {
          const m = re.exec(line);
          if (m) add(name, f, i + 1, `${what}: "${m[0]}"`);
        }
      });
    }
  }
  return { ok: problems.length === 0, checked: targets.filter((n) => all.has(n)), problems };
}

/** The filled pack files sit beside the discussion folder: docs/decisions/discuss → docs/decisions/packs. */
export function projectPacksDir(root) {
  const discuss = toPosix(loadConfig(root).discussDir).replace(/\/+$/, "");
  return path.posix.join(path.posix.dirname(discuss), "packs");
}

export function selected(root, dir) {
  const chosen = loadConfig(root).packs || [];
  const all = new Map(names(dir).map((n) => [n, readPack(dir, n)]));
  const unknown = chosen.filter((n) => !all.has(n));
  const { order } = closure(all, chosen.filter((n) => all.has(n)));
  const required = order.filter((n) => !chosen.includes(n));
  const topics = {};
  for (const n of order) for (const t of all.get(n).topics) topics[t] = n;
  // Every pack's topics, so discuss can name a pack the project has not chosen yet.
  const available = {};
  for (const p of all.values()) for (const t of p.topics) available[t] = p.name;
  const packs = {};
  for (const n of order) {
    const p = all.get(n);
    packs[n] = {
      version: Number(p.version) || p.version,
      title: p.title,
      dir: p.dir,
      discuss: DISCUSS_FILES.map((f) => path.join(p.dir, f)),
      approve: APPROVE_FILES.map((f) => path.join(p.dir, f)),
      stack: Object.fromEntries(p.stacks.map((s) => [s, path.join(p.dir, "stack", `${s}.md`)])),
      filled: `${projectPacksDir(root)}/${n}.md`,
    };
  }
  const warnings = [];
  if (unknown.length) warnings.push(`.mflow/config.json names packs that do not exist: ${unknown.join(", ")}`);
  if (required.length) warnings.push(`selected packs require ${required.join(", ")}, which are not in .mflow/config.json yet: run packs.mjs use ${required.join(",")}`);
  return { selected: chosen, required, unknown, order, topics, available, projectDir: projectPacksDir(root), packs, warnings };
}

export function use(root, dir, requested) {
  const all = new Map(names(dir).map((n) => [n, readPack(dir, n)]));
  const bad = requested.filter((n) => !all.has(n));
  if (bad.length) throw new Error(`no such pack: ${bad.join(", ")} (available: ${[...all.keys()].join(", ")})`);
  const file = path.join(root, MARKER);
  const json = readJsonFile(file, { allowEmpty: true, label: toPosix(MARKER) }) ?? {};
  const before = Array.isArray(json.packs) ? json.packs : [];
  const { order } = closure(all, [...before.filter((n) => all.has(n)), ...requested]);
  const after = [...before.filter((n) => !all.has(n)), ...order];
  const added = after.filter((n) => !before.includes(n));
  if (added.length) {
    json.packs = after;
    writeFileAtomic(file, JSON.stringify(json, null, 2) + "\n");
  }
  return { added, file: toPosix(MARKER), ...selected(root, dir) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const dir = packsDir(args);
  const rest = args.filter((a, i) => a !== "--dir" && args[i - 1] !== "--dir");
  const [cmd, ...more] = rest;
  const requested = more.join(",").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  try {
    let out;
    let fail = false;
    if (cmd === "list" || !cmd) out = { dir: toPosix(dir), packs: listPacks(dir) };
    else if (cmd === "check") { out = check(dir, requested); fail = !out.ok; }
    else if (cmd === "selected" || cmd === "use") {
      const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
      if (!root) throw new Error("not an mflow project (no .mflow/config.json here or above): run /mflow:init first");
      if (cmd === "use" && !requested.length) throw new Error("usage: packs.mjs use <name>[,<name>…]");
      out = cmd === "use" ? use(root, dir, requested) : selected(root, dir);
    } else throw new Error("usage: packs.mjs list | check [<name>…] | selected | use <name>[,<name>…] [--dir <folder>]");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    if (fail) process.exit(1);
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(1);
  }
}
