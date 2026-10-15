# Discussion topics

Cross-cutting topics that customer documents usually leave open to interpretation. Each one shapes many later decisions. If Claude guesses it wrong, it has to be fixed everywhere that depends on it. Use the checklist to find what the sources do not say, and use the suggested shapes for section 3 of the document.

Each topic ends with a Visuals line: the pictures that usually explain it best (rules in [visuals.md](visuals.md)).

Every checklist item is either answered with a tag in the doc, turned into a decision (D) for the user, or listed under "ไม่รวมในเรื่องนี้". None is silently skipped.

**The four foundation topics stand first on every agenda,** because the UI kit and everything after it are built on their answers: `tech-stack`, `code-structure` and `nfr` before `/mreq:theme`, and `security-privacy` before the first handoff to the builder. `/mreq:init` puts them on the agenda as rows 1 to 4. The project name chosen at `/mreq:init` is code-structure's starting point; these docs settle the detail.

**Where the answers come from, in this order:** the user's word and the customer's files (the ones the user names, then those in `mreq/source/`); then the team's standards, when a team knowledge base is connected (for example the Graph Brain MCP: search it for the standard tech stack, the .NET conventions and the solution structure), tagged `[ที่มา: brain <note title>]`; then Claude's proposal, tagged `[เสนอ]`. A note that records a team standard ("default .NET 10", "default PostgreSQL 18") is the recommended option. A note about one past project is an example, not a rule; where examples disagree (one project uses a mediator library, another forbids it), that is a decision (D). In a repo that already has code, the code is a source too: state what exists and what the doc would change.

mreq records these answers; it never creates the solution, the folders or the packages they describe. That work is a line for the builder in `mreq/project/followups.md`.

## tech-stack: apps, frameworks, libraries, database, containers

Split it by app if it grows past ~200 lines, for example `tech-stack-web` and `tech-stack-mobile`.

Checklist:
- **Apps:** every deployable part and who uses it: web apps (back office, a portal for customers or suppliers…), the API, mobile, background workers, scheduled jobs. For each: its kind (`Web`, `Api`, `Worker`, `Mobile`), users, reach (intranet or internet), devices, whether it has screens, and whether it is in this release or later. Each app takes its name and folder from the app names in code-structure (`<ProjectName>.Web.Backend`, `<ProjectName>.Web.Frontend`, `<ProjectName>.Api`), so settle here whether a second web app or API is planned, even for later.
- **Web front end, per app:** framework (MVC + Razor + HTMX, React + Vite, Next.js with static export or a server), TypeScript strictness, CSS (the kit's `tokens.css`, with Bootstrap as in the kit's preview, or another base that reads the same tokens), components (the kit's contracts; a component library only if it can meet them), forms and validation, data fetching, tables with server paging, icons, languages (Thai only, or Thai and English), the kit's date format.
- **Several apps with screens:** one UI kit serves them all: the same tokens and components, with one shell per kind of app, the back-office `AppShell` (sidebar) for `Backend` apps and the public `SiteShell` (top navigation) for `Frontend`, `Portal` and other public-facing apps. Say which app each group of screens belongs to; the prototype screens of each app live in `mreq/ui/prototype/<App>/`. Whether the real code shares the kit as one package (such as `packages/ui`) or copies it into each app is decided here and laid out in code-structure.
- **Mobile:** a responsive web app or PWA first, React Native (Expo), Flutter, or native; it calls the same API; offline use, push notifications, camera or GPS, store publishing.
- **API:** the runtime (default .NET 10 LTS with C# 14), minimal APIs or controllers, versioning (`/api/v1`), the OpenAPI document and its UI, authentication (cookie session or JWT with refresh; the login methods themselves are settled in security-privacy), validation, mapping (hand-written or a library), a mediator (none, or a library), error format (ProblemDetails), logging (for example Serilog), health checks, rate limiting.
- **Data:** the database (default PostgreSQL 18) and access (EF Core 10 with the Npgsql provider), naming (for example snake_case), how migrations reach each environment, money and date types, soft delete and audit columns, one tenant or many, backups (how often and how long they are kept comes from nfr).
- **Files and documents:** where uploads live (disk, or S3-compatible storage such as MinIO), Excel, PDF, e-mail, barcodes and QR codes.
- **Containers and environments:** Docker for every service; `docker-compose` for local work (the database on a free port rather than the default one, so it does not clash with another project); multi-stage Dockerfiles (for .NET, `mcr.microsoft.com/dotnet/sdk` to build and `aspnet` to run); environments (dev, UAT, production) and where each runs (the customer's server, a cloud); reverse proxy and HTTPS; secrets (`.env` locally, never in git); CI/CD.
- **Tests:** unit (xUnit for .NET, Vitest for the web), integration against a real database (Testcontainers), E2E (Playwright), the assertion library.
- **Licences: open source and free is the rule, and it is checked, not assumed.** For every package and container image chosen (NuGet, npm, Docker), verify its current licence for the pinned version at decision time and record it in the libraries table. Licences change between major versions: MediatR, AutoMapper and FluentAssertions moved to commercial licences, EPPlus needs a paid licence for commercial use, QuestPDF is free only under its community terms, and Redis changed its licence (Valkey is the BSD-licensed fork). A paid or non-open-source choice needs the user's explicit decision (D) with the cost stated.
- **Core now, extras from evidence.** Every extra (a cache such as Redis or Valkey, a message queue such as RabbitMQ, a job scheduler such as Hangfire or Quartz.NET, search, real-time with SignalR, object storage, observability with OpenTelemetry) gets exactly one outcome: **now**, when a cited need requires it (volume, a response-time target, jobs in scope, several instances sharing state); **later**, with the trigger that brings it in and what is prepared now so adding it is cheap (for example an `ICacheService` over the in-memory cache, or an outbox table before a queue); or **not needed**. The evidence usually comes from the approved nfr doc (users, data volume, response time). Nothing is added "just in case".

Suggested shapes for section 3:

| App | Kind | Users | Reach | Technology (version) | Folder | Release |
|---|---|---|---|---|---|---|

| Purpose | Library or image (version) | Licence (checked on) | Alternative considered |
|---|---|---|---|

| Extra | Outcome (now / later / not needed) | Evidence or trigger | Prepared now |
|---|---|---|---|

| Environment | Where it runs | Services (containers) | How it is deployed |
|---|---|---|---|

Decisions it usually needs: authentication style, a mediator or not, a mapping library or hand-written mapping, the mobile approach, the web framework per app, a shared kit package or a copy per app.

Visuals: a `flowchart LR` of the apps, the API, the database and the external systems, with the parts left for later dashed and marked (later); the docker-compose services as a small table.

## code-structure: repository, solution and folders

Checklist:
- **Project name:** the name in code that every project, folder and namespace starts with: `Project name (code)` in AGENTS.md `## Stack`, asked at `/mreq:init`. It is not the display name in the AGENTS.md title, which may be Thai. When it is missing or `TODO`, it is a decision (D) with three suggestions, as `${CLAUDE_PLUGIN_ROOT}/skills/init/references/project-name.md` describes; at approval it is written to `## Stack`.
- **App names:** every deployable app is `<ProjectName>.<Kind>` or `<ProjectName>.<Kind>.<Part>`, for its project, its folder and its root namespace alike, with the rules for `Kind` and `Part` in project-name.md: `Web`, `Api`, `Worker`, `Mobile`; `Backend` for the staff back office, `Frontend` for the public or customers, another audience by its own name (`Portal`, `Partner`); a part from the first app of a kind when a second one is planned.
  - Example: `SchoolHr.Web.Backend` (หลังบ้าน for HR staff), `SchoolHr.Web.Frontend` (หน้าบ้าน for teachers), `SchoolHr.Api` (the only API).
- **Repository:** one repo for everything (the default: every app and layer project under `src/`, then `tests/`, `docs/`, `deploy/` and `<ProjectName>.slnx` at the root; or `apps/` for the apps and `packages/` for the shared projects) or one per app; the folder of each app from the tech-stack doc, named as above. `mreq/` stays at the root beside them.
- **.NET solution, split by layer,** following the team's standard when the knowledge base has one:
  - `<ProjectName>.Domain`: entities, value objects, enums, domain services and domain rules; references nothing. Some teams call it `.Core`: choose one name (D).
  - `<ProjectName>.Application`: use cases, DTOs, validation, and the interfaces the outer layers implement (repositories, file storage, e-mail).
  - `<ProjectName>.Infrastructure`: the EF Core DbContext, entity configurations and migrations, repositories, external services, Excel, PDF and file storage.
  - The apps (`<ProjectName>.Api`, each `<ProjectName>.Web.<Part>` that is an MVC app): endpoints or controllers, authentication, middleware, and the composition root that wires the DI.
  - References point inward only: the Api and Web apps → Infrastructure → Application → Domain. An architecture test enforces it (NetArchTest or ArchUnitNET, both free).
- **Modules:** a folder per bounded context inside each layer (`Domain/<Module>/`), or a project per context only when separate teams or deployments need it; a shared building-blocks project only when two contexts truly share code.
- **Inside Application:** folders by feature (`Features/<Module>/<UseCase>/`, recommended) or by kind (Commands, Queries, Dtos).
- **Tests:** a test project per project it tests, named after it plus `.Tests` (`<ProjectName>.Domain.Tests`, `<ProjectName>.Application.Tests`, `<ProjectName>.Api.Tests` for integration, `<ProjectName>.Web.Backend.Tests`), `<ProjectName>.ArchitectureTests`, and the E2E folder.
- **Web and mobile apps:** the folder layout of each app (routes or pages, `features/<module>`, `components` for the kit, `lib` for the API client and the date and number formats), and shared packages (`packages/ui` for the kit when the tech-stack doc shares it, an API client generated from the OpenAPI document).
- **Build settings:** `global.json` pins the SDK; `Directory.Build.props` holds the target framework, nullable and analyzer settings; `Directory.Packages.props` pins package versions in one place; `.editorconfig`; `.env.example` committed and `.env` ignored.
- **Names:** namespaces follow folders; code names come from the Domain vocabulary in AGENTS.md.

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
mreq/
SchoolHr.slnx
```

and

| Project | Holds | References | Must not reference |
|---|---|---|---|

Decisions it usually needs: the project name when init did not settle it, whether a kind gets parts now (a second web app or API planned), `.Domain` or `.Core`, folders by feature or by kind, a shared kit package or a copy per app.

Creating the solution and its folders is work for the builder: at approval it becomes a line under `## For the builder` in `mreq/project/followups.md`, never files written by the discussion.

Visuals: the folder tree; a `flowchart TB` of the project references, with the forbidden direction noted under it.

## nfr: users, data volume, speed, availability, backup

The numbers the other topics need as evidence: tech-stack decides its extras from them, and the UI kit takes its devices and acceptance sizes from them. Each number carries its source; a guess is tagged `[อนุมาน]` and goes to section 5, so it is watched when the system is tried.

Checklist:
- **Users:** how many in total, per app and per role; how many at the same time at the busiest hour; when the busy periods are (month-end, enrolment day, payroll day); expected growth over three years.
- **Data volume:** records per year for the largest data groups (documents, transactions, attendance…); file uploads per month and their typical size; how long data stays online before it is archived (the legal retention periods come from security-privacy).
- **Response time:** what "fast enough" means for opening a list, a search, saving a form, a report and an export; which work may run in the background with a notice when done.
- **Availability:** office hours or around the clock; how long an outage is acceptable, and at which times; the maintenance window; what people do while the system is down.
- **Backup and restore:** how often, how long backups are kept, how much recent data may be lost at most (RPO), how fast the system must be back (RTO), where backups are kept, and who tests a restore and how often.
- **Devices and browsers:** per app with screens, the devices people use (office PC, laptop, tablet, phone) and the window sizes that must work, which become the kit's acceptance sizes; supported browsers and versions; the connection on site (office LAN, slow mobile data).
- **Languages:** Thai only, or Thai and English, and for which apps and documents (the date format itself is settled by the UI kit's questions).
- **Accessibility:** text size, contrast (WCAG 2.1 AA as the default), keyboard use, screen readers where public users need them.
- **Printing and exports:** which documents are printed, on what paper, and how many at once (a month-end batch differs from one slip).

Suggested shapes for section 3:

| Measure | Value | Source | Why it matters |
|---|---|---|---|

| App | Devices | Acceptance sizes | Browsers | Languages |
|---|---|---|---|---|

| Data group | Records per year | Kept online | Then |
|---|---|---|---|

Decisions it usually needs: the availability target and the maintenance window, the backup frequency with the RPO and RTO, the devices and sizes for a public-facing app, Thai only or Thai and English.

Visuals: a `gantt` of the busy periods across a year or a month when load is uneven (or one line saying load is even); the device table above.

## security-privacy: login, access protection, personal data (PDPA)

How people prove who they are, how the system protects what they see, and how it handles personal data under Thailand's Personal Data Protection Act (PDPA, พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล). Who may see which menu, record or field is the later access-control topic; this doc settles the rules every app follows.

Checklist:
- **Login, per app:** accounts kept in the system, the organisation's directory (AD/LDAP), single sign-on through OIDC or SAML (Microsoft Entra ID, Keycloak…), Google, or LINE Login for public users; who creates accounts and who disables them when someone leaves; self-registration for a public app; the forgotten-password flow.
- **Passwords and sessions:** minimum length and other rules, lockout after failed attempts, multi-factor authentication (who must use it, which factor: an authenticator app, SMS, e-mail), session timeout and "remember me", one session per user or several.
- **Personal data held:** for each data group, what is kept and whose it is (staff, customers, students, children); sensitive data that needs explicit consent (health, religion, criminal records, biometrics); the national ID number and bank accounts.
- **Lawful basis and consent:** the basis for each data group (contract, legal obligation, consent, legitimate interest); where the privacy notice is shown; how consent is recorded and how it is withdrawn.
- **Retention:** how long each data group is kept and what happens after (deleted, or anonymised for reports).
- **Rights of the people the data is about:** access, correction, deletion, portability and objection; who receives a request and how it is answered in time.
- **Breach:** who notices, who decides, and who notifies; PDPA's 72-hour notice to the regulator when a breach risks people's rights, and telling the people affected when the risk is high.
- **Processors and location:** outside services that receive personal data (cloud hosting, SMS or e-mail gateways, payment), where the servers and backups are (Thailand, the customer's own server, a cloud region), and any transfer abroad; whether a data protection officer is needed.
- **Encryption and masking:** HTTPS everywhere; data at rest (database, backups, uploaded files); fields stored encrypted or shown masked (national ID number, bank account); where secrets live.
- **Audit of access:** who viewed or changed personal data and when, how long the log is kept, and who may read it.
- **Security testing:** a security review or penetration test before go-live, by whom, and against what standard (OWASP ASVS level 1 as the default).

Suggested shapes for section 3:

| App | Login method | MFA | Session timeout | Account created by |
|---|---|---|---|---|

| Data group | Examples | Whose | Lawful basis | Retention | Then | Encrypted or masked |
|---|---|---|---|---|---|---|

Decisions it usually needs: the login method per app, who must use MFA, the retention period per data group, where the data is stored, which fields are encrypted or masked.

Visuals: a `sequenceDiagram` of the login (with the SSO redirect when there is one); a `flowchart LR` of personal data from collection to deletion.

## Other topics

Roles, menus and data visibility (`access-control`), the data model of each group of data (`<aggregate>-data`), document numbering (`numbering`), approvals, notifications, integration, import and export, and data migration arrive with a later phase of mreq. Meanwhile a topic the user names still gets a discussion doc by the general method in SKILL.md: find what the sources leave open, answer what they settle with a tag, and turn every open choice into a decision.
