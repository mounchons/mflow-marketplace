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
- **`flow <flow>`:** the `e2e` cases of that flow doc. A step no person takes (an Actor that is an external system, an import or a scheduled job, a mail the system sends) is listed with how the test makes it happen and how it sees it happened, as [references/chain.md](references/chain.md) shows: the project's fake of that system and its test endpoints, the job's trigger, the fake mailer. A step with no such seam is reported, with the seam to add as a change of its own. When a step sets something once (a system setting, a master list, a switch, a template, a required field, a limit) that another person's web shows, list for each such setting where it is set, which web, screens and people show it (the web from the app folder its route lives in), each of its states (on and off, each value), whom it reaches, and when the flow doc says it takes effect.
- **Several webs:** when the flow's people work on different web apps (an admin web and a supplier web, each with its own address or sign-in), find in the Playwright config and in AGENTS.md each web's base URL, how it starts for E2E (the config's `webServer` list, or a stack command such as `docker compose … up -d`), and how each Playwright project reaches the API: mocked in the test (`page.route`, a mock server) or the real API. Missing: ask the user, and write it under `## Testing (mtest)` in AGENTS.md.
- **Where each part of a setting is proven.** When the projects of each web mock the API, a setting that crosses webs is proven in three parts, each a case of the flow with its own test: (1) the admin web sends it (`e2e`: that page asserts the request it sends, in each state); (2) the API joins it (`integration`: what is saved through the admin endpoint is what the receiver's endpoint answers, in each state, to whom it reaches and not to the others, and from when); (3) the receiver web shows it (`e2e`: that page draws each state from a mocked answer typed by the project's API contract, with the same values as part 1, from one shared constant or fixture). List, for each setting, the case and test of each part or `missing`. A missing part 2 is a case to add at `integration` level; E2E does not stand in for it. A joined test (both webs on the real API) is one per setting, for its main path, in the project that runs the real API, and only when the project has one.

Done when: one target is chosen, with its cases and its existing test files listed, and for a setting across webs the case and test of each of its three parts or `missing`.

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
- **Mail is a step** (an invitation, a reset, a notice, an approval): read it from the project's fake
  mailer, outbox table or test endpoint, the way its integration tests do, never from real mail, after
  waiting for the mail line to have sent it. Assert who got it and who did not (supplier A, not supplier
  B), its subject and the values the sender set, and that its link opens on the receiving web. No such
  seam in the project: say so; adding one is a change of its own.
- **Data from another system** (an external API, a document store, a file drop): put the input into the
  project's fake of that system as the real one would deliver it, with names unique to the run; start the
  import through the project's trigger (an endpoint or the page that runs it), never by waiting for its
  schedule; poll until a run newer than the test's start has finished and the record is there. Never call
  the real external system.
- **A long chain, one test, a step each**: the main path walks every step through the screens in one
  test, each business step a `test.step` named with its step id in the flow doc, so a failure names the
  step, with a timeout set for the whole chain. Each other path (reject, withdraw, a new revision from the
  external system) is its own test that arranges the steps before its branch point through the project's
  API helpers and walks only the branch on the screens. Such a chain needs the real API, its jobs and its
  mail queue: it runs in the project on the real stack. A sketch: [references/chain.md](references/chain.md).
- **The project's helpers first**: sign-in per web, API calls with the session and CSRF token, the fake
  of each external system, the job trigger, the mail reader, the test clock and the cleanup are the
  project's own; look for them in its E2E helpers before writing one, and write a missing one once,
  beside the others.
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
  web (`browser.newContext({ baseURL, storageState })` with that web's base URL and that web's login: a
  saved state, or the project's sign-in helper that signs in through the API and then opens the page),
  never every context on the one `use.baseURL`. Two webs on one host with different ports share their
  cookies, because cookies do not keep ports apart: a context per web keeps the sessions apart, and one
  context for both works only when the webs name their cookies differently. Both webs run before the
  test: from the Playwright config's `webServer` list, or the stack command AGENTS.md names; a stack that
  is not up is said so before the run, not left to fail. A link in a mail that leads to the other web is
  followed as it is, and the test asserts it opens on that web's address. Still one browser per worker.
- **Calls to the API from the test** (to arrange data, to check what a page only hides, to put things
  back) go through the project's helper that sends what the web sends (its session and CSRF token), or
  the API refuses them before they reach the check the test means to prove.
- **A setting that reaches another web**: for a value a person sets once for everyone or for a group
  (not a value of one record, which the hand-offs above cover), test each state. In a project on the
  real API: set it on the admin web, then on the receiver's page, reloaded or opened again after the
  change, assert it shows exactly as set; turn it off or change it, and assert the page follows, that
  what was turned off is gone by its direct link too, and the API answer when the page only hides it. In
  a project that mocks the API, setting it on one page and looking at the other shows only the mock:
  write parts 1 and 3 of §1 instead, the same values in both. Wait for the new state within the
  project's timeout, never a fixed sleep. A page that does not follow is a defect, unless the flow doc
  says when the change takes effect (a cache's time, the next sign-in); then test that. A setting for
  some suppliers only is also asserted absent for supplier B outside it.
- **Data every test reads** (settings, groups' grants and scopes, templates, seed records, the test
  clock): a test that changes it changes what the other tests see while they run. Prefer a value scoped
  to records the test made (its own group or category). Otherwise the test goes in a file of tests that
  write (such as `*.writes.spec.ts`), run in a Playwright project of its own after the read-only ones:
  that project lists the read-only project in `dependencies` and has `workers: 1`, because serial mode
  alone keeps one file's tests in order but still runs files side by side. Each test puts back what it
  changed in a `finally` (or `afterEach`), never only at the end of the test body, where a failure
  midway leaves it changed for every later test and run. Records a test makes carry a run stamp in their
  names (`Date.now().toString(36)`), so a second run on the same database does not collide, and records
  the rules forbid deleting are cleaned up the way the rules allow (withdraw, then reject).
- Name each test after its case (`C07 supplier B cannot open supplier A's survey`) and write it into the
  case's Test cell.

## 3. Run

Only the target's tests, in the foreground: `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" start --scope "e2e <target>"`, the build part when the E2E command needs a fresh build, `run.mjs part <e2e part> --args "<the test files, or -g \"<title>\">"`, then `run.mjs finish`. The runner keeps the browsers at most `e2eMaxWorkers` (4 by default), and mtest's hook refuses a Playwright command typed in the shell that asks for more or sets no cap anywhere. Playwright's default is half the CPU threads; that many browsers at once has crashed a laptop's graphics driver and restarted it. A story that depends on its order runs from its file, whole. Never the whole E2E set here: that is `/mtest:test e2e`.

Done when: the files ran, and the record has the passed, failed and skipped counts and the first line of each failure.

## 4. Report

Tell the user the test files written or changed, the result, any defect found in the screen, and the next step: the fix for a defect, or the next screen or flow with E2E cases waiting (`/mtest:e2e <screen>`). Write it into `mtest/STATUS.md` `## Now`.

Done when: the tests exist and ran, the record is in `mtest/runs/`, and the user has the result and the next command.
