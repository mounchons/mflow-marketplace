# Flows

One file per flow, `<flow>.md`, from `/mtest:flow <flow>`. A flow is what a user or the system does
from a start to an end that counts as done, step by step, with every way it can leave the straight path.

- **Steps** `1`, `2`, `3` (and `3a` for a step only some paths take): who acts, what they do, what the system
  shows or stores, and the state after it.
- **Branches** `B1`…: at which step the flow leaves the straight path, when, what happens, and the step it
  goes back to (or none: the flow ends there).
- **Transitions** `T1`…: the state changes the flow allows, and the ones it must refuse.
- **Rules** `R1`…: the calculations and limits the steps rely on, each with its unit test.
- **Cases** `C01`…: one walk through the flow, its Path written over those ids (`1-2-B1-2-3-4`; a loop is
  written out, such as a rejection sent back once), its Kind, the expected outcome, the Level of the
  test (unit, integration, e2e, manual) and the Test that proves it.

A flow is complete when every step, branch, transition and rule is walked by at least one case, and every
case names a test that exists. The check: `/mtest:flow check`.
