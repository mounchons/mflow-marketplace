// Apply subagent switch (.mflow/local.json over .mflow/config.json) and the PreToolUse guard: off
// until switched on, and denied whenever the setting cannot be read (fail closed).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { project, run } from "./helpers.mjs";

const BOM = String.fromCharCode(0xfeff); // what Windows Notepad puts before UTF-8 text
let p;
afterEach(() => p?.cleanup());

const call = (agent = "mflow:dev") => ({ tool_name: "Agent", tool_input: { subagent_type: agent }, cwd: p.root });
const guard = (opts) => {
  const r = run(p, "subagent-guard.mjs", [], { input: call(opts?.agent), cwd: opts?.cwd });
  assert.equal(r.status, 0, r.stderr);
  return r.json?.hookSpecificOutput?.permissionDecision ?? "allow";
};

test("off by default: the guard denies mflow:dev and lets other subagents through", () => {
  p = project();
  assert.equal(guard(), "deny");
  assert.equal(guard({ agent: "Explore" }), "allow");
});

test("shared on is allowed, also from a subfolder", () => {
  p = project({ applySubagent: { enabled: true } });
  assert.equal(guard(), "allow");
  fs.mkdirSync(p.file("apps/api"), { recursive: true });
  const r = run(p, "subagent-guard.mjs", [], { input: { ...call(), cwd: p.file("apps/api") }, env: { CLAUDE_PROJECT_DIR: p.file("apps/api") } });
  assert.equal(r.json?.hookSpecificOutput?.permissionDecision ?? "allow", "allow");
});

test("local off overrides shared on", () => {
  p = project({ applySubagent: { enabled: true } });
  p.write(".mflow/local.json", JSON.stringify({ applySubagent: { enabled: false } }));
  assert.equal(guard(), "deny");
});

test("an empty local.json denies instead of falling back to the shared setting (T07)", () => {
  p = project({ applySubagent: { enabled: true } });
  p.write(".mflow/local.json", "");
  assert.equal(guard(), "deny");
  const status = run(p, "apply-subagent.mjs", ["status"]);
  assert.equal(status.status, 1);
  assert.match(status.stderr, /local\.json is empty/);
});

test("an unreadable local.json denies", () => {
  p = project({ applySubagent: { enabled: true } });
  fs.mkdirSync(p.file(".mflow/local.json"));
  assert.equal(guard(), "deny");
});

test("a broken local.json denies and on/off leave it untouched", () => {
  p = project({ applySubagent: { enabled: true } });
  const broken = '{"applySubagent": {"enabled": tru';
  p.write(".mflow/local.json", broken);
  assert.equal(guard(), "deny");
  const r = run(p, "apply-subagent.mjs", ["on"]);
  assert.equal(r.status, 1);
  assert.equal(p.read(".mflow/local.json"), broken);
});

test("on writes local.json and gitignores it; off writes over an empty file", () => {
  p = project();
  const on = run(p, "apply-subagent.mjs", ["on"]);
  assert.equal(on.status, 0, on.stderr);
  assert.equal(on.json.state, "on");
  assert.equal(on.json.source, "local");
  assert.match(p.read(".gitignore"), /^\.mflow\/local\.json$/m);
  assert.equal(guard(), "allow");

  p.write(".mflow/local.json", "");
  const off = run(p, "apply-subagent.mjs", ["off"]);
  assert.equal(off.status, 0, off.stderr);
  assert.deepEqual(JSON.parse(p.read(".mflow/local.json")), { applySubagent: { enabled: false } });
});

test("a local.json saved with a UTF-8 BOM is read", () => {
  p = project();
  p.write(".mflow/local.json", BOM + '{"applySubagent":{"enabled":true}}');
  assert.equal(guard(), "allow");
});

test("outside an mflow project the guard denies mflow:dev", () => {
  p = project();
  fs.rmSync(path.join(p.root, ".mflow"), { recursive: true });
  assert.equal(guard(), "deny");
});
