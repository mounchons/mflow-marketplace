---
name: delegate
description: Hand a task, change, analysis or code review to another AI tool (Codex, OpenCode, Gemini, a chat UI, or any tool added later) through a self-contained brief with a fixed output contract, so its work comes back in a form Claude can verify.
disable-model-invocation: true
argument-hint: "<TASK-ID | change-name | hotspot-slug | \"topic\"> --mode analyze|review|code [--to <tool>]"
---

Another tool does not share this conversation. It gets a **brief**: one file that says what to do, what to read, what not to touch, and what its final answer must contain. The brief is the contract; the answer is checked by `/mflow:assess` (analyze, review) or `/mflow:review` (code). This skill writes the brief and shows the command; the user runs the other tool.

`--to` is optional. Without it (or `--to any`) the brief is tool-neutral and the command list covers every registered tool. Tools live in a registry (defaults in the plugin, overrides and new tools under `tools` in `.mflow/config.json`), so a tool added next year needs a config entry, not a new plugin version.

Brief template and output contracts: [references/brief-template.md](references/brief-template.md).

## 1. Resolve the subject

- `TASK-…`: `backlog task <id> --plain`; the task's description, acceptance criteria and references define the goal.
- change name: `openspec/changes/<name>/` (proposal, delta specs, tasks).
- hotspot slug: `docs/hotspots/<slug>/map.md` and `rules.md`.
- `discuss-<NN>-r<revision>`: the discussion doc `docs/discuss/NN-<slug>.md` and the sources in its frontmatter. Point to the text versions of the sources in `.mflow/cache/<name>.md` that `consult` prepares, never to a binary, and never pack `docs/ai-inbox/`: tools answer independently. Use the "discuss" output contract, and paste the topic's checklist section from `${CLAUDE_PLUGIN_ROOT}/skills/discuss/references/topics.md` into the brief, because the plugin folder is outside the repo. `/mflow:discuss <NN> consult` drives this case. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.
- quoted topic: no file defines it. Choose the files to examine from AGENTS.md's architecture and a code search, and list them explicitly in the brief's Scope so the user can check them.

Done when: the goal fits in two sentences and every path the tool needs is known.

## 2. Write the brief

`.mflow/briefs/<date>-<id>-<mode>-<tool or any>.md` from the template. Pointers, not pasted content. The output contract for the mode is copied in full, including the mandatory `Understanding` and `Files read` sections.

For a tool without repo access (`--to chat`, or the user says it is a web chat), also build a context pack of everything in Read first and Scope:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/context-pack.mjs" --out .mflow/briefs/<brief>.pack.md <paths...>`
and add "Attach: <pack file>" to the brief. Heed the size warning; narrow the paths rather than sending a truncated pack. Show the user the script's `skipped` list: files that may hold secrets are left out on purpose.

Done when: the brief alone is enough for a tool that has never seen this project.

## 3. Workspace (mode `code` only)

- Worktree and branch so Claude and the other tool never share a checkout: `git worktree add ../<repo>-agent-<id> -b agent/<tool or any>/<id>`.
- For an OpenSpec change, the tool implements `openspec/changes/<name>/tasks.md`; tools set up by `openspec init --tools …` have OpenSpec skills (Codex: `$openspec-apply-change`).
- Backlog: assignee `@<tool>` (or `@agent`), status `In Progress`, note pointing at the brief.

## 4. Show the command

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/delegate-cmd.mjs" --mode <mode> --tool <tool or any> --brief <brief> --out docs/ai-inbox/<date>-{tool}-<id>.md [--worktree <dir>]` and present its result. The script replaces `{tool}` with each tool's name, so with `--tool any` every tool writes its own report instead of overwriting one file:
- Both `pwsh` and `bash` lines when available; the PowerShell line sets UTF-8 so Thai text in the brief survives the pipe.
- Mark entries with `verified: false` as "check `--help` first".
- `known: false`: ask the user for that tool's non-interactive command (prompt from file or stdin, read-only option, how output is saved), write it into `.mflow/config.json` under `tools.<name>.<mode>.bash` / `.pwsh` using `{brief}` `{out}` `{worktree}`, then rerun the script.
- Interactive alternative for any CLI tool: open it in the repo and say "read <brief path> and follow it; give the report as your final message and edit no files".

Done when: the brief exists, the command is shown, and STATUS.md records what was delegated, to whom, and where the answer will land.

## When it comes back

- analyze/review → `/mflow:assess @docs/ai-inbox/<file>` (it normalizes the file first).
- a `discuss-<NN>` brief → `/mflow:discuss <NN>`, which folds every tool's report into the doc.
- code on `agent/<…>/<id>` → `/mflow:review agent/<…>/<id>`, plus `/mflow:assess` on the done report; merge only after that verdict and the user's yes.
