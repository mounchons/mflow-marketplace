---
name: handoff
description: End-of-day or before-switching handoff — a thorough STATUS.md entry, and optionally a brief for another AI tool to continue.
disable-model-invocation: true
argument-hint: "[--for codex|gemini|<tool>]"
---

The Stop hook asks for a short STATUS entry during work. This is the thorough version, for the end of a day, before a break of several days, or before another tool picks the work up.

1. **Collect facts, not recollection:** `git status`, `git log --oneline` since the last STATUS entry, `openspec list --json`, `backlog task list -s "In Progress" --plain`, the result of the test command from AGENTS.md.
2. **Rewrite `## Now`** in STATUS.md: focus (change name / task IDs), exact next step (the literal command or file to open), blocked on (who, what, since when), and state of the working tree (clean / uncommitted and why).
3. **Add one log entry:** Did / Decided (with Backlog decision or task IDs) / Learned (gotchas worth adding to AGENTS.md if they recur) / Next.
4. **Trim the log** to the newest 10 entries; fold older ones into a single summary line at the bottom.
5. **With `--for <tool>`:** also follow `${CLAUDE_PLUGIN_ROOT}/skills/delegate/SKILL.md` for the next task in mode `code`, so the other tool starts from a brief instead of the chat history. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.

Done when: someone who has seen none of today's conversation could continue from STATUS.md alone.
