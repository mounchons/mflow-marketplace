# Discussion topics

Cross-cutting topics that customer documents usually leave open to interpretation. Each one touches many screens. If Claude guesses it wrong, it has to be fixed in every screen. Use the checklist to find what the sources do not say, and use the suggested shapes for section 3 of the document.

Each topic ends with a Visuals line: the pictures that usually explain it best (rules in visuals.md).

Every checklist item is either answered with a tag in the doc, turned into a decision (D), turned into a customer question, or listed under "ไม่รวมในเรื่องนี้". None is silently skipped.

## access-control: roles, menus, actions, data visibility

The topic customers underspecify most. Split it into two docs if it grows past ~200 lines, for example `roles-and-menus` and `data-visibility`.

Checklist:
- Roles: the full list, who holds each (job titles, headcount), and whether one user can hold several roles or different roles per branch.
- Menus: which menu groups and screens each role sees, and each role's landing page.
- Actions per screen: view, create, edit, delete/cancel, approve, export, print. Does editing depend on record state (e.g. no edits after approval)?
- Data scope (row level): all / own branch / own team / records I created / records assigned to me / sub-branches. Decide it per entity, not per screen.
- Field visibility: fields some roles must not see (cost, margin, salary, national ID, phone). Should they be hidden, masked, or shown as a range?
- Administration: are roles fixed in code, configurable in an admin screen, or a mix? Can a single user get extra permissions (override)? Who grants them, and is the change audited?
- Edge cases: acting for someone on leave, a user moving branch (what happens to their old records), deactivated users, temporary access.
- Leaks through the side door: export, print, reports, dashboards, search/autocomplete and notifications must obey the same data scope and field rules as the screen.

Suggested shapes for section 3:

| Role | Who (title, headcount) | Main job | Data scope |
|---|---|---|---|

| Menu / screen | Role A | Role B | Role C |
|---|---|---|---|
| (✓ full, R read-only, blank = hidden) | | | |

| Screen | Action | Allowed roles | Condition (record state, amount…) |
|---|---|---|---|

| Entity | Role | Rows visible | Example |
|---|---|---|---|

| Field | Roles that see it | Everyone else sees |
|---|---|---|

Implementation direction to propose as `[เสนอ]` and confirm through a decision (default .NET stack; adapt to AGENTS.md):
- One permission list is the single source for the menu, the endpoint authorization and the button visibility. Hiding a menu is not security: every endpoint checks the permission too.
- ASP.NET Core policy-based authorization with permission claims; the menu is built from the same permissions.
- Data scope is enforced in the query layer (repository specification or EF Core global query filter), never in the view.
- Field masking happens when the ViewModel is mapped, so exports and APIs reuse the same mapping.

Once approved, these tables become the prototype's `PrototypeData/roles.json` and `users.json`, which drive the role switcher the customer uses in the review. So the scenarios name example users with their title, role and unit, one to three per role.

Conditions that depend on amounts, states or approval limits are business rules. Chart them with `/mflow:hotspot`, not here.

Visuals: the same screen drawn once per role, saying what disappears (screenshots once the screens exist); a `flowchart TB` of the data-scope hierarchy (who sees which units).

## data-model: tables, columns, data dictionary

One doc per aggregate: a root table and its children, such as Jobs and JobStops. The slug is `<aggregate>-data`. The best time is after `/mflow:screen inventory`, when it is known which screens show the aggregate. The ~200-line cap does not count data-dictionary rows, because every column is listed.

Checklist:
- Screens: which screens read or write this aggregate (from `docs/ui/screens.md`), and what each one filters, sorts and searches on.
- Tables: root and child tables, and what one row means.
- Columns: name, Thai label, type, length or precision, required, key, default, unique, validation, example, and a source tag.
- Types: take the database engine from AGENTS.md. Give the .NET type and that engine's column type. With no engine decided, give .NET types only, and make the engine a decision.
- Keys: the surrogate key type (Guid or int), the business number (see the numbering topic), and what must be unique.
- Relations: foreign keys, cardinality, and what happens to children when the parent is cancelled or deleted.
- Standard columns: the data-scope keys from the access-control doc (`BranchId`, `CreatedBy`, `AssignedTo`), audit columns (created and updated, by whom and when), and a concurrency token.
- Deletion and history: soft or hard delete; change history (see audit-history).
- Status: an enum in code or a lookup table. Transitions with conditions are a hotspot.
- Money, quantities, dates: precision, currency, rounding (a hotspot if it matters), time zone. Store Gregorian dates and show the Buddhist year only in the UI, unless the customer requires otherwise.
- Snapshot or reference: values copied onto the document at the time (the price or customer name on an invoice) versus values read from master data.
- Text: maximum lengths taken from the customer's real data; Thai search and sorting.
- Attachments: where they are stored (database or file storage), plus size and type limits.
- Personal data (PDPA): which columns hold it, who sees them (field visibility), and how long they are kept.
- Volume and retention: rows per month, years kept online, archiving.

Suggested shapes for section 3:

| Table | One row is | Parent / relation | Rows per month |
|---|---|---|---|

An ER diagram as a mermaid `erDiagram` in a code fence.

One data dictionary per table:

| Column | ชื่อไทย | .NET type | DB type | Required | Key / default | Example | Source |
|---|---|---|---|---|---|---|---|

| Screen | Reads | Filters / sorts / search | Index needed |
|---|---|---|---|

Implementation direction to propose as `[เสนอ]` (default .NET stack; adapt to AGENTS.md):
- One EF Core entity per table, configured through `IEntityTypeConfiguration<T>`, with the precision of money set explicitly.
- Soft delete and data scope as global query filters, and a concurrency token on aggregates that several people edit.
- React + Vite: the same model lives in the API, and the UI receives DTOs.

What approval changes (the merge table in SKILL.md routes it):
- The prototype JSON stays nested per aggregate root (stops inside the job) whatever storage the doc chooses. The dictionary lists the child tables with their foreign keys. JSON field names are the future property names in camelCase, so the swap to EF Core needs no mapping.
- After approval, `PrototypeData/README.md` is the living data dictionary and the doc is the reasoning record. Field-level changes while prototyping (add, rename or drop a column; change its length or whether it is required) follow the schema-change rule there, without a new discussion doc. Structural changes (a new aggregate, a changed key or relationship, reversing a storage decision) need a new doc, or `/mflow:change-request` once built.
- When the OpenSpec change that builds the aggregate is archived, the entity and its migration own the columns, and that README section shrinks to a one-line pointer to them.

Visuals: an `erDiagram` of the aggregate; a `stateDiagram-v2` of its status when it has one.

## org-structure: company, branch, department

- One company or several? Is master data shared between companies or separate?
- The hierarchy (company → region → branch → department) and which levels exist in the data.
- Does a user belong to one unit or several, and does the unit decide their data scope?
- Head-office roles that see across units.

Visuals: a `flowchart TB` of the hierarchy.

## navigation: menu structure

- Menu groups and order, following the story map.
- The landing page or dashboard per role.
- Quick actions, favourites, and global search. What can search find, and for whom?

Visuals: a menu tree (`flowchart LR`, or `mindmap`); a sidebar wireframe per role.

## numbering: document and record numbers

- The format (prefix, year Buddhist or Gregorian, branch code, running number) and when it resets.
- Is the number per branch or global? Is it issued at draft or at approval?
- Can cancelled numbers leave gaps, or must they be reused? Is this a legal requirement (tax invoices)?

Visuals: sample numbers in backticks; a small `flowchart LR` of when the number is issued, if that is in question.

## approval-overview: who approves what

Only the overall shape here: which documents need approval, how many levels, and who is at each level. Amount limits, delegation and escalation rules become a hotspot.

Visuals: a `flowchart LR` with one lane per approver, or a `sequenceDiagram`.

## notifications

- Which events notify, whom, and through which channel (in-app, email, LINE, SMS)?
- Who can only see the record, and must therefore not receive its details in a message?
- Reminders and escalation after a deadline.

Visuals: a `sequenceDiagram` from the event to each recipient.

## audit-history

- Which entities and fields keep a change history. Who can see it?
- Login and permission-change logs. How long must they be kept (retention)?
- Soft delete vs hard delete. Who can restore?

Visuals: usually a table is enough; a `stateDiagram-v2` if records move through deleted and restored states.

## import-export-print

- Imports from Excel: templates, validation, partial failure, and who may import.
- Exports: which lists, which columns, and whether the data scope applies (it should).
- Printed or legal documents: request a real sample from the customer, and ask about sizes and signatures.

Visuals: a `flowchart LR` of import validation and partial failure; a wireframe of the printed layout.

## integration

- External systems: the direction, frequency, triggering event, and data owner.
- Failure handling: retry, manual resend, and who is alerted.
- Is there a test environment on the other side?

Visuals: a `sequenceDiagram` with an `alt` block for the failure path.

## master-data

- Who maintains each master list, and whether changes need approval.
- What happens to old documents when master data changes: do they keep the old value or show the new one?

Visuals: a `flowchart LR` of who changes what and who approves it.

## data-migration

- What comes from the old system, how many years of history, and who checks the migrated data.
- Records that do not fit the new rules. Are they cleaned before import or flagged afterwards?

Visuals: a `flowchart LR` from the old system through cleaning and checking to the new one; `gantt` for the cut-over if dates matter.
