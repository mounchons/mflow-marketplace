// /mtest:night keeps its state in mtest/night/<date>-<HHMM>.md through scripts/night.mjs: the step to go on from
// after a compaction or a restart, the rounds spent per target and the time left. Synthetic projects only;
// NIGHT_NOW stands in for the clock.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { project, run } from "./mtest-helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const pad = (n) => String(n).padStart(2, "0");
const START = new Date("2026-11-07T15:10:00.000Z");
const later = (m) => new Date(START.getTime() + m * 60000);
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const night = (args, minutes = 0, env = {}) =>
  run(p, "night.mjs", args, { env: { NIGHT_NOW: later(minutes).toISOString(), CLAUDE_CODE_REMOTE: "", ...env } });

test("a run lives in mtest/night, ends with the report step, and resumes from its first unfinished step", () => {
  p = project();
  const s = night(["start", "--until", hhmm(later(120)), "--rounds", "2"]);
  assert.equal(s.status, 0, s.stdout);
  assert.match(s.json.file, /^mtest\/night\/\d{4}-\d{2}-\d{2}-\d{4}\.md$/);
  for (const step of ["preflight", "test", "test-fix", "review"]) night(["log", step, step === "test-fix" ? "skipped" : "done"]);
  night(["log", "review-fix", "round", "--target", "fix/night-review"]);
  const st = night(["status"], 60).json;
  assert.equal(st.next, "review-fix");
  assert.equal(st.minutesLeft, 60);
  assert.deepEqual(st.targets.map((t) => [t.target, t.rounds, t.roundsLeft]), [["fix/night-review", 1, 1]]);
  for (const step of ["review-fix", "e2e-write", "e2e", "verify"]) night(["log", step, "done"], 61);
  assert.equal(night(["status"], 61).json.next, "report");
  assert.match(night(["log", "handoff", "done"], 61).json.error, /step "handoff" is not one of/);
  night(["log", "report", "done"], 62);
  assert.equal(night(["finish"], 62).json.result, "done");
  assert.equal(night(["status"], 63).json.open, false);
});

test("without --until a run has no time limit, whatever the hour", () => {
  p = project();
  assert.equal(night(["start"]).json.until, null);
  const st = night(["status"], 24 * 60).json;
  assert.deepEqual([st.minutesLeft, st.overtime], [null, false]);
});

test("outside an mtest project the script says so", () => {
  p = project({ marker: false });
  assert.match(night(["status"]).json.error, /no \.mtest\/config\.json here or above; run \/mtest:init first/);
});
