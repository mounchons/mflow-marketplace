---
name: init
description: Set up a repo for the mflow workflow (AGENTS.md, CLAUDE.md, STATUS.md, vision, hotspot register) and wire OpenSpec + Backlog.md.
disable-model-invocation: true
argument-hint: "[project name]"
---

Set this repository up so every future session (Claude Code or Codex) starts from the same state and knows where each kind of fact lives. The project name is `$ARGUMENTS`, or the folder name when empty.

Work through the steps in order. Each ends on a completion criterion; reach it before moving on.

## 1. Inventory (read only)

Look before asking. Find:
- Solution and projects: `*.sln` / `*.slnx`, `*.csproj`, test projects (xUnit), Playwright (`playwright.config.*` or `Microsoft.Playwright` package), front-end folders (`package.json`, Vite).
- Other stacks: `composer.json`, `pyproject.toml` / `requirements.txt`, `go.mod`, `pom.xml` / `build.gradle`, and the framework named in `package.json`.
- Existing agent files: `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, `.cursorrules`, `.github/copilot-instructions.md`. Note whether AGENTS.md already has a `## Stack` section.
- Existing requirement docs anywhere under `docs/`, `requirements/`, loose `.md`/`.docx`/`.pdf` at the root.
- Tools: `openspec --version`, `backlog --version`, `git --version`; whether `openspec/` and `backlog/` already exist.

Done when: you have reported one compact inventory to the user (stack detected or none, test projects, agent files, docs, tools present/missing/initialised).

## 2. Choose the stack

Ask which stack this project uses, as "Asking" in [references/stacks.md](references/stacks.md) describes: options `a)` `b)` `c)`, a recommendation with its evidence from step 1, and a letter as the answer. Ask it right after the inventory, before any file is written, and on its own; the domain questions come later in step 5. When AGENTS.md already has a filled `## Stack` (a rerun, such as after an mflow upgrade), show it and carry on with it: a rerun to take new templates is not a stack change, and the user changes it by saying so.

Done when: the profile is chosen or kept, and for c) the filled rows are written and shown.

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

Then add to `openspec/config.yaml` (edit YAML, keep existing keys, show the diff):

```yaml
context: |
  Read AGENTS.md for stack, commands, architecture and domain vocabulary.
  The user's answers and instructions are the customer's: build first, test in use, then refine through follow-up changes.
  Business rules for fuzzy areas are worked out first in docs/decisions/hotspots/<slug>/rules.md.
  Designs agreed before building (roles, data models, ...) are in docs/decisions/discuss/NN-*.md with status approved.
  The current data dictionary is PrototypeData/README.md until a change builds the entity.
rules:
  proposal:
    - If the change implements a hotspot, link docs/decisions/hotspots/<slug>/rules.md in the proposal.
    - If the change adds or alters tables, link the approved data-model doc in docs/decisions/discuss/ and follow PrototypeData/README.md; state any difference.
  specs:
    - Every requirement has at least one Scenario; for rule tables, one Scenario per distinct outcome row.
  tasks:
    - Every task ends with the test that proves it (a unit test for rules, an E2E test for user flows; frameworks as in AGENTS.md Stack).
    - A change that builds an aggregate ends by replacing its section in PrototypeData/README.md with a pointer to the entity and migration.
operations:
  apply:
    guidance:
      - Only when this session's mflow briefing says the apply subagent mflow:dev is ON, hand the code changes of each task to a fresh `mflow:dev` subagent, which runs on Sonnet 5.5, one task at a time in tasks.md order. Give it the change name, the task text, the contextFiles paths and the reports of the tasks already done in this session (files changed, tests). It is off until switched on with /mflow:subagent on; decide from this session only, never from notes or memories of earlier sessions. When it is off, not available, or the call is denied, implement every task yourself without pausing to ask.
      - When the subagent did a task, before marking it `- [x]` and starting the next one, check its diff against the task and its specs, and confirm the task's test passes (rerun it when the report shows no passing run).
```

`operations.apply.guidance` reaches `/opsx:apply` through `openspec instructions apply --json` (`operationGuidance`), and `openspec update` never rewrites `config.yaml`, so the delegation survives OpenSpec upgrades. The `mflow:dev` agent ships with this plugin (`agents/dev.md`) and stays off until the user runs `/mflow:subagent on`; do not switch it on during init.

Done when: `openspec list --json` and `backlog task list --json` both return JSON in this repo.

## 5. Fill AGENTS.md from facts

Replace TODOs only with things you verified:
- Stack: write `## Stack` with the profile chosen in step 2 and its rows, as "Record" in [references/stacks.md](references/stacks.md) describes.
- Commands: run the build and test commands of that profile (`dotnet build` and `dotnet test` for a); for b) also the front end's build and test) and the E2E command if one exists. Write the exact command that worked. Anything you could not run gets `(unverified)`.
- Architecture: from the actual project layout.
- Domain vocabulary, bounded contexts, purpose: ask the user in one batch of at most three questions; leave `TODO` for anything not answered. A TODO is honest, a guess looks authoritative.
- Delete template sections that stay empty after this step, except `Domain vocabulary` and `Stack`.

Done when: `## Stack` names a profile, every command line in AGENTS.md was either run successfully or carries `(unverified)`, and AGENTS.md is under 200 lines.

## 6. Existing requirement docs

Customer documents found in step 1 that live outside `docs/source/`: propose moving them there (git mv) so the registry can track them. Then read `${CLAUDE_PLUGIN_ROOT}/skills/capture/SKILL.md` and follow its procedure for all of them: it reads only new or changed files, triages every statement to its destination, and marks each file in `docs/source/INDEX.md`. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.

Done when: `node "${CLAUDE_PLUGIN_ROOT}/scripts/source-index.mjs" scan` reports nothing new or changed, or the remaining files are explicitly noted as irrelevant.

## 7. Hand off

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"` (read-only). Fix what it reports as `fail` that this run can fix, and pass every other `fail` and `warn` to the user with its `fix`.

Update `STATUS.md` (`## Now` + one log entry). Tell the user, briefly:
- what was created, merged, or left untouched;
- the stack profile, and for c) that mflow has not been tested with it yet;
- which commands are `(unverified)`;
- the open questions and hotspot rows found, and the recommended discussion topics in `docs/decisions/discuss/AGENDA.md` if capture wrote any;
- the agenda in `docs/decisions/discuss/AGENDA.md`, starting with `/mflow:discuss tech-stack` and `/mflow:discuss code-structure` (recommended before theme, not required);
- the next move: `/mflow:theme` to build the UI kit, then `/mflow:screen inventory`, then prototype screens for the first story-map slice. `/mflow:help` lists every command.
