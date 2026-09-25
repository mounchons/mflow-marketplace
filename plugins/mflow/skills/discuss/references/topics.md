# Discussion topics

Cross-cutting topics that customer documents usually leave open to interpretation. Each one touches many screens. If Claude guesses it wrong, it has to be fixed in every screen. Use the checklist to find what the sources do not say, and use the suggested shapes for section 3 of the document.

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

Conditions that depend on amounts, states or approval limits are business rules. Chart them with `/mflow:hotspot`, not here.

## org-structure: company, branch, department

- One company or several? Is master data shared between companies or separate?
- The hierarchy (company → region → branch → department) and which levels exist in the data.
- Does a user belong to one unit or several, and does the unit decide their data scope?
- Head-office roles that see across units.

## navigation: menu structure

- Menu groups and order, following the story map.
- The landing page or dashboard per role.
- Quick actions, favourites, and global search. What can search find, and for whom?

## numbering: document and record numbers

- The format (prefix, year Buddhist or Gregorian, branch code, running number) and when it resets.
- Is the number per branch or global? Is it issued at draft or at approval?
- Can cancelled numbers leave gaps, or must they be reused? Is this a legal requirement (tax invoices)?

## approval-overview: who approves what

Only the overall shape here: which documents need approval, how many levels, and who is at each level. Amount limits, delegation and escalation rules become a hotspot.

## notifications

- Which events notify, whom, and through which channel (in-app, email, LINE, SMS)?
- Who can only see the record, and must therefore not receive its details in a message?
- Reminders and escalation after a deadline.

## audit-history

- Which entities and fields keep a change history. Who can see it?
- Login and permission-change logs. How long must they be kept (retention)?
- Soft delete vs hard delete. Who can restore?

## import-export-print

- Imports from Excel: templates, validation, partial failure, and who may import.
- Exports: which lists, which columns, and whether the data scope applies (it should).
- Printed or legal documents: request a real sample from the customer, and ask about sizes and signatures.

## integration

- External systems: the direction, frequency, triggering event, and data owner.
- Failure handling: retry, manual resend, and who is alerted.
- Is there a test environment on the other side?

## master-data

- Who maintains each master list, and whether changes need approval.
- What happens to old documents when master data changes: do they keep the old value or show the new one?

## data-migration

- What comes from the old system, how many years of history, and who checks the migrated data.
- Records that do not fit the new rules. Are they cleaned before import or flagged afterwards?
