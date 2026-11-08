---
name: apply-all
description: Build every OpenSpec change waiting in openspec/changes/ unattended, one after the other — for each one a branch from main, /opsx:apply (which archives and commits it), /mflow:test and /mflow:review with fix rounds until both pass, a merge into main, then the next change. Stops at the first change that does not pass. Never pushes and runs no E2E tests.
disable-model-invocation: true
argument-hint: "[<change> ...] [--rounds <n>]"
---

The user has proposed the changes with `/opsx:propose`, answered their questions, and leaves the machine to build them. Calling this command is the user's word to merge into `main` each change that passes, and for nothing more: it pushes nothing, and it writes and runs no E2E tests (`/mflow:e2e` and `/mflow:night` do, when the user calls them).

With no names, the run takes every folder under `openspec/changes/` except `archive`, the oldest proposal first. Names set which changes run and in what order, so a change that builds on another comes after it. `--rounds` is how many fix rounds one change gets at test and again at review (default 3).

**How the commands below run here.** `/mflow:test` and `/mflow:review` cannot be called as skills from another skill: read `${CLAUDE_PLUGIN_ROOT}/skills/test/SKILL.md` or `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` and follow it. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`. `/opsx:apply <change>` is the project's `openspec-apply-change` skill with the change's name as its input (`.claude/skills/openspec-apply-change/SKILL.md`). Its guidance in `openspec/config.yaml` still applies.

## Before the user leaves

Say this in one message when the run starts, so it can be corrected before the machine is left:
- The session must not stop for permission prompts, or the run waits for an answer until someone comes back. Start it in the project folder with `claude --permission-mode auto`, then `/mflow:apply-all`. The machine must not sleep (on Windows: Settings → System → Power, Sleep: Never while plugged in).
- The changes it will build, in order, and that each one that passes is merged into `main`, with nothing pushed. The first change that does not pass stops the run.

## The rules of the whole run

- **No questions.** Where a skill this run follows would ask the user, take the choice this file names, or else the one that changes nothing outside this repository and loses nothing, and write the question and the choice into the run file (`--note "asked: …; took: …"`). What needs the user's decision (a spec question, a permission rule, a table the spec does not have) is never guessed: that change stops.
- **One long turn.** Do not end the turn before "Finish" is done: nobody is there to say go on. After each step, `node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-all.mjs" status` names the next one, and when the context is compacted or the session restarted, it says where to go on; never start the run over.
- **The run file.** `apply-all.mjs log <step> <state> --target <change> [--note <text>]` after every step and every round (`started`, `round`, `done`, `skipped`, `stopped`). It waits inside `.git` until the run finishes, so logging never dirties the tree.
- **Commits.** Every commit of a change goes on its branch, its files added by name, never `git add -A`. `main` gets only the merges and the run's last commit. Where a skill this run follows says when to commit, or to push or merge only on the user's yes, this file decides.
- **Never** push, force, rebase or delete a branch.
- **One stop stops the run.** The next changes may build on this one. A change stops when its rounds run out, when something needs the user's decision, when `/opsx:apply` is blocked, on a merge conflict, or on a missing prerequisite that one start as AGENTS.md says does not bring up. Log the step `stopped` with why, and go to "Finish".

## 1. Preflight

`node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-all.mjs" start [<change> ...] [--rounds <n>]`. It refuses, and the reason goes to the user, when the checkout is not on `main`, the tree has uncommitted changes, nothing is waiting, or a change has no `tasks.md`; nothing has started then, so stop there. A run already open: go on from its `next` instead.

## 2. Each change, in order

**Branch.** `next` names the change and its branch `change/<change>`. `git switch -c change/<change> main`. A branch of that name already exists (a run stopped there): `git switch` to it; when it already holds the change's archive, log `apply done --note "from an earlier run"` and go on at Test.

**Apply.** Log `apply started`. `/opsx:apply <change>`: it does every task, adds the change's row to `docs/reviews/pending.md` with `change/<change>` as its branch, archives the change and commits once. Then check the branch holds the archive, the row and a clean tree; do what an older `openspec/config.yaml` left out (`/opsx:archive`, the row with `pending.mjs add`, the commit). Log `apply done --note <commit>`.

**Test.** Log `test started`, then `/mflow:test since`, which runs the whole suite when there is no earlier whole run to start from. Say nothing about a second session: no one is there.
- Passed: log `test done --note <record path>`. Its record, `docs/reviews/pending.md` and STATUS.md stay uncommitted, and go in one commit with what the review writes.
- Failed: commit its documents, then `apply-all.mjs log test round --target <change>`; when that is refused, the rounds are out: log `test stopped` with what still fails. For each failure, find whether the code breaks its spec or the test asserts behaviour the spec changed on purpose, and fix the one that is wrong. Never remove, skip or loosen a test to pass. Commit the fix (`fix(<change>): failing tests (apply-all)`), and `/mflow:test since` again.

**Review.** The level is the one in the change's row (`pending.mjs status`).
- Level `skip`: log `review skipped`, and commit the documents (`apply-all: test <change>`).
- Otherwise log `review started`, then `/mflow:review change/<change>`, with `--short` at level `short` and `Change: <change>` in its report. As for any branch, it fixes blockers and majors on this branch and commits them. Then `pending.mjs tick-review <change> --report <report path> --verdict <verdict>`, and commit the documents (`apply-all: review <change>`).
- `approve`: log `review done --note <report path>`.
- `changes-requested`, or `none` because the tests did not run: `apply-all.mjs log review round --target <change>`; when that is refused, the rounds are out: log `review stopped` with the findings still open and the report. Then `/mflow:test since`, fixing a failure as above within this round, then `/mflow:review change/<change> --short`, then tick and commit as above.
- A blocker or major that needs the user's decision stays open, and the review cannot approve: log `review stopped` with the question, numbered with options a), b), c). Minors and nits do not hold the merge.

**Merge.** `apply-all.mjs gate <change>` on the branch must say `ready: true`. When it does not, do what its `why` names if this run can; otherwise log `merge stopped` with the reasons. Then `git switch main` and `git merge --no-ff change/<change> -m "Merge change <change>"`. A conflict: `git merge --abort`, log `merge stopped`. Log `merge done --note <merge commit>`, and go on with the next change from the `main` this merge made.

## 3. Finish

Always runs, after the last merge or the first stop.
1. `git switch main`.
2. Write STATUS.md `## Now` as the list for the user's return, most urgent first: **stopped** (the change, the step, why, its report or record, and that its branch `change/<change>` holds the work), **questions for the user** (numbered, with options a), b), c)), **taken without you** (each question a skill would have asked, and the choice taken), **merged** (each change with its merge commit), **not started** (the changes after a stop).
3. `apply-all.mjs finish --result done` (or `--result stopped` when a change stopped). Commit the run file it names and STATUS.md on `main` (`apply-all: finished`).

Tell the user, for when they are back: the run file, that list in a few lines, and, in one line, that nothing was pushed and pushing waits for their word. After a stop, once it is settled, `/mflow:apply-all` again goes on from that change's branch.

Done when: the run file sits under `docs/reviews/apply-all/` with a `Finished:` line, STATUS.md holds the list, and the checkout is on `main` with a clean tree.
