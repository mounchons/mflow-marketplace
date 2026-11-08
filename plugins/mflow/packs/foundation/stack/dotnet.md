---
pack: foundation
stack: dotnet
---

# foundation on ASP.NET Core

Applies when the back end is ASP.NET Core: profiles `mvc-htmx` and `react-vite`. Guidance for /opsx:propose and apply: which file, package or API carries each decision and what has to be written by hand. Not code to paste. No versions are given on purpose: each project takes the latest stable release of the major line in `params.md`, checks its licence, and records the full version in AGENTS.md.

## Building blocks

| Concern | Use | Note |
|---|---|---|
| SDK pin | `global.json`: `sdk.version`, `sdk.rollForward` | the value of `sdk.version` needs all three parts; `10.0` alone is rejected |
| Test runner | `global.json`: `test.runner` = `Microsoft.Testing.Platform` | .NET 10 SDK and later; the default is still VSTest |
| Shared settings | `Directory.Build.props` at the root: `TargetFramework`, `Nullable`, `ImplicitUsings`, `TreatWarningsAsErrors` | analyzers are on by default for net5.0 and later (`EnableNETAnalyzers`), and `AnalysisLevel` defaults to `latest` |
| C# version | leave `LangVersion` unset; `net10.0` means C# 14 | Microsoft warns against `latest`, which changes with the compiler on each machine |
| Central versions | `Directory.Packages.props`, `ManagePackageVersionsCentrally` = `true`, one `PackageVersion` per package, `PackageReference` without `Version` | a `Version` in a project file is error NU1008 |
| Solution | `.slnx`; `dotnet new sln` creates it by default from .NET 10 | a Node web stays out, with no `.esproj`, so `dotnet build` does not run npm |
| Format | `.editorconfig` (`dotnet new editorconfig`), `dotnet format`, `dotnet format --verify-no-changes` | code-style rules are not enforced in the build unless `EnforceCodeStyleInBuild` is `true`; the format command carries them |
| EF Core | `Microsoft.EntityFrameworkCore`, `Npgsql.EntityFrameworkCore.PostgreSQL` (`UseNpgsql`), `Microsoft.EntityFrameworkCore.Design` as a private asset | |
| snake_case | `EFCore.NamingConventions`: `UseSnakeCaseNamingConvention()` on the options builder | |
| EF tool | local tool `dotnet-ef` in `.config/dotnet-tools.json`, `dotnet tool restore` | migrations: `dotnet ef migrations add <Name> --project <Infrastructure project> --output-dir Persistence/Migrations` |
| Architecture test | `TngTech.ArchUnitNET.xUnitV3`: `new ArchLoader().LoadAssemblies(...).Build()`, `ArchRuleDefinition`, `.Check(architecture)` | namespaces `ArchUnitNET.Loader`, `ArchUnitNET.Fluent`, `ArchUnitNET.xUnitV3` |
| Unit tests | `xunit.v3` | |
| Integration tests | `Testcontainers.PostgreSql` (`PostgreSqlBuilder`), `Microsoft.AspNetCore.Mvc.Testing` (`WebApplicationFactory<Program>`) | one container per test collection, tag the image with the production major |
| Golden data | `<None Include="Golden/**" CopyToOutputDirectory="PreserveNewest" />` in the Domain test project | a file with missing columns fails with its name and row |
| Images | `mcr.microsoft.com/dotnet/sdk:<major>.0` to build, `mcr.microsoft.com/dotnet/aspnet:<major>.0` to run, `postgres:<major>-alpine`, official `nginx` | |
| PostgreSQL volume | mount at `/var/lib/postgresql` for PostgreSQL 18 | not at `.../data`: the image keeps its data in a versioned folder under that path |

## Decision by decision

| Decision | .NET | Write yourself |
|---|---|---|
| FOUND-D01 | `net10.0` in `Directory.Build.props`; a worker uses `Microsoft.Extensions.Hosting` | |
| FOUND-D02 | `AddControllers`, `MapControllers`, `[ApiController]`; option b: `MapGroup` | one folder of controllers per module |
| FOUND-D03 | option b: `Mediator.SourceGenerator` and `Mediator.Abstractions`, `Riok.Mapperly` | the Application services and their mappings; with option b, map out to DTOs only, never into an aggregate |
| FOUND-D04 | `FluentValidation` | a filter that runs the validator and hands failures to the error format of the API |
| FOUND-D05 | `UseNpgsql`, `IEntityTypeConfiguration<T>` in Infrastructure | a test that fails on `context.Database.HasPendingModelChanges()`, or the command `dotnet ef migrations has-pending-model-changes` |
| FOUND-D06 | `UseSnakeCaseNamingConvention()`; `HasPrecision` or `HasColumnType` on money | a model check that every `decimal` property has a precision |
| FOUND-D07 | `DbContext` and `DbSet<T>` used in Infrastructure only; option b: `IAppDbContext` exposing `DbSet<T>` in Application, referencing `Microsoft.EntityFrameworkCore` | one repository per aggregate root, one query set per module, and the fakes for prototype mode |
| FOUND-D08 | option b: `HasQueryFilter` per tenant-owned entity, and row level security policies in a migration | the tenant key on every row; setting the tenant per transaction with an interceptor |
| FOUND-D09 | `mvc-htmx`: `AddControllersWithViews`, Razor views | the web app of the chosen profile |
| FOUND-D10 | | see the profile sections below |
| FOUND-D11 | the API's OpenAPI document as the source of the generated client | see `react-vite` below |
| FOUND-D12 | | see `react-vite` below |
| FOUND-D13 | `ClosedXML` (`XLWorkbook`) in Infrastructure | an interface in Application, implemented in Infrastructure |
| FOUND-D14 | none until a document is in scope | the interface, and the choice with its licence check |
| FOUND-D15 | multi-stage Dockerfile: `dotnet publish` in the SDK stage, `aspnet` as the final stage | the compose file and a `.dockerignore` that leaves out `bin/`, `obj/` and `.env` |
| FOUND-D16 | compose `ports` entry bound to the loopback address with `${POSTGRES_PORT}` as the host port and 5432 as the container port, a named volume, `pg_isready` health check | |
| FOUND-D17 | | `nginx` config in the deploy folder |
| FOUND-D18 | `global.json` test runner, `xunit.v3`, `Testcontainers.PostgreSql`, `[Theory]` with `[MemberData]` for golden data | the golden-data reader |
| FOUND-D19 | `Shouldly`; option b: `AwesomeAssertions`; option c: `Xunit.Assert` | |
| FOUND-D20 | nothing in the .NET solution | a separate npm project in the E2E folder, with its own command |
| FOUND-D21 | `Project` paths in `.slnx` follow the layout, grouped with `Folder` | |
| FOUND-D22 | `ProjectReference` in each project pointing inward only | rules for each layer in the architecture test project, and a project-reference test for the code below |
| FOUND-D23 | one `DbContext` | folders `Domain/<Module>/`, `Application/Features/<Module>/<UseCase>/` |
| FOUND-D24 | the project file named as the app; set `RootNamespace` only if it would differ (unverified) | test project names |
| FOUND-D25 | | the Part in the project name from the first app of a kind |
| FOUND-D26 | `global.json`, `Directory.Build.props` | remove any of these properties from project files |
| FOUND-D27 | `Directory.Packages.props`; `dotnet new packagesprops` creates the file | |
| FOUND-D28 | `.editorconfig`, `.gitignore` | `.env.example` with placeholders only |
| FOUND-D29 | | the licence check on nuget.org, npm and the image page, recorded in AGENTS.md |
| FOUND-D30 | `IMemoryCache` behind your own interface, when a cache is marked later | the outcome table in the tech-stack document |

## mvc-htmx

- The web app is a project of the solution, named as FOUND-D24 says, with Razor views under `Views/`.
- CSS is Bootstrap 5 through the kit's bridge in `wwwroot/css/tokens.css`. No Node step is needed unless the project adds one, so FOUND-D11 and FOUND-D12 do not apply.
- Unit tests of the web use `Microsoft.AspNetCore.Mvc.Testing` like the API; there is no Vitest.

## react-vite

- The web app is a plain npm project in its own folder, outside `.slnx`. Pin Node with `.nvmrc` and `engines` at `foundation.node_major`.
- TypeScript `strict: true` in `tsconfig`. Tailwind CSS 4 through `@tailwindcss/vite`, with the kit's tokens mapped in `@theme`.
- In development, the Vite dev server forwards `/api` to the API (`server.proxy`), so the browser sees one origin.
- Generate types with `openapi-typescript` from the committed OpenAPI document, call with `openapi-fetch`, and write TanStack Query hooks per feature.
- Unit tests: `vitest` and `@testing-library/react`, in `*.test.tsx` next to the file they test.
- Final web image: build with the `node` image, copy `dist` into the `nginx` image.

## Pitfalls

- `TreatWarningsAsErrors` also covers NuGet audit warnings, and with `net10.0` `NuGetAuditMode` defaults to `all`, so a new advisory on a transitive package fails restore on code nobody changed. Add `NU1901;NU1902;NU1903;NU1904` to `WarningsNotAsErrors` and read those warnings instead.
- `Npgsql.EntityFrameworkCore.PostgreSQL` can pull a lower `Microsoft.EntityFrameworkCore.Relational` than the `Design` package needs; add a `PackageVersion` for `Relational` at the EF Core version.
- ArchUnitNET skips compiler-generated code (top-level statements, lambdas), so a wrong use in `Program.cs` or a minimal-API lambda passes. Add a test over the `ProjectReference` graph.
- With `test.runner` set to Microsoft Testing Platform and `xunit.v3`, add no VSTest packages (`Microsoft.NET.Test.Sdk`, `xunit.runner.visualstudio`).
- Without a `rollForward`, `global.json` uses `patch`, and a machine with only a newer feature band fails. With package lock files, Microsoft advises `disable`.
- Testcontainers needs Docker on the developer's machine; say so in AGENTS.md `## Commands`.
- A connection string written from `POSTGRES_*` values breaks when the password holds `;`. Keep the placeholder in `.env.example` free of it.
