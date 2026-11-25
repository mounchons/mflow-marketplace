---
name: monitor
description: "See every piece of work in this project at once, read-only, with the guide of what is left to do — by topic (what blocks, the changes not finished, the test, the review and the E2E tests not done, the decisions waiting for the user, the rest), in the order to do it, each with its command — and the page behind it: the features of the story map with their discussion documents, the documents and agenda, the branches against main, the merges, the changes, the rows waiting for test and review, change requests, hotspots and the unattended runs, as one HTML page inside .git, opened in the browser. Writes nothing in the tree."
disable-model-invocation: true
argument-hint: "[--no-open]"
---

The user wants to see the whole of the work at once, and what to do next, in order: what the system should have, what is discussed and approved, what is built, which changes still lack their test, review or E2E tests, which branches are still open or left behind, and what waits for them. This command reads; it never fixes, switches a branch, commits or runs another command, whatever the page shows.

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/monitor.mjs" --open`. Leave `--open` out when the user wrote `--no-open`, and on the web (`CLAUDE_CODE_REMOTE`), where no browser opens. It writes the page to `.git/mflow/monitor.html` (inside `.git`, so the tree stays clean; run it again for a fresh page) and prints JSON: `file`, `opened`, `counts`, `guide`, `storyMap` (why the story map could not be read, or null) and `problems`. When it prints `error`, tell the user why in one line and stop.

`guide` is seven topics in the order the work depends on, each `{ id, title, items }`, every item `{ n, text, command, ref }`, numbered across topics: blocked (`ต้องแก้ก่อน`), the changes not finished, the test, the review (after the test: a review without one gives no verdict), the E2E tests, the decisions waiting for the user, and the rest. E2E items say no `/mflow:e2e` record was found in `docs/reviews/tests/`, not that a screen has no tests: `/mflow:e2e` with no argument looks at the test files. E2E tests are written and run only on the user's call, once a screen has settled, so say under that topic, in one line, that these wait for that call and are not owed before the next step.

Reply in Thai, addressing the user as คุณ:
1. The page: the full path of `file`, and that it opened in the browser (or, when `opened` is false, to open that file).
2. **ลำดับงาน**: each topic as a heading `### <title> (<count>)`, in the order given, then its items as `<n>. <text>` and, on the next line, `→ \`<command>\`` when there is one (and the `ref` file in a few words when it helps). A topic with no items: `ไม่มี` under its heading, so the user sees that test, review and E2E were checked. At most 8 items per topic; past 8, one line saying how many more are on the page.
3. **เริ่มจากข้อไหน**: the first item's number and command, with one line of why it comes first (what it unblocks). When `blocked` is empty, say so in the same line.
4. One line of counts: features with a discussion document of all features, documents approved and in draft, branches open, left behind and in main, changes open, rows waiting for test and review, items in the guide.
5. When `storyMap` is not null, one line saying the features could not be read and why. When a feature's documents are marked ≈ on the page, they are an estimate from the documents its story-map line cites; `feature:` in a discussion document's frontmatter (`feature: P1-6a` or `feature: [6a, 6b]`) links it exactly.
6. Last line: the setup itself (the CLIs, the hooks, `/mflow:init` after an upgrade) is checked by `/mflow:help check setup`.

Run none of the commands in the guide: the user picks.
