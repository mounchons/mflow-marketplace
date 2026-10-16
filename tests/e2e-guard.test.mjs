// E2E guard: a PreToolUse hook that refuses a Playwright run without a cap on browsers in an mflow project.
// The commands below are the ones a real session ran before the machine restarted, plus look-alikes that
// are not runs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

/** The hook's decision for one shell command: "deny" with its reason, or null when the call goes on. */
function decide(command, { tool = "Bash", cwd } = {}) {
  const r = run(p, "e2e-guard.mjs", [], { input: { tool_name: tool, tool_input: { command }, cwd: cwd || p.root } });
  assert.equal(r.status, 0, r.stderr);
  if (!r.stdout.trim()) return null;
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.permissionDecision, "deny");
  return out.permissionDecisionReason;
}

test("the uncapped runs that restarted the machine are refused, with the way to run them", () => {
  p = project();
  for (const command of [
    'cd /d/GitHub/StemHub/tests/e2e && timeout 595 npx playwright test --project=buyer --project=supplier --reporter=line > "C:/tmp/pw1.txt" 2>&1; echo "exit $?"',
    "cd /d/GitHub/StemHub/tests/e2e; npx playwright test --project=buyer --project=supplier --reporter=line 2>&1 | grep -v \"^\\[\" | tail -60",
    "SUPPLIER_URL=http://localhost:8090 BUYER_URL=http://localhost:8091 npx playwright test --project=stack --reporter=line",
    "pnpm exec playwright test",
    "node_modules/.bin/playwright test buyer/round-detail.spec.ts",
  ]) {
    const reason = decide(command);
    assert.ok(reason, `not refused: ${command}`);
    assert.match(reason, /--workers=2/);
    assert.match(reason, /\/mflow:e2e/);
  }
  assert.ok(decide("Set-Location tests/e2e; npx playwright test --project=buyer", { tool: "PowerShell" }), "PowerShell too");
});

test("a run within the cap, a listing and look-alikes go on", () => {
  p = project();
  for (const command of [
    "cd tests/e2e && npx playwright test buyer/survey-documents.spec.ts --project=buyer --workers=2 --reporter=line",
    "npx playwright test --workers 1",
    "npx playwright test -j 2 buyer/a.spec.ts",
    "timeout 120 npx playwright test --list --project=stack 2>&1 | grep -i revision",
    'grep -n "npx playwright test" AGENTS.md',
    "npx playwright install chromium",
    "npx playwright show-report",
    "sed -n 1,80p tests/e2e/playwright.config.ts",
  ]) assert.equal(decide(command), null, `refused: ${command}`);
});

test("more workers than the cap, or a share of the CPU, is refused; e2eMaxWorkers raises the cap", () => {
  p = project();
  assert.match(decide("npx playwright test --workers=4"), /at most 2/);
  assert.match(decide("npx playwright test --workers=50%"), /whole number/);
  p.write(".mflow/config.json", JSON.stringify({ version: 1, e2eMaxWorkers: 4 }));
  assert.equal(decide("npx playwright test --workers=4"), null);
  assert.match(decide("npx playwright test"), /e2eMaxWorkers in \.mflow\/config\.json, 4 here/);
});

test("outside an mflow project, or with unreadable settings, the guard stays out of the way", () => {
  p = project();
  p.write(".mflow/config.json", '{ "e2eMaxWorkers": 0 }');
  assert.equal(decide("npx playwright test"), null, "settings that do not load");
  fs.rmSync(path.join(p.root, ".mflow"), { recursive: true });
  assert.equal(decide("npx playwright test", { cwd: p.root }), null, "not an mflow project");
});
