---
name: night
description: Run the checks of the changes waiting in docs/reviews/pending.md unattended, whenever the user starts it and leaves the machine to it, at any hour (the name says night), on Claude Code (terminal or web) — the whole suite, every review, the fixes of what failed or was found on branches with test and review again up to a round cap, the E2E tests the reviewed screens lack, every E2E test, a final check, and a handoff with the list for the user's return; never merges, and pushes only on the web.
disable-model-invocation: true
argument-hint: "[--until HH:MM] [--rounds <n>] [--no-e2e]"
---

The user starts this whenever the machine can work alone for a while (overnight, over lunch, through a meeting) and reads the result on coming back; the name says night, the hour does not matter. It chains what mflow already does, in this order: `/mflow:test` → fix what failed → `/mflow:review pending` → fix what the reviews found, then test and review again, round after round → write the E2E tests the reviewed screens lack (`/mflow:e2e`) → `/mflow:test e2e` → check → `/mflow:handoff`. Every step runs as its own skill says; this file says only how they chain without anyone there.

`--until` is a local time the run must be done by; without it the run goes on until its steps are done; `--rounds` is how many fix rounds one target gets (default 3). A round is one fix commit, then its tests, then its review. E2E runs because the user called this command; `--no-e2e` leaves steps 6 and 7 out.

## Before the user leaves

Say this in one message when the run starts, so it can be corrected before the machine is left:
- **Terminal:** the session must not stop for permission prompts, or the run waits for an answer until someone comes back. Start it in the project folder with `claude --permission-mode auto`, then `/mflow:night`. The machine must not sleep (on Windows: Settings → System → Power, Sleep: Never while plugged in).
- **Web (claude.ai/code):** a session on the repository in the Auto permission mode, with the tools the tests need in the environment's setup script. mflow loads there only from the copy `/mflow:init` writes in `.claude/skills/mflow/` (a route not yet proven on the web; `${CLAUDE_PLUGIN_ROOT}/skills/init/references/cloud.md`).
- Nothing is merged; the list at the end says what waits for the user's yes. On the web, every commit is pushed as soon as it is made, because a web machine can be reclaimed and keeps only the conversation; from the terminal nothing is pushed.

## The rules of the whole run

- **No questions.** Where a skill this run calls would ask the user, take the choice this file names, or else the one that changes nothing outside this repository and loses nothing, and write the question and the choice into the run file (`--note "asked: …; took: …"`). A finding whose fix needs the user's decision (a spec question, a permission rule, a table the spec does not have) is never guessed: it stays open and goes in the list for the user.
- **One long turn.** Do not end the turn before step 9 is done: nobody is there to say go on. After each step, `node "${CLAUDE_PLUGIN_ROOT}/scripts/night.mjs" status` names the next one.
- **The run file.** `night.mjs log <step> <state> [--target <name>] [--note <text>]` after every step, every target and every round (`started`, `round`, `done`, `skipped`, `stopped`). When the context is compacted, or the session restarted, `night.mjs status` and the run file say where to go on; never start the run over.
- **Commits.** Documents always land on `main` (the session's branch on the web); fix and E2E branches hold code only. After each step or round, commit the documents it wrote (test records, review reports, `docs/reviews/pending.md`, STATUS.md, the run file) in one commit, `night: <step> <target>`, on `main`, so the next test run starts on a clean tree and the user's merges later carry no edits of `pending.md`. A test run on a fix or E2E branch writes its record there, untracked: switch back to `main` (the record and the edited STATUS.md come along), run the review from `main` (it reads the branch by its diff), and commit the documents there. A fix or E2E commit adds the files it changed by name, never `git add -A`, so no document goes on a branch.
- **On the web, push every commit** right after it (`git push -u origin <branch>`: the session's branch after a document commit, the fix or E2E branch after a code commit). A web machine that sits idle pauses and may be reclaimed with only the conversation left; what is pushed, the run file included, is what the next session goes on from. A push the environment refuses is noted in the run file and tried again at the end.
- **Main keeps its code.** Fixes go on branches from `main`; never merge, rebase, force-push or delete a branch. The only commits the run adds to `main` are its documents.
- **Time.** Before each step and each round, check `overtime` in `night.mjs status`. Past `--until`, when it was given: log the step `stopped` with `until reached`, and go straight to step 8 and step 9, which always run.
- **Browsers.** E2E runs keep the cap: `--workers` at most `e2eMaxWorkers` (2 by default), as `/mflow:e2e` and `/mflow:test e2e` say.

## 1. Preflight

- `night.mjs start [--until …] [--rounds …]`. A run already open: go on from its `next` step instead.
- The tree must be clean (`git status --porcelain`): the run never commits the user's own work in progress. Not clean: log `preflight stopped` with the files, and go to step 9.
- The branch: `main` from the terminal. On the web, the session's own branch made from `main` takes the run's document commits in its place.
- Read `pending.mjs status` (the rows waiting), AGENTS.md `## Commands` (the test parts, the E2E command and the build it needs, a stack command and its health address) and `e2eMaxWorkers`. Nothing waiting and no E2E screens: the run is the whole suite and the E2E tests alone.
- Log `preflight done` with the rows, where it runs and the time it must end.

## 2. Test

`/mflow:test`, the whole suite, as that skill says (parts of about 8 minutes, in the foreground, the record, `pending.mjs tick-test`). When it would offer a second session, say nothing: no one is there. Commit its documents. Log `test done` with the result and the record path.

## 3. Test fix

Only when the suite failed; otherwise log `test-fix skipped`.

On a branch `fix/night-<date>-tests` from `main`, each round:
1. `night.mjs log test-fix round --target fix/night-<date>-tests`.
2. For each failure, find whether the code breaks its spec or the test asserts behaviour the spec changed on purpose, as `/mflow:test` "Failures" says; fix the one that is wrong. Never remove, skip or loosen a test to pass. A failure from a missing prerequisite (a database that is down): start it once as AGENTS.md says; still missing, it is not a code fix: log `stopped`.
3. Commit the fix (`fix: <what> (night <date>)`), then `/mflow:test since` on the branch. Switch to `main`, then `/mflow:review fix/night-<date>-tests` at the level its files need, and commit the documents on `main`.
4. Passing tests and `approve`: log the target `done` with the commit. Otherwise switch to the branch for the next round, until `--rounds`: then log it `stopped` with what is still failing or open.

Each round ends on `main`. While `main` fails, the rows' Test stays open and their reviews in step 4 end `none (tests not run)`; the list for the user puts this branch first.

## 4. Review

`/mflow:review pending`, every open row in its order, in this one session: the skill's stop after a full context does not apply, because the run file keeps the place. After each row, commit its documents and log `review done --target <change> --note "<verdict> <report path>"`. Then log `review done`.

## 5. Review fix

For each row whose verdict is `changes-requested`, in order, on its branch `fix/<change>-review` from `main` (or the branch an earlier night left), each round:
1. `night.mjs log review-fix round --target <change>`.
2. Fix the findings of its newest report, blockers and majors first, each with the test that proves it. A finding that needs the user's decision stays open.
3. Commit the fix (`fix(<change>): review findings (night <date>)`), then `/mflow:test since` on the branch. Switch to `main`, then `/mflow:review fix/<change>-review --short`, and commit the documents on `main`.
4. `approve`: log the target `done` with `approved at <commit>, waiting for merge`. Otherwise switch to the branch for the next round, until `--rounds`: then log it `stopped` with the findings still open and the report.

Each round ends on `main`. Then log `review-fix done`.

## 6. Write the missing E2E tests

The screens in the E2E screens column of the rows in `docs/reviews/pending.md` (open, and the ones this run moved to Done), those with no E2E test yet or whose UI files changed after their tests (`git log -1` of each). No E2E framework in the project, or `--no-e2e`: log `e2e-write skipped` and `e2e skipped` with why, and go to step 8.

On a branch `e2e/night-<date>` from `main`, for each screen: `/mflow:e2e <screen>`, which writes or updates its tests from its spec and runs them. A test that fails because the screen breaks its spec stays as it is and is a defect for the list for the user; a test that fails because the test is wrong is fixed, a round each, up to `--rounds`. Commit the test files on the branch; switch to `main` and commit the records there; log the screen as a target; switch back to the branch for the next screen.

## 7. Run every E2E test

`/mflow:test e2e` on `e2e/night-<date>` when step 6 wrote anything, on `main` otherwise, with the cap. A Playwright project that needs a stack (a compose stack, a server the config does not start): run it only when the stack answers at the health address AGENTS.md names; down, leave it out and say so. Failures are not fixed here: each goes in the list for the user with whether the screen or the test is at fault. Switch to `main`, commit the record there, and log `e2e done`.

## 8. Check

Log `verify started`, then check, and write each result into the run file:
- every step of the run file is finished, or stopped with a reason;
- `main` holds only the run's document commits since the run's start commit: `git diff --name-only <start commit>..main` lists only `docs/reviews/`, `STATUS.md` and `docs/status-log.md`;
- the newest whole-suite record on `main`, and, for each fix branch, its newest `since` record and review verdict at its last code commit;
- each row of `docs/reviews/pending.md`: Test and Review filled, or why not;
- the E2E record, and the screens left without tests;
- `git status --porcelain` is clean, and the checkout is back on `main` (the session's branch on the web).

A problem in the run's own documents is fixed now; anything else goes in the list for the user.

## 9. Handoff

- `/mflow:handoff`, with `## Now` in STATUS.md as the list for the user's return, most urgent first:
  1. **Waiting for your yes to merge:** each branch with what it holds and its proof (`fix/night-<date>-tests`, each approved `fix/<change>-review`, `e2e/night-<date>`), the test fix branch first.
  2. **Stopped:** each target out of rounds or time, with its open findings or failures and the report.
  3. **Failing and not fixed:** suite or E2E failures, and the defects the E2E tests found.
  4. **Taken without you:** each question a skill would have asked, and the choice taken.
- Commit the documents, then `night.mjs finish --result done` (or `--result stopped` when a step was cut short by the time or the tree), and commit the run file.
- **On the web** (`where: cloud` in the run file): every commit was pushed as it was made; push once more the session's branch and every branch the run made (`git push -u origin <branch>`), so the last commits and any push refused earlier are there. A push the environment refuses goes in the run file and STATUS.md with the branch's commits; commit and push that note on the session's branch. **From the terminal:** push nothing.

Tell the user, for when they are back: the run file, the list for the user in a few lines, and the first command to run (the merge of the first branch after reading its review).

Done when: the run file has a `Finished:` line, STATUS.md holds that list, every document is committed, and on the web the branches are pushed.
