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

A letter for each, or a typed name, is a full answer. When AGENTS.md already has a filled `## Stack` (a rerun, such as after an mflow upgrade), show it and carry on with it: a rerun to take new templates is not a stack change, and the user changes it by saying so. If that `## Stack` has no `Project name (code)` yet, ask only the name.

Done when: the profile and the project name are chosen or kept, and for c) the filled rows are written and shown.

## 3. Scaffold

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs" --root . --name "<project name>" --dry-run`, show the planned result, then run it without `--dry-run`.

The script never overwrites. For every entry under `suggested`, a template copy sits in `.mflow/suggested/`: merge it into the existing file by hand (keep everything the user wrote, add the missing mflow sections), show the diff, then delete `.mflow/suggested/`. `.mflow/templates.json` records each template offered and the plugin version that offered it, so a rerun after an upgrade suggests only the templates that changed; `kept` lists the files whose template was offered before, where the project's version stands. Commit `.mflow/templates.json` with the rest of `.mflow/`.

Then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" agenda init`. It creates `docs/decisions/discuss/AGENDA.md`, which starts with the `tech-stack` and `code-structure` topics, and never overwrites an existing one.

Done when: `.mflow/config.json`, `AGENTS.md`, `CLAUDE.md`, `STATUS.md`, `docs/vision.md`, `docs/decisions/hotspots/INDEX.md`, `docs/source/README.md`, `docs/ai/inbox/README.md`, `docs/decisions/discuss/README.md` and `docs/decisions/discuss/AGENDA.md` exist (or the same files in the folders `.mflow/config.json` names) and `.mflow/suggested/` is gone.

## 4. Wire OpenSpec and Backlog.md

Both write into the repo and into agent files, so show each command and get a yes before running it. Run mflow's scaffold first (step 3) so both tools append to an AGENTS.md that already exists.

- Missing CLI: give the install line and stop this step until the user installs it: `npm i -g @fission-ai/openspec@latest`, `npm i -g backlog.md`.
- OpenSpec not initialised: `openspec init --tools claude,codex`. Add `--language th` only if the user wants spec artifacts in Thai.
- OpenSpec already initialised: `openspec update`.
- Backlog.md not initialised: `backlog init "<project name>" --defaults --integration-mode cli --agent-instructions agents` (AGENTS.md only; CLAUDE.md already imports it). If the repo has no git remote, also `backlog config set remoteOperations false`.

Then write mflow's lines into `openspec/config.yaml`: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/openspec-config.mjs" --dry-run`, show what it would remove and add, then run it without `--dry-run`. The lines are, in short:
- `context`: read AGENTS.md; the user's word is the customer's (build first, test in use, refine); hotspot rules, approved discussion docs and the data dictionary, in the folders `.mflow/config.json` names.
- `rules.proposal`: link the hotspot's `rules.md` and the data-model doc; list the choices nothing settles yet, and ask about the costly ones (tables, permissions, external writes, what reaches the customer, a departure from a customer document) before the proposal is final; one change per feature, its server side and screens together, split by feature only past about 25 tasks or on the user's word, the rest listed under Later changes. `rules.specs`: a Scenario per requirement and per outcome row.
- `rules.tasks`: a task that changes code ends with its unit test; no task writes or runs E2E (`/mflow:e2e`); a task runs the build, the unit tests and its own tests, with no gate task (`/mflow:test`); an aggregate's README section becomes a pointer.
- `operations.apply.guidance`: the `mflow:dev` subagent only when it is on, and the diff check after it; after each task the build, the unit tests and the integration classes the task added or changed, in the foreground in parts of about 8 minutes, never in the background; once at the end the `- Shared checks:` of AGENTS.md when the change touched the data model, startup, permissions or seed data; every other integration class waits for `/mflow:test`; never E2E; at the end a row in `docs/reviews/pending.md` instead of asking for `/mflow:test` and a review, which the user runs later, once for every row.

The script puts mflow's list items between `# mflow:begin <version>` and `# mflow:end`, replaces whatever an earlier mflow wrote (with markers, or recognised by its wording), keeps the project's own lines and OpenSpec's comments, and quotes any line YAML would misread: OpenSpec ignores a `config.yaml` it cannot parse. What it reports under `problems` (a context on one line, a key that is not a list, a line of the project's own that YAML misreads) is fixed by hand; then run it again.

`operations.apply.guidance` reaches `/opsx:apply` through `openspec instructions apply --json` (`operationGuidance`), and `openspec update` never rewrites `config.yaml`, so the delegation survives OpenSpec upgrades. The `mflow:dev` agent ships with this plugin (`agents/dev.md`) and stays off until the user runs `/mflow:subagent on`; do not switch it on during init.

Then the list of changes waiting for test and review: step 3 copies `docs/reviews/pending.md` from the template when it is missing. On a project that already has archived changes (a rerun after an mflow upgrade), ask from which date archived changes count as waiting, with a) the date of the newest whole-suite record in `docs/reviews/tests/` that passed, b) today (only new changes), or a date of the user's own, and write it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/pending.mjs" init --since <date>`. Then add every `missing` change of `pending.mjs status` (`pending.mjs add <change> --level … --why … --applied <archive date>`, the level by "Levels" in `/mflow:review` from the files of `pending.mjs range <change>`), run `pending.mjs tick-test` with the newest passing whole-suite or `since` record, and `pending.mjs tick-review` for each change that an `approve` report in `docs/reviews/code/` already covers. Show the list to the user.

Then the skills for Codex and OpenCode: `/mflow:test` and `/mflow:review` as `.agents/skills/mflow-test/` and `mflow-review/`, the folder both tools read (Codex calls `$mflow-test`, OpenCode `/mflow-test`). Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/agent-skills.mjs" plan`, show what it would create, update or remove, and run `write` on a yes. A skill it reports as `foreign` is the user's own of that name: it stays, and say how to free the name. Skip this when the user does not use those tools; `/mflow:help check setup` reports when the copies are older than the plugin.

Then the copy for Claude Code on the web, as [references/cloud.md](references/cloud.md) describes: the web installs no plugins, so a web session has mflow only from a copy in the repository, `.claude/skills/mflow/`. With no copy yet, ask once: a) write it, recommended when the user works on claude.ai/code or the repository has `claude/…` branches, b) no. A copy already there (a rerun after an mflow upgrade) is refreshed without asking. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/vendor.mjs" plan`, show what it would create, update or remove, and run `vendor.mjs write`. A folder it reports as `foreign` is the project's own: it stays, and say how to free the name. Then give the user what cloud.md lists: commit the copy in a commit of its own, the environment to set up on claude.ai/code with the setup script for this stack (init cannot set it), and how to see in the first web session that mflow loaded. Say in one line that loading mflow this way on the web is not yet proven, and that the first web session is that test.

Done when: `openspec list --json` and `backlog task list --json` both return JSON in this repo, `openspec-config.mjs --dry-run` reports `changed: false` with no problems, `agent-skills.mjs plan` reports every skill `unchanged`, `foreign`, or skipped by the user, and `vendor.mjs status` reports `current: true`, or the user declined the copy.

## 5. Fill AGENTS.md from facts

Replace TODOs only with things you verified:
- Stack: write `## Stack` with the project name and the profile chosen in step 2 and its rows, as "Record" in [references/stacks.md](references/stacks.md) describes.
- Commands: run the build and test commands of that profile (`dotnet build` and `dotnet test` for a); for b) also the front end's build and test). Write the exact command that worked. Anything you could not run gets `(unverified)`. Write the E2E command if one exists, but do not run it: E2E runs only when the user calls `/mflow:e2e` or `/mflow:test e2e`, so it carries `(unverified)` until one of them has run it.
- Shared checks: when there are integration tests, find the classes that check the whole schema (every table), every migration, the startup and the seed data, by their names and what they assert. Propose them to the user as one filtered command, with how long it took when you ran it (`- Shared checks: <the integration test command filtered to them>`; aim for a few minutes), and write it on a yes. A project without integration tests writes `none`. `/opsx:apply` runs this line once at the end of a change that touched the data model, startup, permissions or seed data; without it those checks wait for `/mflow:test`. On a rerun where AGENTS.md has `## Commands` but no `- Shared checks:` line, propose it the same way.
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
