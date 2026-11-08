---
pack: permission
stack: dotnet
---

# permission on ASP.NET Core

Applies when the back end is ASP.NET Core: profiles `mvc-htmx` (MVC + Razor + HTMX) and `react-vite` (React front end + ASP.NET Core Web API). Guidance for /opsx:propose and apply: which framework feature carries each decision and what has to be written by hand. Not code to paste. Groups, screens, checkboxes and keys are this pack's own tables; Identity roles are not used for them.

## Building blocks

| Concern | Use | Note |
|---|---|---|
| Key per endpoint | Policy-based authorization: an attribute that implements `IAuthorizationRequirementData` (ASP.NET Core 8+) carrying the key, and one `AuthorizationHandler<PermissionRequirement>` | No policy registration per key; the handler reads the keys the session holds |
| Keys of the session | Cookie session: stored with the `user_session` row. Token session: a claim of the access token (auth pack, AUTH-D32) | Fixed at sign-in (PERM-D07) |
| Every endpoint declares something | `SetFallbackPolicy` requiring an authenticated user, plus an architecture test over `EndpointDataSource` | The test fails for an endpoint with neither a key, `[AllowAnonymous]`, nor an explicit "signed-in only" marker |
| Data scope | EF Core 10 named query filters: `HasQueryFilter("Scope", e => …)` next to the audit pack's `"SoftDelete"` | Disable one filter by name with `IgnoreQueryFilters(["SoftDelete"])`, never `"Scope"` |
| Scope of the request | A scoped service filled from the session at the start of the request, read by the `DbContext` filter | System work (migrations, seed, jobs) sets "all" explicitly |
| Catalog of screens and keys | A static class or enum in code, synced to the catalog table by a start-up seeder | Keys never come from the database alone (PERM-D03) |

## Decision by decision

| Decision | .NET | Write yourself |
|---|---|---|
| PERM-D01, PERM-D02 | — | Group tables; one group per account as a column on the account |
| PERM-D03, PERM-D04, PERM-D05 | — | The catalog: screen → checkboxes → `<SCREEN>.<Action>` keys; the View-pulls rules in the group save |
| PERM-D06 | EF Core migration with data | Move keys and tick the new checkbox for every group that held the old one, in the same migration |
| PERM-D07 | — | Keys computed at sign-in from the group; a change of the group ends the members' sessions (auth pack) |
| PERM-D08 | `IAuthorizationRequirementData` attribute + handler; `IAuthorizationMiddlewareResultHandler` to shape the 403 `ACCESS_DENIED` body | Activity Log entry for a refusal |
| PERM-D09, PERM-D10 | `GET /me` endpoint | The menu tree and buttons come from `/me`; never from a second permission call per page |
| PERM-D12, PERM-D13, PERM-D14, PERM-D18 | Named query filter `"Scope"` on every owned entity | A model test that fails when an owned entity lacks the filter; raw SQL only in a reviewed list |
| PERM-D17 | — | Out-of-scope records answer 404 `NOT_FOUND` because the filter hides them; log `AccessDenied` |
| PERM-D15, PERM-D16 | Start-up seeder | Seed groups from the customer's role table; "all" scope for seed groups |

## mvc-htmx

- A tag helper or HTML helper hides a button when the session lacks its key; the server still checks.
- Menu: a view component built from the session's keys.

## react-vite

- A `<Can key="…">` component and a menu built from `/me`; the API still checks every call.

## Pitfalls

- Identity roles plus `[Authorize(Roles = …)]` look tempting but tie rights to role names in code; this pack's checkboxes would then not change anything.
- `IgnoreQueryFilters()` without names drops the scope filter too.
- Putting many keys in the access token grows every request; keep key names short or send a key set version and resolve it on the server when the list gets long.
