---
name: subagent
description: Switch the apply subagent (mflow:dev, Sonnet 5.5) on or off for this project, or show whether it is on.
disable-model-invocation: true
argument-hint: "[on | off | status] [--shared]"
---

`/opsx:apply` hands the code changes of each task to the `mflow:dev` subagent (guidance in `openspec/config.yaml`). Switching it off adds a Claude Code permission rule that denies `Agent(mflow:dev)`; the guidance then tells Claude to implement every task itself. Nothing under `openspec/` changes.

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-subagent.mjs" <on|off|status> [--shared]`, with `status` when `$ARGUMENTS` is empty.

- Default scope is `.claude/settings.local.json`: this machine only, not committed. The script adds it to `.gitignore` when it creates the file.
- `--shared` writes `.claude/settings.json`, which is committed and applies to everyone on the project. Use it only when the user says it is for the team.
- The script never rewrites a settings file it cannot parse; show its error and stop.

Tell the user, in one or two lines: on or off now, which file holds the rule, and every entry under `warnings`. The ones that matter:
- `still off`: another file still denies the agent. Say which file and what to do, as the warning gives it.
- no apply guidance: the project was initialised before 0.16, so `/opsx:apply` will not use the subagent even when on. Point to the 0.16 row of the manual's known issues, or `/mflow:init` to merge it.
- opened below the project root (`openedBelowRoot`): Claude Code reads permission rules only from the folder it was opened in, so the state and any change apply only to sessions opened there, and a rule at the root does not reach them. Recommend opening Claude Code at the project root.

The change applies from the next `/opsx:apply`. To skip the subagent for one run only, no command is needed: say so in the `/opsx:apply` message.

Done when: the user knows the state and the next command (`/opsx:apply <change>`).
