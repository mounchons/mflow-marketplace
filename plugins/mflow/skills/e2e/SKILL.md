---
name: e2e
description: Write or update the E2E tests of one screen and run only them, when the user calls it once the screen has settled; nothing else in mflow writes or runs E2E tests.
disable-model-invocation: true
argument-hint: "[<screen> [what to cover]]"
---

E2E tests drive the real pages in a browser. Written while a screen still changes, they have to be rewritten after every change, and a whole run starts many browsers at once. So mflow writes and runs them only here, one screen at a time, when the user calls it. Tasks, `/opsx:apply`, `/mflow:screen` and the whole suite of `/mflow:test` prove behaviour with unit tests and the build. `/mflow:test e2e` runs every E2E test, also only on the user's call.

## 1. Pick the screen

- Read AGENTS.md `## Stack` (the E2E tests row) and `## Commands` (the E2E command and the build it needs). If `## Stack` is missing or its profile is `TODO`, ask first, as "Asking" in `${CLAUDE_PLUGIN_ROOT}/skills/init/references/stacks.md` describes, and write the section. No E2E framework in the project yet: say so and stop; setting one up is an `/opsx:propose` change.
- No argument: list the screens in `docs/ui/screens.md` with their E2E test files (or none), and when each test file and the screen's UI files last changed (`git log -1`), so the user sees which screens have no tests and which changed after their tests. Ask which one, and stop.
- `<screen>`: find its row in `docs/ui/screens.md` (route, roles, actions, rules) and what it must do: the scenarios in `openspec/specs/` and in open changes that cross it, the UAT or acceptance IDs AGENTS.md names, and its existing E2E test files (search the E2E folder for the route and the page's test ids).

Done when: one screen is chosen and its scenarios and existing test files are listed.

## 2. Write

- One test file per screen, or the files the project already has for it, in the project's E2E conventions: its folder, helpers, fixtures or API mocks, and the test names AGENTS.md asks for (such as the UAT Test ID).
- Cover: the page loads as each role in `Role(s)`, with only that role's rows and buttons; each action and each acceptance scenario that crosses this screen; the screenshots that §5 of `${CLAUDE_PLUGIN_ROOT}/skills/theme/references/responsive.md` names, when the project keeps them. "What to cover" in the argument narrows or adds to this.
- An existing test that fails because the screen changed on purpose (its spec or the user says so) is updated to the current behaviour. A test that fails because the screen breaks its spec keeps asserting the spec: report it as a defect in the screen, with the fix as the next step (`/opsx:apply` for a change in progress, `/mflow:screen <screen> …` for a prototype). This command changes test files only.

Done when: every scenario of the screen has a test, or the user narrowed the scope.

## 3. Run

- Only this screen's test files, in the foreground, after the build the E2E command needs (AGENTS.md `## Commands`), with at most 2 browsers at a time: `--workers=2` for Playwright Test. `e2eMaxWorkers` in `.mflow/config.json` raises the cap when the user wants more, and mflow's hook refuses a Playwright run above it or without `--workers`. Playwright's default is half the CPU threads, 10 on a 20-thread laptop; that many browsers at once has crashed a laptop's graphics driver and restarted the machine.
- Never the whole E2E suite here: that is `/mflow:test e2e`.
- When AGENTS.md marks the E2E command `(unverified)` and this run worked, remove the mark.

Done when: the files ran, with passed, failed and skipped counts and the first line of each failure.

## 4. Record

Write the run the way `/mflow:test` records one (its §3), with `Scope: e2e <screen>`. A record of one screen never counts as the whole suite.

Tell the user the test files written or changed, the result, any defect found in the screen, and the next step: the fix for a defect, or the next screen with no tests or changed after its tests (`/mflow:e2e <screen>`). Write it into STATUS.md `## Now`.

Done when: the screen's test files exist and ran, the record exists, and the user has the result and the next command.
