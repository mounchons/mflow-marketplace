---
name: test
description: Run the whole test suite and the project's checks once per change, when the user calls it, in foreground parts, and record the result against the commit so /mflow:review reuses it instead of running it again.
disable-model-invocation: true
argument-hint: "[unit | e2e | <part> | <test filter>] [--change <name>]"
---

The whole suite runs once per change, when the user has the time and the machine for it. `/opsx:apply` runs only each task's own test and the test classes that cover the code it changed, and `/mflow:review` reuses the run recorded here when it is at the commit it reviews. This command is the gate that a change's last task used to be. It runs on this machine: mflow sets up no CI pipeline (GitHub Actions or another) until the user asks for one in the project.

## 1. Plan the run

- Read AGENTS.md `## Commands` and `## Stack`. If `## Stack` is missing or its profile is `TODO`, ask first, as "Asking" in `${CLAUDE_PLUGIN_ROOT}/skills/init/references/stacks.md` describes, and write the section.
- Target: the current branch at `git rev-parse HEAD`. When `git status --porcelain` is not empty, the run is "with uncommitted changes": say in one line that review cannot reuse it, and carry on.
- Change: `--change <name>`, else the one open change in `openspec list --json` that this branch implements; none is fine.
- Scope: with no argument, the whole suite, in this order:
  1. Build, once, so later steps reuse it (`--no-build` in the .NET profiles). Without errors, and without warnings when AGENTS.md asks for that.
  2. Every test command in `## Commands` (unit and domain, integration, architecture, E2E with whatever AGENTS.md says it needs running), part by part.
  3. Format in its check-only form (`dotnet format --verify-no-changes` in the .NET profiles) and lint, when `## Commands` lists them.
  4. `openspec validate <change> --strict` when there is a change.

  An argument runs only that: `unit`, `e2e`, a part name from `Test parts:`, or a test filter. Its record names it as the scope, and review never counts it as the whole suite.
- Parts: use the `- Test parts:` line under `## Commands` when there is one. Otherwise one test project per part, and a project that takes longer than about 8 minutes is split by namespace or class filter. When the parts differ from one per project, write them as `- Test parts: <name>: <command>; …` under `## Commands`, so the next run does not have to find them again.

Tell the user in one line what will run and how long the newest record in `docs/reviews/tests/` took. Then run it: the user's call is the go-ahead.

## 2. Run

- In the foreground, one part at a time, each within the shell's time limit. A whole suite in the background, or parts in parallel, can run the machine out of memory and be stopped halfway.
- Carry on after a failing part, so one run shows every failure. Stop only when the build fails.
- For each part keep the command, the passed / failed / skipped counts, the duration and, for each failure, the test name and the first line of its message.

Done when: every step of the scope has a result.

## 3. Record

Write `docs/reviews/tests/<date>-<short commit>.md`, with `-2`, `-3` for another run the same day at the same commit:

```
Tested: <branch> at <full commit>[ with uncommitted changes]
Scope: whole suite | <what the argument named>
Change: <name or none>
Result: pass | fail
Duration: <total>

| Part | Command | Result | Duration |
|---|---|---|---|

## Failures
<test name: first line of its message>, or none
```

`Result: pass` needs every step of the scope to pass: tests without failures, the build without errors, format and lint without changes, validate without errors.

When the scope was the whole suite, the result is pass, there were no uncommitted changes and the change's `tasks.md` has a gate task (a task whose only work is running the build, the suites or the checks), tick it `- [x]` and add `Done: <record path>` to it.

**What comes next:** on pass, `/mflow:review <branch>`, which reuses this run at this commit. On fail, the failing tests by part; once they are fixed, `/mflow:test <part>` for each failing part first, then `/mflow:test` at the commit that will be reviewed. Write it into STATUS.md `## Now`. Add one line on why it is next: what it unblocks, or which risk it settles.

Done when: the record exists, STATUS.md has the result, and the user has the next command.
