# foundation requirements

What the delivered repository must have: the stack it runs on, how the solution is split and named, what a clean machine needs to build and run it, and which packages it may depend on. Requirements of a choice the project answered differently are rewritten to that answer at approval. Where a rule says what another pack owns, that pack's text applies once it is selected.

### Requirement: Back-end runtime
The back end SHALL be ASP.NET Core on .NET {foundation.dotnet_major} with C# {foundation.csharp_major}. Every .NET project in the solution, including workers and one-shot jobs, SHALL target that same .NET version. (FOUND-D01, FOUND-D26)

#### Scenario: Target framework
- **WHEN** a developer lists the target framework of every .NET project
- **THEN** each one is the framework of .NET {foundation.dotnet_major}, and none sets its own

### Requirement: API endpoints
HTTP endpoints SHALL be controllers grouped by module. An endpoint SHALL validate, authorize and call the Application layer, and SHALL hold no business rule. (FOUND-D02, FOUND-D22)

#### Scenario: A business rule in a controller
- **WHEN** a reviewer finds a business rule written inside a controller action
- **THEN** the rule is moved to Domain or Application and the action only calls it

### Requirement: Use cases without a mediator
Endpoints SHALL call Application services directly, and mappings between entities and DTOs SHALL be written by hand. No mediator or mapping library SHALL be referenced. (FOUND-D03)

#### Scenario: Package list
- **WHEN** a developer reads `Directory.Packages.props`
- **THEN** it lists no mediator and no object-mapping package

### Requirement: Input validation
Input rules SHALL be FluentValidation validators in the Application layer, next to the use case they check. (FOUND-D04)

#### Scenario: A rule across two fields
- **WHEN** a request's end date is before its start date
- **THEN** the validator of that use case rejects it, and a unit test of the validator covers the case without a web host

### Requirement: Database and data access
The database SHALL be PostgreSQL {foundation.postgres_major}, reached through EF Core with the Npgsql provider. The DbContext, entity configurations and migrations SHALL live in `{project_name}.Infrastructure`, and the schema SHALL change only through migrations. (FOUND-D05)

#### Scenario: Schema change
- **WHEN** a developer adds a column
- **THEN** a new migration in `{project_name}.Infrastructure` carries it, and no script changes the schema outside migrations

#### Scenario: Model and migrations disagree
- **WHEN** an entity changes and no migration is added
- **THEN** the test suite fails and says that the model has pending changes

### Requirement: Names and money in the database
Table and column names SHALL be snake_case through one naming convention, without a name written column by column. Money SHALL be `decimal` in code and {foundation.money_precision} in the database. Quantities and weights SHALL be `decimal`, and no money or quantity column SHALL be a float or an integer. (FOUND-D06)

#### Scenario: A new entity
- **WHEN** a developer adds a `DbSet` named `PurchaseOrders` whose entity has the money property `TotalAmount`
- **THEN** the migration creates the table `purchase_orders` with the column `total_amount` of type {foundation.money_precision}

### Requirement: Application reaches data through interfaces
The Application layer SHALL reach data only through interfaces it declares: one repository per aggregate root for writes and one query set per module for reads, implemented in `{project_name}.Infrastructure`. `{project_name}.Application` SHALL not reference EF Core. (FOUND-D07)

#### Scenario: Prototype data behind the same interface
- **WHEN** prototype mode is on and a screen lists records
- **THEN** a fake implementation of the same interface answers, and no endpoint or use case changes between the fake and the real one

#### Scenario: EF Core in Application
- **WHEN** a type in `{project_name}.Application` uses a type of EF Core
- **THEN** the architecture test fails and names the rule

### Requirement: One organisation per installation
One installation SHALL serve one organisation, and business tables SHALL have no tenant column. (FOUND-D08)

#### Scenario: A business table
- **WHEN** a reviewer reads the columns of a business table
- **THEN** none is a tenant key

### Requirement: Web application
Under the profile `react-vite`, each web app SHALL be React {foundation.react_major} with Vite and TypeScript in `strict` mode, built with Node {foundation.node_major} into static files that the proxy serves. Under the profile `mvc-htmx`, it SHALL be ASP.NET Core MVC with Razor and HTMX. A web built with Node SHALL not be a project of the .NET solution, so a .NET build does not run it. (FOUND-D09, FOUND-D22)

#### Scenario: Type error
- **WHEN** a developer assigns a possibly undefined value to a required field in a `react-vite` web and runs its build
- **THEN** the build fails

#### Scenario: Production has no Node
- **WHEN** the image of a `react-vite` web is built
- **THEN** it holds the static files and the proxy, and no Node runtime

#### Scenario: .NET build leaves the web alone
- **WHEN** a developer builds the .NET solution
- **THEN** no build of a Node web runs

### Requirement: CSS base reads the kit's tokens
The `react-vite` web SHALL use Tailwind CSS 4 reading the kit's `tokens.css`; the `mvc-htmx` web SHALL use Bootstrap 5 through the kit's bridge. Colours and spacing SHALL come only from those tokens. (FOUND-D10)

#### Scenario: A hard-coded colour
- **WHEN** a page sets a colour that is not a token
- **THEN** `/mflow:review` reports it

### Requirement: React web libraries
A `react-vite` web SHALL use React Router for routes, with filters and the page kept in the URL; TanStack Query for data; React Hook Form with Zod for forms; and types and the API client generated from the OpenAPI document with openapi-typescript and openapi-fetch. (FOUND-D11)

#### Scenario: Reload keeps the list state
- **WHEN** a user filters a list, opens page 2 and reloads
- **THEN** the same filter and page are shown

#### Scenario: A changed API
- **WHEN** a response field is renamed and the client is regenerated
- **THEN** the web's type check names every place that used the old field

### Requirement: Web tooling
A web built with Node SHALL install with npm from a committed lockfile and SHALL be linted with ESLint and formatted with Prettier. (FOUND-D12, FOUND-D27)

#### Scenario: Clean install
- **WHEN** a developer runs `npm ci` on a clean machine
- **THEN** it installs exactly the versions in the lockfile

### Requirement: Spreadsheets
Reading and writing `.xlsx` files SHALL use ClosedXML behind an interface implemented in `{project_name}.Infrastructure`. (FOUND-D13, FOUND-D22)

#### Scenario: A rule that exports
- **WHEN** an Application use case produces a spreadsheet
- **THEN** it calls the interface, and `{project_name}.Application` does not reference ClosedXML

### Requirement: PDF library chosen with its first document
No PDF library SHALL be added until a printed or PDF document is in scope. When one is, the library SHALL be chosen from a real sample of the document, with its licence checked as for any package, and SHALL sit behind an interface implemented in `{project_name}.Infrastructure`. (FOUND-D14, FOUND-D29)

#### Scenario: No printed document in scope
- **WHEN** the release has no printed or PDF document
- **THEN** `Directory.Packages.props` lists no PDF library

### Requirement: Containers and one command
Every service SHALL run as a container, and one `docker compose up` from a fresh clone, after `.env.example` is copied to `.env`, SHALL start the whole stack. A developer SHALL be able to start only the database from the same compose file and run the API and the web from the machine. Every Dockerfile SHALL be multi-stage, and the final image SHALL hold neither an SDK nor source code. (FOUND-D15)

#### Scenario: Fresh clone
- **WHEN** a developer copies `.env.example` to `.env` and runs `docker compose up` on a clean machine
- **THEN** every service starts without any file being edited

#### Scenario: Only the database
- **WHEN** a developer starts the database service alone and runs the API from the machine
- **THEN** the API connects to it using the values in `.env`

#### Scenario: Final image
- **WHEN** a developer inspects the final API image
- **THEN** it holds the published application and the runtime, with no SDK and no source files

### Requirement: Local database does not clash
The local database SHALL be published on the machine's loopback address only, at port {foundation.db_dev_port}, never 5432, and its data SHALL live in a named volume. (FOUND-D16)

#### Scenario: Another PostgreSQL on the machine
- **WHEN** another PostgreSQL already uses port 5432 and the developer starts the compose file
- **THEN** the project's database starts at port {foundation.db_dev_port}

#### Scenario: Data survives a restart
- **WHEN** the developer runs `docker compose down` and then starts the stack again
- **THEN** the tables and rows are still there

#### Scenario: Not reachable from the network
- **WHEN** another machine on the same network connects to the developer's machine at port {foundation.db_dev_port}
- **THEN** the connection is refused

### Requirement: Reverse proxy
The reverse proxy SHALL be nginx from its official image, with its configuration in `{foundation.deploy_folder}`. (FOUND-D17)

#### Scenario: Changing a proxy rule
- **WHEN** a proxy rule changes
- **THEN** only a file in `{foundation.deploy_folder}` changes, and no application code does

### Requirement: Tests on the developer's machine
.NET tests SHALL use xUnit v3 on Microsoft Testing Platform; integration tests SHALL run against a real PostgreSQL {foundation.postgres_major} started by Testcontainers, and SHALL not use an in-memory database; a `react-vite` web SHALL use Vitest with Testing Library. One test command SHALL run all of the .NET tests on the developer's machine, including the architecture tests. Business rules SHALL be tested data-driven from golden data in `{foundation.tests_folder}/{project_name}.Domain.Tests/Golden/`, one case per row. (FOUND-D18)

#### Scenario: Test command from the root
- **WHEN** a developer with Docker running runs `dotnet test` at the root
- **THEN** unit, integration and architecture tests run, and no browser starts

#### Scenario: One case per row
- **WHEN** a golden-data file has three rows and the expected value of one is wrong
- **THEN** three cases are reported and only that one fails

### Requirement: Assertions
.NET tests SHALL assert with Shouldly. (FOUND-D19)

#### Scenario: A failing assertion
- **WHEN** an assertion fails
- **THEN** the message names the expression and both values

### Requirement: End-to-end tests only on request
Playwright tests SHALL live in `{foundation.e2e_folder}` and SHALL run only when someone asks for them. No default build or test command SHALL start them. (FOUND-D20)

#### Scenario: Default commands
- **WHEN** a developer runs the build and the test commands listed in AGENTS.md
- **THEN** no Playwright test runs

#### Scenario: On request
- **WHEN** someone runs the E2E command named in AGENTS.md
- **THEN** the Playwright tests in `{foundation.e2e_folder}` run

### Requirement: Repository layout
One repository SHALL hold everything: every app and layer project under `{foundation.src_folder}/`, the tests under `{foundation.tests_folder}/`, deployment files under `{foundation.deploy_folder}/`, documents under `docs/`, and `{project_name}.slnx` at the root. Every path in AGENTS.md `## Stack` SHALL point at a real path in this layout. (FOUND-D21)

#### Scenario: Build from the root
- **WHEN** a developer runs `dotnet build` at the root
- **THEN** every .NET project of `{project_name}.slnx` builds

#### Scenario: Stack paths exist
- **WHEN** a reviewer follows each path in `## Stack`
- **THEN** each one exists

### Requirement: Layers reference inward only
The solution SHALL have the layers `{project_name}.Domain`, `{project_name}.Application` and `{project_name}.Infrastructure`, plus the apps. References SHALL point inward only: the apps to Infrastructure, Infrastructure to Application, Application to Domain. Domain SHALL reference no other project and no package of data access, web framework, identity or mediator. An app SHALL use Infrastructure only to wire dependency injection at start. An architecture test SHALL check these rules on every test run and name the rule that failed. (FOUND-D22)

#### Scenario: Correct layering
- **WHEN** the architecture tests run on correctly layered code
- **THEN** every rule passes

#### Scenario: Domain uses the data access framework
- **WHEN** a type in `{project_name}.Domain` uses a type of EF Core
- **THEN** the architecture test fails and names the rule

#### Scenario: Application uses Infrastructure
- **WHEN** a type in `{project_name}.Application` uses a type of `{project_name}.Infrastructure`
- **THEN** the architecture test fails and names the rule

### Requirement: Modules and use-case folders
Each bounded context SHALL be one folder inside each layer, and the solution SHALL have one DbContext. In Application, each use case SHALL have one folder, `Features/<Module>/<UseCase>/`, holding its request, its handler or service, its validator and its DTOs. (FOUND-D23)

#### Scenario: Finding a use case
- **WHEN** a reviewer opens the folder of one use case
- **THEN** the request, the validator and the DTOs of that use case are all in it

#### Scenario: Work across two contexts
- **WHEN** one command changes records of two contexts and the second save fails
- **THEN** both are rolled back in the one transaction

### Requirement: Names of apps, projects and namespaces
Every deployable app SHALL be named `{project_name}.<Kind>` or `{project_name}.<Kind>.<Part>`, the same for its project, its folder and its root namespace. A web that is not .NET SHALL use the same folder name, and its package name SHALL be that name in lower case with hyphens. The innermost layer SHALL be `{project_name}.Domain`. A test project SHALL be the project it tests plus `.Tests`, and the architecture tests SHALL be `{project_name}.ArchitectureTests`. Namespaces SHALL follow folders. (FOUND-D24, FOUND-D25)

#### Scenario: One API
- **WHEN** the system has one API and no second one is planned
- **THEN** its project, folder and root namespace are all `{project_name}.Api`

#### Scenario: A namespace
- **WHEN** a class lives in the folder `Features/Orders/ApproveOrder/` of `{project_name}.Application`
- **THEN** its namespace is `{project_name}.Application.Features.Orders.ApproveOrder`

### Requirement: SDK pinned
`global.json` at the root SHALL pin the .NET SDK of the project's major version with roll-forward {foundation.sdk_roll_forward}. (FOUND-D26)

#### Scenario: A machine with a newer major SDK
- **WHEN** a developer with a newer major SDK also installed runs `dotnet --version` in the repository
- **THEN** it reports an SDK of .NET {foundation.dotnet_major}

### Requirement: Shared build settings
`Directory.Build.props` at the root SHALL set the target framework, nullable reference types, implicit usings and warnings as errors for every project, with the SDK's analyzers on. No project file SHALL set these again. (FOUND-D26)

#### Scenario: A possible null
- **WHEN** code in any project dereferences a value that may be null
- **THEN** the build fails

### Requirement: Package versions in one place
Every NuGet package version SHALL be set in `Directory.Packages.props`, and no project file SHALL state one. Every package and image SHALL be listed in the Libraries table of AGENTS.md with its full version. (FOUND-D27)

#### Scenario: A project states a version
- **WHEN** a project file puts a version on a package reference
- **THEN** restore fails

### Requirement: Code format and local settings
`.editorconfig` at the root SHALL define the code format that `dotnet format` applies. `.env.example` SHALL be committed and SHALL list every setting that the compose file and the apps read, with placeholder values only. `.env`, build output and `node_modules/` SHALL be ignored by git. (FOUND-D28)

#### Scenario: .env is ignored
- **WHEN** a developer creates `.env` at the root and runs `git status`
- **THEN** git does not list the file

#### Scenario: Every setting is listed
- **WHEN** a reviewer compares the names the compose file and the apps read from the environment with `.env.example`
- **THEN** every name is in `.env.example`

#### Scenario: Format check
- **WHEN** a developer runs `dotnet format --verify-no-changes` on formatted code
- **THEN** it reports no changes

### Requirement: Licences are checked
Every package and container image SHALL be open source and free for commercial use, with its licence checked for the pinned version when it is chosen and recorded with that date in AGENTS.md. A paid or non-open-source package SHALL be added only on the user's explicit decision, with its cost stated. (FOUND-D29)

#### Scenario: A package that needs a paid licence
- **WHEN** a change wants a package whose current licence requires payment for commercial use
- **THEN** the package is not added until the user has decided, with the cost stated

#### Scenario: Libraries table
- **WHEN** a reviewer reads the Libraries table
- **THEN** every package and image shows its version, its licence and the date it was checked

### Requirement: Extras only from evidence
A cache, message queue, search engine, real-time channel, object storage, observability stack or other extra SHALL be added only with a recorded need. Each extra the project considered SHALL have one recorded outcome: now with its need, later with its trigger and what is prepared, or not needed. (FOUND-D30)

#### Scenario: An extra without a need
- **WHEN** a change adds a cache and no response-time target or sharing need is recorded
- **THEN** the cache is not added

#### Scenario: A later extra
- **WHEN** a reviewer reads the outcome of an extra marked later
- **THEN** it states the trigger that brings it in and what is prepared now
