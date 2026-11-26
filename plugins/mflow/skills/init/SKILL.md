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

## 2. Everything to ask, in one message

`/mflow:init` is the user's go-ahead for setting the repository up (AGENTS.md `## Who decides`), so this run asks once, here, right after the inventory and before any file is written, and then works to the end without stopping; only the domain questions of step 5 come later. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" plan --root .` first (it reads only). It gives each optional part a state from what the user answered before, kept in `.mflow/config.json` `setup`: `ask` (never offered), `write` (said yes before, or already in the project: written without asking), `declined` (said no before: neither written nor asked), `current`, `foreign` or `problem`. Before step 3 has made `.mflow/config.json`, every optional part is `ask`.

Put in one numbered message only what applies:
1. Which stack this project uses, as "Asking" in [references/stacks.md](references/stacks.md) describes: options `a)` `b)` `c)`, a recommendation with its evidence from step 1. Not when AGENTS.md already has a filled `## Stack` (a rerun, such as after an mflow upgrade): show it in one line and carry on with it; a rerun to take new templates is not a stack change, and the user changes it by saying so.
2. The project name in code, which every project, folder and namespace starts with (`<ProjectName>.Api`, `<ProjectName>.Web.Backend`), as "Project name" in the same file describes: three suggestions with one recommended, or a name of the user's own. Not when `## Stack` already has `Project name (code)`.
3. Each part in `ask`, as a) yes (recommended) or b) no: `agentSkills`, the skills Codex, OpenCode and Antigravity run as `$mflow-test`, `$mflow-review`, `$mflow-e2e` and `$mflow-test-pr` (no is right only when the user uses none of them); `worktree`, what parallel branches need (apply works on a `feat/<change>` branch); `webCopy`, the copy for Claude Code on the web (references/cloud.md), recommended only when the user works on claude.ai/code or `webBranches` is true, otherwise b) is the recommendation.
4. Updating the OpenSpec CLI, when `openspec version --check --json` (run it here) finds a newer one, as step 4 describes: it installs on the machine, outside this repository, so it is asked.
5. The date from which archived changes wait for test and review, when `openspec/changes/archive/` holds changes and `docs/reviews/pending.md` is missing or has no `Since:` line, as step 4 describes.

A letter for each, or a typed name, is a full answer. Once `.mflow/config.json` exists (step 3), keep every answer to 3 with `setup.mjs record <part> yes|no`, so no later run asks it again. When nothing applies (a rerun with a filled `## Stack` and no part `ask`), ask nothing: go on, and say in one line of the final report which parts are `declined` and that the user's word turns one on (`setup.mjs record <part> yes`).

Done when: the profile and the project name are chosen or kept, for c) the filled rows are written and shown, and every question of this step has its answer or none was needed.

## 3. Scaffold

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs" --root . --name "<project name>" --dry-run`, show the planned result, then run it without `--dry-run`.

The script never overwrites. For every entry under `suggested`, a template copy sits in `.mflow/suggested/`: merge it into the existing file by hand (keep everything the user wrote, add the missing mflow sections), show the diff, then delete `.mflow/suggested/`. `.mflow/templates.json` records each template offered and the plugin version that offered it, so a rerun after an upgrade suggests only the templates that changed; `kept` lists the files whose template was offered before, where the project's version stands. Commit `.mflow/templates.json` with the rest of `.mflow/`.

The commit lines of the templates (`Commit each finished piece of work without asking…` in `CLAUDE.md` and `AGENTS.md`, `` `/opsx:apply` archives the change in the same turn and commits once `` in `CLAUDE.md`) are how mflow works, not a choice of the project. When the existing file says something else about commits, such as `Commit only on the user's word`, replace it with the template's line. Do not ask about it, whatever work is waiting or failing, and say in one line of the report which line was replaced. The same holds for a line asking for plan mode (`Use plan mode before implementing…`, from templates before 0.52.0): replace it with the template's `Never enter plan mode…` line, and add the template's line on running `/opsx:*` yourself when it is missing. And for the push and mflow-step lines of templates before 0.59.0, so the old rule never stays beside the new one: `Push, merge and deploy only on the user's word…` (CLAUDE.md and AGENTS.md) becomes the template's push sentences, `/mflow:* commands still run only when the user types them` and `Other /mflow:* commands still run only when the user types them` go, with the template's `An mflow step the work leads to…` line added, the hotspot line's `because mflow commands run only when the user types them` becomes the template's wording, and `never main` leaves the AGENTS.md line on pushing `feat/<change>`.

Then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" agenda init`. It creates `docs/decisions/discuss/AGENDA.md`, which starts with the `tech-stack` and `code-structure` topics, and never overwrites an existing one.

Done when: `.mflow/config.json`, `AGENTS.md`, `CLAUDE.md`, `STATUS.md`, `docs/vision.md`, `docs/decisions/hotspots/INDEX.md`, `docs/source/README.md`, `docs/ai/inbox/README.md`, `docs/decisions/discuss/README.md` and `docs/decisions/discuss/AGENDA.md` exist (or the same files in the folders `.mflow/config.json` names) and `.mflow/suggested/` is gone.

## 4. Wire OpenSpec and Backlog.md

The user's `/mflow:init` is the yes for these commands: run them without asking again, and name each in the final report. Run mflow's scaffold first (step 3) so both tools append to an AGENTS.md that already exists.

- Missing CLI: give the install line and stop this step until the user installs it: `npm i -g @fission-ai/openspec@latest`, `npm i -g backlog.md`.
- OpenSpec not initialised: `openspec init --tools claude,codex --scope project` on OpenSpec 2.0 or newer (`openspec --version`), plain `openspec init --tools claude,codex` before 2.0. Without `--scope project`, OpenSpec 2 puts its skills in the user's home for every project (`~/.agents/skills/`, linked from `~/.claude/skills/`) instead of this repository, where a web session and `.claude/skills/<name>/SKILL.md` (CLAUDE.md's fallback) look for them. OpenSpec 2 has no `/opsx:*` commands: the user types the skill (`/openspec-propose`, `/openspec-apply-change`) or asks in words, and Claude runs it. Add `--language th` only if the user wants spec artifacts in Thai. In PowerShell quote the list (`--tools 'claude,codex'`): unquoted, PowerShell splits it at the comma and OpenSpec rejects it.
- OpenSpec CLI up to date, first (so `openspec update` below writes the newest files): `openspec version --check --json`, run in step 2. When `update.status` is not `current` and `update.latest` is newer than `version`, step 2 asked whether to update OpenSpec to `update.latest` now; on a yes run `update.command` when it gives one (it fits how OpenSpec was installed), otherwise `npm install -g @fission-ai/openspec@latest`, then `openspec --version` to confirm. npm's OpenSpec 2.2 needs Node 22.20 or newer: when `node --version` is older, say so and leave the CLI as it is. Before OpenSpec 2.0 (no `version` command), compare `openspec --version` with `npm view @fission-ai/openspec version` instead. The check failing (offline, a registry error): say so in one line and go on with the CLI there is. A no: go on with it too.
- OpenSpec already initialised: `openspec update`, which keeps the scope the project has. To add a tool to a project already initialised, run `openspec init --tools <the full list>` again; it adds that tool's files and keeps the rest.
- The Antigravity CLI (`agy`) needs nothing more: it reads `.agents/skills/openspec-*`, which `codex` in the list writes (`agents` writes the same folder when the user has no Codex). Add `antigravity` to the list only when the user also works in the Antigravity IDE: it writes `.agents/workflows/opsx-*.md`, which only the IDE sees. Say in one line that in `agy` the user asks for the `openspec-apply-change` skill by name, as there is no `/opsx:apply` there.
- Backlog.md not initialised: `backlog init "<project name>" --defaults --integration-mode cli --agent-instructions agents` (AGENTS.md only; CLAUDE.md already imports it). If the repo has no git remote, also `backlog config set remoteOperations false`.

Then write mflow's lines into `openspec/config.yaml`: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/openspec-config.mjs"` and say in the report how many lines it removed and added. The lines are, in short:
- `context`: read AGENTS.md; the user's word is the customer's (build first, test in use, refine); hotspot rules, approved discussion docs and the data dictionary, in the folders `.mflow/config.json` names.
- `rules.proposal`: link the hotspot's `rules.md` and the data-model doc; list the choices nothing settles yet, and ask about the costly ones (tables, permissions, external writes, what reaches the customer, a departure from a customer document) before the proposal is final; one change per feature, its server side and screens together, split by feature only past about 25 tasks or on the user's word, the rest listed under Later changes. `rules.specs`: a Scenario per requirement and per outcome row.
- `rules.tasks`: a task that changes code ends with its unit test; no task writes or runs E2E (`/mflow:e2e`); a task runs the build, the unit tests and its own tests, with no gate task (`/mflow:test`); an aggregate's README section becomes a pointer.
- `operations.apply.guidance`: the `mflow:dev` subagent only when it is on, and the diff check after it; after each task the build, the unit tests and the integration classes the task added or changed, in the foreground in parts of about 8 minutes, never in the background; once at the end the `- Shared checks:` of AGENTS.md when the change touched the data model, startup, permissions or seed data; every other integration class waits for `/mflow:test`; never E2E; at the end a row in `docs/reviews/pending.md` instead of asking for `/mflow:test` and a review, which the user runs later, once for every row.

The script puts mflow's list items between `# mflow:begin <version>` and `# mflow:end`, replaces whatever an earlier mflow wrote (with markers, or recognised by its wording), keeps the project's own lines and OpenSpec's comments, and quotes any line YAML would misread: OpenSpec ignores a `config.yaml` it cannot parse. What it reports under `problems` (a context on one line, a key that is not a list, a line of the project's own that YAML misreads) is fixed by hand; then run it again.

`operations.apply.guidance` reaches `/opsx:apply` through `openspec instructions apply --json` (`operationGuidance`), and `openspec update` never rewrites `config.yaml`, so the delegation survives OpenSpec upgrades. The `mflow:dev` agent ships with this plugin (`agents/dev.md`) and stays off until the user runs `/mflow:subagent on`; do not switch it on during init.

Then the list of changes waiting for test and review: step 3 copies `docs/reviews/pending.md` from the template when it is missing. On a project that already has archived changes and no `Since:` line in that list (a first rerun after an mflow upgrade), step 2 asked from which date archived changes count as waiting, with a) the date of the newest whole-suite record in `docs/reviews/tests/` that passed, b) today (only new changes), or a date of the user's own; write it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/pending.mjs" init --since <date>`. Then add every `missing` change of `pending.mjs status` (`pending.mjs add <change> --level … --why … --applied <archive date>`, the level by "Levels" in `/mflow:review` from the files of `pending.mjs range <change>`), run `pending.mjs tick-test` with the newest passing whole-suite or `since` record, and `pending.mjs tick-review` for each change that an `approve` report in `docs/reviews/code/` already covers. Show the list to the user.

Then the skills for Codex and OpenCode: `/mflow:test`, `/mflow:review` and `/mflow:e2e` as `.agents/skills/mflow-test/`, `mflow-review/` and `mflow-e2e/`, the folder both tools read (Codex calls `$mflow-test`, OpenCode `/mflow-test`), and mflow's E2E guard as an entry in `.codex/hooks.json`, so Codex caps the browsers of a Playwright run as the hook does here; other hooks in that file stay. When `setup.mjs plan` gave `agentSkills` the state `write`, or the user said yes in step 2, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/agent-skills.mjs" write` without asking and list in the report what it created, updated or removed (the skills and `hook`); `declined` or a no in step 2: skip it. A skill it reports as `foreign` is the user's own of that name: it stays, and say how to free the name. A hook it reports as `refused` is a file mflow cannot merge into: show its note. When the hook was created or changed, tell the user in one line that Codex runs it only once they trust the project and approve the hook in Codex's `/hooks`; until then `$mflow-e2e` and `$mflow-test e2e` refuse to start Playwright. OpenCode has no such hook: it writes E2E tests but never runs them. `/mflow:help check setup` reports when the copies are older than the plugin.

Then what parallel branches need, for `/mflow:worktree` and for every tool working in its own worktree (AGENTS.md `## Branches and worktrees`): when `setup.mjs plan` gave `worktree` the state `write`, or the user said yes in step 2, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs" setup` and list in the report what it added (`.claude/worktrees/` to `.gitignore`, `docs/reviews/pending.md merge=union` to `.gitattributes`, and a new `.worktreeinclude` listing the git-ignored settings it found, such as `.env` files and `.claude/settings.local.json`); `declined` or a no: skip it. It never rewrites what is there; an existing `.worktreeinclude` is the project's.

Then the copy for Claude Code on the web, as [references/cloud.md](references/cloud.md) describes: the web installs no plugins, so a web session has mflow only from a copy in the repository, `.claude/skills/mflow/`. When `setup.mjs plan` gave `webCopy` the state `write` (a copy already there, refreshed after an mflow upgrade, or a yes kept before), or the user said yes in step 2, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/vendor.mjs" write` without asking and say in the report how many files it created, updated or removed; `declined` or a no: skip it. A folder it reports as `foreign` is the project's own: it stays, and say how to free the name. When the copy was written for the first time, give the user what cloud.md lists: commit the copy in a commit of its own, the environment to set up on claude.ai/code with the setup script for this stack (init cannot set it), and how to see in the first web session that mflow loaded. Say in one line that loading mflow this way on the web is not yet proven, and that the first web session is that test.

Done when: `openspec list --json` and `backlog task list --json` both return JSON in this repo, and `setup.mjs plan` reports no part `ask` or `write`: each one `current`, `declined` or `foreign`, and a `problem` passed to the user with its note.

## 5. Fill AGENTS.md from facts

Replace TODOs only with things you verified:
- Stack: write `## Stack` with the project name and the profile chosen in step 2 and its rows, as "Record" in [references/stacks.md](references/stacks.md) describes.
- Commands: run the build and test commands of that profile (`dotnet build` and `dotnet test` for a); for b) also the front end's build and test). Write the exact command that worked. Anything you could not run gets `(unverified)`. Write the E2E command if one exists, but do not run it: E2E runs only when the user calls `/mflow:e2e` or `/mflow:test e2e`, so it carries `(unverified)` until one of them has run it.
- Shared checks: when there are integration tests, find the classes that check the whole schema (every table), every migration, the startup and the seed data, by their names and what they assert. Write them as one filtered command (`- Shared checks: <the integration test command filtered to them>`; aim for a few minutes) without asking, and say in the report which classes it runs and how long it took when you ran it; the user changes it by saying so. A project without integration tests writes `none`. `/opsx:apply` runs this line once at the end of a change that touched the data model, startup, permissions or seed data; without it those checks wait for `/mflow:test`. On a rerun where AGENTS.md has `## Commands` but no `- Shared checks:` line, write it the same way.
- Architecture: from the actual project layout.
- Coding standard: in `docs/standards/coding.md`, replace a TODO line with a `STD-<nn>` rule only where the code already shows it for certain (the test framework and assertion style in use, the project layout, the data-access pattern every project uses). Leave the rest TODO: the approved `tech-stack` and `code-structure` discussions fill them.
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
