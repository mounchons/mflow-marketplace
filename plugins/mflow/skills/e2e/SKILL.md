---
name: e2e
description: Write or update the E2E tests of one screen, or of one flow that crosses screens and people (an invitation answered by a supplier, then collected, approved or sent back), and run only them, when the user calls it once the screens have settled; nothing else in mflow writes or runs E2E tests.
disable-model-invocation: true
argument-hint: "[<screen> [what to cover] | flow <capability or scenario>]"
---

E2E tests drive the real pages in a browser. Written while a screen still changes, they have to be rewritten after every change, and a whole run starts many browsers at once. So mflow writes and runs them only here, one screen at a time, when the user calls it. Tasks, `/opsx:apply`, `/mflow:screen` and the whole suite of `/mflow:test` prove behaviour with unit tests and the build. `/mflow:test e2e` runs every E2E test, also only on the user's call.

## 1. Pick the screen

- Read AGENTS.md `## Stack` (the E2E tests row) and `## Commands` (the E2E command and the build it needs). If `## Stack` is missing or its profile is `TODO`, ask first, as "Asking" in `${CLAUDE_PLUGIN_ROOT}/skills/init/references/stacks.md` describes, and write the section. No E2E framework in the project yet: say so and stop; setting one up is an `/opsx:propose` change.
- No argument: list the screens in `docs/ui/screens.md` with their E2E test files (or none), and when each test file and the screen's UI files last changed (`git log -1`), so the user sees which screens have no tests and which changed after their tests. Ask which one, and stop.
- `<screen>`: find its row in `docs/ui/screens.md` (route, roles, actions, rules) and what it must do: the scenarios in `openspec/specs/` and in open changes that cross it, the UAT or acceptance IDs AGENTS.md names, and its existing E2E test files (search the E2E folder for the route and the page's test ids).
- `flow <capability or scenario>`: the scenarios of that capability in `openspec/specs/` (and in open changes), or the one named, that cross several screens or several roles, such as set up a survey → invite suppliers → a supplier answers and attaches files → collect → send back or keep in the library → build a document from chosen files → approve, reject or withdraw → the supplier acknowledges. List its steps in order, each with its screen (from `docs/ui/screens.md`) and the role that acts, then every path the scenarios name (each send back, reject and withdraw), and show the list to the user before writing.

Done when: one screen or one flow is chosen and its scenarios and existing test files are listed.

## 2. Write

- One test file per screen, or the files the project already has for it, in the project's E2E conventions: its folder, helpers, fixtures or API mocks, and the test names AGENTS.md asks for (such as the UAT Test ID).
- Cover: the page loads as each role in `Role(s)`, with only that role's rows and buttons; each action and each acceptance scenario that crosses this screen; the screenshots that §5 of `${CLAUDE_PLUGIN_ROOT}/skills/theme/references/responsive.md` names, when the project keeps them. For a flow: every path from its first step to its end, and the hand-offs and the second party below. "What to cover" in the argument narrows or adds to this.
- An existing test that fails because the screen changed on purpose (its spec or the user says so) is updated to the current behaviour. A test that fails because the screen breaks its spec keeps asserting the spec: report it as a defect in the screen, with the fix as the next step (`/opsx:apply` for a change in progress, `/mflow:screen <screen> …` for a prototype). This command changes test files only.

Done when: every scenario of the screen or the flow has a test, or the user narrowed the scope.

## A flow across screens and people

One test per path, the people taking turns in it:
- **One browser context per role** in the same test (`browser.newContext()`, each logged in as its role, or from the project's saved login states; in prototype mode, the role switcher of each context). Contexts share the worker's one browser, so the cap on browsers still holds.
- **Links people get by mail** (an invitation, a notice): from the project's fake mailer, outbox table or test endpoint, as its integration tests read them, never from real mail. No such seam: say so; adding one is an `/opsx:propose` change.
- **What was set arrives as set:** keep the values the sender set in the test's own variables (questions, options, required files, deadline, message) and assert, on the receiver's page, each one shown as set, and that a setting that hides something hides it. The answers and files sent back reach the next role and the place they are kept (a library), and a document built from chosen files carries them.
- **Every decision shows on both sides:** after send back, reject, approve, withdraw or acknowledge, assert on each role's page the new state, the reason, and the actions now offered and the ones gone.
- **A second outside party:** a second account of the outside role (supplier B) opens supplier A's record by its direct URL, A's file download URL, its own list, search, counts and notifications: nothing of A's shows, and the direct links are refused. Check the API answer too when the page only hides it.
- **Files:** upload from the project's fixtures (`setInputFiles`); for a file or document the system builds, wait for the download and assert its name, type and size, and its text when the project can read it.
- **Background steps** (collecting answers, building a document, sending mail): wait for the state on the page or through the API, within the project's timeout. Never a fixed sleep.
- **Data:** each test makes its own records with unique names, unless the project's E2E tests are one ordered story on one database.

A scenario of the flow that the specs do not have (what the supplier sees of a setting, what another supplier sees) is not invented in the test: report it as missing from the spec, with the scenario to add, and test what the spec says.

## 3. Run

- Only this screen's or this flow's test files, in the foreground, after the build the E2E command needs (AGENTS.md `## Commands`), with at most 2 browsers at a time: `--workers=2` for Playwright Test. `e2eMaxWorkers` in `.mflow/config.json` raises the cap when the user wants more, and mflow's hook refuses a Playwright run above it or without `--workers`. Playwright's default is half the CPU threads, 10 on a 20-thread laptop; that many browsers at once has crashed a laptop's graphics driver and restarted the machine.
- Never the whole E2E suite here: that is `/mflow:test e2e`.
- When AGENTS.md marks the E2E command `(unverified)` and this run worked, remove the mark.

Done when: the files ran, with passed, failed and skipped counts and the first line of each failure.

## 4. Record

Write the run the way `/mflow:test` records one (its §3), with `Scope: e2e <screen>` or `Scope: e2e flow <name>`. A record of one screen or one flow never counts as the whole suite.

Tell the user the test files written or changed, the result, any defect found in the screen, and the next step: the fix for a defect, or the next screen with no tests or changed after its tests (`/mflow:e2e <screen>`), or the next flow (`/mflow:e2e flow <name>`); and any scenario found missing from the spec, as an `/opsx:propose` change. Write it into STATUS.md `## Now`.

Done when: the screen's test files exist and ran, the record exists, and the user has the result and the next command.
