---
name: delegate
description: Hand a task, change, analysis or code review to another AI tool (Codex, the Antigravity CLI, OpenCode, Gemini, a chat UI, or any tool added later) through a self-contained brief with a fixed output contract, so its work comes back in a form Claude can verify.
disable-model-invocation: true
argument-hint: "<TASK-ID | change-name | hotspot-slug | \"topic\"> --mode analyze|review|code [--to <tool>]"
---

Another tool does not share this conversation. It gets a **brief**: one file that says what to do, what to read, what not to touch, and what its final answer must contain. The brief is the contract; the answer is checked by `/mflow:assess` (analyze, review) or `/mflow:review` (code). This skill writes the brief, then runs Codex and the Antigravity CLI itself for read-only work (analyze and review, the user's standing word since 0.59.0), runs Codex itself when it builds an OpenSpec change ("Apply by Codex" below, since 0.60.0), and shows the command for everything else, which the user runs.

`--to` is optional. Without it (or `--to any`) the brief is tool-neutral and the command list covers every registered tool. Tools live in a registry (defaults in the plugin, overrides and new tools under `tools` in `.mflow/config.json`), so a tool added next year needs a config entry, not a new plugin version.

Brief template and output contracts: [references/brief-template.md](references/brief-template.md).

## 1. Resolve the subject

- `TASK-…`: `backlog task <id> --plain`; the task's description, acceptance criteria and references define the goal.
- change name: `openspec/changes/<name>/` (proposal, delta specs, tasks).
- hotspot slug: `docs/decisions/hotspots/<slug>/map.md` and `rules.md`.
- `discuss-<NN>-r<revision>`: the discussion doc `docs/decisions/discuss/NN-<slug>.md` and the sources in its frontmatter. Point to the text versions of the sources that `consult` prepares (the paths `source-index.mjs cache` gives), never to a binary, and never pack `docs/ai/inbox/`: tools answer independently. Use the "discuss" output contract, and paste the topic's checklist section from `${CLAUDE_PLUGIN_ROOT}/skills/discuss/references/topics.md` into the brief, because the plugin folder is outside the repo. `/mflow:discuss <NN> consult` drives this case. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.
- quoted topic: no file defines it. Choose the files to examine from AGENTS.md's architecture and a code search, and list them explicitly in the brief's Scope so the user can check them.

Done when: the goal fits in two sentences and every path the tool needs is known.

## 2. Write the brief

`.mflow/briefs/<date>-<id>-<mode>-<tool or any>.md` from the template. Pointers, not pasted content. Record the snapshot the tool reads in the frontmatter: `base:` the output of `git rev-parse HEAD`, and `dirty:` `none` when `git status --porcelain` prints nothing, otherwise the number of uncommitted files, with a line in Scope saying the brief covers uncommitted work. The report copies `base`, so `/mflow:assess` can tell which files changed after the tool read them. The output contract for the mode is copied in full, including the mandatory `Understanding` and `Files read` sections.

For a tool without repo access (`--to chat`, or the user says it is a web chat), also build a context pack of everything in Read first and Scope:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/context-pack.mjs" --out .mflow/briefs/<brief>.pack.md <paths...>`
and add "Attach: <pack file>" to the brief. Heed the size warning; narrow the paths rather than sending a truncated pack (past 500 files or 2 MB the script stops without reading anything). Files outside the project are left out unless their folder is named with `--allow <folder>`, which is for a folder the brief itself lists, such as a shared package. Show the user the script's `skipped` list: files that may hold secrets or sit outside the project are left out on purpose. The secret check matches patterns and can miss some, so tell the user to read the pack before pasting it anywhere.

Done when: the brief alone is enough for a tool that has never seen this project.

## 3. Workspace (mode `code` only)

- Worktree and branch so Claude and the other tool never share a checkout: `git worktree add .claude/worktrees/agent-<tool or any>-<id> -b agent/<tool or any>/<id> main`, inside the main checkout where `/mflow:worktree` puts its own (`node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs" setup` first, when `.claude/worktrees/` is not yet git-ignored), then copy the git-ignored files `.worktreeinclude` names into it. A worktree of a change applied there by a tool is `/mflow:worktree <change>` instead, on `feat/<change>`.
- For an OpenSpec change, the tool implements `openspec/changes/<name>/tasks.md`; tools set up by `openspec init --tools …` have OpenSpec skills (Codex: `$openspec-apply-change`). The Antigravity CLI (`agy`, `--to antigravity`) uses the same `.agents/skills/openspec-*` that `--tools codex` writes; it does not see the `.agents/workflows/` that `--tools antigravity` writes for the Antigravity IDE.
- `--to antigravity` in code mode runs `agy` with `--dangerously-skip-permissions` in the worktree, the user's choice: headless `agy` refuses whatever it would have to ask about, and its sandboxed terminal cannot write, so a build or `git commit` would fail. Say so in one line when showing the command.
- Backlog: assignee `@<tool>` (or `@agent`), status `In Progress`, note pointing at the brief.

## 4. Run it, or show the command

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/delegate-cmd.mjs" --mode <mode> --tool <tool or any> --brief <brief> --out docs/ai/inbox/<date>-{tool}-<id>.md [--worktree <dir>]`. The script replaces `{tool}` with each tool's name, so with `--tool any` every tool writes its own report instead of overwriting one file.

**Mode `analyze` or `review`, for `codex` and `antigravity`: run them yourself**, when the script marks the entry `mflowOwn: true`. With `--tool any`, or no tool named, that means both. A line `.mflow/config.json` replaced (`mflowOwn: false`) came with the repository and could run anything: show it as below and let the user run it. Before starting, take `git status --porcelain` and the hash of the tracked changes (`git diff HEAD | git hash-object --stdin`, which writes nothing). Take each tool's line for the shell this session runs (`bash` in the Bash tool, `pwsh` in PowerShell), run it from the repository root as a background command, and start every tool at once, so they answer side by side. Both plugin lines are read-only: Codex in its `read-only` sandbox, `agy` in plan mode with mflow's read-only settings, which is weaker. While they run, write nothing in the repository yourself, so any change is theirs. When each one ends:
- **Check the report.** The output file must exist, hold more than whitespace, and be more than `no output produced`; `agy` can exit 0 without writing. A run that failed, ran out of time, hit a usage limit or left no report gets one line saying so, with its command for the user to run later. Go on with the reports that came back.
- **Check what the run changed.** Take both again. A file new in `git status --porcelain` other than the reports, or a different hash of the tracked changes, is a tool going past its brief: say which files changed, leave them as they are, and do not commit them.
- **Use it.** Go on with "When it comes back" below for each report, in the same turn.

**Every other tool, mode `code`, or the user saying they will run it themselves:** present the script's result as below, and the user runs it.
- Both `pwsh` and `bash` lines when available; the PowerShell line sets UTF-8 so Thai text in the brief survives the pipe.
- Mark entries with `verified: false` as "check `--help` first".
- For `antigravity`, add that an empty report file with "no output produced" in the terminal means `agy` refused a tool without asking; the run still exits 0.
- `known: false`: ask the user for that tool's non-interactive command (prompt from file or stdin, read-only option, how output is saved), write it into `.mflow/config.json` under `tools.<name>.<mode>.bash` / `.pwsh` using `{brief}` `{out}` `{worktree}` unquoted (the script quotes each path for its shell; PowerShell cmdlets take them with `-LiteralPath`), then rerun the script.
- Interactive alternative for any CLI tool: open it in the repo and say "read <brief path> and follow it; give the report as your final message and edit no files".

Done when: the brief exists, Codex and agy ran for analyze or review and their reports were checked (or the failure was named), every other command is shown, and STATUS.md records what was delegated, to whom, and where the answer will land.

## Apply by Codex (an OpenSpec change built by Codex, checked by Claude)

When the user says Codex builds it ("ให้ codex เขียน", "codex apply", "approve, codex ทำ"), or `.mflow/config.json` has `"applyBy": "codex"`, Codex writes the code of a proposed change and Claude checks it, which spends Claude's usage on the checking, not the writing. Claude still writes the proposal, the user's questions about it included. Claude runs Codex itself, the user's standing word since 0.60.0. Codex has its own worktree, and its sandbox lets it write only there.
1. **The proposal is committed on main** (push it, as AGENTS.md says), then `node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs" new <change>` makes `.claude/worktrees/<change>` on `feat/<change>`.
2. **Brief**, mode `code`, subject the change: implement `openspec/changes/<change>/tasks.md` with the `openspec-apply-change` skill (`$openspec-apply-change`), writing the code to `docs/standards/coding.md` and AGENTS.md; after each task the build and the unit tests as `## Commands` says, ticking the task when they pass; no archive, no commit (the sandbox cannot write `.git`), no E2E. The report lists the tasks done, the commands run with their results, and every departure from the standard with its rule id.
3. **Run it.** `delegate-cmd.mjs --mode code --tool codex --worktree .claude/worktrees/<change>`; only an entry marked `mflowOwn: true` is run, in the background. Write nothing in that worktree while Codex runs. A run that fails, ends without a report or hits a usage limit: say so in one line and ask in one line, a) Claude applies it now, b) wait and run Codex again later.
4. **Check.** In the worktree, `git status` and `git diff`: only files the tasks name, nothing under `.mflow/`, `.agents/`, `.claude/`, `.codex/` or the agent files. Run the build and the unit tests yourself in the foreground, as the apply guidance says. Review the diff as `/mflow:review` does at the change's level, including its coding-standard check. Blockers and majors go back to Codex once, as a second brief that lists them by id, and are checked again; what is left, fix yourself or name to the user.
5. **Finish as apply does:** tick what is done in tasks.md, archive the change, commit in the worktree by name, push `feat/<change>`, add the `docs/reviews/pending.md` row (`By: codex` in its reason), then ask in one line about the merge.

## When it comes back

A report Claude ran the tool for is taken up at once, following the skill named here as if the user had typed it (CLAUDE.md, mflow steps); for a tool the user ran, the user types the command.
- analyze/review → `/mflow:assess @docs/ai/inbox/<file>` (it normalizes the file first).
- a `discuss-<NN>` brief → `/mflow:discuss <NN>`, which folds every tool's report into the doc.
- code on `agent/<…>/<id>` → `/mflow:review agent/<…>/<id>`, plus `/mflow:assess` on the done report; merge only after that verdict and the user's yes.
