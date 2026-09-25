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
- Existing agent files: `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, `.cursorrules`, `.github/copilot-instructions.md`.
- Existing requirement docs anywhere under `docs/`, `requirements/`, loose `.md`/`.docx`/`.pdf` at the root.
- Tools: `openspec --version`, `backlog --version`, `git --version`; whether `openspec/` and `backlog/` already exist.

Done when: you have reported one compact inventory to พี่ปู (stack, test projects, agent files, docs, tools present/missing/initialised).

## 2. Scaffold

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs" --root . --name "<project name>" --dry-run`, show the planned result, then run it without `--dry-run`.

The script never overwrites. For every entry under `suggested`, a template copy sits in `.mflow/suggested/`: merge it into the existing file by hand (keep everything the user wrote, add the missing mflow sections), show the diff, then delete `.mflow/suggested/`.

Done when: `.mflow/config.json`, `AGENTS.md`, `CLAUDE.md`, `STATUS.md`, `docs/vision.md`, `docs/hotspots/INDEX.md`, `docs/source/README.md`, `docs/ai-inbox/README.md`, `docs/discuss/README.md` exist and `.mflow/suggested/` is gone.

## 3. Wire OpenSpec and Backlog.md

Both write into the repo and into agent files, so show each command and get a yes before running it. Run mflow's scaffold first (step 2) so both tools append to an AGENTS.md that already exists.

- Missing CLI: give the install line and stop this step until พี่ปู installs it: `npm i -g @fission-ai/openspec@latest`, `npm i -g backlog.md`.
- OpenSpec not initialised: `openspec init --tools claude,codex`. Add `--language th` only if พี่ปู wants spec artifacts in Thai.
- OpenSpec already initialised: `openspec update`.
- Backlog.md not initialised: `backlog init "<project name>" --defaults --integration-mode cli --agent-instructions agents` (AGENTS.md only; CLAUDE.md already imports it). If the repo has no git remote, also `backlog config set remoteOperations false`.

Then add to `openspec/config.yaml` (edit YAML, keep existing keys, show the diff):

```yaml
context: |
  Read AGENTS.md for stack, commands, architecture and domain vocabulary.
  Business rules for fuzzy areas are worked out first in docs/hotspots/<slug>/rules.md.
rules:
  proposal:
    - If the change implements a hotspot, link docs/hotspots/<slug>/rules.md in the proposal.
  specs:
    - Every requirement has at least one Scenario; for rule tables, one Scenario per distinct outcome row.
  tasks:
    - Every task ends with the test that proves it (xUnit for rules, Playwright for user flows).
```

Done when: `openspec list --json` and `backlog task list --json` both return JSON in this repo.

## 4. Fill AGENTS.md from facts

Replace TODOs only with things you verified:
- Commands: run `dotnet build` and `dotnet test` (and the Playwright command if one exists). Write the exact command that worked. Anything you could not run gets `(unverified)`.
- Architecture: from the actual project layout.
- Domain vocabulary, bounded contexts, purpose: ask พี่ปู in one batch of at most three questions; leave `TODO` for anything not answered. A TODO is honest, a guess looks authoritative.
- Delete template sections that stay empty after this step, except `Domain vocabulary`.

Done when: every command line in AGENTS.md was either run successfully or carries `(unverified)`, and AGENTS.md is under 200 lines.

## 5. Existing requirement docs

Customer documents found in step 1 that live outside `docs/source/`: propose moving them there (git mv) so the registry can track them. Then read `${CLAUDE_PLUGIN_ROOT}/skills/source/SKILL.md` and follow its procedure for all of them: it reads only new or changed files, triages every statement to its destination, and marks each file in `docs/source/INDEX.md`. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.

Done when: `node "${CLAUDE_PLUGIN_ROOT}/scripts/source-index.mjs" scan` reports nothing new or changed, or the remaining files are explicitly noted as irrelevant.

## 6. Hand off

Update `STATUS.md` (`## Now` + one log entry). Tell พี่ปู, briefly:
- what was created, merged, or left untouched;
- which commands are `(unverified)`;
- the open questions and hotspot rows found;
- the next move: `/mflow:theme` to build the UI kit, then `/mflow:screen inventory`, then prototype screens for the first story-map slice. `/mflow:help` lists every command.
