---
name: review
description: Review code (from Claude, Codex, or the user) against the OpenSpec change, AGENTS.md conventions, the design system and the domain rules, run the tests, and give a verdict with findings.
disable-model-invocation: true
argument-hint: "[<branch> | --uncommitted | <change-name> | <TASK-ID>]"
---

A review answers one question: does this diff do what the spec says, the way this project does things, with proof? It reports; it fixes nothing unless asked afterwards.

## 1. Scope the diff

- Branch: `git diff main...<branch>`; `--uncommitted`: working tree; change name: the commits and files for `openspec/changes/<name>/`; TASK-ID: the task's `modifiedFiles` and linked commits.
- Load what the diff must satisfy: the change's `proposal.md`, `tasks.md` and delta specs; the Backlog task's acceptance criteria; AGENTS.md, including `## Stack` (if it is missing or its profile is `TODO`, ask first, as "Asking" in `${CLAUDE_PLUGIN_ROOT}/skills/init/references/stacks.md` describes, and write the section); `docs/ui/design-system.md` for view changes; the hotspot `rules.md` if it implements one.

## 2. Check

1. **Spec coverage:** each Scenario in the delta specs and each acceptance criterion has a test that exercises it. List any without one.
2. **Tests:** run the test command from AGENTS.md; report the actual output summary.
3. **Domain placement:** business rules live in the domain layer (aggregates, value objects, domain services); controllers, views and repositories do not re-implement them. Invariants from rules.md are enforced where their owning aggregate is.
4. **UI kit:** views use kit components and tokens only; lists use DataTable with paging in the database query, the FilterPanel above the table, and header search only on columns marked searchable; dates go through `FormField` type `date` or `DateRangeField` (no `<input type="date">`, no date formatting in a screen) and reach the server as ISO `YYYY-MM-DD`; screen files hold no media or container queries, fixed widths or page-level grids; the changed pages pass at the acceptance sizes in `docs/ui/design-system.md` (§5 of `${CLAUDE_PLUGIN_ROOT}/skills/theme/references/responsive.md`: screenshots or an E2E run at those sizes).
5. **Data access:** queries page and filter in the database, no N+1 in lists, migrations reversible. Entities, columns, types, precision and nullability match `PrototypeData/README.md` and the approved data-model doc, or the change states the difference; the indexes the doc lists for screen filters exist.
6. **Security basics:** a `Permissions` key checked on every endpoint that changes data, and on every read the access-control discussion doc restricts; data scope applied in the query, not the view; restricted fields masked in the ViewModel mapping that exports reuse; no role-name comparisons (contract: "Current user, permissions and the role switcher" in `${CLAUDE_PLUGIN_ROOT}/skills/screen/references/prototype-data.md`); `FakeCurrentUser` and `/_prototype/*`, or their equivalents, registered only under the prototype-mode flag in AGENTS.md `## Stack` (`Prototype:UseFakeData` in the .NET profiles); no raw SQL built from input, no secrets in code or config.
7. **Leftovers:** `// PROTOTYPE:` markers still in code that this change was meant to replace; TODOs without a task.

Done when: every check has a result, with file:line for each problem.

## 3. Report

Write `docs/reviews/code/<date>-<target>.md`: verdict (`approve` / `changes-requested`), findings by severity (blocker, major, minor, nit) with location, problem, and fix. Blockers: failing tests, a scenario with wrong behaviour, a domain rule implemented outside the domain, missing authorization or data scope, prototype user switching reachable outside prototype mode.

For a second opinion, offer `/mflow:delegate <target> --to <tool> --mode review`; when it returns, `/mflow:assess` checks its findings against this report.

**What comes next:** on `approve`, merge after the user's yes, then `/opsx:archive` and `git diff --stat openspec/specs`; on `changes-requested`, the blockers to fix, then `/mflow:review` again. Write it into STATUS.md `## Now`.

Done when: the report exists, STATUS.md records the verdict, and the user has the next command. Merge only on `approve` and the user's yes.
