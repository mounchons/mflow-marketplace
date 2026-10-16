---
name: review
description: Review code (from Claude, Codex, or the user) against the OpenSpec change, AGENTS.md conventions, the design system and the domain rules, in full or short as the change needs, prove the tests from /mflow:test records (a whole run, or a since run on an earlier whole run), and give a verdict with findings.
disable-model-invocation: true
argument-hint: "[<branch> | --uncommitted | <change-name> | <TASK-ID>] [--short]"
---

A review answers one question: does this diff do what the spec says, the way this project does things, with proof? It reports; it fixes nothing unless asked afterwards.

## Levels

How much review a change needs follows from the files it touched (`git diff --name-only` of the target). `/opsx:apply` and `/mflow:test` name the level as the next step; the user's word decides.
- **full** (the default): the change touches business rules (domain or application code), permissions or data scope, queries, migrations or the data model, an integration with another system, or startup and dependency wiring. Every check below.
- **short** (`--short`): any other code change, such as a screen that only shows what the API sends, and a fix after a review, whose diff then starts at the commit the last report of the target reviewed (`Reviewed: … at <commit>`). Checks 1 and 2 for what changed, each finding of that report marked fixed or still open, and checks 3–7 only on the changed lines.
- **skip**: only documents (Markdown, `openspec/`, `backlog/`, `docs/`, `STATUS.md`), stylesheets and tokens, or the text of labels (the diff changes no condition, query or data shape). No review: merge on the user's yes, with a passing `/mflow:test` record at the commit when anything but documents changed.

## 1. Scope the diff

- Branch: `git diff main...<branch>`; `--uncommitted`: working tree; change name: the commits and files for `openspec/changes/<name>/`; TASK-ID: the task's `modifiedFiles` and linked commits.
- Load what the diff must satisfy: the change's `proposal.md`, `tasks.md` and delta specs; the Backlog task's acceptance criteria; AGENTS.md, including `## Stack` (if it is missing or its profile is `TODO`, ask first, as "Asking" in `${CLAUDE_PLUGIN_ROOT}/skills/init/references/stacks.md` describes, and write the section); `docs/ui/design-system.md` for view changes; the hotspot `rules.md` if it implements one.

## 2. Check

1. **Spec coverage:** each Scenario in the delta specs and each acceptance criterion has a test that exercises it. List any without one. A scenario that crosses the UI is covered by unit tests of the rules and services behind it; its E2E test is written per screen with `/mflow:e2e` when the user calls it, so a missing one is not a finding: name those screens in one line, `E2E on request: <screens>`.
2. **Tests:** proof of the whole suite at the reviewed commit, as `/mflow:test` defines it: the newest record in `docs/reviews/tests/` with `Tested: … at <the reviewed commit>`, no "with uncommitted changes", and `Scope: whole suite` or `Scope: since <base>`. Cite it (file, result, counts) and do not run it again. Without one, when a whole-suite record exists at an ancestor of the reviewed commit, run the "Since the last whole run" step of `/mflow:test` yourself and record it the same way; it usually takes minutes. Ask once only when that step needs the whole suite or there is no base, unless the review message already says which: a) run the whole suite now, the way `/mflow:test` does and recorded the same way (say how long the newest record took), or b) review the rest now and leave the tests to `/mflow:test`. `--uncommitted` runs the `since` step over the working tree; nothing can reuse that record. Report the actual output summary. A review never runs E2E tests.
3. **Domain placement:** business rules live in the domain layer (aggregates, value objects, domain services); controllers, views and repositories do not re-implement them. Invariants from rules.md are enforced where their owning aggregate is.
4. **UI kit:** views use kit components and tokens only; lists use DataTable with paging in the database query, the FilterPanel above the table, and header search only on columns marked searchable; a row's details open through `QuickView` and compared features through the icon column with a kit icon set; statuses, avatars, KPI tiles and category icons take their hues from the kit, never from the screen; dates go through `FormField` type `date` or `DateRangeField` (no `<input type="date">`, no date formatting in a screen) and reach the server as ISO `YYYY-MM-DD`; screen files hold no media or container queries, fixed widths or page-level grids; the changed pages pass at the acceptance sizes in `docs/ui/design-system.md` (§5 of `${CLAUDE_PLUGIN_ROOT}/skills/theme/references/responsive.md`: screenshots at those sizes, or an `/mflow:e2e` record of the page).
5. **Data access:** queries page and filter in the database, no N+1 in lists, migrations reversible. Entities, columns, types, precision and nullability match `PrototypeData/README.md` and the approved data-model doc, or the change states the difference; the indexes the doc lists for screen filters exist.
6. **Security basics:** a `Permissions` key checked on every endpoint that changes data, and on every read the access-control discussion doc restricts; data scope applied in the query, not the view, including each quick-view endpoint, which checks the list's view key and scope; restricted fields masked in the ViewModel mapping that exports reuse; no role-name comparisons (contract: "Current user, permissions and the role switcher" in `${CLAUDE_PLUGIN_ROOT}/skills/screen/references/prototype-data.md`); `FakeCurrentUser` and `/_prototype/*`, or their equivalents, registered only under the prototype-mode flag in AGENTS.md `## Stack` (`Prototype:UseFakeData` in the .NET profiles), with the startup check that refuses the flag outside a development or prototype environment and its negative tests ("Production safety" in the same file); no raw SQL built from input, no secrets in code or config.
7. **Leftovers:** `// PROTOTYPE:` markers still in code that this change was meant to replace; TODOs without a task.

Done when: every check has a result, with file:line for each problem.

## 3. Report

Write `docs/reviews/code/<date>-<target>.md`: the commit reviewed (`Reviewed: <target> at <git rev-parse of it>`, plus "with uncommitted changes" for `--uncommitted`), the level (`Level: full` or `Level: short`, with the earlier report a short one follows), the test run it relies on (record path, or "run by this review"), verdict (`approve` / `changes-requested` / `none`), findings by severity (blocker, major, minor, nit) with location, problem, and fix. `approve` needs passing proof of the whole suite at the reviewed commit (a whole run there, or a `since` run there); when the tests were left for later and nothing else blocks, the verdict is `none (tests not run at <commit>)`. Blockers: failing tests, a scenario with wrong behaviour, a domain rule implemented outside the domain, missing authorization or data scope, prototype user switching reachable outside prototype mode, a prototype-mode flag that production could turn on without the app refusing to start.

For a second opinion, offer `/mflow:delegate <target> --to <tool> --mode review`; when it returns, `/mflow:assess` checks its findings against this report.

**What comes next:** on `approve`, merge after the user's yes, then `/opsx:archive` and `git diff --stat openspec/specs`; on `changes-requested`, the blockers to fix, then `/mflow:review` again; on `none`, `/mflow:test`, then `/mflow:review` again, which reuses that run. Write it into STATUS.md `## Now`. Add one line on why it is next: what it unblocks, or which risk it settles.

Done when: the report exists, STATUS.md records the verdict, and the user has the next command. Merge only on `approve` and the user's yes, and only while the target still points at the reviewed commit: an approval covers what was reviewed, so commits added since are reviewed first (`git diff <reviewed commit>..<target>`).
