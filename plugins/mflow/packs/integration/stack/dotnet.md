---
pack: integration
stack: dotnet
---

# integration on ASP.NET Core

Applies when the back end is ASP.NET Core: profiles `mvc-htmx` (MVC + Razor + HTMX) and `react-vite` (React front end + ASP.NET Core Web API). Guidance for /opsx:propose and apply: which framework feature carries each decision and what has to be written by hand. Not code to paste.

Target: .NET 10, EF Core 10 with Npgsql, PostgreSQL. Names checked against Microsoft Learn or a project the team built; anything marked (unverified) was not.

## Building blocks

| Concern | Use | Note |
|---|---|---|
| HTTP clients | `IHttpClientFactory` through `AddHttpClient` (package `Microsoft.Extensions.Http`), one named or typed client per `{external_system}` | Never `new HttpClient()` in business code. Base address is set per call from the settings reader, because the address can change without a restart |
| Resilience | `AddStandardResilienceHandler` (package `Microsoft.Extensions.Http.Resilience`) on each client, tuned with `HttpStandardResilienceOptions` | Defaults: total 30 s, attempt 10 s, retry 3 times with exponential backoff from 2 s and jitter, breaker 10% failures over 100 calls in 30 s for 5 s, retries HTTP 500 and above, 408, 429, `HttpRequestException`, `Polly.Timeout.TimeoutRejectedException` |
| No retry of writes | `options.Retry.DisableForUnsafeHttpMethods()` (from package 9.x) | Only `POST`, `PUT`, `PATCH`, `DELETE`, `CONNECT` are skipped; a read `POST` of the other side is treated as a write unless you tag it |
| Timeouts | `options.AttemptTimeout.Timeout`, `options.TotalRequestTimeout.Timeout`; `SocketsHttpHandler.ConnectTimeout` | Set `HttpClient.Timeout` to `Timeout.InfiniteTimeSpan` so one set of numbers rules. The handler's own timeouts are what fire |
| Primary handler | `ConfigurePrimaryHttpMessageHandler` or `UseSocketsHttpHandler`, `SocketsHttpHandler.AllowAutoRedirect = false` | `SocketsHttpHandler` is the default primary handler from .NET 9 |
| Cancellation | Pass `HttpContext.RequestAborted` or the job's `CancellationToken` into every port method | `HttpClient.Timeout` only covers until headers when `HttpCompletionOption.ResponseHeadersRead` is used; time the content read yourself |
| Large files | `HttpCompletionOption.ResponseHeadersRead` and stream; `StreamContent` to send | A longer timeout for files only; see the pitfall on the standard handler |
| Call log | A `DelegatingHandler` registered with `AddTransient` and added with `AddHttpMessageHandler<THandler>` | Tag the call with `HttpRequestMessage.Options` and an `HttpRequestOptionsKey<T>` holding system, operation, caller and idempotency key. Handlers run in the order they are added: add this one after `AddStandardResilienceHandler`, so it sits inside it and each attempt writes one row |
| Log line masking | `RedactLoggedHeaders` on the client | For the framework's log lines; the call log's own masking is below |
| Outbox | An `integration_outbox` entity added to the same `DbContext` before `SaveChangesAsync` | The sender is a job of the jobs pack, or a `BackgroundService` with a `PeriodicTimer` of `integration.outbox_poll_seconds` |
| Taking rows | PostgreSQL `SELECT … FOR UPDATE SKIP LOCKED` through `FromSql` on the entity | Two senders never take the same row |
| Webhook signature | `HMACSHA256.HashData(key, body)`, compare with `CryptographicOperations.FixedTimeEquals` | Convert the header's hex with `Convert.FromHexString`, on a length mismatch fail at once |
| Raw body | `HttpRequest.EnableBuffering` then read `HttpRequest.Body` and set `Position = 0` | Must be called before anything reads the body; an endpoint taking `Stream` binds the body directly |
| Clock | `TimeProvider` | Cursor, next try, late mark, signature age and the fake's time in tests |

## Decision by decision

| Decision | .NET | Write yourself |
|---|---|---|
| INTG-D01 | One interface per system in the Application project; two implementations in Infrastructure registered by the mode (the same way the team's live/fake clients are registered) | Architecture test that bans `HttpClient`, `HttpRequestMessage` and `IHttpClientFactory` outside `Infrastructure/Integrations/<System>` |
| INTG-D02 | — | The table in the discuss doc; one enum of operations per port |
| INTG-D03 | The settings reader of the settings pack; `integration.password` through its secret type | Read address and credentials at the start of each call, never in the client's constructor |
| INTG-D04 | `IValidateOptions<T>` with `ValidateOnStart()` for the mode and the list; `AllowAutoRedirect = false` | A check of `request.RequestUri.Host` against the list in the first handler of the pipeline, returning a refused outcome with no network call |
| INTG-D05 | `AddStandardResilienceHandler` options; a second named client for jobs and a third for files, each with its own timeouts | Pick the client by the caller: request, job or file |
| INTG-D06 | `options.Retry.DisableForUnsafeHttpMethods()`; `HttpRetryStrategyOptions.ShouldRetryAfterHeader` (default `true`); `options.Retry.MaxRetryAttempts` from `integration.read_attempts` (minus one, it counts the retries) | The outcome table as one pure function, unit tested on every row. Token cache with a `SemaphoreSlim` so one caller refreshes; a 401 retry in a handler outside the resilience handler |
| INTG-D07 | `HttpRequestMessage.Headers.Add("Idempotency-Key", key)` (unverified) | The pre-resend read, one method per write `{operation}` of the port |
| INTG-D08 | EF Core: add the `integration_outbox` row to the same `DbContext` before `SaveChangesAsync`; a sender job or `BackgroundService`; `IServiceScopeFactory.CreateScope()` | `next_try_at` from the table of `integration.outbox_retry_minutes`; the sweep of stale `InFlight` rows; `ExecuteUpdateAsync` for `Superseded` |
| INTG-D09 | Upsert with `ExecuteUpdateAsync`, or raw `INSERT … ON CONFLICT`, on `integration_cursor` | Advance only when the last page was read, inside the same save as the last batch |
| INTG-D10 | The `DelegatingHandler` above; `HttpContent.ReadAsStringAsync` after `LoadIntoBufferAsync` on small bodies | Masking: walk the JSON with `System.Text.Json.Nodes.JsonNode`, compare names with `integration.masked_fields` as a contains check. Never log streams. Log row in its own `DbContext` scope so a rollback of the caller keeps the log |
| INTG-D11 | `BackgroundService` + `PeriodicTimer`; `ExecuteDeleteAsync` is allowed on these tables only (AUDIT-D07) | Upsert into `integration_call_hourly` with an `ON CONFLICT` increment |
| INTG-D12 | Map outcomes to the problem body through the project's exception handler (api pack) | A pull stops on the first `Unavailable`, `Unauthorized` or refused connection, and asks the jobs pack for a re-run |
| INTG-D13 | The standard handler's circuit breaker as is | Nothing; do not tune `options.CircuitBreaker` unless the decision changes |
| INTG-D14, INTG-D15 | Read endpoints with the permission pack's attributes; `IQueryable` over `integration_call_log` plus the hourly table | The rollup per system and operation, and the rule that hides single-record rows from a list scope |
| INTG-D16 | A `POST` action on the outbox row with optimistic concurrency on `version` | Reset `status`, keep `idempotency_key`, write the Activity Log entry in the same save |
| INTG-D17 | The mail pack's queue for the e-mail; recipients from the jobs pack's alert setting | `integration_alert_state`: update `failures_in_a_row` from the call log handler after each real call, compare with `integration.alert_failures`, send the back-to-normal e-mail when `is_alerting` clears |
| INTG-D18 | `IConfiguration` value `<SYSTEM>_MODE`; start-up validation; `IHostEnvironment.EnvironmentName` | Fake class per port with its own table or in-memory store; the fault plan registered only in fake mode, so its endpoint does not exist in live mode |
| INTG-D19 | An action that creates a `CancellationTokenSource` from `integration.test_timeout_seconds` and calls the lightest read | The result object; no setting value in it |
| INTG-D20 | xUnit tests with `[Fact(Skip = …)]` (unverified) or a dynamic skip when the environment lacks credentials | Sample files with secrets removed; a test comparing each fake answer to its sample |
| INTG-D21 | An endpoint with `[AllowAnonymous]` and no antiforgery (`DisableAntiforgery()`); `HttpRequest.EnableBuffering`; `HMACSHA256.HashData`; `CryptographicOperations.FixedTimeEquals`; a unique index on `(system, event_id)` | Signed payload format (time and body), tolerance check with `TimeProvider`, catch the unique-violation (`PostgresErrorCodes.UniqueViolation`, unverified) as a repeat and answer 200 |
| INTG-D22 | Mapping as `static` methods or dictionaries inside the port; a `const string ApiVersion` | Unknown value throws a mapping exception the port turns into `Review` |
| INTG-D23 | The upload pack's storage interface; `StreamContent` over its read stream | Pass `file_key` in the outbox row, never bytes in `payload` |
| INTG-D24 | `integration.masked_fields` used by the masking above | The list of personal fields per operation in the table of INTG-D02 |

## mvc-htmx

- The monitor is a Razor page with partials per panel; Test connection and Re-send post with `hx-post` and swap the result; keep the antiforgery token.
- Do not render raw bodies with `@Html.Raw`; they are shown encoded, and only in the masked form that is stored.

## react-vite

- The monitor reads the JSON endpoints with the project's data layer, and a failed load shows Retry.
- Show the reference code from the problem body's extension field and let the user copy it.

## Pitfalls

- The standard handler's 10 s attempt and 30 s total override a longer `HttpClient.Timeout`. A job or a file upload needs `AttemptTimeout` and `TotalRequestTimeout` raised on its own client, or it is cut off and retried while still running.
- `CircuitBreaker.SamplingDuration` must be at least twice `AttemptTimeout`, or the options fail validation at start (a team project hit this). Raise it with the attempt timeout.
- Retrying the standard handler over `POST` by default is on. Without `DisableForUnsafeHttpMethods`, one user click can write several times.
- `RemoveAllResilienceHandlers` is marked experimental (`EXTEXP0001`). Prefer not stacking handlers: apply the standard handler per client and leave `ConfigureHttpClientDefaults` out, or suppress the warning knowingly.
- `HttpClient` methods buffer the body by default; with `ResponseHeadersRead` the timeout covers headers only, and `MaxResponseContentBufferSize` is not enforced.
- `EnableBuffering` must come before anything reads the body, otherwise the signature is computed over nothing.
- Hosted services are singletons: take a scope for the `DbContext` with `IServiceScopeFactory`, and do not inject a port that holds a scoped dependency.
- A `DelegatingHandler` is resolved once per handler lifetime, not per request: never hold a scoped service in a field.
- Order of handlers: first the host check and the 401 retry (outside), then `AddStandardResilienceHandler`, then the call log (inside). A call log outside the resilience handler writes one row for several attempts.
