# Discussion topics

Cross-cutting topics that customer documents usually leave open to interpretation. Each one touches many screens. If Claude guesses it wrong, it has to be fixed in every screen. Use the checklist to find what the sources do not say, and use the suggested shapes for section 3 of the document.

Each topic ends with a Visuals line: the pictures that usually explain it best (rules in visuals.md).

Every checklist item is either answered with a tag in the doc, turned into a decision (D) for the user, or listed under "ไม่รวมในเรื่องนี้". None is silently skipped.

Two topics stand first on every agenda, because everything after them is built on their answers: `tech-stack`, then `code-structure`, both before `/mflow:theme`. The profile chosen at `/mflow:init` is their starting point; these docs settle the detail.

**Where the answers come from, in this order:** the customer's sources and the user's word; then the team's standards, when a team knowledge base is connected (for example the Graph Brain MCP: search it for the standard tech stack, the .NET conventions and the solution structure), tagged `[ที่มา: brain <note title>]`; then Claude's proposal, tagged `[เสนอ]`. A note that records a team standard ("default .NET 10", "default PostgreSQL 18") is the recommended option. A note about one past project is an example, not a rule; where examples disagree (one project uses a mediator library, another forbids it), that is a decision (D). In a repo that already has code, the code is a source too: state what exists and what the doc would change.

## tech-stack: apps, frameworks, libraries, database, containers

Split it by app if it grows past ~200 lines, for example `tech-stack-web` and `tech-stack-mobile`.

Checklist:
- **Apps:** every deployable part and who uses it: web apps (back office, a portal for customers or suppliers…), the API, mobile, background workers, scheduled jobs. For each: users, reach (intranet or internet), devices, and whether it is in this release or later. Each app takes its name and folder from the app names in code-structure (`<ProjectName>.Web.Backend`, `<ProjectName>.Web.Frontend`, `<ProjectName>.Api`), so settle here whether a second web app or API is planned, even for later.
- **Web front end, per app:** framework (MVC + Razor + HTMX, React + Vite, Next.js with static export or a server), TypeScript strictness, CSS (the kit's `tokens.css` with Bootstrap, or another base), components (the kit's contracts; a component library only if it can meet them), forms and validation, data fetching, tables with server paging, icons, languages (Thai only, or Thai and English), the kit's date format.
- **Several web apps:** mflow's `## Stack` seams (UI files, tokens, app shell, components, style guide) hold one path each, and `/mflow:theme` and `/mflow:screen` assume one UI app. Decide where the kit lives (one shared kit package, such as `packages/ui`, or one kit per app) and which app each screen belongs to. Building a kit per app is not automated yet; say so in the doc. Until it is, the `## Stack` seams point at the app that hosts the prototype screens, usually `<ProjectName>.Web.Backend`.
- **Mobile:** a responsive web app or PWA first, React Native (Expo), Flutter, or native; it calls the same API; offline use, push notifications, camera or GPS, store publishing.
- **API:** the runtime (default .NET 10 LTS with C# 14), minimal APIs or controllers, versioning (`/api/v1`), the OpenAPI document and its UI, authentication (cookie session or JWT with refresh), validation, mapping (hand-written or a library), a mediator (none, or a library), error format (ProblemDetails), logging (for example Serilog), health checks, rate limiting.
- **Data:** the database (default PostgreSQL 18) and access (EF Core 10 with the Npgsql provider), naming (for example snake_case), how migrations reach each environment, money and date types, soft delete and audit columns (details per aggregate in the data-model docs), one tenant or many, backups.
- **Files and documents:** where uploads live (disk, or S3-compatible storage such as MinIO), Excel, PDF, e-mail, barcodes and QR codes.
- **Containers and environments:** Docker for every service; `docker-compose` for local work (the database on a free port rather than the default one, so it does not clash with another project); multi-stage Dockerfiles (for .NET, `mcr.microsoft.com/dotnet/sdk` to build and `aspnet` to run); environments (dev, UAT, production) and where each runs (the customer's server, a cloud); reverse proxy and HTTPS; secrets (`.env` locally, never in git); CI/CD.
- **Tests:** unit (xUnit for .NET, Vitest for the web), integration against a real database (Testcontainers), E2E (Playwright), the assertion library.
- **Licences: open source and free is the rule, and it is checked, not assumed.** For every package and container image chosen (NuGet, npm, Docker), verify its current licence for the pinned version at decision time and record it in the libraries table. Licences change between major versions: MediatR, AutoMapper and FluentAssertions moved to commercial licences, EPPlus needs a paid licence for commercial use, QuestPDF is free only under its community terms, and Redis changed its licence (Valkey is the BSD-licensed fork). A paid or non-open-source choice needs the user's explicit decision (D) with the cost stated.
- **Core now, extras from evidence.** Every extra (a cache such as Redis or Valkey, a message queue such as RabbitMQ, a job scheduler such as Hangfire or Quartz.NET, search, real-time with SignalR, object storage, observability with OpenTelemetry) gets exactly one outcome: **now**, when a cited need requires it (volume, a response-time target, jobs in scope, several instances sharing state); **later**, with the trigger that brings it in and what is prepared now so adding it is cheap (for example an `ICacheService` over the in-memory cache, or an outbox table before a queue); or **not needed**. Nothing is added "just in case".

Suggested shapes for section 3:

| App | Users | Reach | Technology (version) | Folder | Release |
|---|---|---|---|---|---|

| Purpose | Library or image (version) | Licence (checked on) | Alternative considered |
|---|---|---|---|

| Extra | Outcome (now / later / not needed) | Evidence or trigger | Prepared now |
|---|---|---|---|

| Environment | Where it runs | Services (containers) | How it is deployed |
|---|---|---|---|

Decisions it usually needs: authentication style, a mediator or not, a mapping library or hand-written mapping, the mobile approach, the web framework per app, one kit or one per app.

Visuals: a `flowchart LR` of the apps, the API, the database and the external systems, with the parts left for later dashed and marked (later); the docker-compose services as a small table.

## code-structure: repository, solution and folders

Checklist:
- **Project name:** the name in code that every project, folder and namespace starts with: `Project name (code)` in AGENTS.md `## Stack`, chosen at `/mflow:init`. It is not the display name in the AGENTS.md title, which may be Thai. When it is missing or `TODO` (projects set up before mflow 0.22), it is a decision (D) with three suggestions, as "Project name" in `${CLAUDE_PLUGIN_ROOT}/skills/init/references/stacks.md` describes; at approval it is written to `## Stack`.
- **App names:** every deployable app is `<ProjectName>.<Kind>` or `<ProjectName>.<Kind>.<Part>`, for its project, its folder and its root namespace alike.
  - **Kind:** `Web` for a site people open in a browser, `Api` for an HTTP API. Other kinds follow the same pattern (`Worker`, `Mobile`).
  - **Part:** which app of that kind. When a kind has more than one app, or the tech-stack doc plans another one later, every app of that kind carries a part from the first, so none is renamed later. `Frontend` is หน้าบ้าน, the site or API for customers or the public; `Backend` is หลังบ้าน, the back office for staff; another audience takes its own name (`Portal`, `Partner`). Frontend and Backend name the audience, not the browser and server tiers: a web app's server side is part of that app or of its `.Api`.
  - **One app of a kind, none planned:** no part (`<ProjectName>.Api`).
  - **Not .NET:** a React or other web app keeps the same folder name; its package name is the same in lowercase with hyphens (`schoolhr-web-frontend`).
  - Example: `SchoolHr.Web.Backend` (หลังบ้าน for HR staff), `SchoolHr.Web.Frontend` (หน้าบ้าน for teachers), `SchoolHr.Api` (the only API).
- **Repository:** one repo for everything (the default: every app and layer project under `src/`, then `tests/`, `docs/`, `deploy/` and `<ProjectName>.slnx` at the root; or `apps/` for the apps and `packages/` for the shared projects) or one per app; the folder of each app from the tech-stack doc, named as above.
- **.NET solution, split by layer,** following the team's standard when the knowledge base has one:
  - `<ProjectName>.Domain`: entities, value objects, enums, domain services and domain rules; references nothing. Some teams call it `.Core`: choose one name (D). The golden-data folder in `## Stack` follows it (`tests/<ProjectName>.Domain.Tests/Golden/`).
  - `<ProjectName>.Application`: use cases, DTOs, validation, and the interfaces the outer layers implement (repositories, file storage, e-mail).
  - `<ProjectName>.Infrastructure`: the EF Core DbContext, entity configurations and migrations, repositories, external services, Excel, PDF and file storage.
  - The apps (`<ProjectName>.Api`, each `<ProjectName>.Web.<Part>` that is an MVC app): endpoints or controllers, authentication, middleware, and the composition root that wires the DI.
  - References point inward only: the Api and Web apps → Infrastructure → Application → Domain. An architecture test enforces it (NetArchTest or ArchUnitNET, both free).
- **Modules:** a folder per bounded context inside each layer (`Domain/<Module>/`), or a project per context only when separate teams or deployments need it; a shared building-blocks project only when two contexts truly share code.
- **Inside Application:** folders by feature (`Features/<Module>/<UseCase>/`, recommended) or by kind (Commands, Queries, Dtos).
- **Tests:** a test project per project it tests, named after it plus `.Tests` (`<ProjectName>.Domain.Tests` with its golden data, `<ProjectName>.Application.Tests`, `<ProjectName>.Api.Tests` for integration, `<ProjectName>.Web.Backend.Tests`), `<ProjectName>.ArchitectureTests`, and the E2E folder.
- **Web and mobile apps:** the folder layout of each app (routes or pages, `features/<module>`, `components` for the kit, `lib` for the API client and the date and number formats), and shared packages (`packages/ui` for the kit, an API client generated from the OpenAPI document).
- **Build settings:** `global.json` pins the SDK; `Directory.Build.props` holds the target framework, nullable and analyzer settings; `Directory.Packages.props` pins package versions in one place; `.editorconfig`; `.env.example` committed and `.env` ignored.
- **Names:** namespaces follow folders; code names come from the Domain vocabulary in AGENTS.md.
- **mflow's seams:** every row of `## Stack` (UI files, tokens, app shell, components, prototype data, prototype-mode flag, tests, golden data) points at a real path in this layout.

Suggested shapes for section 3: the folder tree in a `text` block, such as

```text
src/
  SchoolHr.Domain/
  SchoolHr.Application/
  SchoolHr.Infrastructure/
  SchoolHr.Api/
  SchoolHr.Web.Backend/
  SchoolHr.Web.Frontend/
tests/
  SchoolHr.Domain.Tests/
  SchoolHr.Api.Tests/
  SchoolHr.ArchitectureTests/
SchoolHr.slnx
```

and

| Project | Holds | References | Must not reference |
|---|---|---|---|

Decisions it usually needs: the project name when init did not settle it, whether a kind gets parts now (a second web app or API planned), `.Domain` or `.Core`, folders by feature or by kind.

Creating the solution is work: at approval it becomes a Backlog task or an `/opsx:propose` change, never files written by the discussion.

Visuals: the folder tree; a `flowchart TB` of the project references, with the forbidden direction noted under it.

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

Implementation direction to propose as `[เสนอ]` and confirm through a decision (for the .NET profiles `mvc-htmx` and `react-vite`; under another profile, adapt to AGENTS.md `## Stack`):
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
- Types: take the database engine from AGENTS.md. Give the code type in the stack's language and that engine's column type; name the column after the language (`.NET type`, `TS type`, `PHP type`…). With no engine decided, give code types only, and make the engine a decision.
- Keys: the surrogate key type (Guid or int), the business number (see the numbering topic), and what must be unique.
- Relations: foreign keys, cardinality, and what happens to children when the parent is cancelled or deleted.
- Standard columns: the data-scope keys from the access-control doc (`BranchId`, `CreatedBy`, `AssignedTo`), audit columns (created and updated, by whom and when), and a concurrency token.
- Deletion and history: soft or hard delete; change history (see audit-history).
- Status: an enum in code or a lookup table. Transitions with conditions are a hotspot.
- Money, quantities, dates: precision, currency, rounding (a hotspot if it matters), time zone. Store Gregorian dates and show the Buddhist year only in the UI, unless the customer requires otherwise; the kit's date format (pattern and year, `/mflow:theme`) is where that choice lives.
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

Implementation direction to propose as `[เสนอ]` (for the .NET profiles; under another profile, adapt to AGENTS.md `## Stack`):
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
