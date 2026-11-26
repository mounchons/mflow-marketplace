# Coding standard

The one place for how code is written in this project. Every tool that writes code (Claude Code, Codex, Antigravity, OpenCode) reads it before the first task and follows it. A review checks the code against it and cites the rule by its id (`STD-07`). Claude keeps it: it is filled from the approved `tech-stack` and `code-structure` discussions, the selected packs and the code already here, and it changes only through the user's word or an approved discussion, never because a tool suggested it.

One rule per line, `STD-<nn>` never reused. A rule says what to do, short enough to check in a diff, and points to its source when it has one (`(docs/decisions/discuss/02-code-structure.md D3)`). A departure is written in the change's tasks.md with the reason, never silently.

## Layout and references
- STD-01 TODO: where each kind of code goes (apps, packages, tests), from the approved code-structure doc
- STD-02 TODO: which project may reference which (references point inward)

## Naming
- STD-03 TODO: namespaces, files, classes, database tables and columns

## Domain and application
- STD-04 TODO: where business rules live, and what a controller, page or handler may do

## Data access
- STD-05 TODO: how data is read and written (the data-access pattern of the stack), transactions, migrations

## Validation and errors
- STD-06 TODO: where input is validated, how errors reach the user and the API caller

## API and UI
- STD-07 TODO: endpoint style, response shape, paging; components from the design system only

## Security and data
- STD-08 TODO: permissions checked on the server, data scope filters, secrets never in code or logs

## Tests
- STD-09 TODO: test framework and assertion style, where tests live, one case per example row of a rule

## Not allowed
- STD-10 TODO: libraries, patterns or shortcuts this project rules out, with the reason
