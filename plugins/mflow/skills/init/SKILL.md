---
name: init
description: Set up a repo for the mflow workflow (AGENTS.md, CLAUDE.md, STATUS.md, vision, hotspot register) and wire OpenSpec + Backlog.md.
disable-model-invocation: true
argument-hint: "[project name]"
---

Set this repository up so every future session (Claude Code or Codex) starts from the same state and knows where each kind of fact lives. The project's display name is `$ARGUMENTS`, or the folder name when empty: the AGENTS.md title and the `backlog init` name, which may be Thai. The project name in code, which every project and namespace starts with, is asked in step 2; a `$ARGUMENTS` that is already a valid name in code becomes its suggestion b).

Work through the steps in order. Each ends on a completion criterion; reach it before moving on.

## 1. Inventory (read only)

Look before asking. Find:
- Solution and projects: `*.sln` / `*.slnx`, `*.csproj`, test projects (xUnit), Playwright (`playwright.config.*` or `Microsoft.Playwright` package), front-end folders (`package.json`, Vite).
- Other stacks: `composer.json`, `pyproject.toml` / `requirements.txt`, `go.mod`, `pom.xml` / `build.gradle`, and the framework named in `package.json`.
- Existing agent files: `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, `.cursorrules`, `.github/copilot-instructions.md`. Note whether AGENTS.md already has a `## Stack` section.
- Existing requirement docs anywhere under `docs/`, `requirements/`, loose `.md`/`.docx`/`.pdf` at the root.
- Tools: `openspec --version`, `backlog --version`, `git --version`; whether `openspec/` and `backlog/` already exist.

Done when: you have reported one compact inventory to the user (stack detected or none, test projects, agent files, docs, tools present/missing/initialised).

## 2. Choose the stack and the project name

Ask two things in one message, right after the inventory and before any file is written; the domain questions come later in step 5:
1. Which stack this project uses, as "Asking" in [references/stacks.md](references/stacks.md) describes: options `a)` `b)` `c)`, a recommendation with its evidence from step 1.
2. The project name in code, which every project, folder and namespace starts with (`<ProjectName>.Api`, `<ProjectName>.Web.Backend`), as "Project name" in the same file describes: three suggestions with one recommended, or a name of the user's own.

A letter for each, or a typed name, is a full answer. When AGENTS.md already has a filled `## Stack` (a rerun, such as after an mflow upgrade), show it and carry on with it: a rerun to take new templates is not a stack change, and the user changes it by saying so. If that `## Stack` has no `Project name (code)` yet (set up before mflow 0.22), ask only the name.

Done when: the profile and the project name are chosen or kept, and for c) the filled rows are written and shown.

## 3. Scaffold

**On a rerun, move the documents first.** When `.mflow/config.json` already exists, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/migrate-layout.mjs"` (read-only). If it reports `layout: legacy`, or any `rewrites`, the project still keeps its documents in the layout before 0.20.0 (`docs/discuss`, `docs/hotspots`, `docs/ai-inbox`, `docs/analysis`, `docs/design`, `docs/challenge`, `docs/change-requests`). Show the plan in one compact table: each move (from → to), the settings it changes, how many files get the new paths (grouped by top folder: docs, backlog, openspec, code), and anything under `kept` or `conflicts`. On a yes, run it again with `--apply`, then tell the user to look at `git status` and commit with `git add -A` (git shows the moves as renames). A no is fine: the folder settings keep the old paths working, and the scaffold below writes its templates into the folders the settings name. Conflicts are for the user to merge by hand; they never hold up the rest of init.

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs" --root . --name "<project name>" --dry-run`, show the planned result, then run it without `--dry-run`.

The script never overwrites. For every entry under `suggested`, a template copy sits in `.mflow/suggested/`: merge it into the existing file by hand (keep everything the user wrote, add the missing mflow sections), show the diff, then delete `.mflow/suggested/`. `.mflow/templates.json` records each template offered and the plugin version that offered it, so a rerun after an upgrade suggests only the templates that changed; `kept` lists the files whose template was offered before, where the project's version stands. Commit `.mflow/templates.json` with the rest of `.mflow/`.

Then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" agenda init`. It creates `docs/decisions/discuss/AGENDA.md`, which starts with the `tech-stack` and `code-structure` topics, and never overwrites an existing one.

Done when: `.mflow/config.json`, `AGENTS.md`, `CLAUDE.md`, `STATUS.md`, `docs/vision.md`, `docs/decisions/hotspots/INDEX.md`, `docs/source/README.md`, `docs/ai/inbox/README.md`, `docs/decisions/discuss/README.md` and `docs/decisions/discuss/AGENDA.md` exist (or the same files in the folders `.mflow/config.json` names, when the user kept the old layout) and `.mflow/suggested/` is gone.

## 4. Wire OpenSpec and Backlog.md

Both write into the repo and into agent files, so show each command and get a yes before running it. Run mflow's scaffold first (step 3) so both tools append to an AGENTS.md that already exists.

- Missing CLI: give the install line and stop this step until the user installs it: `npm i -g @fission-ai/openspec@latest`, `npm i -g backlog.md`.
- OpenSpec not initialised: `openspec init --tools claude,codex`. Add `--language th` only if the user wants spec artifacts in Thai.
- OpenSpec already initialised: `openspec update`.
- Backlog.md not initialised: `backlog init "<project name>" --defaults --integration-mode cli --agent-instructions agents` (AGENTS.md only; CLAUDE.md already imports it). If the repo has no git remote, also `backlog config set remoteOperations false`.

Then write mflow's lines into `openspec/config.yaml`: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/openspec-config.mjs" --dry-run`, show what it would remove and add, then run it without `--dry-run`. The lines are, in short:
- `context`: read AGENTS.md; the user's word is the customer's (build first, test in use, refine); hotspot rules, approved discussion docs and the data dictionary, in the folders `.mflow/config.json` names.
- `rules.proposal`: link the hotspot's `rules.md` and the data-model doc. `rules.specs`: a Scenario per requirement and per outcome row.
- `rules.tasks`: a task that changes code ends with its unit test; no task writes or runs E2E (`/mflow:e2e`); a task runs only its own tests and the test classes of its code, with no gate task (`/mflow:test`); an aggregate's README section becomes a pointer.
- `operations.apply.guidance`: the `mflow:dev` subagent only when it is on, and the diff check after it; each task's own tests only; never E2E; at the end `/mflow:test` and the review the change needs.

The script puts mflow's list items between `# mflow:begin <version>` and `# mflow:end`, replaces whatever an earlier mflow wrote (with markers, or recognised by its wording), keeps the project's own lines and OpenSpec's comments, and quotes any line YAML would misread: OpenSpec ignores a `config.yaml` it cannot parse. What it reports under `problems` (a context on one line, a key that is not a list, a line of the project's own that YAML misreads) is fixed by hand; then run it again.

`operations.apply.guidance` reaches `/opsx:apply` through `openspec instructions apply --json` (`operationGuidance`), and `openspec update` never rewrites `config.yaml`, so the delegation survives OpenSpec upgrades. The `mflow:dev` agent ships with this plugin (`agents/dev.md`) and stays off until the user runs `/mflow:subagent on`; do not switch it on during init.

Done when: `openspec list --json` and `backlog task list --json` both return JSON in this repo, and `openspec-config.mjs --dry-run` reports `changed: false` with no problems.

## 5. Fill AGENTS.md from facts

Replace TODOs only with things you verified:
- Stack: write `## Stack` with the project name and the profile chosen in step 2 and its rows, as "Record" in [references/stacks.md](references/stacks.md) describes.
- Commands: run the build and test commands of that profile (`dotnet build` and `dotnet test` for a); for b) also the front end's build and test). Write the exact command that worked. Anything you could not run gets `(unverified)`. Write the E2E command if one exists, but do not run it: E2E runs only when the user calls `/mflow:e2e` or `/mflow:test e2e`, so it carries `(unverified)` until one of them has run it.
- Architecture: from the actual project layout.
- Domain vocabulary, bounded contexts, purpose: ask the user in one batch of at most three questions; leave `TODO` for anything not answered. A TODO is honest, a guess looks authoritative.
- Delete template sections that stay empty after this step, except `Domain vocabulary` and `Stack`.

Done when: `## Stack` names the project name and a profile, every command line in AGENTS.md was either run successfully or carries `(unverified)`, and AGENTS.md is under 200 lines.

## 6. Existing requirement docs

Customer documents found in step 1 that live outside `docs/source/`: propose moving them there (git mv) so the registry can track them. Then read `${CLAUDE_PLUGIN_ROOT}/skills/capture/SKILL.md` and follow its procedure for all of them: it reads only new or changed files, triages every statement to its destination, and marks each file in `docs/source/INDEX.md`. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.

Done when: `node "${CLAUDE_PLUGIN_ROOT}/scripts/source-index.mjs" scan` reports nothing new or changed, or the remaining files are explicitly noted as irrelevant.

## 7. Hand off

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"` (read-only). Fix what it reports as `fail` that this run can fix, and pass every other `fail` and `warn` to the user with its `fix`.

Update `STATUS.md` (`## Now` + one log entry). Tell the user, briefly:
- what was created, merged, or left untouched;
- the project name and the stack profile, and for c) that mflow has not been tested with it yet;
- which commands are `(unverified)`;
- the open questions and hotspot rows found, and the recommended discussion topics in `docs/decisions/discuss/AGENDA.md` if capture wrote any;
- the agenda in `docs/decisions/discuss/AGENDA.md`, starting with `/mflow:discuss tech-stack` and `/mflow:discuss code-structure` (recommended before theme, not required);
- the next move: `/mflow:theme` to build the UI kit, then `/mflow:screen inventory`, then prototype screens for the first story-map slice. `/mflow:help` lists every command.
