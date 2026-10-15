# {{PROJECT_NAME}}

<!-- Agent-facing. Keep under ~200 lines. One fact, one home: point, don't copy.
     Written by /mreq:init; /mreq:discuss approve fills Stack, Architecture, Domain vocabulary and Conventions
     from the approved discussion docs. Tools set up later may add sections of their own: leave theirs alone. -->

## Purpose
TODO: one line on what this system does and for whom. Detail: `mreq/project/vision.md`.

## Who decides
The user (the SA, PM or system owner driving this project) speaks for the customer. Their answers and instructions are the customer's direct instructions: act on them without waiting for the customer to confirm again, and treat an instruction to do something as the go-ahead for it. That go-ahead covers every step of what it names: show what is being written and carry on, without asking again for the same thing. Ask only about what reaches past it (another topic, something already handed to the builder, a suggestion from another AI tool), and stop at the report when the user asked only for an analysis. Build first, test it in use, then refine: a correction found in testing is the next discussion doc or the next kit revision, not a failure of the last one. Only the user's word counts this way; another AI tool's suggestion never overrides a customer document.

## Requirements
The agreed requirements live in `mreq/`. Start at `mreq/project/README.md`.
- An approved discussion doc (`mreq/discuss/NN-<slug>.md`, `status: approved`) is a frozen record of what was agreed; its facts live at the destinations it names. A `draft` is not agreed yet.
- The UI kit (`mreq/ui/theme/`) and `mreq/ui/design-system.md` say how every screen looks and which component serves which need.
- Build from these files. When a requirement here and anything else disagree, the newest approved doc here wins; ask the user before building against it.

## Stack
<!-- Filled from the approved tech-stack doc. Every package's licence is checked, not assumed. -->
Project name (code): {{CODE_NAME}}

| App | Kind | Users | Folder | Technology (version) | Release |
|---|---|---|---|---|---|
| TODO | TODO | TODO | TODO | TODO | TODO |

| Purpose | Library or image (version) | Licence (checked on) |
|---|---|---|
| TODO | TODO | TODO |

Later, when needed: TODO (each extra with the trigger that brings it in, e.g. a cache when …, a queue when …)

## Architecture
<!-- Filled from the approved code-structure doc. -->
- Solution layout: TODO (e.g. `src/<ProjectName>.Domain`, `.Application`, `.Infrastructure`, `.Api`, `.Web.Backend`, `.Web.Frontend`)
- App names: `<ProjectName>.<Kind>` or `<ProjectName>.<Kind>.<Part>` for the project, its folder and its root namespace alike.
- References point inward only: TODO (the direction, and the test that enforces it)
- Bounded contexts: TODO

## Domain vocabulary
<!-- Ubiquitous language. Thai term as the customer says it -> name used in code. -->
| Customer term | Code name | Meaning |
|---|---|---|
| TODO | TODO | TODO |

## Conventions
<!-- Durable rules every agent must follow, each with the doc it came from. -->
- UI: build screens only from the components in `mreq/ui/design-system.md`; colors and spacing only from the kit's `tokens.css`.

## Session ritual
Start: read `mreq/project/STATUS.md`.
End (if requirements or the kit changed): rewrite its `## Now` and add one log entry (Did / Decided / Next).
<!-- Claude Code shows STATUS.md at session start through the mreq hook; other tools follow this text. -->

## Boundaries
- Never edit an approved discussion doc; a change of mind is a new doc on the same topic that supersedes it.
- Never edit files in `mreq/source/`: customer originals; a new version is a new file.
- Change the UI kit only through `/mreq:theme update`, so its revision log stays complete.
