# {{PROJECT_NAME}}

<!-- Agent-facing. Keep under ~200 lines. One fact, one home: point, don't copy.
     Written by /mtest:init. Other tools may add sections of their own: leave theirs alone. -->

## Purpose
TODO: one line on what this system does and for whom.

## Who decides
The user (the SA, PM or owner driving this project) speaks for the customer. Their answers and instructions are the customer's: act on them without asking again, and treat an instruction to do something as the go-ahead for it. Build first, test it in use, then refine.

## Layout
TODO: the folders that matter (source, tests, web app), taken from the actual project.

## Commands
TODO: the build, run and test commands that were run here. The test parts mtest runs are in `.mtest/config.json`.

## Testing (mtest)
- Test parts (build, unit, integration, checks, E2E), their commands, folders and prerequisites live in `.mtest/config.json`. A part that no record in `mtest/runs/` shows passing has not been proven to work yet.
- Flows live in `mtest/flows/<flow>.md`: numbered Steps, Branches (B1…), state Transitions (T1…), Rules (R1…) and Cases whose Path walks them (`1-2-B1-2-3`). A change that adds or changes a step, a branch, a state, a rule or a role of a flow updates its flow doc and adds the case's test in the same change.
- Where a test goes: a business rule or a calculation → a unit test (table-driven, one row per case of the rule); a flow through the API with the database, permissions and data scope → an integration test per case; a screen → an E2E test, written and run only when the user calls for it, with at most `e2eMaxWorkers` browsers at once.
- A case is covered when its test asserts the case's expected outcome (the state, the amounts, the refusal and its reason), not only a status code.
- Runs are recorded in `mtest/runs/`, reviews in `mtest/reviews/`. A record at the same commit is reused, never run again.
- Never: run the whole suite in the background or parts in parallel; start Playwright without a workers cap; skip a test, loosen an assertion or change an expected value to make a run pass. A test that fails because the code breaks the flow keeps asserting the flow, and the code is fixed.
- No CI pipeline is set up until the user asks for one in this project.

## Boundaries
- Never commit secrets, real customer data or API keys; tests use fakes and synthetic data.
