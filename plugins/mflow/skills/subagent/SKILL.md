---
name: subagent
description: Switch the apply subagent (mflow:dev, Sonnet 5.5) on or off for this project, or show whether it is on. It is off until switched on.
disable-model-invocation: true
argument-hint: "[on | off | status] [--shared]"
---

When the apply subagent is on, `/opsx:apply` hands the code changes of each task to `mflow:dev` (guidance in `openspec/config.yaml`). It is **off until switched on**: the mflow `PreToolUse` hook denies `mflow:dev` unless the project says on, and the session briefing has a line only when it is on. Nothing under `openspec/` or `.claude/` changes.

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-subagent.mjs" <on|off|status> [--shared]`, with `status` when `$ARGUMENTS` is empty.

- Default scope is `.mflow/local.json`: this machine only. The script adds it to `.gitignore` when it creates the file.
- `--shared` writes `applySubagent` in `.mflow/config.json`, which is committed and applies to everyone on the project. Use it only when the user says it is for the team. A local value overrides it on that machine.
- The state lives at the project root, so it holds wherever in the project Claude Code is opened.
- The script never rewrites a file it cannot parse; show its error and stop.

Tell the user, in one or two lines: on or off now, which file decided it (`source`: local, shared or default), and every entry under `warnings`. The ones that matter:
- a permission rule blocks it: a Claude Code deny rule (for example `Agent(mflow:dev)` in `~/.claude/settings.json`) keeps it off whatever mflow says; say which file, to be removed by hand.
- local overrides shared: after `--shared`, this machine's `.mflow/local.json` still decides here.
- no apply guidance: the project was initialised before 0.16, so `/opsx:apply` will not use the subagent even when on. Point to the 0.16 row of the manual's known issues, or `/mflow:init` to merge it.

Off takes effect at once: the hook checks the setting on every call. On takes effect from the next session or after `/clear`, when the briefing line that the apply guidance reads appears. To skip the subagent for one run only while it is on, no command is needed: say so in the `/opsx:apply` message.

Done when: the user knows the state and the next command (after `on`: `/clear`, then `/opsx:apply <change>`).
