---
name: init
description: Set up a repo for gathering requirements with mreq — AGENTS.md, CLAUDE.md and the mreq/ folders (project, source, discuss, ui), the project name in code, and the agenda that starts with the four foundation topics.
disable-model-invocation: true
argument-hint: "[display name]"
---

Set this repository up so every future session starts from the same state and knows where each kind of requirement lives. Everything mreq writes goes under `mreq/` (content) and `.mreq/` (settings and records the scripts keep), plus AGENTS.md and CLAUDE.md at the root. The display name is `$ARGUMENTS`, or the folder name when empty; it may be Thai. The project name in code is asked in step 2.

The user's answers are the customer's (see AGENTS.md `## Who decides` once it exists): act on them without asking again.

Work through the steps in order. Each ends on a completion criterion; reach it before moving on.

## 1. Inventory (read only)

Look before asking. Find:
- `.mflow/config.json`. If it exists, another workflow plugin drives this project and writes the same files: say so and stop. Nothing is written.
- `.mreq/config.json` and `mreq/`: this is a rerun (after an mreq upgrade, or to take new templates). AGENTS.md may already hold the project name in code.
- Agent files: `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, `.cursorrules`, `.github/copilot-instructions.md`.
- Requirement documents anywhere outside `mreq/source/`: `docs/`, `requirements/`, loose `.md`, `.docx`, `.xlsx`, `.pdf` at the root.
- Code that already exists (`*.sln`, `*.slnx`, `*.csproj`, `package.json`, `pyproject.toml`, `go.mod`…): its prefix is the recommended project name in code.
- Whether the folder is a git repository.

Done when: you have reported one compact inventory to the user (agent files, documents found, code found or none, git or not, first run or rerun).

## 2. Ask, in one message

1. The display name, if `$ARGUMENTS` was empty and the folder name will not do.
2. The project name in code, as "Asking" in `${CLAUDE_PLUGIN_ROOT}/skills/init/references/project-name.md` describes: three suggestions with one recommended, or a name of the user's own. On a rerun whose AGENTS.md already has `Project name (code)` filled, show it and keep it; the user changes it by saying so.
3. At most three questions about the system: what it does, who uses it (the main roles), and what is measurably better on the day it succeeds.

Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.

A letter, or a typed name, is a full answer to question 2. Anything not answered becomes `TODO`; a TODO is honest, a guess looks authoritative.

Done when: the project name in code is chosen (or explicitly left `TODO`), and the user has answered or passed on the rest.

## 3. Scaffold

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs" --root . --name "<display name>" --code-name <ProjectName> --dry-run` (leave `--code-name` out while it is TODO), show the planned result, then run it without `--dry-run`. The script never overwrites and refuses a project with `.mflow/config.json`.

For every entry under `suggested`, a template copy sits in `.mreq/suggested/`: merge it into the existing file by hand (keep everything the user wrote, add the missing mreq sections), show the diff, then delete `.mreq/suggested/`. `.mreq/templates.json` records each template offered and the plugin version that offered it, so a rerun after an upgrade suggests only the templates that changed; `kept` lists the files where the project's version stands.

Then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" agenda init`. It creates `mreq/discuss/AGENDA.md` with the four foundation topics (`tech-stack`, `code-structure`, `nfr`, `security-privacy`) and never overwrites an existing one.

Fill from the step 2 answers, and only from them: AGENTS.md `## Purpose` (one line), `mreq/project/vision.md` (`## The day it succeeds`, `## Users and roles`). Leave every other TODO for the discussion docs that settle it.

Done when: `.mreq/config.json`, AGENTS.md, CLAUDE.md, `mreq/project/` (README, STATUS, vision, followups), `mreq/source/README.md`, `mreq/ui/README.md`, `mreq/discuss/README.md` and `mreq/discuss/AGENDA.md` exist, and `.mreq/suggested/` is gone.

## 4. Existing requirement documents

Documents found in step 1 outside `mreq/source/`: propose moving them there (`git mv` in a repository, a plain move otherwise), and move them on the user's yes. They are originals: never edit them; a new version is a new file. Reading and sorting their content into topics comes with each discussion doc that cites them (`/mreq:discuss <topic> @file`).

Done when: every document found is in `mreq/source/`, or the user chose to leave it where it is.

## 5. Check and hand off

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"` (read-only). Fix what it reports as `fail` that this run can fix, and pass every other `fail` and `warn` to the user with its `fix`.

Update `mreq/project/STATUS.md` (`## Now` + one log entry). Tell the user, briefly:
- what was created, merged, moved or left untouched;
- the project name in code (or that it is still TODO, and that `code-structure` will settle it);
- the agenda in `mreq/discuss/AGENDA.md`: the four foundation topics, recommended before `/mreq:theme` (security-privacy before the first handoff), and that it is advice, not a gate;
- the next command: `/mreq:discuss tech-stack`. `/mreq:help` lists every command.

Done when: the doctor reports no `fail` this run could have fixed, STATUS.md records the setup, and the user has the next command.
