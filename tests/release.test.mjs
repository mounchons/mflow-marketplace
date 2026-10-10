// Release checks: the plugin version, the tool versions it was tested with, the scripts and the CI
// matrix say the same thing everywhere a reader meets them, so a release cannot ship documents that
// disagree with the plugin. When one fails after a version bump, update the document it names.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = "plugins/mflow";
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const version = JSON.parse(read(`${PLUGIN}/.claude-plugin/plugin.json`)).version;
const compat = JSON.parse(read(`${PLUGIN}/compat.json`));

test("the requirement, the manual and the README name the plugin's version", () => {
  assert.match(read("docs/requirement.md"), new RegExp(`\\| เวอร์ชันที่อธิบาย \\| ${esc(version)} \\|`), "docs/requirement.md header");
  const manual = read("docs/manual.md");
  assert.match(manual, new RegExp(`\\| เวอร์ชัน plugin \\| ${esc(version)} \\|`), "docs/manual.md header");
  assert.match(manual, new RegExp(`## 8\\. ข้อควรระวังที่ทราบแล้ว \\(${esc(version)}\\)`), "docs/manual.md section 8");
  const minor = version.split(".").slice(0, 2).join(".");
  assert.match(read(`${PLUGIN}/README.md`), new RegExp(`## คำสั่ง \\(v${esc(minor)}\\)`), "README commands heading");
});

test("compat.json and requirement section 12 list the same tested versions", () => {
  const req = read("docs/requirement.md");
  for (const [name, id] of [["OpenSpec", "openspec"], ["Backlog.md", "backlog"], ["Claude Code", "claude-code"]]) {
    assert.match(req, new RegExp(`\\| ${esc(name)} \\| ${esc(compat.testedWith[id])} \\|`), `${name} in section 12`);
  }
  const majorMinor = (v) => v.split(".").slice(0, 2).join(".");
  const node = compat.minimum.node.split(".")[0];
  assert.match(req, new RegExp(`Node ${node}\\+`), "NFR-01 minimum Node");
  assert.match(read(`${PLUGIN}/README.md`), new RegExp(`Node ${node}\\+`), "README minimum Node");
  const manual = read("docs/manual.md");
  assert.match(manual, new RegExp(`Node ${node} ขึ้นไป`), "manual minimum Node");
  assert.match(manual, new RegExp(`OpenSpec ${esc(majorMinor(compat.minimum.openspec))} ขึ้นไป`), "manual minimum OpenSpec");
  assert.match(manual, new RegExp(`Backlog\\.md ${esc(majorMinor(compat.minimum.backlog))} ขึ้นไป`), "manual minimum Backlog.md");
});

test("the CI matrix runs the Node versions compat.json declares", () => {
  const ci = read(".github/workflows/tests.yml");
  const matrix = /node:\s*\[([^\]]*)\]/.exec(ci)?.[1].split(",").map((s) => s.trim());
  assert.deepEqual(matrix, compat.ciNode);
  assert.ok(compat.ciNode.includes(compat.minimum.node.split(".")[0]), "CI covers the minimum");
});

test("every script is listed in the README and requirement trees, and every hook runs one that exists", () => {
  const scripts = fs.readdirSync(path.join(REPO, PLUGIN, "scripts")).filter((f) => f.endsWith(".mjs"));
  const readme = read(`${PLUGIN}/README.md`);
  const req = read("docs/requirement.md");
  for (const s of scripts) {
    assert.ok(readme.includes(`─ ${s}`), `${s} missing from the README tree`);
    assert.ok(req.includes(`─ ${s}`), `${s} missing from the requirement tree`);
  }
  const hooks = JSON.parse(read(`${PLUGIN}/hooks/hooks.json`)).hooks;
  for (const entries of Object.values(hooks)) {
    for (const h of entries.flatMap((e) => e.hooks)) {
      const script = /scripts\/([\w-]+\.mjs)/.exec(h.command)?.[1];
      assert.ok(script && scripts.includes(script), `hook command runs a missing script: ${h.command}`);
    }
  }
});

test("every skill is invoked by hand only and has a description (NFR-04)", () => {
  const skills = fs.readdirSync(path.join(REPO, PLUGIN, "skills"));
  for (const s of skills) {
    const text = read(`${PLUGIN}/skills/${s}/SKILL.md`);
    assert.match(text, /^disable-model-invocation: true$/m, `${s}: disable-model-invocation`);
    assert.match(text, /^description: \S/m, `${s}: description`);
  }
});

test("the marketplace points at the plugin", () => {
  const market = JSON.parse(read(".claude-plugin/marketplace.json"));
  const entry = market.plugins.find((x) => x.name === "mflow");
  assert.ok(entry, "mflow in marketplace.json");
  assert.ok(fs.existsSync(path.join(REPO, entry.source, ".claude-plugin", "plugin.json")), "its source has a plugin.json");
});

test("every marketplace entry states its plugin's version, the same as its plugin.json", () => {
  for (const entry of JSON.parse(read(".claude-plugin/marketplace.json")).plugins) {
    const manifest = JSON.parse(read(path.join(entry.source, ".claude-plugin", "plugin.json")));
    assert.match(entry.version ?? "", /^\d+\.\d+\.\d+$/, `${entry.name}: version in marketplace.json`);
    assert.equal(entry.version, manifest.version, `${entry.name}: marketplace.json says ${entry.version}, plugin.json says ${manifest.version}`);
  }
});
