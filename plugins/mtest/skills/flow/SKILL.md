---
name: flow
description: Map a flow of the system — numbered steps, branches, state transitions, rules and roles — into mtest/flows/<flow>.md with every case that walks it, check that each step, branch, transition and rule has a case and each case a test that exists, and write the missing unit and integration tests.
disable-model-invocation: true
argument-hint: "[list | <flow> | <flow> write | check [<flow>]]"
---

A flow is what a person or the system does from a start to an end that counts as done: upload → read →
check → approve → post, or request → approve → order → receive → pay. A straight flow of four steps needs
one test. A real one leaves the straight path (a question to answer, a rejection sent back, a period
already closed), refuses some roles, moves records through states and relies on rules, and each of those
needs its own case and its own test. This command makes that list explicit, in a file a script can check,
so "the tests are complete" is something `flows.mjs check` says, not something anyone assumes.

The format is [references/flow-format.md](references/flow-format.md); the list of cases to derive is
[references/cases.md](references/cases.md). Read both before writing a flow doc. Files opened with Read
are not substituted: where they write the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.

## No argument, or `list`

With flow docs in `mtest/flows/`: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/flows.mjs" list` and show one
line per flow (coverage, gaps), then the next flow to work on.

Without any: find the candidate flows, reading only:
- the requirement docs: workflow, status or process sections, acceptance criteria tables (`AC-…`), user
  stories, and the decision records that change them;
- the code: status enums and state machines in the domain, the services or endpoints grouped by the
  record they move, background jobs;
- the tests that already walk several steps (their names often carry the requirement ids), and the
  helpers the project uses to walk a flow in a test;
- the screens and menus, for who starts and who finishes each flow.

Propose them in one table: name, title, where it comes from, about how many steps, the tests found that
already walk it. Recommend an order: the flow the business depends on first, then the ones that move
money, stock or permissions. Ask which to map (`a)` `b)` `c)` or "all"), and stop.

Done when: the user has the list and has picked, or the flows' coverage is shown.

## `<flow>`: map one flow

1. **The doc.** New: `node "${CLAUDE_PLUGIN_ROOT}/scripts/flows.mjs" new <flow> --title "<title>"`.
   Existing: read it; edit it in place.
2. **Steps, branches, transitions, rules** from the sources found above, the requirement first. Each
   step: who acts, what they do, what the system shows or stores, the state after. Each branch: where it
   leaves, when, what happens, where it goes back. Transitions: the ones the code allows and the ones the
   requirement forbids (going back from a final state, skipping one). Rules: every calculation, limit or
   permission rule a step relies on. A cell that comes from the code and not from a requirement ends with
   `(from code)`: the code may be wrong, and the user should see where the doc rests on it.
3. **Cases**, by every line of references/cases.md that applies: the straight path, each branch out and
   back (and twice when it can repeat), each exit, each refused transition, each guarded step per role,
   data scope with a second account of each outside role, each hand-off between people (what was set
   arrives as set, what was sent back arrives whole, every decision shows on both sides), the rules'
   edges in unit tests, twice, at once, dates, failure midway. Leave out only what the flow cannot do,
   with one line on why under `## Goal` (and `skip: isolation` or `skip: handoff` in the front matter
   when it has no second party or no hand-off).
4. **Existing tests.** For each case and rule, look for a test that already proves it: by requirement id,
   by the case's words, by the endpoint or service it calls. Read the test before citing it: it must
   assert the case's outcome, not just reach the step. Write its reference into the Test cell. Do not
   write new tests in this mode.
5. **Check**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/flows.mjs" check <flow>`. Fix every problem it reports
   in the doc itself (a malformed id, a path token that names nothing).
6. **Confirm with the user** in one message: the steps in one line each, the branches, the cases with a
   test and the gaps, and numbered questions only for what the sources do not settle (what happens when
   …, who may …), each with options. On the user's answer, update the doc and set `status: agreed`.

A flow of more than about 15 steps or 40 cases is split into stages, one doc each, the end state of one
being the start of the next; a case that crosses stages lives in the later doc.

Done when: the doc exists, `flows.mjs check <flow>` reports no `problems`, and the user has seen the gaps.

## `<flow> write`: write the missing tests

For each case in `casesWithoutTest` and each rule in `rulesWithoutTest` of `flows.mjs check <flow>`, and
each reference in `testsNotFound` (a test that was renamed or deleted):
- Write the test at its level, in the project's conventions (its test projects, helpers for walking a
  flow, fixtures, fakes and naming), as "Writing a case's test" in references/cases.md says: named so the
  case can be found from it, its own data, the case's outcome asserted.
- `e2e` cases stay for `/mtest:e2e`. `manual` cases get a checklist line in the Test cell.
- Write the new test's reference into the Test cell.

Run only the new tests: `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" start --scope "flow <flow>"`, then
`run.mjs part <part> --args "<filter for the new tests>"` for each part they belong to (the filter syntax
of the stack is in `${CLAUDE_PLUGIN_ROOT}/skills/init/references/stacks.md`), then `run.mjs finish`. When
the build is stale, run the build part first in the same run.

A new test that fails is checked against the flow doc: when the test is wrong, fix the test; when the
code breaks the flow, the test keeps asserting the flow, and the defect is reported with the case, the
file:line and the fix. This command writes tests and flow docs only; product code changes when the user
says so.

Then `flows.mjs check <flow>` again.

Done when: every non-E2E case and every rule has a test that exists, the new tests ran and their record
is in `mtest/runs/`, and every defect found is reported.

## `check [<flow>]`

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/flows.mjs" check [<flow>]` and report per flow: what no case
walks, the cases and rules without a test, the references no test file holds, and the E2E cases waiting
for `/mtest:e2e`. Nothing is written.

## After any mode

Update `mtest/STATUS.md` `## Now`: the flows mapped, their gaps, and the next command
(`/mtest:flow <flow> write` for gaps, `/mtest:test` once they are closed, `/mtest:e2e flow <flow>` for the
E2E cases when the screens have settled).
