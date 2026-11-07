---
name: e2e
description: Write or update the E2E tests of one screen, or of one flow's E2E cases (people taking turns, a setting made on the admin web as the supplier web shows it), and run only them with at most e2eMaxWorkers browsers, when the user calls it once the screen has settled; nothing else in mtest writes E2E tests.
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
- **`flow <flow>`:** the `e2e` cases of that flow doc. When a step sets something once (a system setting, a master list, a switch, a template, a required field, a limit) that another person's web shows, list for each such setting where it is set, which web, screens and people show it, each of its states (on and off, each value), whom it reaches, and when the flow doc says it takes effect.
- **Several webs:** when the flow's people work on different web apps (an admin web and a supplier web, each with its own address or sign-in), find each web's base URL and how it starts for E2E in the Playwright config and in AGENTS.md. Missing: ask the user, and write it under `## Testing (mtest)` in AGENTS.md.

Done when: one target is chosen, with its cases and its existing test files listed.

## 2. Write

- In the project's E2E conventions: its folder, helpers, fixtures or API mocks, login per role, and test names (the case id or the requirement id in the title). When the E2E tests are one ordered story on one database (`workers: 1`, tests that build on each other), add to the story in its order rather than writing a test that needs a fresh database.
- Cover: the page as each role that may open it, with only that role's rows and buttons, and a role that may not; each action; each E2E case of the target; filters and paging kept in the URL when the screen has them. For a flow where several people act, also each `handoff` and `isolation` case, as "A flow with several people" below says. "What to cover" in the argument narrows or adds to this.
- Write each new test's reference into the Test cell of its case in `mtest/flows/`.
- An existing test that fails because the screen changed on purpose (the requirement or the user says so) is updated. A test that fails because the screen breaks its flow keeps asserting the flow: report the defect with the fix as the next step. This command changes test files and flow docs only.

Done when: every E2E case of the target has a test, or the user narrowed it.

## A flow with several people

A flow such as set up a survey → invite suppliers → a supplier answers and attaches files → collect →
send back or keep in the library → build a document from chosen files → approve, reject or withdraw →
the supplier acknowledges is proven in the browser one path per test, the people taking turns in it:
- **One browser context per person** in the same test (`browser.newContext()`, each logged in as its
  role, or from the project's saved login states). Contexts share the worker's one browser, so this adds
  no browsers to the cap. Switch to the context of each step's Actor in the flow doc.
- **Links that people get by mail** (an invitation, a reset, a notice): read them from the project's fake
  mailer, outbox table or test endpoint, the way its integration tests do. Never from real mail. No such
  seam in the project: say so; adding one is a change of its own.
- **Hand-offs**: keep the values the sender set in the test's own variables (questions, options,
  required files, deadline, message) and, on the receiver's page, assert each one is shown as set, and
  that a setting that hides something hides it. After each decision (send back, reject, approve,
  withdraw, acknowledge), assert on every party's page the new state, the reason, and the actions that
  are now offered and the ones that are gone.
- **Isolation**: a second account of the outside role (supplier B, invited to its own survey or to none)
  opens supplier A's record by its direct URL, A's file download URL and its own list and notifications:
  nothing of A's shows, and the direct links are refused. Check the API answer too when the page only
  hides it.
- **Files**: upload from the project's fixtures (`setInputFiles`); for a file or document the system
  builds, wait for the download and assert its name, type and size, and its text when the project has a
  reader for it (a PDF text extract) or an endpoint that returns its content.
- **Background steps** (collecting answers, building a document, sending mail): wait for the state the
  flow doc names, on the page or through the API, within the project's timeout. Never a fixed sleep.
- **Data**: each test makes its own records with unique names, so paths do not depend on each other,
  unless the project's E2E tests are written as one ordered story on one database.
- **Several webs**: when the people work on different web apps, open each person's context on its own
  web (`browser.newContext({ baseURL, storageState })` with that web's base URL and that web's saved
  login), never every context on the one `use.baseURL`. Both webs run before the test: from the
  Playwright config's `webServer` list, or already running as AGENTS.md says. A link in a mail that
  leads to the other web is followed as it is, and the test asserts it opens on that web's address.
  Still one browser per worker.
- **A setting that reaches another web**: for a value a person sets once for everyone or for a group
  (not a value of one record, which the hand-offs above cover), test each state: set it on the admin
  side, then on the receiver's page, reloaded or opened again after the change, assert it shows exactly
  as set; then turn it off or change it, and assert the page follows, and that what was turned off is
  gone by its direct link too, with the API answer checked when the page only hides it. Wait for the
  new state within the project's timeout, never a fixed sleep. A page that does not follow is a defect,
  unless the flow doc says when the change takes effect (a cache's time, the next sign-in); then test
  that. A setting for some suppliers only is also asserted absent for supplier B outside it.
- **Shared settings, one test at a time**: a setting the whole system reads changes what other tests
  see while they run, since several workers run at once. Prefer a setting scoped to records the test
  made (its own supplier group or category). When it can only be system-wide, keep such tests in one
  file in serial mode, run apart from the other E2E files (their own Playwright project, which the
  others list in `dependencies`), and put the value back as it was in `afterAll` or a `finally`, even
  when a test fails. Never leave a changed shared setting behind.
- Name each test after its case (`C07 supplier B cannot open supplier A's survey`) and write it into the
  case's Test cell.

## 3. Run

Only the target's tests, in the foreground: `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" start --scope "e2e <target>"`, the build part when the E2E command needs a fresh build, `run.mjs part <e2e part> --args "<the test files, or -g \"<title>\">"`, then `run.mjs finish`. The runner keeps the browsers at most `e2eMaxWorkers` (4 by default), and mtest's hook refuses a Playwright command typed in the shell that asks for more or sets no cap anywhere. Playwright's default is half the CPU threads; that many browsers at once has crashed a laptop's graphics driver and restarted it. A story that depends on its order runs from its file, whole. Never the whole E2E set here: that is `/mtest:test e2e`.

Done when: the files ran, and the record has the passed, failed and skipped counts and the first line of each failure.

## 4. Report

Tell the user the test files written or changed, the result, any defect found in the screen, and the next step: the fix for a defect, or the next screen or flow with E2E cases waiting (`/mtest:e2e <screen>`). Write it into `mtest/STATUS.md` `## Now`.

Done when: the tests exist and ran, the record is in `mtest/runs/`, and the user has the result and the next command.
