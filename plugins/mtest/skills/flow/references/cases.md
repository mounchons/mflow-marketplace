# Deriving the cases of a flow

A flow of four straight steps needs one happy case. Everything else a flow can do needs its own case,
and "complete" means none is left out. Walk this list for every flow, write a case for each line that
applies, and leave out only what the flow cannot do (say why in one line under `## Goal`).

## From the structure

1. **The straight path**, start to done: one `happy` case. When done can be reached two ways (paid in
   full, paid in parts), one case per way (`alt`).
2. **Every branch** at least once. A branch that returns (a question answered, a rejection fixed) is
   walked out and back (`1-2-B1-2-3`). A branch that can repeat is also walked twice in one case
   (`1-2-B1-2-B1-2-3`), which is where state left over from the first round shows up.
3. **Every exit before done**: each place the flow can stop for good (cancelled, rejected, expired) is an
   `error` or `alt` case that asserts the final state and that nothing after it happened (no journal, no
   mail, no stock movement).
4. **Every state transition** the flow allows, and every one it must refuse: going back from a final
   state, skipping a state, acting on a cancelled record. A refused transition is its own case
   (`1-2-3-T9`) that asserts the refusal, its reason and that the record did not change.

## From the people

5. **Each guarded step, each role**: for a step only some roles may take, one `permission` case where a
   role without the right is refused (by the API, not only by a hidden button) and the record is
   unchanged. One allowed role is enough when the rule is "this permission or not"; one per role when
   roles differ in what they see or may do.
6. **Data scope**: a user of one tenant, company, branch or owner never sees or changes another's record
   in this flow, through a list, a detail, an export or a direct id (`isolation`).
7. **Separation of duties**, when the requirement asks for it: the person who prepared a record cannot
   approve it.

## From the data

8. **Rules behind the steps**: every calculation, limit and rounding becomes a Rule row with a
   table-driven unit test covering its edges: zero, the limit, one past it, negative, the rounding
   half-way point, the largest value (`boundary`). The flow's cases then use one ordinary value; the edges
   live in the unit test, not in more integration cases.
9. **Partial and many**: part of an amount, several items at once, one action covering several records
   (one payment for three invoices), when the flow allows them (`alt`).
10. **Bad input that reaches the flow**: required data missing, a duplicate, a value the rule refuses;
    each as one `error` case asserting the message the user sees.

## From time and failure

11. **Twice**: the same action submitted twice (double click, retried request, the same file uploaded
    again) takes effect once (`idempotency`).
12. **At once**: two people or a job and a person acting on the same record; one wins and the other is
    told, with no half-written state (`concurrency`), when the flow can be reached by two at a time.
13. **Dates and periods**: a closed period, a due date that passes, the end of a month or a year, a time
    zone at midnight (`time`), when the flow depends on a date.
14. **Failure midway**: an external service that fails or times out, a worker that restarts; the flow is
    left in a state it can resume from, and resuming does not do the work twice (`recovery`).

## Choosing the level

| What the case proves | Level | Why |
|---|---|---|
| a rule, a calculation, a state machine's allowed moves | `unit` | fast and exact; one table row per edge |
| a walk through the API: database, permissions, data scope, jobs | `integration` | proves the pieces together, without a browser |
| what the user sees: buttons per role, a filter kept, a page per size | `e2e` | written per screen when the user calls `/mtest:e2e`, after the screen settles |
| something only a person can judge (a printed form's layout) | `manual` | name the checklist in the Test cell |

Most cases of a flow are `integration`. A flow whose every case is `e2e` is too slow to prove after each
change: move what does not need the browser down a level.

## Writing a case's test

- One test per case, named so the case can be found from it: the case id or the requirement id the
  project already uses (`AC-10`, `C03`) in the test name or a comment next to it. Write that name in the
  case's Test cell.
- Arrange the data the case needs in the test (or through the project's own fixtures and helpers for
  walking a flow). Never depend on another test having run first, unless the project's E2E tests are
  written as one ordered story and say so.
- Assert the outcome the case's Expect column names: the final state, the amounts, the rows written
  and the ones not written, the refusal and its reason. A status code alone proves nothing about the
  flow.
- No sleeps: wait for the state. No network to real services: the project's fakes.
