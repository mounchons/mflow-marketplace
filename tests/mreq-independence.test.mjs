// mreq stands on its own: no file of the plugin names a spec tool, a task-board CLI or another plugin's
// commands, and every file a skill points at ships with the plugin. Copied text is where such a
// reference slips in, so both checks run over every file.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { PLUGIN, walk } from "./mreq-helpers.mjs";

const files = walk(PLUGIN);
const text = (rel) => fs.readFileSync(path.join(PLUGIN, rel), "utf8");

test("no file names OpenSpec, Spec Kit, Backlog.md or another plugin's commands", () => {
  const banned = [/openspec/i, /\/opsx:/i, /spec[ -]?kit/i, /speckit/i, /backlog/i, /\/mflow:/i];
  const hits = [];
  for (const rel of files) {
    text(rel).split(/\r?\n/).forEach((line, i) => {
      for (const re of banned) if (re.test(line)) hits.push(`${rel}:${i + 1} ${re} ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(hits, []);
});

test("every plugin-root path and relative link in the skills, hooks and templates exists", () => {
  const missing = [];
  for (const rel of files.filter((f) => /\.(md|json)$/.test(f))) {
    const body = text(rel);
    for (const m of body.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9_./-]+)/g)) {
      const target = m[1].replace(/[.]+$/, "");
      if (!fs.existsSync(path.join(PLUGIN, target))) missing.push(`${rel}: \${CLAUDE_PLUGIN_ROOT}/${target}`);
    }
    if (!rel.startsWith("skills/")) continue;
    for (const m of body.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
      if (/^(https?:|mailto:)/.test(m[1])) continue;
      const target = path.join(PLUGIN, path.dirname(rel), m[1]);
      if (!fs.existsSync(target)) missing.push(`${rel}: (${m[1]})`);
    }
  }
  assert.deepEqual(missing, []);
});

test("every skill is invoked by hand and says what it takes", () => {
  const skills = files.filter((f) => /^skills\/[^/]+\/SKILL\.md$/.test(f));
  assert.ok(skills.length >= 4, `skills found: ${skills.join(", ")}`);
  for (const rel of skills) {
    const front = text(rel).split(/^---$/m)[1] ?? "";
    const name = rel.split("/")[1];
    assert.match(front, new RegExp(`^name: ${name}$`, "m"), `${rel} name`);
    assert.match(front, /^description: \S/m, `${rel} description`);
    assert.match(front, /^disable-model-invocation: true$/m, `${rel} is user-invoked only`);
    assert.match(front, /^argument-hint: /m, `${rel} argument-hint`);
  }
});
