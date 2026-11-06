// The Playwright guard: in an mtest project a Playwright run may start at most e2eMaxWorkers browsers
// (4 by default). A run passes with --workers within the cap, or without one when the Playwright config it
// uses sets a plain number within the cap; it is denied otherwise. Outside an mtest project, or for a
// command that only mentions Playwright, nothing is said.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { project, run } from "./mtest-helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const guard = (command, cwd) => {
  const r = run(p, "e2e-guard.mjs", [], { input: { tool_name: "Bash", tool_input: { command }, cwd: cwd ?? p.root } });
  assert.equal(r.status, 0, r.stderr);
  return r.json?.hookSpecificOutput ?? null;
};

test("a run without --workers and without a config that sets them is denied", () => {
  p = project();
  const out = guard("npx playwright test");
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /--workers=4 or fewer/);
});

test("--workers within the cap passes; above it is denied", () => {
  p = project();
  assert.equal(guard("npx playwright test --workers=4"), null);
  assert.equal(guard("npx playwright test -j 2 tests/a.spec.ts"), null);
  assert.equal(guard("npx playwright test --workers 5").permissionDecision, "deny");
});

test("the cap follows e2eMaxWorkers", () => {
  p = project({ config: { e2eMaxWorkers: 2 } });
  assert.equal(guard("npx playwright test --workers=3").permissionDecision, "deny");
  assert.equal(guard("npx playwright test --workers=2"), null);
});

test("a plain run passes when the config of the folder it cds into sets workers within the cap", () => {
  p = project();
  p.write("tests/Shop.E2E/playwright.config.ts", "export default defineConfig({\n  testDir: './tests',\n  workers: 1, // one shared database, flows build on each other\n})\n");
  assert.equal(guard("cd tests/Shop.E2E && npx playwright test"), null);
  assert.equal(guard("npx playwright test", p.file("tests/Shop.E2E")), null);
});

test("the config of an E2E part is found when the command runs from the root", () => {
  p = project({ config: { parts: [{ name: "e2e", kind: "e2e", command: "npx playwright test", cwd: "e2e" }] } });
  p.write("e2e/playwright.config.ts", "export default { workers: 2 }\n");
  assert.equal(guard("npx playwright test"), null);
});

test("a config whose workers are above the cap, or not a plain number, does not let a plain run pass", () => {
  p = project();
  p.write("playwright.config.ts", "export default { workers: 8 }\n");
  assert.match(guard("npx playwright test").permissionDecisionReason, /workers: 8, above/);
  p.write("playwright.config.ts", "export default { workers: process.env.CI ? 2 : undefined }\n");
  assert.equal(guard("npx playwright test").permissionDecision, "deny");
});

test("--list, help, other commands and folders outside an mtest project pass", () => {
  p = project();
  assert.equal(guard("npx playwright test --list"), null);
  assert.equal(guard("grep -r 'playwright test' AGENTS.md"), null);
  assert.equal(guard("npx playwright install chromium"), null);
  p.cleanup();
  p = project({ marker: false });
  assert.equal(guard("npx playwright test"), null);
});
