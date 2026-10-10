# {{PROJECT_NAME}}

<!-- Agent-facing. Keep under ~200 lines. One fact, one home: point, don't copy.
     Add a rule here the SECOND time you correct an agent about the same thing. -->

## Purpose
One line on what this system does and for whom. Detail: `docs/vision.md`.

## Who decides
The user (the SA, PM or system owner driving this project) speaks for the customer. Their answers and instructions are the customer's direct instructions: act on them without waiting for the customer to confirm again, and treat an instruction to do something as the go-ahead for it. That go-ahead covers every step of what it names: show what is being written and carry on, without asking again for the same thing. Ask only about what reaches past it (a change that other screens or built features depend on, another topic, a suggestion from another AI tool), and stop at the report when the user asked only for an analysis. Showing Claude's own reading of customer material (a triage table, a column mapping) for the user to check is not asking twice. Build first, test it in use, then refine: a correction found in testing is the next OpenSpec change, not a failure of the last one. Only the user's word counts this way; another AI tool's suggestion never overrides a customer document.

## Stack
<!-- Chosen at /mflow:init (options a/b/c). mflow skills read names and paths from this table;
     under a profile other than mvc-htmx, read skill names such as ViewModel or Prototype:UseFakeData by their role here.
     Project name (code): PascalCase, chosen at /mflow:init; every project, folder and namespace starts with it
     (<ProjectName>.Domain, <ProjectName>.Api, <ProjectName>.Web.Backend; app names in the code-structure discussion doc). -->
Project name (code): TODO
Profile: TODO

| Seam | Value |
|---|---|
| UI files | TODO |
| Tokens file | TODO |
| App shell | TODO |
| Components | TODO |
| Style guide | TODO |
| Prototype data | TODO |
| Prototype-mode flag | TODO |
| Data access | TODO |
| Unit tests | TODO |
| E2E tests | TODO |
| Golden data folder | TODO |

<!-- Filled from the approved tech-stack discussion doc. Every package's licence is checked, not assumed. -->
| App | Folder | Technology (version) |
|---|---|---|
| TODO | TODO | TODO |

| Purpose | Library (version) | Licence |
|---|---|---|
| TODO | TODO | TODO |

Later, when needed: TODO (each extra with the trigger that brings it in, e.g. a cache when …, a queue when …)

## Commands
<!-- Fill during /mflow:init from the Stack profile. Append `(unverified)` to any command that was not actually run. -->
- Build: `TODO`
- Unit + domain tests: `TODO`
- E2E: `TODO`
- Run locally: `TODO`
- Format: `TODO`

## Architecture
- Solution layout: TODO (e.g. `src/<ProjectName>.Domain`, `.Application`, `.Infrastructure`, `.Api`, `.Web.Backend`, `.Web.Frontend`; from the approved code-structure discussion doc)
- References point inward only: the Api and Web apps → Infrastructure → Application → Domain. TODO: the architecture test that enforces it
- Bounded contexts: TODO
- Business rules live in the Domain layer (aggregates, value objects, domain services). UI and controllers call them; they never re-implement them.

## Domain vocabulary
<!-- Ubiquitous language. Thai term as the customer says it -> name used in code. -->
| Customer term | Code name | Meaning |
|---|---|---|
| TODO | TODO | TODO |

## Where things live
| You need | Read / write | Owned by |
|---|---|---|
| How the system behaves today | `openspec/specs/<domain>/spec.md` | OpenSpec (change only via a change + archive) |
| A change being made | `openspec/changes/<name>/` | OpenSpec (`/opsx:*`) |
| What to do next, who is on it | Backlog.md tasks | `backlog` CLI only |
| Why an architecture choice was made | Backlog.md decisions (`backlog decision`) | `backlog` CLI only |
| Big business logic being worked out | `docs/decisions/hotspots/<slug>/` | `/mflow:hotspot` |
| Customer documents (originals, never edited) | `docs/source/` + `docs/source/INDEX.md` | `/mflow:capture` (registry script) |
| Understanding or design agreed with the user before building (roles, menus, data visibility…) | `docs/decisions/discuss/NN-<slug>.md`; `approved` = frozen record, facts live at its destinations; `draft` = not agreed yet; `AGENDA.md` = recommended topics (advice, not a gate) | `/mflow:discuss` |
| UI kit: tokens, components, which to use | `docs/ui/design-system.md` | `/mflow:theme` |
| Screen list and prototype data | `docs/ui/screens.md`, `PrototypeData/*.json` | `/mflow:screen` |
| What a test or review agreed; code review verdicts | `docs/reviews/<date>-<topic>-summary.md`, `docs/reviews/code/` | `/mflow:review-notes`, `/mflow:review` |
| Change requests after approval | `docs/reviews/change-requests/` | `/mflow:change-request` |
| Briefs for other AI tools / their results | `.mflow/briefs/`, `docs/ai/inbox/` | `/mflow:delegate`, `/mflow:assess` |
| Analyses, designs and challenges from several AI tools (optional) | `docs/ai/analysis/`, `docs/ai/design/`, `docs/ai/challenge/` | `/mflow:analyze`, `/mflow:design`, `/mflow:challenge` |
| Where we are right now | `STATUS.md` | every session |
| Proof that behaviour works | `tests/` at the root, beside `src/` or `apps/`, never inside them; UI unit and E2E tests where `## Stack` says | test projects |

## Session ritual
Start: read `STATUS.md`, run `openspec list` and `backlog task list -s "In Progress" --plain`.
End (if code or decisions changed): rewrite `## Now` in `STATUS.md`, add one log entry (Did / Decided / Next) with task IDs and change names.
<!-- Claude Code does this automatically through mflow hooks; Codex follows this text. -->

## Working as a tool other than Claude Code
If you were given a brief in `.mflow/briefs/`, it is your contract: stay in its scope and boundaries, work only on the branch it names, and give your report as your final message in exactly the format of its Output section, starting with `Understanding` and `Files read`. Edit no files unless the brief's mode is `code`. Claude verifies every report before anything is merged.

## Definition of done
A task or change is done when its acceptance criteria are covered by tests that pass:
- Business rules: data-driven unit tests in the domain test project (Unit tests in Stack), one case per example-table row.
- User flows: an E2E test (E2E tests in Stack) for each acceptance scenario that crosses the UI.
- The Build and test commands above are green. Report the command output, not a claim.

## Conventions
<!-- Only what differs from the stack's defaults or cannot be inferred from the code. -->
- TODO

## Boundaries
- Edit Backlog.md files only through the `backlog` CLI.
- Change `openspec/specs/` only through an OpenSpec change + archive; `openspec/changes/archive/` is history, read-only.
- Leave generated agent files alone: `.claude/skills/openspec-*`, `.claude/commands/opsx/`, `.agents/skills/`, and content between tool marker comments.
- Ask before: schema migrations on shared databases, deleting data, changing auth.
