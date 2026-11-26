---
name: test-pr
description: Do the next test job of the open checks batch, the draft pull request checks/<date>-<n> that /mflow:checks made. It takes the job, runs that test in the batch's worktree, records it, then commits and publishes it to the batch, so the main checkout stays free for the day's work; with no batch open it says so and stops, and it never tests in the main checkout.
disable-model-invocation: true
argument-hint: "[<job>] [--batch <batch>]"
---

The tests of the changes merged into main wait as jobs in the checks batch (`/mflow:checks`): `T0` prepare, `T1…` one test part each (or `T1` the whole suite), and `S…` the test since a fix. This command does one of them from start to end, here, in this tool. It works only in the batch's worktree, never in the main checkout, where the user goes on building; it starts no batch and syncs nothing (that is `/mflow:checks` in Claude Code). Design: `docs/mflow-checks-proposal.md` in the mflow repository.

Script: `node "${CLAUDE_PLUGIN_ROOT}/scripts/checks.mjs" <command>`, run from the main checkout's root; it prints JSON. `--as <you>` is `claude` in Claude Code, and in another tool its own name (`codex`, `antigravity`; OpenCode takes reviews only).

## 1. Take the job

`checks.mjs next --as <you> --kind test` (`--job <id>` when the argument names one, `--batch <batch>` when it names one).

- `job` is null: give its `reason` in one line and stop. `no checks batch is open`: tell the user `/mflow:checks` in Claude Code makes one from what waits in `docs/reviews/pending.md`, and `/mflow:test` runs the suite the old way in this checkout. A batch that runs another job (one job at a time in a batch), a test that waits for a fix, or the heavy lane taken: name it and stop. Never run the test in the main checkout instead.
- A job: keep its `batch`, `dir` and `how`, and pass `--batch <batch>` to every command below. The job is held for you for `checks.staleMinutes` (60); a run that will take longer than that is split into parts (`- Test parts:` in AGENTS.md), or another tool may take the job again.

## 2. Run it

In `dir`, as `how` says, the way `/mflow:test` does it (its plan, parts, `since` and record), with these differences:

- Every command runs in `dir`, the batch's worktree, on its branch as it is. Switch no branch, merge nothing, change no code: a failing test stays failing and goes in the record, for the fix job the rules start.
- `T0` (prepare) is the build, format and lint check-only, `openspec validate`, and the every-test-once count; its record's `Scope:` is `prepare`. A part (`T2`) runs that part only. `S…` is `/mflow:test since`, from the base `how` names.
- The record goes to `docs/reviews/tests/` in `dir`, with `By: <you>`.
- Commit nothing, and leave STATUS.md, `docs/reviews/pending.md`, `docs/reviews/checks/` and every `tasks.md` alone: no `pending.mjs tick-test`, no STATUS.md entry, no commit step of `/mflow:test`. Step 3 records and commits.
- A stack or a database the tests need (Docker, Testcontainers) starts as AGENTS.md `## Commands` says. A test that cannot run here (Docker down, a tool missing): `checks.mjs release <job> --batch <batch> --note "<why>"` and stop.
- A usage limit, or a stop before the record is written: `release` the job the same way, so another tool can take it.

## 3. Record and publish

1. `git -C "<dir>" status --porcelain`: the one new record, and nothing else changed. Another changed file: say which and `release` the job rather than record it.
2. `checks.mjs done <job> --batch <batch> --record <the record, relative to dir>`. It refuses a record made from other code than the pinned commit or the last fix, or one run with uncommitted changes: fix that and run again. It commits the record and the checklist on the batch's branch, ticks Test in `pending.md` when the last part is done, and starts the next jobs by the rules (`added`): a review or E2E when the tests pass, a fix when they fail.
3. `checks.mjs publish --batch <batch>`: pushes the batch's branch (`checks/*` only, never main) and updates its draft pull request. No remote or a refused push: say so in one line; the checklist holds the result all the same.

## 4. Tell the user

One short message: the job and its result (pass, or which tests failed), the record, the commit, the jobs it started and for which tool, and what comes next: `/mflow:test-pr` again when another test job is ready for this tool, the review and E2E jobs for the tools they wait for, or a fix (`/mflow:checks next` in Claude Code, or the runner). The pull request is merged by the user only.

Done when: the job is recorded with its commit and published, or released or left with the reason, and the user knows what comes next.
