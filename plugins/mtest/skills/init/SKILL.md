---
name: init
description: Set a project up for mtest, new or with code already — create AGENTS.md and CLAUDE.md when they are missing (or merge a testing section into the ones it has), find the test commands and verify the build and the unit tests, and, for Claude Code on the web, put a copy of the plugin in the repository.
disable-model-invocation: true
argument-hint: "[display name]"
---

Set this repository up so every session, here or on the web, knows how the project is tested and where the proof lives. mtest writes its content under `mtest/` and its settings under `.mtest/`, plus AGENTS.md and CLAUDE.md at the root. The display name is `$ARGUMENTS`, or the folder name when empty; it may be Thai.

The user's answers are the customer's: act on them without asking again. Files opened with Read are not substituted: where they write the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.

Work through the steps in order. Each ends on a completion criterion; reach it before moving on.

## 1. Inventory (read only)

Look before asking. Find:
- `.mflow/config.json`. If it exists, the mflow plugin drives this project, and its own test, review and E2E commands do what mtest does: say so and stop. Nothing is written.
- `.mtest/config.json`: this is a rerun (after an mtest upgrade). Keep its parts and settings unless the user changes them.
- Code: `*.sln` / `*.slnx` / `*.csproj`, `package.json` (its test runner: Vitest, Jest, Playwright, Cypress), `pyproject.toml` / `requirements*.txt`, `go.mod`, `pom.xml` / `build.gradle*`, `composer.json`. No code at all: a new project.
- Tests: test projects and folders, how many test files, the E2E framework and its config (Playwright's `workers:` value), the project's own helpers for walking a flow, fixtures.
- What the tests need: a database (connection strings in test settings, Testcontainers, `docker-compose.yml` services), environment variables, installed browsers, `node_modules` in the folders that run Node.
- Agent files: `AGENTS.md` (does it already say how to test?), `CLAUDE.md`, `.claude/rules/`, `.cursorrules`, `.github/copilot-instructions.md`.
- Requirement and decision docs: `docs/requirements*`, `docs/adr/`, acceptance criteria tables (ids such as `AC-01`), workflow or status sections. They are the sources of the flows later.
- Git: the default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`, else `main` or `master`), the remote, and branches named `claude/…` (code written on Claude Code on the web). A remote HEAD that points at a working branch while `main` exists is worth asking about.
- CI files (`.github/workflows/`): note them only. mtest never adds or proposes a pipeline until the user asks for one in this project.

Done when: you have reported one compact inventory (stack, test projects with their size, E2E and its workers, prerequisites, agent files, docs, default branch, first run or rerun).

## 2. Ask, in one message

Numbered questions, options `a)` `b)` `c)`, one recommended; a line of letters (`1a 2a 3b`) is a full answer:
1. **The test parts**: a table of what mtest will run, one row per part (name, kind, command, folder, results, prerequisites), built as [references/stacks.md](references/stacks.md) describes from the commands the project documents and the projects found. a) as shown, b) change it (the user says how).
2. **The default branch** reviews compare against, only when step 1 found none or two candidates.
3. **A copy for Claude Code on the web**, as [references/cloud.md](references/cloud.md) describes: a) yes, recommended when the repo has `claude/…` branches or the user says they code there, b) no. Say that loading a plugin this way on the web is not yet proven.
4. For a project without tests: which test framework to start with, recommending the one its stack ships with (xUnit for .NET, Vitest for Vite, pytest for Python), plus the display name if `$ARGUMENTS` was empty and the folder name will not do.

Done when: each question has an answer, or the user chose to leave it.

## 3. Scaffold

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs" --root . --name "<display name>" --dry-run`, show the planned result, then run it without `--dry-run`. The script never overwrites and refuses a project with `.mflow/config.json`.

For every entry under `suggested`, a template copy sits in `.mtest/suggested/`. Merge it by hand and show the diff:
- **AGENTS.md** that exists: add the `## Testing (mtest)` section, and `## Commands` only when the file says nothing about how to build and test. Keep every line the user wrote. Where the existing file already says how to test, point to it from the new section instead of repeating it.
- **CLAUDE.md** that exists: make sure `@AGENTS.md` is its first line and add the `## Claude Code specifics` lines.
Then delete `.mtest/suggested/`.

Write the parts from step 2 into `.mtest/config.json` (`parts`), and `defaultBranch` when step 2 settled it. Keep `testRoots` unless the tests live in folders it does not name.

Done when: `.mtest/config.json` with its parts, `.mtest/.gitignore`, AGENTS.md (with `## Testing (mtest)`), CLAUDE.md (importing AGENTS.md), `mtest/README.md`, `mtest/STATUS.md`, `mtest/flows/`, `mtest/runs/` and `mtest/reviews/` exist, and `.mtest/suggested/` is gone.

## 4. Verify the commands

Run the build part and the unit parts through the runner, each in its own foreground call:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" start --scope "init check"`, then `run.mjs part <name>` for the build and for each unit part, then `run.mjs finish`. A part counts as verified once a record shows it passing; nothing is written back to the config. A part that failed because its command was wrong: fix the command and run it again. A part that failed because the code fails: leave the code, report the failures, and keep the part as it is.

Do not run integration or E2E parts here: they need a database or browsers and can take long. Check their prerequisites with `run.mjs plan` and report the missing ones with how to meet them. They stay unverified until `/mtest:test` (or `/mtest:e2e`) runs them.

Done when: the build and unit parts ran, the init-check record exists in `mtest/runs/`, and every part is either verified or reported with why not.

## 5. The copy for the web (when step 2 said yes)

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/vendor.mjs" plan`, show what it would create, update or remove, and run `vendor.mjs write` on a yes. A folder it reports as `foreign` is the project's own: it stays, and say how to free the name. Then give the user what [references/cloud.md](references/cloud.md) lists: the files to commit, the setup script to paste into the web environment for the tools the parts call (init cannot set that), and how to see in the first web session that the plugin loaded.

Done when: `vendor.mjs status` reports `current: true`, or the user declined the copy.

## 6. Hand off

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"` (read-only). Fix what it reports as `fail` that this run can fix, and pass every other `fail` and `warn` to the user with its `fix`.

Update `mtest/STATUS.md` (`## Now` + one log entry). Tell the user, briefly:
- what was created, merged or left untouched;
- the parts, which are verified and which are not, and the prerequisites still missing;
- the candidate flows step 1 found (from the requirement docs, the status code and the tests that already walk several steps);
- the next command: `/mtest:flow` to map the flows and their cases, then `/mtest:test` for the first whole-suite record. `/mtest:help` lists every command.

Done when: the doctor reports no `fail` this run could have fixed, STATUS.md records the setup, and the user has the next command.
