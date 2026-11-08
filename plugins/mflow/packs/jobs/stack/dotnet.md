---
pack: jobs
stack: dotnet
---

# jobs on ASP.NET Core

Applies when the back end is ASP.NET Core: profiles `mvc-htmx` (MVC + Razor + HTMX) and `react-vite` (React front end + ASP.NET Core Web API). Guidance for /opsx:propose and apply: which framework feature carries each decision and what has to be written by hand. Not code to paste.

Target: .NET 10, EF Core 10 with Npgsql, PostgreSQL. .NET names are checked against Microsoft Learn; Hangfire, Cronos and the PostgreSQL SQL come from projects the team built. Anything marked (unverified) was neither.

## Building blocks

| Concern | Use | Note |
|---|---|---|
| A loop in the host | `BackgroundService` with `ExecuteAsync(CancellationToken)`, registered with `AddHostedService<T>()` | A hosted service is a singleton: take `IServiceScopeFactory`, and open `CreateAsyncScope()` for each run so each run has its own `DbContext` |
| The beat of a loop | `PeriodicTimer(TimeSpan, TimeProvider)` and `WaitForNextTickAsync(stoppingToken)` | One waiter at a time; a run in the loop body cannot overlap itself. Pass `TimeProvider` so tests move time |
| Clock | `TimeProvider`; in tests `FakeTimeProvider` from `Microsoft.Extensions.TimeProvider.Testing` | Read every time through it |
| Time zone | `TimeZoneInfo.FindSystemTimeZoneById("Asia/Bangkok")` | Accepts an IANA or Windows id on .NET 6 and later when the operating system has time zone data. Keep the data in the container image |
| Cron | `Cronos`: `CronExpression.Parse`, `GetNextOccurrence(DateTime, TimeZoneInfo, bool)` | Five fields. Daylight-saving handling of a skipped or repeated hour (unverified): test it when the project's zone has one |
| Occurrence and one-run rules | EF Core `HasIndex(…).IsUnique().HasFilter("status IN ('Queued', 'Running')")` and a second unique index on `(job_code, scheduled_for)` | Catch `PostgresException { SqlState: PostgresErrorCodes.UniqueViolation }` by constraint name; that is the signal, not an error |
| Taking one-off rows | `SELECT … FOR UPDATE SKIP LOCKED LIMIT 1` in a transaction, through `FromSql` or `NpgsqlCommand` | Update to `Running` with `lease_until` in the same transaction, commit, then work outside it |
| Graceful stop | `builder.Services.Configure<HostOptions>(o => o.ShutdownTimeout = …)` from `jobs.shutdown_seconds`; default 30 seconds | `ExecuteAsync` must end when `stoppingToken` fires; the host waits for it up to this time |
| An exception in a loop | `HostOptions.BackgroundServiceExceptionBehavior`, default `StopHost` | Catch inside the loop body per run: an exception that leaves `ExecuteAsync` stops the API |
| Hangfire (case 3 below) | `AddHangfire`, `AddHangfireServer(o => { o.WorkerCount = …; o.Queues = … })`, `Hangfire.PostgreSql` via `UsePostgreSqlStorage`, `PostgreSqlStorageOptions { SchemaName, PrepareSchemaIfNecessary }` | Use `SetDataCompatibilityLevel(CompatibilityLevel.Version_180)`. Its tables live in their own schema, outside EF migrations |
| Hangfire jobs | `IRecurringJobManager.AddOrUpdate<T>(id, expression, cron, new RecurringJobOptions { TimeZone = … })`, `RemoveIfExists(id)`, `IBackgroundJobClient.Enqueue<T>`, `[AutomaticRetry(Attempts = n, DelaysInSeconds = […])]` | A `CancellationToken` parameter of a job method is filled by Hangfire at run time (unverified; the team's projects rely on it); pass `CancellationToken.None` in the expression |

## Which way for which case

`BackgroundService` is in 9 of the team's 13 projects and Hangfire in 7. They fit different shapes.

| Case | Use | When |
|---|---|---|
| 1. Recurring jobs with a schedule on the screen, the default of this pack | One `BackgroundService` that ticks every `jobs.tick_seconds`, reads `job_definition`, asks Cronos for the due occurrence and claims it by inserting the `job_run` row (the unique index decides) | Up to a few dozen jobs. A saved schedule or switch applies at the next tick; tests call the tick with a fake clock. The team's cron-table project works this way. Needs only `Cronos` |
| 2. One-off jobs queued with the save, and queue lines such as the mail sender | One `BackgroundService` that polls `job_run` every `jobs.poll_seconds` with `SKIP LOCKED`, runs up to `jobs.worker_count` and renews the lease | The default for one-off jobs, because the row commits in the same transaction as the save (JOB-D02). The team's import worker is built so |
| 3. Many one-off job types with named queues and a separate worker | Hangfire, with `job_run` still as the record and the one-run rule | Heavy work such as AI or document processing on its own worker with queues. Enqueue only after the save commits, from a row that says it is due: a call to `Enqueue` is not in the EF transaction |
| 4. A project that already runs Hangfire | Keep it: recurring jobs through `IRecurringJobManager`, re-applied from `job_definition` at start and on every save, `[AutomaticRetry(Attempts = 0)]`, and `job_run` for the rest | Do not add a second scheduler beside it |

Quartz (`AddQuartz`, `AddQuartzHostedService`) is in two of the team's projects with nothing a decision needs from it. Do not choose it for new work; a project that has it keeps it and applies `job_run` around it as in case 4.

A timer that only does one fixed thing, for a project with no job screen (JOB-D12 answered b), is the same case 1 with one row.

## Decision by decision

| Decision | .NET | Write yourself |
|---|---|---|
| JOB-D01 | Controller action returns `Accepted` / `TypedResults.Accepted` with the run id | The rule of which calls queue; a job class per job |
| JOB-D02 | `job_run` entity added to the same `DbContext` before `SaveChangesAsync` | A static catalog in one class; a `IJobQueue.Queue(code, subjectKey, args)` service that only adds the row |
| JOB-D03 | `job_definition` entity; the schedule editor maps the three forms to cron and back | Validation of the forms; the text of a schedule, with `Other` for anything else. Pack-owned jobs carry `schedule_editable = false` |
| JOB-D04 | `CronExpression.GetNextOccurrence(utc, zone, inclusive)`, the zone from `TimeZoneInfo` | A single place that resolves `{system_time_zone}` from configuration, failing at start if unknown |
| JOB-D05 | The two filtered unique indexes; `SKIP LOCKED` for taking rows | Treat the unique violation as "someone else has it": skip quietly for a schedule, 409 for a manual start, return the active run for a one-off job |
| JOB-D06 | `SaveChangesAsync` per item with `ChangeTracker.Clear()` between items | Item selection that skips done items |
| JOB-D07 | Case 1 and 2: a `catch` that classifies the exception and sets `next_attempt_at`. Case 3: `[AutomaticRetry(Attempts = n, DelaysInSeconds = […])]` | The list of exceptions that need a fix, and a marker exception a job throws for them |
| JOB-D08 | `CancellationTokenSource.CreateLinkedTokenSource(stoppingToken)` with `CancelAfter(limit)` | Check the token between items; end `Failed` with `JOB_TIMEOUT` |
| JOB-D09 | A renew loop beside the work, every third of `jobs.lease_seconds`, `UPDATE … WHERE id = @id AND locked_by = @me` | A reaper at every tick that closes rows past `lease_until`; zero rows updated by a renew means another process took the run, so cancel the work |
| JOB-D10 | `job_run` updated at start and end; `ILogger` with a scope holding the run id | A function that turns an exception into a code and text with no secret. Never store `exception.ToString()` |
| JOB-D11 | A catalog job with `ExecuteDeleteAsync` on `job_run` | Add `job_run` to the architecture test's allow list of transient tables (AUDIT-D07) |
| JOB-D12 | Ordinary endpoints with `[Authorize]`-style policy over `{job_view_key}` and `{job_manage_key}` | The list query joining the latest run; the `Late` mark. Do not map `UseHangfireDashboard` |
| JOB-D13 | `POST` endpoints return 202 | Insert the `Queued` row and the activity entry in one save; the runner takes it as any row |
| JOB-D14 | One SQL `UPDATE` that raises `consecutive_failures` and returns the new value | The check against `jobs.alert_after_failures` in the transaction that ends the run; queue the e-mail through the mail pack's queue where it exists, skip otherwise |
| JOB-D15, AUDIT-D02 | The audit pack's current-actor service set to `System` at the start of each run's scope | Pass the organization to the scope where data is per organization |
| JOB-D16, AUDIT-D13 | The audit pack's marker on `JobRun` and `JobDefinition` so the interceptor skips them | Write `ManualTrigger` and `SaveSchedule` from the services that handle those calls, not from the runner |
| JOB-D17 | The tick reads `enabled` every time; the poll skips queued rows of a job that is off unless the trigger is `Manual` or `Retry` | Effect text per job in the catalog |
| JOB-D18 | `jobs.mode` bound at start. `Inline`: register an `IJobQueue` that runs the job in a fresh scope after the save, and do not register the hosted services | Refuse `Inline` at start when `IHostEnvironment.IsProduction()` is true. Tests resolve the job class and call it, with `FakeTimeProvider` |
| JOB-D19 | Sync of the catalog from a start-up step after migrations; the hosted services do no work in `StartAsync` | A missed occurrence: compare `next_run_at` with now and claim one run for the latest due occurrence, then move `next_run_at` forward. Hangfire's default `MisfireHandlingMode.Relaxed` does the same; `Ignorable` is the "no catch-up" answer |
| JOB-D20 | `HostOptions.ShutdownTimeout`; `stoppingToken` passed down to the job | On cancellation by shutdown set `Interrupted` with `JOB_STOPPED`, not `Failed`; one-off rows back to `Queued` |
| JOB-D21 | `jobs.runner` decides whether the hosted services are registered. A worker is `Host.CreateApplicationBuilder(args)` with the same registrations | Nothing else: both use `job_run` |

## mvc-htmx

- The table refreshes with `hx-get` and `hx-trigger="every 5s"` while a job is running, and stops when none is (unverified).
- Run and Retry post with `hx-post` and keep the antiforgery token.

## react-vite

- Poll the jobs list while any row is `Running` (`refetchInterval` of TanStack Query (unverified)), and stop when none is.
- The 202 answer holds the run; show it in the row at once rather than waiting for the next poll.

## Pitfalls

- A loop of `Task.Delay` until the next 02:00 misses the run on a restart and reads the time zone by hand. Use the tick and Cronos.
- Never work in `StartAsync`: hosted services start in order and the API does not take requests until they return.
- An exception leaving `ExecuteAsync` stops the host by default, and on .NET 11 fails `RunAsync` with it.
- `[DisableConcurrentExecution]` locks per method, so jobs of different codes through one method block each other. Use the `job_run` index instead.
- Do not map the Hangfire dashboard: it has its own authorization (`DashboardOptions.Authorization`), outside the pack's keys, and an empty filter list lets anyone in (unverified).
- Two Hangfire hosts in one test process can share storage through its static configuration: register `JobStorage` and `JobActivator` yourself before `AddHangfire` (found in a team project).
- On Hangfire.PostgreSql a job that outlives `InvisibilityTimeout` can be fetched again (unverified, inferred from the option's documentation); set `UseSlidingInvisibilityTimeout = true` for jobs that may run long. It does not work on a lightweight server (`BackgroundJobServerOptions.IsLightweightServer`).
- Do not close every `Running` row at start-up; with two containers that closes the other's work. The lease is the rule.
- Do not hold a job in `pg_try_advisory_lock`: a session lock lives on a pooled connection, and a transaction-scoped lock holds a transaction open for the whole job (unverified). Advisory locks are fine for short critical sections such as seeders (`pg_advisory_xact_lock`). When this pack is selected, its index replaces the advisory lock the upload pack mentions.
- The default stop grace period of a container is 10 seconds (unverified): set compose `stop_grace_period` above `jobs.shutdown_seconds`.
- `TimeZoneInfo` throws for an unknown id, and needs time zone data in the image: resolve at start so a bad value stops the deployment, not the 02:00 run.
