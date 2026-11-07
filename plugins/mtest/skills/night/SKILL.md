---
name: night
description: Run the project's checks unattended, whenever the user starts it and leaves the machine to it, at any hour (the name says night), on Claude Code (terminal or web) — the whole suite, the review of the commits since the last review, the fixes of what failed or was found on branches with test and review again up to a round cap, the E2E tests the reviewed screens and flows lack, every E2E test, a final check, and the list for the user's return in mtest/STATUS.md; never merges, and pushes only on the web.
disable-model-invocation: true
argument-hint: "[--until HH:MM] [--rounds <n>] [--no-e2e] [--stack]"
---

The user starts this whenever the machine can work alone for a while (overnight, over lunch, through a meeting) and reads the result on coming back; the name says night, the hour does not matter. It chains what mtest already does, in this order: `/mtest:test` → fix what failed → `/mtest:review since` → fix what the review found, then test and review again, round after round → write the E2E tests the reviewed screens and flows lack (`/mtest:e2e`) → `/mtest:test e2e` → check → the list for the user. Every step runs as its own skill says; this file says only how they chain without anyone there.

`--until` is a local time the run must be done by; without it the run goes on until its steps are done; `--rounds` is how many fix rounds one target gets (default 3). A round is one fix commit, then its tests, then its review. E2E runs because the user called this command; `--no-e2e` leaves steps 6 and 7 out. `--stack` also starts the stack the E2E tests need (a compose stack) and stops it again, as "The stack" below says; without it, a stack that is not up is left out.

## Before the user leaves

Say this in one message when the run starts, so it can be corrected before the machine is left:
- **Terminal:** the session must not stop for permission prompts, or the run waits for an answer until someone comes back. Start it in the project folder with `claude --permission-mode auto`, then `/mtest:night`. The machine must not sleep (on Windows: Settings → System → Power, Sleep: Never while plugged in). With `--stack`, Docker must be running (Docker Desktop on Windows).
- **Web (claude.ai/code):** a session on the repository in the Auto permission mode, with the plugin copy in `.claude/skills/mtest/` (`/mtest:init` writes it) and the tools the parts need in the environment's setup script ([cloud.md](../init/references/cloud.md)). Browsers for E2E need their own line in that script.
- Nothing is merged; the list at the end says what waits for the user's yes. On the web, every commit is pushed as soon as it is made, because a web machine can be reclaimed and keeps only the conversation; from the terminal nothing is pushed.

## The rules of the whole run

- **No questions.** Where a skill this run calls would ask the user, take the choice this file names, or else the one that changes nothing outside this repository and loses nothing, and write the question and the choice into the run file (`--note "asked: …; took: …"`). A finding whose fix needs the user's decision (a requirement question, a permission rule, data the requirement does not have) is never guessed: it stays open and goes in the list for the user.
- **One long turn.** Do not end the turn before step 9 is done: nobody is there to say go on. After each step, `node "${CLAUDE_PLUGIN_ROOT}/scripts/night.mjs" status` names the next one.
- **The run file.** `night.mjs log <step> <state> [--target <name>] [--note <text>]` after every step, every target and every round (`started`, `round`, `done`, `skipped`, `stopped`). When the context is compacted, or the session restarted, `night.mjs status` and the run file say where to go on; never start the run over.
- **Commits.** What the run writes under `mtest/` always lands on the default branch (the session's branch on the web); fix and E2E branches hold code only. After each step or round, commit it (records, reviews, flow docs' Test cells, STATUS.md, the run file) in one commit, `night: <step> <target>`, on the default branch, so the user's merges later carry no edits of `mtest/`. A test run on a fix or E2E branch writes its record there, uncommitted: switch back to the default branch (the files under `mtest/` come along), run the review from there (it reads the branch by its diff), and commit there. A fix or E2E commit adds the files it changed by name, never `git add -A`, so nothing under `mtest/` goes on a branch.
- **On the web, push every commit** right after it (`git push -u origin <branch>`: the session's branch after an `mtest/` commit, the fix or E2E branch after a code commit). A web machine that sits idle pauses and may be reclaimed with only the conversation left; what is pushed, the run file included, is what the next session goes on from. A push the environment refuses is noted in the run file and tried again at the end.
- **The default branch keeps its code.** Fixes go on branches from the default branch (`.mtest/config.json` or git); never merge, rebase, force-push or delete a branch. The only commits the run adds to the default branch are under `mtest/`.
- **Time.** Before each step and each round, check `overtime` in `night.mjs status`. Past `--until`, when it was given: log the step `stopped` with `until reached`, and go straight to step 8 and step 9, which always run.
- **Browsers.** E2E runs go through the runner, which keeps them at most `e2eMaxWorkers` (4 by default).

## 1. Preflight

- `night.mjs start [--until …] [--rounds …]`. A run already open: go on from its `next` step instead.
- The tree must be clean (`git status --porcelain`, leaving out `mtest/` and `.mtest/` but not `.mtest/config.json`): the run never commits the user's own work in progress. Not clean: log `preflight stopped` with the files, and go to step 9.
- The branch: the default branch from the terminal. On the web, the session's own branch made from it takes the run's `mtest/` commits in its place.
- `run.mjs plan` (the parts and their prerequisites), `reviews.mjs since` (the commits waiting for review), `flows.mjs check` (the flows and their E2E cases waiting).
- Log `preflight done` with the parts, the commits waiting, where it runs and the time it must end.

## 2. Test

`/mtest:test`, the whole suite, as that skill says (each part in the foreground, the record). When it would ask about missing prerequisites, start what AGENTS.md says starts them, once; still missing, take a) run the rest, so the record is `incomplete`. When it would offer a second session, say nothing. Commit. Log `test done` with the result and the record path.

## 3. Test fix

Only when the suite failed; otherwise log `test-fix skipped`.

On a branch `fix/night-<date>-tests` from the default branch, each round:
1. `night.mjs log test-fix round --target fix/night-<date>-tests`.
2. `/mtest:test triage` for the causes, then fix the one that is wrong, the code or the test, measured against the flow doc and the requirement. Never remove, skip or loosen a test to pass. A failure from a missing prerequisite is not a code fix: log `stopped`.
3. Commit the fix (`fix: <what> (night <date>)`), then `/mtest:test since` on the branch. Switch to the default branch, then `/mtest:review fix/night-<date>-tests` at the level its files need, and commit there.
4. Passing tests and `approve`: log the target `done` with the commit. Otherwise switch to the branch for the next round, until `--rounds`: then log it `stopped` with what is still failing or open.

Each round ends on the default branch. While it fails, the review in step 4 has no passing proof and ends `none`; the list for the user puts this branch first.

## 4. Review

`/mtest:review since`, the commits since the last review on the default branch, at the level its files need. Commit. Log `review done --target since --note "<verdict> <report path>"`, then `review done`. No commits waiting: log `review skipped`.

## 5. Review fix

When the verdict is `changes-requested`, on a branch `fix/night-<date>-review` from the default branch, each round:
1. `night.mjs log review-fix round --target fix/night-<date>-review`.
2. Fix the findings of the newest report, blockers and majors first, each with the test that proves it, and the flow doc's Test cell when a case gets its test. A finding that needs the user's decision stays open.
3. Commit the fix (`fix: review findings (night <date>)`), then `/mtest:test since` on the branch. Switch to the default branch, then `/mtest:review fix/night-<date>-review --short`, and commit there.
4. `approve`: log the target `done` with `approved at <commit>, waiting for merge`. Otherwise switch to the branch for the next round, until `--rounds`: then log it `stopped` with the findings still open and the report.

Each round ends on the default branch. With no `changes-requested`, log `review-fix skipped`.

## The stack, with `--stack`

Without `--stack` the run starts no stack: an E2E part that needs one (a compose stack, a server the runner does not start) runs only when the stack already answers. With `--stack`, and only when E2E runs, the run starts it before step 6 and stops it after step 7:
1. Find in AGENTS.md (`## Testing (mtest)` or `## Commands`) and the E2E part's prerequisites in `.mtest/config.json` how the stack starts for E2E, its health address, and the files it needs first (such as `cp .env.example .env`). No stack command there: log `e2e stopped --target stack --note "no stack command in AGENTS.md"` and go on without it.
2. Already answering at its health address: use it as it is, and leave it running at the end.
3. Otherwise, on the default branch (the session's branch on the web), so it builds the code the E2E tests are for (the E2E branch adds only tests): make each file it needs from its example only when the file is missing, never changing one that exists; check that Docker answers (`docker info`; on Windows, Docker Desktop must be running); run the stack command in the foreground with the shell's longest timeout, and once more when a build runs past it (Docker keeps what it built); then wait for the health address in one command, polling every 10 seconds for up to 10 minutes. Docker down, or no answer in time: log it with the last lines of the stack's logs (`docker compose … logs --tail 50`), stop what the run started, and go on without the stack.
4. Log `e2e started --target stack --note "started by the run"` (or `"already up"`). After step 7, stop what the run started (`docker compose … down`, without `-v`, so the stack's data stays) and log `e2e done --target stack`. A file the run made from its example that git does not ignore is removed again, so the tree stays clean. A stack that was up before the run stays up.

## 6. Write the missing E2E tests

The screens whose files the reviewed commits changed and that have no E2E test, or whose tests are older than their files (`git log -1` of each), and the flows those commits touched with E2E cases waiting (`flows.mjs check`, `e2ePending`). No E2E part in `.mtest/config.json`, or `--no-e2e`: log `e2e-write skipped` and `e2e skipped` with why, and go to step 8.

On a branch `e2e/night-<date>` from the default branch, for each: `/mtest:e2e <screen>` or `/mtest:e2e flow <flow>`, which writes or updates the tests and runs them. A test that fails because the screen breaks its flow stays as it is and is a defect for the list for the user; a test that fails because the test is wrong is fixed, a round each, up to `--rounds`. Commit the test files on the branch; switch to the default branch and commit the records and the Test cells there; log each screen or flow as a target; switch back to the branch for the next one.

## 7. Run every E2E test

`/mtest:test e2e` on `e2e/night-<date>` when step 6 wrote anything, on the default branch otherwise. An E2E part that needs a stack the runner does not start runs only when the stack answers at the address AGENTS.md names (with `--stack`, the run started it, as "The stack" above says); down, leave it out and say so. Failures are not fixed here: each goes in the list for the user with whether the screen or the test is at fault. Switch to the default branch, commit the record there, and log `e2e done`.

## 8. Check

Log `verify started`, then check, and write each result into the run file:
- every step of the run file is finished, or stopped with a reason;
- the default branch holds only the run's `mtest/` commits since the run's start commit: `git diff --name-only <start commit>..<default branch>` lists only `mtest/`;
- the newest whole-suite record on the default branch, and, for each fix branch, its newest `since` record and review verdict at its last code commit;
- the E2E record, the screens and flows left without tests, and `flows.mjs check` after the run;
- with `--stack`, the stack the run started is down again, and the files it made from their examples are named in the run file;
- `git status --porcelain` is clean, and the checkout is back on the default branch (the session's branch on the web).

A problem in the run's own records is fixed now; anything else goes in the list for the user.

## 9. Report

- Write `## Now` in `mtest/STATUS.md` as the list for the user's return, most urgent first:
  1. **Waiting for your yes to merge:** each branch with what it holds and its proof (`fix/night-<date>-tests`, `fix/night-<date>-review` when approved, `e2e/night-<date>`), the test fix branch first.
  2. **Stopped:** each target out of rounds or time, with its open findings or failures and the report.
  3. **Failing and not fixed:** suite or E2E failures, and the defects the E2E tests found.
  4. **Taken without you:** each question a skill would have asked, and the choice taken.
- Log `report done`, then `night.mjs finish --result done` (or `--result stopped` when a step was cut short by the time or the tree), and commit `mtest/`.
- **On the web** (`where: cloud` in the run file): every commit was pushed as it was made; push once more the session's branch and every branch the run made (`git push -u origin <branch>`), so the last commits and any push refused earlier are there. A push the environment refuses goes in the run file and STATUS.md with the branch's commits; commit and push that note on the session's branch. **From the terminal:** push nothing.

Tell the user, for when they are back: the run file, the list for the user in a few lines, and the first command to run (the merge of the first branch after reading its review).

Done when: the run file has a `Finished:` line, `mtest/STATUS.md` holds that list, everything under `mtest/` is committed, and on the web the branches are pushed.
