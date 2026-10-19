---
name: test
description: Run the whole test suite (without E2E) and the project's checks once per change, when the user calls it, in foreground parts, and record the result against the commit; `since` proves a later commit from that record with only the tests its changes need, so /mflow:review does not run everything again; `e2e` runs the E2E tests only when named.
disable-model-invocation: true
argument-hint: "[since | unit | e2e | <part> | <test filter>] [--change <name>]"
---

The whole suite runs once per change, when the user has the time and the machine for it. `/opsx:apply` runs only each task's own test and the test classes that cover the code it changed. A later commit, such as a fix after review, is proven with `since`: the whole-suite record of an earlier commit plus the tests its changes need. `/mflow:review` reuses these records. This command is the gate that a change's last task used to be. It runs on this machine: mflow sets up no CI pipeline (GitHub Actions or another) until the user asks for one in the project.

E2E tests are not part of the whole suite. They run only when the user names them: `/mflow:test e2e` for all of them, `/mflow:e2e <screen>` to write and run one screen's.

## 1. Plan the run

- Read AGENTS.md `## Commands` and `## Stack`. If `## Stack` is missing or its profile is `TODO`, ask first, as "Asking" in `${CLAUDE_PLUGIN_ROOT}/skills/init/references/stacks.md` describes, and write the section.
- Target: the current branch at `git rev-parse HEAD`. When `git status --porcelain` is not empty, the run is "with uncommitted changes": say in one line that review cannot reuse it, and carry on.
- Change: `--change <name>`, else the one open change in `openspec list --json` that this branch implements; none is fine.
- Scope: with no argument, the whole suite, in this order:
  1. Build, once, so later steps reuse it (`--no-build` in the .NET profiles). Without errors, and without warnings when AGENTS.md asks for that.
  2. Every test command in `## Commands` except E2E (unit and domain, integration, architecture), part by part.
  3. Format in its check-only form (`dotnet format --verify-no-changes` in the .NET profiles) and lint, when `## Commands` lists them.
  4. `openspec validate <change> --strict` when there is a change.

  `since` runs what "Since the last whole run" below decides. Any other argument runs only that: `unit`, `e2e`, a part name from `Test parts:`, or a test filter. Its record names it as the scope, and review never counts it as the whole suite.
- Parts: use the `- Test parts:` line under `## Commands` when there is one; an E2E part on it stays out of the whole suite. Otherwise one test project per part, and a project that takes longer than about 8 minutes is split by namespace or class filter. When the parts differ from one per project, write them as `- Test parts: <name>: <command>; …` under `## Commands`, so the next run does not have to find them again.

Tell the user in one line what will run and how long the newest record in `docs/reviews/tests/` took. Then run it: the user's call is the go-ahead.

In the same message, tell the user how to keep working while it runs. This session is busy until the run ends, so open a second Claude Code session in the same project folder (a new terminal, then `claude`) for work that only writes documents: `/mflow:discuss`, `/mflow:capture`, `/mflow:hotspot`, `/mflow:review-notes`, `/opsx:explore` or `/opsx:propose`. Leave `/opsx:apply`, `/mflow:screen`, `/mflow:e2e`, `/mflow:theme` and `/mflow:golden` until the run ends: they change and build code in this checkout, which breaks the run or what it proves. The record keeps the commit taken when the run started, so documents committed meanwhile need nothing more (see `since`).

## Since the last whole run

A commit made after a whole-suite run is proven without running everything again:

1. **Base:** the newest record in `docs/reviews/tests/` with `Scope: whole suite` and no "with uncommitted changes" whose commit is an ancestor of the target (`git merge-base --is-ancestor <base> HEAD`). Its result may be pass or fail. No base: run the whole suite.
2. **What changed:** `git diff --name-only <base>..HEAD`, plus the uncommitted files when there are any.
   - Documents only (Markdown, `openspec/`, `backlog/`, `docs/`, `STATUS.md`): nothing to run.
   - Migrations, startup or dependency wiring (`Program.cs` in the .NET profiles), build or package files (project files, `Directory.*.props`, `package.json`, lock files) or shared test infrastructure (fixtures, factories, test helpers): the whole suite, because their effect is not local.
   - Otherwise: the build; every part or test that failed in the base; the changed test files except E2E ones, which wait for `/mflow:e2e`; the test classes that cover the changed code (filtered); format, lint and validate as in the whole suite.
3. **Record** it as below with `Scope: since <base short commit>` and `Base: <base record path>`. A passing `since` record on a clean tree counts as the whole suite at its commit.

## 2. Run

- In the foreground, one part at a time, each within the shell's time limit. A whole suite in the background, or parts in parallel, can run the machine out of memory and be stopped halfway.
- E2E, when the argument names it: the build the E2E command needs, then one E2E project at a time with at most 2 browsers at a time (`--workers=2` for Playwright Test; `e2eMaxWorkers` in `.mflow/config.json` raises the cap, and mflow's hook refuses a Playwright run above it or without `--workers`). Playwright's default is half the CPU threads, 10 on a 20-thread laptop; that many browsers at once has crashed a laptop's graphics driver and restarted the machine.
- Carry on after a failing part, so one run shows every failure. Stop only when the build fails.
- For each part keep the command, the passed / failed / skipped counts, the duration and, for each failure, the test name and the first line of its message.

Done when: every step of the scope has a result.

## 3. Record

Write `docs/reviews/tests/<date>-<short commit>.md`, with `-2`, `-3` for another run the same day at the same commit:

```
Tested: <branch> at <full commit>[ with uncommitted changes]
By: claude | codex | opencode
Scope: whole suite | since <base short commit> | <what the argument named>
Base: <base record path, for since>
Change: <name or none>
Result: pass | fail
Duration: <total>

| Part | Command | Result | Duration |
|---|---|---|---|

## Failures
<test name: first line of its message>, or none
```

For `since`, add the changed files that decided the scope, in one line.

`Result: pass` needs every step of the scope to pass: tests without failures, the build without errors, format and lint without changes, validate without errors.

When the scope was the whole suite or `since`, the result is pass, there were no uncommitted changes and the change's `tasks.md` has a gate task (a task whose only work is running the build, the suites or the checks), tick it `- [x]` and add `Done: <record path>` to it. When the gate task also names E2E, add `E2E not run: /mflow:e2e` too, so the tick does not claim a run that did not happen.

**What comes next:** on pass, the review the change needs by the files it touched, as "Levels" in `/mflow:review` says: `/mflow:review <branch>`, `/mflow:review <branch> --short`, or no review (merge on the user's yes); a review reuses this run. On fail, the failing tests by part; once they are fixed and committed, `/mflow:test since`, which reruns the failed parts and the tests of what the fix changed. Write it into STATUS.md `## Now`. Add one line on why it is next: what it unblocks, or which risk it settles.

Done when: the record exists, STATUS.md has the result, and the user has the next command.
