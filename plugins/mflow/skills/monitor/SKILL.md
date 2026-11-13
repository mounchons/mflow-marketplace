---
name: monitor
description: See every piece of work in this project on one page, read-only — the features of the story map in docs/vision.md with the discussion documents that cover each, every discussion document and agenda topic, the branches against main (open, left behind, already in main), the merges and latest commits on main, the changes, the rows waiting for test and review, change requests, hotspots, the unattended runs, and the list of what waits for the user — as one HTML page inside .git, opened in the browser. Writes nothing in the tree.
disable-model-invocation: true
argument-hint: "[--no-open]"
---

The user wants to see the whole of the work at once: what the system should have, what is discussed and approved, what is built, which branches are still open or left behind, and what waits for them. This command reads; it never fixes, switches a branch, commits or runs another command, whatever the page shows.

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/monitor.mjs" --open`. Leave `--open` out when the user wrote `--no-open`, and on the web (`CLAUDE_CODE_REMOTE`), where no browser opens. It writes the page to `.git/mflow/monitor.html` (inside `.git`, so the tree stays clean; run it again for a fresh page) and prints JSON: `file`, `opened`, `counts`, `waiting` (most urgent first, each a line in Thai), `storyMap` (why the story map could not be read, or null) and `problems`. When it prints `error`, tell the user why in one line and stop.

Reply in Thai, addressing the user as คุณ:
1. The page: the full path of `file`, and that it opened in the browser (or, when `opened` is false, to open that file).
2. **รอคุณ**: the `waiting` lines as given, numbered, at most 10; past 10, one line saying how many more are on the page.
3. One line of counts: features with a discussion document of all features, documents approved and in draft, branches open, left behind and in main, changes open, rows waiting for test and review.
4. When `storyMap` is not null, one line saying the features could not be read and why. When a feature's documents are marked ≈ on the page, they are an estimate from the documents its story-map line cites; `feature:` in a discussion document's frontmatter (`feature: P1-6a` or `feature: [6a, 6b]`) links it exactly.

Nothing more: no advice on what to do first unless the user asks.
