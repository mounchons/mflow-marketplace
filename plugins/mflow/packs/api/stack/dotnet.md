---
pack: api
stack: dotnet
---

# api on ASP.NET Core

Applies when the back end is ASP.NET Core: profiles `mvc-htmx` (MVC + Razor + HTMX) and `react-vite` (React front end + ASP.NET Core Web API). Guidance for /opsx:propose and apply: which framework feature carries each decision and what has to be written by hand. Not code to paste. Target .NET 10, EF Core 10, PostgreSQL through `Npgsql.EntityFrameworkCore.PostgreSQL`.

## Building blocks

| Concern | Use | Note |
|---|---|---|
| Route prefix | `app.MapGroup("/api/v1")` for minimal APIs; `[Route("api/v1/...")]` on `[ApiController]` classes | one group or base route; kebab-case path segments are written in the template |
| JSON | System.Text.Json web defaults (camelCase) + `JsonStringEnumConverter` | set it in both `ConfigureHttpJsonOptions` and `AddControllers().AddJsonOptions`; the OpenAPI generator reads the minimal-API options |
| Errors | `AddProblemDetails(o => o.CustomizeProblemDetails = ...)`, an `IExceptionHandler` via `AddExceptionHandler<T>`, `UseExceptionHandler()`, `UseStatusCodePages()` | the handler writes through `IProblemDetailsService.TryWriteAsync` |
| Validation | `[ApiController]` automatic 400 `ValidationProblemDetails` (MVC); `AddValidation()` (minimal APIs, .NET 10) | MVC: add `SystemTextJsonValidationMetadataProvider` so `errors` keys are the JSON names |
| Concurrency | Npgsql `xmin` mapped to a `uint` property with `.IsRowVersion()`; `DbUpdateConcurrencyException` | the audit pack's stack file owns the column; this pack owns the wire |
| Clock | `TimeProvider.System` as a singleton; `FakeTimeProvider` from `Microsoft.Extensions.TimeProvider.Testing` in tests | |
| Health | `AddHealthChecks().AddDbContextCheck<TContext>(tags: ["ready"])` (package `Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore`); `MapHealthChecks` twice with `HealthCheckOptions.Predicate` | liveness predicate returns false (runs no check) |
| OpenAPI | `Microsoft.AspNetCore.OpenApi`: `AddOpenApi`, `MapOpenApi("/api/v1/openapi.json")`; build-time file with `Microsoft.Extensions.ApiDescription.Server` (`OpenApiGenerateDocumentsOnBuild`, `OpenApiDocumentsDirectory`, `OpenApiGenerateDocumentsOptions --file-name`) | .NET 10 writes OpenAPI 3.1; no UI is built in, use `Scalar.AspNetCore` (`MapScalarApiReference`) |
| Logs | `builder.Logging.AddJsonConsole` (`IncludeScopes`, `UseUtcTimestamp`); `AddHttpLogging` with `LoggingFields = RequestMethod \| RequestPath \| ResponseStatusCode \| Duration` and `CombineLogs` | Serilog.AspNetCore is the alternative the team has used |
| Rate limit | `AddRateLimiter` + `UseRateLimiter`, `GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(...)` | `RejectionStatusCode` defaults to 503; set 429 |
| Proxy headers | `UseForwardedHeaders` with `KnownProxies` or `KnownIPNetworks` | `KnownNetworks` is obsolete in .NET 10 (warning ASPDEPR005) |
| Body size | `ConfigureKestrel(o => o.Limits.MaxRequestBodySize = ...)`, `FormOptions.MultipartBodyLengthLimit` | defaults 30,000,000 bytes and 128 MB; set both from `api.body_max_mb` |
| Settings and secrets | environment variables (`__` for sections), `AddKeyPerFile("/run/secrets", optional: true)` for Docker secrets, `AddOptions<T>().Bind(...).ValidateDataAnnotations().ValidateOnStart()` | |
| Migrations | `Database.MigrateAsync()` before `app.Run()`; EF Core 9+ takes a database lock while migrating | option b of API-D21: `dotnet ef migrations bundle` + `GetPendingMigrationsAsync()` at start |

## Decision by decision

| Decision | .NET | Write yourself |
|---|---|---|
| API-D01 | `MapGroup` / base route; a fallback under the group returning `TypedResults.Problem(statusCode: 404)` | the `NOT_FOUND` code on that fallback |
| API-D02 | route templates; `TypedResults.Created`, `Ok`, `NoContent` | the kebab-case action routes; no `MapPatch` |
| API-D03 | the contract drift test (API-D12) catches every change | nothing more while the web is the only client |
| API-D04 | `CustomizeProblemDetails` adds `code` and `requestId` and removes the default `traceId`; `ValidationProblemDetails.Errors` is already field to messages | the exception-to-`code` map in one `IExceptionHandler`; a domain exception type that carries status and `code` |
| API-D05 | resource files only if API-D05 b is chosen (`AddLocalization`) | messages in `api.message_language` next to the rules |
| API-D06 | `DbUpdateConcurrencyException` to 409, `BadHttpRequestException.StatusCode` kept (413, 400), unique-violation `PostgresException` to 400 or 409 | never return 422; `ApiBehaviorOptions.InvalidModelStateResponseFactory` adds `code` `VALIDATION_FAILED` |
| API-D07 | set `entry.Property(x => x.Version).OriginalValue = request.Version` before `SaveChangesAsync` | `version` on every read model and write request; the `<RESOURCE>_CHANGED` code per aggregate |
| API-D08 | `AsNoTracking()`, `CountAsync()`, `Skip`/`Take`, `ThenBy(x => x.Id)` | a `PageQuery`/`PageResult<T>` pair, a sort whitelist (field name to expression), `EF.Functions.ILike` (Npgsql) for search |
| API-D09 | `DateTimeOffset` for instants, `DateOnly` for dates, `TimeZoneInfo.FindSystemTimeZoneById(api.time_zone)` | a `JsonConverter<DateTimeOffset>` that refuses a value without offset and writes UTC `Z` |
| API-D10 | inject `TimeProvider`; `FakeTimeProvider.Advance` in tests | a ban on `DateTime.Now`/`UtcNow` and `DateTimeOffset.Now`/`UtcNow`, for example `Microsoft.CodeAnalysis.BannedApiAnalyzers` with `BannedSymbols.txt` (unverified) |
| API-D11 | two `MapHealthChecks` calls, `.AllowAnonymous()`, `.DisableRateLimiting()` | a `ResponseWriter` that writes `status` and the prototype flag, and the 503 problem body |
| API-D12 | build-time document into `api.contract_path` | a test that compares the committed file with `GET /api/v1/openapi.json` from `WebApplicationFactory<Program>` |
| API-D13 | map `MapOpenApi` and `MapScalarApiReference` only when the environment is not Production | the route `/api/v1/docs` for the Scalar page |
| API-D14 | `HttpContext.TraceIdentifier`, `ILogger.BeginScope` with the request id | a small middleware: read and check the header, set the response header, open the scope |
| API-D15 | `HttpLoggingFields` without headers or bodies (header values not listed are `[Redacted]`) | a reflection test over response models for forbidden property names, with one allow list |
| API-D16 | `RateLimitPartition.GetFixedWindowLimiter` keyed by `Connection.RemoteIpAddress` for anonymous requests, `GetNoLimiter` for signed-in ones; `OnRejected` | `UseRateLimiter` after `UseAuthentication`; `Retry-After` and the problem body in `OnRejected` |
| API-D17 | no `AddCors` by default; else `AddCors` + `WithOrigins(...)` + `AllowCredentials()` | read `api.cors_origins`; never `AllowAnyOrigin` |
| API-D18 | Kestrel and form limits; `UseForwardedHeaders` first in the pipeline | the proxy config (nginx or similar): `client_max_body_size`, forwarded headers, security headers |
| API-D19 | `ValidateOnStart` names the missing setting | the placeholder check outside Development |
| API-D20 | the compose file: `healthcheck` on the database (`pg_isready`), `depends_on: condition: service_healthy`, `mem_limit` per service | |
| API-D21 | `MigrateAsync()` with the schema-owner connection string, then the app role's string for the `DbContext` | a wait loop on `CanConnectAsync()` up to `api.db_wait_seconds`; the job library's own schema, for example `Hangfire.PostgreSql` `SchemaName` (unverified) |
| API-D22 | `ASPNETCORE_ENVIRONMENT`, `IsEnvironment("Prototype")`, `IsStaging()`, `IsProduction()` | refuse any other name at start |
| API-D23 | an options class bound from the prototype switch, validated with `ValidateOnStart` | the start check against Staging and Production; map the prototype endpoints only when on |

## mvc-htmx

- The JSON rules apply to `/api/v1`. Page and HTMX endpoints return HTML with the same statuses and the same request id; a 400 re-renders the form partial with its field messages, a 409 renders the reload prompt.
- htmx 2 does not swap 4xx and 5xx answers by default; set `htmx.config.responseHandling` so 400 and 409 swap (unverified).
- .NET 10 cookie auth answers 401/403 instead of redirecting only for detected API endpoints (`[ApiController]`, JSON minimal APIs); page and HTMX endpoints still redirect. For an HTMX request answer 401 with an `HX-Redirect` header to the sign-in page, written by hand.
- `version` travels in a hidden input of each edit form.

## react-vite

- Generate the TypeScript types from `api.contract_path` with `openapi-typescript`; never write request or response types by hand.
- In development the Vite dev server forwards `/api` to the API (`server.proxy`), so the browser sees one origin and no CORS is needed.
- Read `code` and `errors` from the problem body in one fetch wrapper; show `requestId` on a 500.

## Pitfalls

- .NET 10 no longer logs exceptions that an `IExceptionHandler` handled (`TryHandleAsync` returns true); log 5xx yourself in the handler, or set `SuppressDiagnosticsCallback`.
- In .NET 10 and earlier the exception handler turns `BadHttpRequestException` into 500 unless it keeps `StatusCode`; map it, or 413 and bad JSON become 500.
- Minimal-API binding failures outside Development write a bare 400 without your handler unless `RouteHandlerOptions.ThrowOnBadRequest` is true.
- `RejectionStatusCode` defaults to 503 and `UseRateLimiter` placed before `UseAuthentication` sees every request as anonymous.
- `UseForwardedHeaders` placed late, or without the proxy in `KnownProxies`/`KnownIPNetworks`, leaves the scheme `http` and the client address the proxy's: Secure cookies, HTTPS redirects and the rate limit all break.
- Build-time OpenAPI generation runs `Program`; guard migrations, seeding and required-secret checks so the build does not need a database.
- `IsDevelopment()` is false in Prototype; every "dev-only" switch must name both environments.
- Npgsql refuses to write a `DateTimeOffset` with a non-zero offset to `timestamptz`; convert to UTC before saving (unverified).
- EF Core 9+ `MigrateAsync()` throws when the model has changes without a migration; run `dotnet ef migrations has-pending-model-changes` in the test suite.
- `AddValidation()` does not reject unknown JSON properties; that needs `JsonSerializerOptions.UnmappedMemberHandling`, which this pack does not ask for.
