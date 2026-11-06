---
flow: {{FLOW}}
title: {{TITLE}}
status: draft
sources: TODO (the requirement, ADR, screen or code this flow comes from)
updated: {{DATE}}
---

# {{TITLE}}

<!-- One flow per file. Cases walk the ids: steps 1, 2, 3 (3a for a step only some paths take), branches B1…,
     transitions T1…; rules R1… each name their unit test. The check lists what no case walks and which
     case or rule has no test: /mtest:flow check {{FLOW}}. -->

## Goal
TODO: what the flow achieves in one line, and where it ends (the state or result that counts as done).

## Steps
| Step | Actor | Action | Expected | State after |
|---|---|---|---|---|
| 1 | TODO | TODO | TODO | TODO |

## Branches
| Branch | At | When | Then | Back to |
|---|---|---|---|---|

## Transitions
| Transition | From | To | Trigger | Allowed for |
|---|---|---|---|---|

## Rules
| Rule | Where it applies | Unit test |
|---|---|---|

## Cases
| Case | Path | Kind | Expect | Level | Test |
|---|---|---|---|---|---|
| C01 | 1 | happy | TODO | integration | TODO |
