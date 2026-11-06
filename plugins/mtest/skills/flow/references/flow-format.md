# Flow doc format

A flow doc is `mtest/flows/<flow>.md`: a front matter, then fixed `##` sections holding markdown tables.
`scripts/flows.mjs` reads the first table under each heading; the first column of every table is the id.
Text in the cells may be in any language; the headings and ids stay as below.

## Front matter

```
---
flow: <flow>            same as the file name: lowercase letters, digits, hyphens
title: <title>          what the customer calls it; may be Thai
status: draft | agreed  agreed once the user has confirmed the steps and the cases
sources: <where it comes from: requirement section, ADR, screen, code path>
updated: <YYYY-MM-DD>
skip: <kinds>           optional: kinds the flow cannot have (isolation, handoff), the reason under ## Goal
---
```

## Sections

| Section | Id form | Columns | Required |
|---|---|---|---|
| `## Goal` | — | one line: what it achieves and the end that counts as done | yes |
| `## Steps` | `1`, `2`, `3`, `3a`, `4.1` | Step, Actor, Action, Expected, State after | yes |
| `## Branches` | `B1`, `B2` | Branch, At (the step it leaves), When, Then, Back to (a step, or `end`) | when the flow can leave the straight path |
| `## Transitions` | `T1`, `T2` | Transition, From, To, Trigger, Allowed for (`nobody` for one that must be refused) | when the flow moves a record through states |
| `## Rules` | `R1`, `R2` | Rule, Where it applies (step ids), Unit test | when a step relies on a calculation, a limit or a permission rule |
| `## Cases` | `C01`, `C02` | Case, Path, Kind, Expect, Level, Test | yes |

**Actor** is a role the project names (Uploader, Approver) or the system (`system`, `AI`, `worker`,
`job`; the list is `systemActors` in `.mtest/config.json`). A flow where people act needs at least one
`permission` case.

**Path** is the walk, written over step, branch and transition ids joined by `-` (or `→`): `1-2-3-4`,
`1-2-B1-2-3-4` (left at 2, came back to 2), `1-2-B1-2-B1-2-3` (sent back twice), `1-2-T7` (a refused
transition). A branch comes right after its `At` step and is followed by its `Back to` step; the check
warns when a path says otherwise.

**Kind**, one of:

| Kind | The case proves |
|---|---|
| `happy` | the straight path, start to the end that counts as done |
| `alt` | another path that also ends done (paid in part, approved after a question) |
| `error` | a path the system stops, with the reason the user sees |
| `permission` | a role that may not take a step is refused, and one that may is not |
| `handoff` | what one person sets or sends reaches the next as it was set: the fields, options, files and deadlines of an invitation as the invited party sees them, and after each decision (send back, reject, approve, withdraw, acknowledge) the state and the actions every party now sees |
| `boundary` | the edges of a rule: zero, the limit, one past it, rounding |
| `idempotency` | the same action twice (double click, retried request, upload again) does it once |
| `concurrency` | two users or jobs on the same record at once: one wins, the other is told |
| `isolation` | data of another tenant, company or owner never shows or changes |
| `time` | dates and periods: a closed period, a due date, a month or year boundary |
| `recovery` | a failure midway (an external service down, a restart) leaves a state the flow can resume from |

**Level**: `unit`, `integration`, `e2e` or `manual` (a check a person makes; its Test cell names the
checklist). **Test**: one or more references separated by `;`:
- `path/to/File.cs::Method_name`: that file holds that text;
- `Method_name` or `"AC-19 upload → approve"`: some test file holds that text;
- `ClassName.MethodName`: some test file holds both names.
`TODO` or an empty cell means no test yet. An `e2e` case without a test is listed as "E2E on request",
not as a gap: E2E is written per screen when the user calls `/mtest:e2e`.

## What the check reports

`node flows.mjs check [<flow>]` reports, per flow:
- `stepsUncovered`, `branchesUncovered`, `transitionsUncovered`: ids no case walks;
- `casesWithoutTest`, `rulesWithoutTest`: rows whose Test is `TODO`;
- `testsNotFound`: references no test file holds (a renamed or deleted test);
- `unknownTokens`: path tokens that name no step, branch or transition;
- `problems`: a missing section, a malformed or duplicated id, a level that is not one of the four;
- `warnings`: a branch out of place in a path, an unknown kind, no `permission` case where people act,
  and, where two roles or more act, no `handoff` case and no `isolation` case (a `skip:` in the front
  matter silences the last two for a flow that cannot have them).

A flow is complete (`ok: true`) when it has no problems and no gaps. `--strict` exits 1 when one is not.
