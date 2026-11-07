// /mflow:night keeps its state in docs/reviews/night/<date>-<HHMM>.md through scripts/night.mjs, so a run whose
// context was compacted, or whose session restarted, goes on from the first unfinished step, and stops at --until
// or after --rounds on one target. Synthetic projects only; NIGHT_NOW stands in for the clock.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const pad = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const START = new Date("2026-11-07T15:10:00.000Z");
const at = (minutes) => ({ NIGHT_NOW: new Date(START.getTime() + minutes * 60000).toISOString(), CLAUDE_CODE_REMOTE: "" });
const night = (args, minutes = 0, env = {}) => run(p, "night.mjs", args, { env: { ...at(minutes), ...env } });

test("start writes the run file with its limits; a second start is refused while the first is open", () => {
  p = project();
  const s = night(["start", "--until", hhmm(new Date(START.getTime() + 90 * 60000))]);
  assert.equal(s.status, 0, s.stdout);
  assert.match(s.json.file, /^docs\/reviews\/night\/\d{4}-\d{2}-\d{2}-\d{4}\.md$/);
  assert.equal(s.json.rounds, 3);
  assert.equal(s.json.where, "cli");
  const text = p.read(s.json.file);
  assert.match(text, /^Rounds: 3$/m);
  assert.match(text, /^\| Time \| Step \| Target \| State \| Note \|$/m);

  const st = night(["status"]).json;
  assert.equal(st.open, true);
  assert.equal(st.next, "preflight");
  assert.equal(st.minutesLeft, 90);
  assert.equal(st.overtime, false);

  const again = night(["start"]);
  assert.equal(again.status, 1);
  assert.match(again.json.error, /a night run is open/);
  assert.equal(again.json.next, "preflight");
});

test("the next step follows the finished ones, and rounds count per target", () => {
  p = project();
  night(["start", "--rounds", "2"]);
  for (const step of ["preflight", "test"]) night(["log", step, "done"]);
  night(["log", "test-fix", "skipped", "--note", "suite passed"]);
  night(["log", "review", "started"]);
  assert.equal(night(["status"]).json.next, "review");
  night(["log", "review", "done", "--target", "invite-suppliers", "--note", "changes-requested | 2 major"]);
  night(["log", "review", "done"]);
  night(["log", "review-fix", "round", "--target", "invite-suppliers"]);
  night(["log", "review-fix", "round", "--target", "invite-suppliers"]);
  night(["log", "review-fix", "stopped", "--target", "invite-suppliers", "--note", "round cap"]);

  const st = night(["status"]).json;
  assert.equal(st.next, "review-fix");
  assert.equal(st.steps.test, "done");
  assert.equal(st.steps["test-fix"], "skipped");
  const fix = st.targets.find((t) => t.step === "review-fix" && t.target === "invite-suppliers");
  assert.deepEqual([fix.rounds, fix.roundsLeft, fix.state, fix.note], [2, 0, "stopped", "round cap"]);
  const review = st.targets.find((t) => t.step === "review");
  assert.equal(review.note, "changes-requested | 2 major", "a pipe in a note reads back as written");
});

test("past --until the run is overtime; finish closes it and a new run can start", () => {
  p = project();
  const file = night(["start", "--until", hhmm(new Date(START.getTime() + 30 * 60000))]).json.file;
  assert.equal(night(["status"], 31).json.overtime, true);
  const f = night(["finish", "--result", "stopped"], 31);
  assert.equal(f.status, 0, f.stdout);
  assert.match(p.read(file), /^Finished: \S+ \(stopped\)/m);
  const st = night(["status"], 32).json;
  assert.deepEqual([st.open, st.newest], [false, file]);
  assert.equal(night(["log", "test", "done"], 32).status, 1, "nothing to log into once finished");
  const second = night(["start"], 32);
  assert.equal(second.status, 0, second.stdout);
  assert.notEqual(second.json.file, file);
});

test("a run on Claude Code on the web says so, and a flag the skill reads (--no-e2e) does not stop the start", () => {
  p = project();
  const s = night(["start", "--no-e2e", "--rounds", "2"], 0, { CLAUDE_CODE_REMOTE: "true" });
  assert.equal(s.status, 0, s.stdout);
  assert.deepEqual([s.json.where, s.json.rounds], ["cloud", 2]);
});

test("wrong input is refused with the reason", () => {
  p = project();
  assert.match(night(["start", "--until", "25:00"]).json.error, /--until takes a local time HH:MM/);
  assert.match(night(["start", "--rounds", "0"]).json.error, /--rounds takes a whole number from 1 to 10/);
  assert.match(night(["start", "--rounds"]).json.error, /--rounds takes a whole number from 1 to 10/);
  assert.match(night(["start", "--until"]).json.error, /--until takes a local time HH:MM/);
  assert.match(night(["log", "test", "done"]).json.error, /no night run is open/);
  night(["start"]);
  assert.match(night(["log", "lunch", "done"]).json.error, /step "lunch" is not one of/);
  assert.match(night(["log", "review-fix", "round"]).json.error, /add --target/);
  assert.match(night(["log", "test", "maybe"]).json.error, /state "maybe" is not one of/);
});
