// Packaging and release checks for the mtech plugin: the version reads the same in the manifest, the
// marketplace and the README; every skill is user-invoked; every file a skill links or names under the
// plugin root ships with the plugin; the example cost spec only uses assumption keys it defines; and no
// file carries a credential-looking value. Static checks only (Node, no Python needed).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = path.join(REPO, "plugins", "mtech");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const version = JSON.parse(read("plugins/mtech/.claude-plugin/plugin.json")).version;

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}
const files = walk(PLUGIN);
const skills = fs.readdirSync(path.join(PLUGIN, "skills"));

test("the manifest, the marketplace and the README name the same version", () => {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const entry = JSON.parse(read(".claude-plugin/marketplace.json")).plugins.find((x) => x.name === "mtech");
  assert.ok(entry, "mtech in marketplace.json");
  assert.equal(entry.source, "./plugins/mtech");
  assert.equal(entry.version, version, "marketplace.json version");
  const minor = version.split(".").slice(0, 2).join(".");
  assert.match(read("plugins/mtech/README.md"), new RegExp(`## คำสั่ง \\(v${esc(minor)}\\)`), "README commands heading");
});

test("every skill is user-invoked, named after its folder and listed in the README", () => {
  const readme = read("plugins/mtech/README.md");
  assert.ok(skills.length > 0);
  for (const name of skills) {
    const front = read(`plugins/mtech/skills/${name}/SKILL.md`).split(/^---$/m)[1] ?? "";
    assert.match(front, new RegExp(`^name: ${esc(name)}$`, "m"), `${name}: name`);
    assert.match(front, /^description: \S/m, `${name}: description`);
    assert.match(front, /^disable-model-invocation: true$/m, `${name}: user-invoked only`);
    assert.match(front, /^argument-hint: /m, `${name}: argument-hint`);
    assert.ok(readme.includes(`/mtech:${name}`), `${name}: README lists the command`);
  }
});

test("every plugin-root path and relative link in the skills exists", () => {
  const missing = [];
  for (const rel of files.filter((f) => f.startsWith("skills/") && f.endsWith(".md"))) {
    const body = fs.readFileSync(path.join(PLUGIN, rel), "utf8");
    for (const m of body.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9_./-]+)/g)) {
      const target = m[1].replace(/[.]+$/, "");
      if (!fs.existsSync(path.join(PLUGIN, target))) missing.push(`${rel}: \${CLAUDE_PLUGIN_ROOT}/${target}`);
    }
    for (const m of body.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
      if (/^(https?:|mailto:)/.test(m[1])) continue;
      if (!fs.existsSync(path.join(PLUGIN, path.dirname(rel), m[1]))) missing.push(`${rel}: (${m[1]})`);
    }
    // bare `scripts/x`, `references/x`, `examples/x`, `assets/x` mentions resolve inside the skill folder
    const skillDir = rel.split("/").slice(0, 2).join("/");
    for (const m of body.matchAll(/`((?:scripts|references|examples|assets)\/[A-Za-z0-9_.-]+\.[a-z]+)`/g)) {
      if (!fs.existsSync(path.join(PLUGIN, skillDir, m[1]))) missing.push(`${rel}: \`${m[1]}\``);
    }
  }
  assert.deepEqual(missing, []);
});

test("the example cost spec uses only assumption keys it defines", () => {
  const spec = JSON.parse(read("plugins/mtech/skills/cloud-architecture/examples/cost-spec.example.json"));
  const keys = new Set(spec.assumptions.map((a) => a.key));
  const formulas = [
    ...spec.assumptions.map((a) => a.value),
    ...Object.values(spec.clouds).flatMap((c) => c.items.map((i) => i.qty)),
    ...(spec.onetime ?? []).map((i) => i.qty),
  ].filter((v) => typeof v === "string");
  const unknown = formulas.flatMap((f) => [...f.matchAll(/\{(\w+)\}/g)].map((m) => m[1])).filter((k) => !keys.has(k));
  assert.deepEqual(unknown, []);
  for (const [name, cloud] of Object.entries(spec.clouds)) {
    for (const item of cloud.items) {
      assert.ok(["official", "estimate"].includes(item.source), `${name} ${item.service}: source is official or estimate`);
      assert.equal(typeof item.price, "number", `${name} ${item.service}: numeric price`);
    }
  }
});

test("no file carries a credential-looking value", () => {
  const patterns = [/AKIA[0-9A-Z]{16}/, /(password|pwd)\s*=\s*[^\s;"'<>{}]{6,}/i, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /xox[bap]-[0-9A-Za-z-]{10,}/];
  const hits = [];
  for (const rel of files.filter((f) => /\.(md|py|js|json|css|svg)$/.test(f))) {
    const body = fs.readFileSync(path.join(PLUGIN, rel), "utf8");
    for (const re of patterns) if (re.test(body)) hits.push(`${rel} ${re}`);
  }
  assert.deepEqual(hits, []);
});

test("every Python script stops on Python older than 3.10 and prints UTF-8 on Windows", () => {
  const scripts = files.filter((f) => /^skills\/[^/]+\/scripts\/[^/]+\.py$/.test(f));
  assert.ok(scripts.length > 0);
  for (const rel of scripts) {
    const src = fs.readFileSync(path.join(PLUGIN, rel), "utf8");
    assert.match(src, /if sys\.version_info < \(3, 10\):\s*\n\s*sys\.exit\(/, `${rel}: version guard`);
    assert.match(src, /sys\.stdout\.reconfigure\(encoding="utf-8"\)/, `${rel}: UTF-8 stdout`);
    for (const line of src.split(/\r?\n/).filter((l) => /(?<![.\w])open\(/.test(l))) {
      assert.match(line, /encoding="utf-8"|"[rw]b"/, `${rel}: every text open() names utf-8: ${line.trim()}`);
    }
  }
  for (const skill of skills) {
    const md = read(`plugins/mtech/skills/${skill}/SKILL.md`);
    if (/python3/.test(md)) assert.match(md, /Python 3\.10 or newer/, `${skill}: names the minimum Python`);
  }
});
