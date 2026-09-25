# {{PROJECT_NAME}}

<!-- Agent-facing. Keep under ~200 lines. One fact, one home: point, don't copy.
     Add a rule here the SECOND time you correct an agent about the same thing. -->

## Purpose
One line on what this system does and for whom. Detail: `docs/vision.md`.

## Commands
<!-- Fill during /mflow:init. Append `(unverified)` to any command that was not actually run. -->
- Build: `dotnet build`
- Unit + domain tests: `dotnet test`
- E2E (Playwright): `TODO`
- Run locally: `TODO`
- Format: `dotnet format`

## Architecture
- Solution layout: TODO (e.g. `src/<Context>.Domain`, `.Application`, `.Infrastructure`, `.Web`)
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
| Big business logic being worked out | `docs/hotspots/<slug>/` | `/mflow:hotspot` |
| Customer documents (originals, never edited) | `docs/source/` + `docs/source/INDEX.md` | `/mflow:source` (registry script) |
| Understanding or design agreed with พี่ปู before building (roles, menus, data visibility…) | `docs/discuss/NN-<slug>.md`; `approved` = frozen record, facts live at its destinations; `draft` = not agreed yet | `/mflow:discuss` |
| UI kit: tokens, components, which to use | `docs/ui/design-system.md` | `/mflow:theme` |
| Screen list and prototype data | `docs/ui/screens.md`, `PrototypeData/*.json` | `/mflow:screen` |
| Change requests after approval | `docs/change-requests/` | `/mflow:change-request` |
| Briefs for other AI tools / their results | `.mflow/briefs/`, `docs/ai-inbox/` | `/mflow:delegate`, `/mflow:assess` |
| Where we are right now | `STATUS.md` | every session |
| Proof that behaviour works | tests | test projects |

## Session ritual
Start: read `STATUS.md`, run `openspec list` and `backlog task list -s "In Progress" --plain`.
End (if code or decisions changed): rewrite `## Now` in `STATUS.md`, add one log entry (Did / Decided / Next) with task IDs and change names.
<!-- Claude Code does this automatically through mflow hooks; Codex follows this text. -->

## Working as a tool other than Claude Code
If you were given a brief in `.mflow/briefs/`, it is your contract: stay in its scope and boundaries, work only on the branch it names, and give your report as your final message in exactly the format of its Output section, starting with `Understanding` and `Files read`. Edit no files unless the brief's mode is `code`. Claude verifies every report before anything is merged.

## Definition of done
A task or change is done when its acceptance criteria are covered by tests that pass:
- Business rules: xUnit tests in the domain test project, one case per example-table row (`[Theory]` + `[InlineData]` / `[MemberData]`).
- User flows: Playwright test for each acceptance scenario that crosses the UI.
- `dotnet build` and `dotnet test` are green. Report the command output, not a claim.

## Conventions
<!-- Only what differs from .NET defaults or cannot be inferred from the code. -->
- TODO

## Boundaries
- Edit Backlog.md files only through the `backlog` CLI.
- Change `openspec/specs/` only through an OpenSpec change + archive; `openspec/changes/archive/` is history, read-only.
- Leave generated agent files alone: `.claude/skills/openspec-*`, `.claude/commands/opsx/`, `.agents/skills/`, and content between tool marker comments.
- Ask before: schema migrations on shared databases, deleting data, changing auth.
