---
name: review
description: Review a diff — the commits since the last review, a branch, a range, a pull request or uncommitted work — against the project's own rules in AGENTS.md, its requirements and decisions, the flow docs it touches and the tests that prove it, reusing a test record of the reviewed commit, and give a verdict with findings.
disable-model-invocation: true
argument-hint: "[since | <branch> | <from>..<to> | pr <number> | --uncommitted] [--short]"
---

A review answers one question: does this diff do what the project needs, the way the project says it is
done, with proof? It reports; it fixes nothing unless the user asks afterwards. Code may come from
Claude (here or on the web), another tool or the user; the review is the same.

## Levels

How much review a diff needs follows from the files it touched; the user's word decides.
- **full** (the default): business rules, calculations, permissions or data scope, queries, migrations or the data model, an integration with another system, startup and dependency wiring, background jobs. Every check below.
- **short** (`--short`): any other code change, such as a screen that only shows what the API sends, or a fix after a review (its diff starts at the end commit of that review). Checks 1 and 2 for what changed, each finding of the earlier report marked fixed or still open, and checks 3–7 only on the changed lines.
- **skip**: only documents, stylesheets, or label text (no condition, query or data shape changed). No review; say so.

## 1. Scope the diff

- **`since`**, or no argument: `node "${CLAUDE_PLUGIN_ROOT}/scripts/reviews.mjs" since`. It starts at the end commit of the newest report that is an ancestor of HEAD (or, with no report yet, where this branch left the default branch) and lists the commits and files after it. No commits: nothing to review; say so.
- **`<branch>`**: `git diff <default branch>...<branch>`, the default branch from `.mtest/config.json` or git (never assume `main`).
- **`<from>..<to>`**: that range.
- **`pr <number>`**: `gh pr view <number> --json title,body,headRefName,baseRefName,headRefOid` and `gh pr diff <number>`, when `gh` is available; the reviewed commit is the head of the pull request.
- **`--uncommitted`**: the working tree against HEAD.
- Leave out of the code checks the plugin copy in `.claude/skills/mtest/` and the records in `mtest/`.
- **Level** by "Levels" from the files, unless `--short`.
- **Load what the diff must satisfy:** AGENTS.md (every rule written as must, never, always or only is a check item; quote it in a finding) and CLAUDE.md; the requirement and decision docs the project keeps, at the sections the diff touches or its commit messages and pull request name (requirement ids such as `AC-10`, `FR-61`); the flow docs whose steps, rules or tests the diff touches (`mtest/flows/`).

Done when: the diff, its level and what it must satisfy are known.

## 2. Check

1. **Flow coverage.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/flows.mjs" check`. Each behaviour the diff adds or changes (an endpoint, a state, a branch, a permission, a rule, a job) has its step, branch, transition or rule in a flow doc, and a case with a test, in the diff or before it. New behaviour without a case is a finding: major, a blocker when it is a permission, data scope, money or a state change. The gaps of the flows the diff touches are listed. An E2E case without a test is not a finding: name the screens or flows in one line, `E2E on request: …`.
2. **Tests.** The proof is a record in `mtest/runs/` with `Tested: … at <the reviewed commit>`, no "with uncommitted changes", `Scope: whole suite` or `Scope: since …`, and `Result: pass`, whichever tool ran it. Cite it (file, counts, who ran it) and run nothing. Without one, when a whole-suite record exists at an ancestor of the reviewed commit, run the "Since the last whole run" step of `/mtest:test` yourself; it usually takes minutes. When that step needs the whole suite or there is no base, ask once, unless the user already said: a) run the whole suite now, the way `/mtest:test` does (say how long the newest record took), or b) review the rest now and leave the tests to `/mtest:test`. `--uncommitted` runs the `since` step over the working tree, and nothing can rely on that record later. A review never runs E2E tests.
   **The tests in the diff:** a test removed, skipped or focused (`Skip =`, `[Ignore]`, `@Disabled`, `.skip`, `xit`, `.only`, `fit`); an assertion removed or loosened; an expected value changed with no requirement change behind it; a test that asserts only a status code; a sleep instead of waiting for a state; a call to a real outside service; a test that needs another test to run first. A focused test (`.only`), or an assertion weakened so that a failure passes, is a blocker.
3. **The project's rules.** Each AGENTS.md rule the diff could break, checked on the changed lines and on what they call (for example: every query inside the tenant's context, money as decimal with the project's rounding, posted records immutable, controllers thin). A broken rule the file marks as non-negotiable is a blocker.
4. **Requirements and decisions.** The behaviour against the requirement text the diff names or touches. A departure without a decision record is major; a decision the diff makes silently (a new state, a changed limit) is named for the user.
5. **Security basics.** Authorization on every endpoint that changes data and on every read the requirement restricts; data scope (tenant, company, owner) applied in the query, not the view; input validated where it enters; no SQL built from input; no secrets in code, config or logs; uploads checked for type and size; personal or document data never logged.
6. **Data access.** Paging and filtering in the database; no N+1 in lists; migrations that match the model and can be reversed; several writes of one step in one transaction; idempotency where the flow asks for it.
7. **Leftovers.** Debug output, commented-out code, a TODO without a tracked item, code the diff made dead.

Done when: every check has a result, with file:line for each problem.

## 3. Report

Write `mtest/reviews/<date>-<target>.md` (target: the branch with `/` as `-`, `since`, `pr-<number>`, `uncommitted`; `-2` for a second the same day). Header lines first, one per line:

```
Reviewed: <target> <base commit>..<end commit>[ with uncommitted changes]
Reviewer: claude | codex | user
Author: claude | codex | user
Level: full | short [after <earlier report>]
Tests: <record path> | run by this review: <record path> | none
Verdict: approve | changes-requested | none (tests not run at <short commit>)
```

`Author` comes from the branch (`claude/…` is Claude), the commits' `Co-Authored-By` lines, or the user (ask in one line when neither tells). When the reviewer is the tool that wrote the code, add `Self-review: yes`; offer a review by another tool when the diff is full level.

Then `## Findings` by severity (blocker, major, minor, nit), each with file:line, the problem, the rule or requirement it breaks, and the fix; `## Flows` with the coverage of the flows the diff touches; `## E2E on request` when any.

`approve` needs a passing proof at the reviewed commit and no blocker or major. Blockers: failing tests, a case with wrong behaviour, missing authorization or data scope, a broken non-negotiable rule, a weakened or focused test. When the tests were left for later and nothing else blocks, the verdict is `none (tests not run at <commit>)`.

**What comes next:** on `approve`, merge after the user's yes, and only while the target still points at the reviewed commit (commits added since are reviewed first). On `changes-requested`, the fixes, when the user says so, then `/mtest:test since` and `/mtest:review <target> --short`. On `none`, `/mtest:test`, then `/mtest:review` again, which reuses that run. Write it into `mtest/STATUS.md` `## Now`, with one line on why it is next.

Done when: the report exists, STATUS.md has the verdict, and the user has the next command.
