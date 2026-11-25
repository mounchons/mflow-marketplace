---
name: worktree
description: "Give a change its own worktree and branch feat/<change>, so several sessions and tools (Claude Code, Codex, Antigravity, OpenCode) work at the same time without moving each other's checkout; list the worktrees, merge one into main, or remove one once merged."
disable-model-invocation: true
argument-hint: "<change> [--to claude|codex|antigravity|opencode] [--dir <path>] | list | merge <change> | remove <change>"
---

One change, one branch, one folder. Two sessions in one folder share its checkout, so a branch switch in one moves the other; a worktree per change keeps them apart. Everything mflow needs is committed (AGENTS.md, CLAUDE.md, `openspec/config.yaml`, `.agents/skills/`, `.claude/skills/`, `.mflow/config.json`), so every tool finds mflow in the worktree: Claude Code loads the main checkout's project-scope plugins in its worktrees and shares its auto memory, and Codex, Antigravity and OpenCode read AGENTS.md and `.agents/skills/`. The rules every tool follows there are in AGENTS.md `## Branches and worktrees`.

Scripts: `node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs" <command>`, run from the main checkout or any worktree.

## `<change>`: a worktree for a change

1. The change's proposal, when it exists, must be committed: the worktree holds committed files only. When `openspec/changes/<change>/` has uncommitted files here, commit them on this branch first, added by name.
2. Run `worktree.mjs new <change>` (`--dir <path>` when the user gave one). It makes `.claude/worktrees/<change>` in the main checkout on `feat/<change>` from `main` (the existing branch when there is one), copies the git-ignored files `.worktreeinclude` names, and adds `.claude/worktrees/` to `.gitignore` when missing. When `gitignored` is set, commit `.gitignore`. An error (the branch is checked out elsewhere, the folder exists) goes to the user as it is.
3. Install the dependencies in the new folder as AGENTS.md `## Commands` says (package restore, `npm install` per web project, `dotnet tool restore`), in the foreground. When AGENTS.md names none, say so in one line and leave it to the first build.
4. Tell the user, in a few lines: the folder, the branch, the files copied, every warning (a long path on Windows, no `.worktreeinclude`), and how to start the tool `--to` names (Claude Code when none) from `start`, in a new terminal, because this session stays where it is:
   - Claude Code: `start.claude`, then `/opsx:apply <change>` there.
   - Codex: `start.codex`, then ask it to apply `<change>` (its `openspec-apply-change` skill); `$mflow-test` and `$mflow-review` work there too. Give `notes.codex` with it: Codex's sandbox keeps `.git` read-only everywhere, so it asks before each `git commit`; approve it, or Claude commits the work with `merge`.
   - Antigravity: `start.antigravity` (with `notes.antigravity`); OpenCode: `start.opencode`; then ask it to apply `<change>`.
   Apply in that worktree stays on `feat/<change>` and, when the change is done, asks to merge it.

## `list`

Run `worktree.mjs list` and show each worktree: its branch, the change a `feat/` branch names, its folder, and which one is the main checkout and which one is this session's. For each `feat/` branch say whether main already holds it (`git merge-base --is-ancestor feat/<change> main`).

## `merge <change>`: from the main checkout

For a change applied in another worktree, when its session or tool is finished. Merge only on the user's word; `/mflow:worktree merge` typed by the user is that word.

1. `worktree.mjs list` gives the folder of `feat/<change>`. It must have no uncommitted changes (`git -C <folder> status --porcelain`). When it has some, ask in one line whether its tool is done: on a yes, commit them on `feat/<change>`, added by name (a tool that could not commit, such as Codex in its sandbox), and go on; otherwise stop.
2. In that folder: `git -C <folder> merge main`. Settle a conflict there; for `openspec/specs/`, keep the requirements of both sides. Then run the change's tests there (the build, the unit tests and the test classes it added, filtered as `/opsx:apply` does after a task), and commit the merge.
3. Here, on `main`: `git merge --no-ff feat/<change> -m "Merge feat/<change>"`. When this checkout is not on `main`, or git would overwrite uncommitted files, stop and say why.
4. Write the STATUS.md entry for the merge (the change, its merge commit, what is next) and commit it. Do not push; ask about the push once in one line.
5. The worktree stays until the user says to remove it: name `/mflow:worktree remove <change>`.

## `remove <change>`

Run `worktree.mjs remove <change>`. It refuses when the worktree has uncommitted changes, when `feat/<change>` is not merged into `main`, and for the main checkout or this session's own folder; give its reason as it is. On success it also deletes the merged branch (`git branch -d`). It never deletes unmerged work.

Done when: the user has the folder and the command to start the tool (`<change>`), the list (`list`), the merge commit and the STATUS.md entry (`merge`), or the removal (`remove`).
