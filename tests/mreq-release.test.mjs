// Release checks for mreq: the plugin version reads the same in the manifest, the marketplace and the
// README, and the hook points at a script that exists. When one fails after a version bump, update the
// file it names.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { PLUGIN, REPO } from "./mreq-helpers.mjs";

const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const version = JSON.parse(read("plugins/mreq/.claude-plugin/plugin.json")).version;

test("the manifest, the marketplace and the README name the same version", () => {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const entry = JSON.parse(read(".claude-plugin/marketplace.json")).plugins.find((x) => x.name === "mreq");
  assert.ok(entry, "mreq in marketplace.json");
  assert.equal(entry.source, "./plugins/mreq");
  assert.equal(entry.version, version, "marketplace.json version");
  const minor = version.split(".").slice(0, 2).join(".");
  assert.match(read("plugins/mreq/README.md"), new RegExp(`## คำสั่ง \\(v${esc(minor)}\\)`), "README commands heading");
});

test("the hook runs a script that ships with the plugin", () => {
  const hooks = JSON.parse(read("plugins/mreq/hooks/hooks.json")).hooks;
  const commands = Object.values(hooks).flat().flatMap((h) => h.hooks.map((x) => x.command));
  assert.ok(commands.length > 0);
  for (const cmd of commands) {
    const m = /\$\{CLAUDE_PLUGIN_ROOT\}\/(scripts\/[\w-]+\.mjs)/.exec(cmd);
    assert.ok(m, cmd);
    assert.ok(fs.existsSync(path.join(PLUGIN, m[1])), m[1]);
  }
});
