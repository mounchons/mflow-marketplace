// Packaging checks for the tamra plugin: the marketplace lists it, the MCP config takes the URL and the
// token from userConfig (never a literal token), and every skill is user-invoked and only pre-approves
// tools of the plugin's own `kb` server. Static checks only; nothing here talks to a Tamra server.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = "plugins/tamra";
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const SKILLS = ["search", "save", "get", "update", "space", "tag", "archive", "withdraw"];
const TOOLS = new Set(["kb_overview", "kb_template", "kb_search", "kb_get", "kb_history", "kb_save", "kb_restore", "kb_admin"]);
// Only explicit admin commands may pre-approve kb_admin; /tamra:withdraw is irreversible, so it always asks.
const ADMIN_PREAPPROVED = new Set(["space", "tag", "archive"]);

test("the marketplace points at the tamra plugin", () => {
  const entry = JSON.parse(read(".claude-plugin/marketplace.json")).plugins.find((x) => x.name === "tamra");
  assert.ok(entry, "tamra in marketplace.json");
  const manifest = JSON.parse(read(path.join(entry.source, ".claude-plugin", "plugin.json")));
  assert.equal(manifest.name, "tamra");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.userConfig.token.sensitive, true, "the token is stored as a secret");
});

test("the MCP server takes its URL and token from userConfig, never a literal token", () => {
  const raw = read(`${PLUGIN}/.mcp.json`);
  assert.doesNotMatch(raw, /kbp_[A-Za-z0-9_-]{8,}/, "no real token in the plugin");
  const server = JSON.parse(raw).mcpServers.kb;
  assert.ok(server, "server is named kb (not tamra-kb, which a hand-added user-scope server would shadow)");
  assert.equal(server.type, "http");
  assert.equal(server.url, "${user_config.server_url}");
  assert.equal(server.headers.Authorization, "Bearer ${user_config.token}");
});

test("every skill is user-invoked and pre-approves only tools of the plugin's kb server", () => {
  for (const name of SKILLS) {
    const text = read(`${PLUGIN}/skills/${name}/SKILL.md`);
    const front = text.split(/^---$/m)[1] ?? "";
    assert.match(front, new RegExp(`^name: ${name}$`, "m"), `${name}: name`);
    assert.match(front, /^description: \S/m, `${name}: description`);
    assert.match(front, /^disable-model-invocation: true$/m, `${name}: user-invoked only`);
    const allowed = (front.match(/^allowed-tools: (.+)$/m)?.[1] ?? "").split(/[,\s]+/).filter(Boolean);
    assert.ok(allowed.length > 0, `${name}: allowed-tools`);
    for (const tool of allowed) {
      const m = tool.match(/^mcp__plugin_tamra_kb__(\w+)$/);
      assert.ok(m && TOOLS.has(m[1]), `${name}: ${tool} is a tool of the kb server`);
    }
    assert.equal(allowed.includes("mcp__plugin_tamra_kb__kb_admin"), ADMIN_PREAPPROVED.has(name), `${name}: kb_admin pre-approval`);
    assert.doesNotMatch(text, /\/kb-[a-z]+\b|tamra-kb/, `${name}: no leftover names from the hand-installed skills`);
  }
});
