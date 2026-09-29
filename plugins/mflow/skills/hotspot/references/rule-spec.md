# Rule spec format and readiness bar

`rules.md` captures a hotspot as things a test can check. Prose explains; tables, diagrams and invariants decide.

## Building blocks

**Example table** (Specification by Example). One table per rule. Columns = the inputs that change the outcome, then the expected outcome. Rows cover every branch plus the edges: zero, boundary values, caps, rounding, missing data, reversal.

```markdown
### R1 Late fee (TASK-12, TASK-15)
| Item type | Days late | VIP | Expected fee | Note |
|---|---|---|---|---|
| A | 0 | no | 0 | on time |
| A | 3 | no | 300 | 100/day |
| A | 3 | yes | 150 | VIP half |
| B | 10 | no | 2,000 | capped |
```

Rounding, currency, time zone and "which date counts" (created, approved, delivered) are stated once under the table.

**State machine.** For every document or entity with a lifecycle: all states, every transition, who may trigger it, and what each transition does to other aggregates. Mermaid `stateDiagram-v2` plus a transition table:

| From | Event | To | Allowed role | Guard | Side effects |
|---|---|---|---|---|---|

**Invariants.** Statements that must hold after every operation, each with its owning aggregate:
`INV-1 (Contract): total paid never exceeds total billed + deposit.`

**Golden data.** A pointer to real historical cases with known correct outcomes (the customer's spreadsheet, last month's invoices), and how they map to the table columns.

## Readiness bar (the destination)

Graduate only when every item holds, each with evidence:

1. Every rule has an example table with at least one row per branch and at least one edge row.
2. Every entity with a lifecycle has a complete state machine; no transition lacks a role or guard.
3. Every invariant names its owning aggregate; no invariant needs two aggregates in one transaction without a recorded decision.
4. Golden data is identified (source and mapping), or explicitly waived by พี่ปู with a reason.
5. No open `ask` tickets remain; anything still unknown is in Out of scope with a reason.
6. The frontier is empty and `Not yet specified` is empty.

## Mapping to OpenSpec

| rules.md | OpenSpec delta spec |
|---|---|
| Rule R1 | `### Requirement:` with SHALL wording |
| Each distinct outcome row | `#### Scenario:` WHEN inputs THEN outcome |
| Invariant | its own Requirement with a violating Scenario |
| State transition | Requirement per transition group; Scenario per guard |
| Golden data | referenced in the change's tasks, loaded by a data-driven test (xUnit `[MemberData]` in the .NET profiles) |
