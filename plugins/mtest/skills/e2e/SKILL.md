---
name: e2e
description: Write or update the E2E tests of one screen, or of one flow's E2E cases, and run only them with at most e2eMaxWorkers browsers, when the user calls it once the screen has settled; nothing else in mtest writes E2E tests.
disable-model-invocation: true
argument-hint: "[<screen> | flow <flow>] [what to cover]"
---

E2E tests drive the real pages in a browser. Written while a screen still changes, they must be
rewritten after every change, and a whole run starts many browsers at once. So mtest writes and runs
them only here, one screen or one flow at a time, when the user calls it. Everything else proves
behaviour with unit and integration tests. `/mtest:test e2e` runs every E2E test, also only on the
user's call.

## 1. Pick the target

- The E2E part in `.mtest/config.json` (`kind: "e2e"`), its folder and its Playwright config (helpers, fixtures, base URL, how it starts the app, `workers`). None: there is no E2E framework yet; say so and stop. Setting one up is a change of its own when the user asks for it.
- **No argument:** list the screens (the web app's routes or pages) and the flows with E2E cases waiting (`node "${CLAUDE_PLUGIN_ROOT}/scripts/flows.mjs" check`, `e2ePending`), each with its E2E test files (search the E2E folder for the route, the page's test ids or the case ids) and when the test files and the screen's files last changed (`git log -1`), so the user sees which have no tests and which changed after their tests. Ask which one, and stop.
- **`<screen>`:** its route, the roles that may open it (from the app's menu and permission code), its actions, and the flow cases that cross it.
- **`flow <flow>`:** the `e2e` cases of that flow doc.

Done when: one target is chosen, with its cases and its existing test files listed.

## 2. Write

- In the project's E2E conventions: its folder, helpers, fixtures or API mocks, login per role, and test names (the case id or the requirement id in the title). When the E2E tests are one ordered story on one database (`workers: 1`, tests that build on each other), add to the story in its order rather than writing a test that needs a fresh database.
- Cover: the page as each role that may open it, with only that role's rows and buttons, and a role that may not; each action; each E2E case of the target; filters and paging kept in the URL when the screen has them. "What to cover" in the argument narrows or adds to this.
- Write each new test's reference into the Test cell of its case in `mtest/flows/`.
- An existing test that fails because the screen changed on purpose (the requirement or the user says so) is updated. A test that fails because the screen breaks its flow keeps asserting the flow: report the defect with the fix as the next step. This command changes test files and flow docs only.

Done when: every E2E case of the target has a test, or the user narrowed it.

## 3. Run

Only the target's tests, in the foreground: `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" start --scope "e2e <target>"`, the build part when the E2E command needs a fresh build, `run.mjs part <e2e part> --args "<the test files, or -g \"<title>\">"`, then `run.mjs finish`. The runner keeps the browsers at most `e2eMaxWorkers` (4 by default), and mtest's hook refuses a Playwright command typed in the shell that asks for more or sets no cap anywhere. Playwright's default is half the CPU threads; that many browsers at once has crashed a laptop's graphics driver and restarted it. A story that depends on its order runs from its file, whole. Never the whole E2E set here: that is `/mtest:test e2e`.

Done when: the files ran, and the record has the passed, failed and skipped counts and the first line of each failure.

## 4. Report

Tell the user the test files written or changed, the result, any defect found in the screen, and the next step: the fix for a defect, or the next screen or flow with E2E cases waiting (`/mtest:e2e <screen>`). Write it into `mtest/STATUS.md` `## Now`.

Done when: the tests exist and ran, the record is in `mtest/runs/`, and the user has the result and the next command.
