---
name: test
description: Run the project's test suite (without E2E) part by part when the user calls it and record the result against the commit; `since` proves a later commit from an earlier whole-suite record with only what its changes need; `e2e` runs the E2E parts only when named; `triage` explains the failures of the newest run.
disable-model-invocation: true
argument-hint: "[since | e2e | <part> [<filter>] | triage]"
---

The whole suite runs when the user has the time and the machine for it, and its record is the proof
every review after it reuses: a record says which commit it tested, so nothing is run twice for the same
commit. A later commit is proven with `since`: the whole-suite record of an earlier commit plus the tests
its changes need. The runner (`scripts/run.mjs`) does the running and the recording, the same way from
this session, from a terminal (`run.mjs all`) or, later, from a scheduler. This command sets up no CI
pipeline (GitHub Actions or another) until the user asks for one in the project.

E2E tests are not part of the whole suite. They run only when the user names them: `/mtest:test e2e`
for all of them, `/mtest:e2e <screen>` to write and run one screen's.

## 1. Plan

- Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" plan` (`--scope e2e` for `e2e`). No parts: `/mtest:init` first. An open run (`open`): ask once whether to finish it (`run.mjs finish`) or abort it (`run.mjs abort`).
- **Scope:** no argument, the whole suite: every part except E2E, the build first. `since`: the section below. `e2e`: the build and the E2E parts. `<part>`: that part alone; `<part> <filter>`: that part with the filter as `--args` (the stack's filter syntax: `${CLAUDE_PLUGIN_ROOT}/skills/init/references/stacks.md`). A record of a part or a filter never counts as the whole suite.
- **Prerequisites:** for each part in scope with `prerequisitesMissing`, say what is missing and how to meet it (start the database, `npm ci` in that folder). Ask once: a) run the rest now, the record being `incomplete`, or b) wait while the user meets them.
- **Uncommitted changes** (`git.dirty`): the record says "with uncommitted changes" and no review can rely on it; say so in one line and carry on.

Tell the user in one line what will run and how long the newest record took (`last`). Then run it: the user's call is the go-ahead. In the same message: this session is busy until the run ends; work that only writes documents (flow docs, notes) can go on in a second Claude Code session in the same folder, but nothing that changes or builds code in this checkout, which would break the run or what it proves.

## 2. Run

- `run.mjs start --scope <whole | e2e | since | "part <name>">`, then one `run.mjs part <name>` per shell call, in the order `start` printed under `expected`, in the foreground, with the shell's longest timeout (10 minutes). Never in the background, never two parts at once: a suite run that way has run a machine out of memory and been stopped halfway.
- Carry on after a failing part, so one run shows every failure. After a failed build the runner marks the other parts "not run" itself.
- A part that ends in `timeout` is too big for one call: split it by filter into parts of about `partMinutes` (stacks.md, "Splitting a slow part"), write them into `.mtest/config.json` in its place, and run the new parts in this run before finishing. When parts split one project, check that every test ran once: count the project's tests and compare with the parts' passed, failed and skipped added together; a class that no part matched is run as an extra part (`run.mjs part <part> --args "<filter>" --label <part>-rest`) and added to the config.
- `run.mjs finish` writes the record in `mtest/runs/` and prints its result. A part counts as verified once a record shows it passing; leave `.mtest/config.json` as it is, since a change there makes the next `since` run the whole suite.

Done when: every part of the scope has a row in the record, and the record exists.

## Since the last whole run

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" since`. It finds the newest whole-suite or `since` record on a clean tree whose commit is an ancestor of HEAD (its result may be pass or fail), the files changed since, and decides:
- `none`: only documents changed, and the base left nothing to run again. Nothing runs; say so and cite the base.
- `whole`: no base, or a change whose effect is not local (build and package files, migrations, startup, test configuration, `.mtest/config.json`). Run the whole suite and say why.
- `targeted`: `run.mjs start --scope since` (it takes the base itself), then the build; each part in `rerunParts` (failed, timed out, skipped or not run in the base); for each changed test file, its tests (its part with a filter); for each changed code file, the tests that cover it: the test classes or files that name its types or routes, and the tests of the flow cases whose steps it implements (`mtest/flows/`); each part in `partsHit` whole; each `check` part whole. Then `run.mjs finish`.

A passing `since` record on a clean tree counts as the whole suite at its commit.

## E2E

`/mtest:test e2e`, only on the user's call: the build and every E2E part, one at a time. The runner keeps the browsers at most `e2eMaxWorkers` (4 by default): it keeps a `--workers` within the cap, accepts a `workers:` number within the cap in the Playwright config, adds `--workers=<cap>` otherwise, and refuses a run that asks for more. A project whose E2E tests are one ordered story on one database (`workers: 1`) keeps it that way. Playwright's own default is half the CPU threads, 10 on a 20-thread laptop; that many browsers at once has crashed a laptop's graphics driver and restarted it.

## `triage`

For the newest record that failed (`run.mjs last`): read each failure and its part's log in `.mtest/logs/<run>/<part>.log`. For each failing test, find the assertion that failed, the code under it, and the flow case or requirement it proves (`mtest/flows/`). Group the failures by cause and say, for each cause, whether the code or the test is wrong, measured against the flow doc and the requirement, with the file:line and the fix. A failure from a missing prerequisite (a database that went down) is named as that. Never propose skipping a test, loosening an assertion or changing an expected value to make it pass, unless the requirement itself changed. Nothing is fixed until the user says so.

## 3. Report

Tell the user: the record path, the result, the counts per part, the failures by part (the first line of each), and the parts skipped with why. Write it into `mtest/STATUS.md` `## Now`.

**What comes next:** on pass, `/mtest:review since` when `node "${CLAUDE_PLUGIN_ROOT}/scripts/reviews.mjs" since` lists unreviewed commits, otherwise nothing. On fail, `/mtest:test triage`, then the fix and a commit, then `/mtest:test since`, which reruns the failed parts and the tests of what the fix changed. On incomplete, the prerequisite to meet, then `/mtest:test since`. Add one line on why it is next: what it unblocks, or which risk it settles.

Done when: the record exists, STATUS.md has the result, and the user has the next command.
