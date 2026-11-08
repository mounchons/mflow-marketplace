---
pack: audit
stack: dotnet
---

# audit on ASP.NET Core

Applies when the back end is ASP.NET Core: profiles `mvc-htmx` (MVC + Razor + HTMX) and `react-vite` (React front end + ASP.NET Core Web API). Guidance for /opsx:propose and apply: which framework feature carries each decision and what has to be written by hand. Not code to paste.

## Building blocks

| Concern | Use | Note |
|---|---|---|
| Who/when columns and the Activity Log | One `SaveChangesInterceptor` that walks `ChangeTracker.Entries()` before saving | Sets `created_*`, `updated_*`, turns deletes into soft deletes, and adds the Activity Log rows in the same `SaveChangesAsync` |
| Soft delete filter | EF Core 10 named query filter: `HasQueryFilter("SoftDelete", e => !e.IsDeleted)` | History views call `IgnoreQueryFilters(["SoftDelete"])`, leaving other filters on |
| Keys | `Guid.CreateVersion7()` (.NET 9+) for uuid v7; `bigint` identity for `activity_log` | |
| Concurrency | A concurrency token: PostgreSQL's `xmin` mapped as a row version with Npgsql, or a version column with `IsConcurrencyToken()` | Catch `DbUpdateConcurrencyException` and answer 409 |
| Who is acting | A scoped "current actor" service filled from the session; the `SYSTEM` actor for jobs and seeds | The interceptor reads it, never `HttpContext` directly |
| Clock | `TimeProvider` | All times UTC |

## Decision by decision

| Decision | .NET | Write yourself |
|---|---|---|
| AUDIT-D01, AUDIT-D02 | Interceptor + current actor service | |
| AUDIT-D03 | EF Core FK from every who column to `actor` | The account tables share the `actor.id` key |
| AUDIT-D04, AUDIT-D11, AUDIT-D12 | `EntityEntry.Properties` with `IsModified`, `OriginalValue`, `CurrentValue` | An attribute or model annotation marking secret properties, logged as "changed" only |
| AUDIT-D05, AUDIT-D06, AUDIT-D07 | Interceptor turns `EntityState.Deleted` into an update for business entities; named filter `"SoftDelete"` | Unique indexes with a filter on `is_deleted = false` (`HasFilter`) so a value can be reused |
| AUDIT-D08 | `Guid.CreateVersion7()` as the key's value generator | |
| AUDIT-D10 | Concurrency token | The 409 body of the api pack |
| AUDIT-D13 | — | A marker on log-like entities so the interceptor skips them |
| AUDIT-D14 | PostgreSQL grants: the app's role gets `INSERT, SELECT` only on `activity_log` | In the migration or the deploy script, not in EF |

## Pitfalls

- `ExecuteUpdate` and `ExecuteDelete` bypass the change tracker and the interceptor: allow them only on the technical tables of AUDIT-D07.
- A second `SaveChangesAsync` for the log breaks "same transaction"; add the log rows before the one save.
- `IgnoreQueryFilters()` without names also drops the permission pack's scope filter.
