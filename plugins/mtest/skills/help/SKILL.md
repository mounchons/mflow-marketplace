---
name: help
description: List the mtest commands with where the project stands (newest run, flow coverage, unreviewed commits), or check the setup.
disable-model-invocation: true
argument-hint: "[check setup]"
---

## No argument

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" plan`, `node "${CLAUDE_PLUGIN_ROOT}/scripts/flows.mjs" list` and `node "${CLAUDE_PLUGIN_ROOT}/scripts/reviews.mjs" since` (read-only). Outside an mtest project (no `.mtest/config.json`), skip them and say `/mtest:init` comes first.

Answer in the user's language, in three short parts:

1. **Where it stands:** the newest run (result, scope, commit, whether HEAD moved since), the flows and their gaps, the commits not reviewed yet, the parts no record shows passing yet (`verified: false` in `plan`).
2. **The commands:**

| Command | What it does |
|---|---|
| `/mtest:init` | Sets the project up: AGENTS.md and CLAUDE.md when missing (or a testing section merged into them), the test parts, the build and unit tests verified, a copy for Claude Code on the web |
| `/mtest:flow` | Maps a flow (steps 1-2-3-4, branches, states, rules, roles) and its cases into `mtest/flows/`; `check` shows what no test covers; `<flow> write` writes the missing tests |
| `/mtest:test` | Runs the whole suite (without E2E) part by part and records it against the commit; `since` for a later commit; `e2e` on request; `triage` explains failures |
| `/mtest:review` | Reviews the commits since the last review, a branch, a range or a pull request against AGENTS.md, the requirements and the flows, reusing the test record |
| `/mtest:e2e` | Writes and runs the E2E tests of one screen or one flow, at most `e2eMaxWorkers` browsers at once |
| `/mtest:night` | Started by the user whenever the machine can work alone, at any hour (terminal with `claude --permission-mode auto`, or the web): the whole suite, the review, the fixes on branches with test and review again up to a round cap, the missing E2E tests, every E2E test, a check and a list for the user's return; never merges, pushes only on the web |
| `/mtest:help` | This list; `check setup` checks the setup |

From a terminal, without Claude, in the project folder: `node "<runner>" all` runs the whole suite and writes the same record (`--scope e2e` for the E2E parts). Write `<runner>` out as the `runner` path `plan` printed, so the line can be pasted as it is; when `plan` also printed `copy` (the project's copy for the web), give that form too, `node .claude/skills/mtest/scripts/run.mjs all`, which stays the same across plugin upgrades.

3. **The next command**, with one line on why: no flows yet → `/mtest:flow`; gaps → `/mtest:flow <flow> write`; no record at HEAD → `/mtest:test` or `/mtest:test since`; failing → `/mtest:test triage`; unreviewed commits → `/mtest:review since`.

## `check setup`

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"` (read-only) and report each `fail` and `warn` with its `fix`, then `ok` in one line. When the plugin runs from the copy in `.claude/skills/mtest/` (`${CLAUDE_PLUGIN_ROOT}` is that folder), say so: on the web this confirms the copy loaded.
