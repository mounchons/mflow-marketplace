---
pack: shell
stack: dotnet
---

# shell on ASP.NET Core

Applies when the back end is ASP.NET Core: profiles `mvc-htmx` (MVC + Razor + HTMX) and `react-vite` (React front end + ASP.NET Core Web API). Guidance for /opsx:propose and apply: which framework feature carries each decision and what has to be written by hand. Not code to paste. Target .NET 10. The look and the component contracts stay with the UI kit (`/mflow:theme`); this file only says where the shell's behaviour lives.

## Building blocks

| Concern | Use | Note |
|---|---|---|
| Layout per portal | `mvc-htmx`: one `_Layout` per portal under `Views/Shared/`, picked by `_ViewStart.cshtml` per folder or area. `react-vite`: one layout route per portal | The sign-in layout and the public layout are layouts too |
| Menu | a `MenuDefinition` in code, filtered by the current user's keys | Write yourself; the keys come from the permission pack's current-user service |
| System time zone | `TimeZoneInfo.FindSystemTimeZoneById(shell.time_zone)`, read once from configuration | IANA ids work on Windows from .NET 6 only with ICU (not NLS, not invariant mode) |
| Now and today | inject `TimeProvider`; `FakeTimeProvider` (`Microsoft.Extensions.TimeProvider.Testing`) in tests | "Today" = `TimeZoneInfo.ConvertTime(provider.GetUtcNow(), zone)` |
| Instants and dates | `DateTimeOffset` in UTC for instants, `DateOnly` for calendar dates | Never `DateTime.Now` |
| Formatting on the server | `CultureInfo.InvariantCulture` with an explicit pattern (`dd/MM/yyyy`, `N2`); `ThaiBuddhistCalendar.GetYear` only when `shell.calendar` is พ.ศ. | One formatter class; screens never call `ToString()` on a date |
| Error pages | `UseExceptionHandler("/Error")` + `UseStatusCodePagesWithReExecute("/StatusCode/{0}")` | The status-code middleware does not catch exceptions; both are needed |
| API errors | the project's error body; with ASP.NET Core defaults, `AddProblemDetails` and `ValidationProblemDetails.Errors` keyed by field | The field key must match the form field name (SHELL-D16) |
| Request reference | `HttpContext.TraceIdentifier` or the trace id the error body carries | Shown on the 500 page and logged (SHELL-D21) |
| Antiforgery header | `AntiforgeryOptions.HeaderName`, `[AutoValidateAntiforgeryToken]` | CSRF itself is the auth pack's; the shell's fetch wrapper and HTMX send the header |
| `next` after sign-in | `Url.IsLocalUrl`, `LocalRedirect` (MVC) or `RedirectHttpResult.IsLocalUrl` | The rule is the auth pack's; never redirect to an unchecked `next` |
| Environments | `IWebHostEnvironment.IsProduction()` / `IsDevelopment()` | Style guide and prototype pages register only outside Production (SHELL-D23) |
| Language switch (only SHELL-D07 option c) | `AddLocalization`, `IStringLocalizer<T>`, `UseRequestLocalization`, `CookieRequestCultureProvider` | Not needed for bilingual labels |
| OpenAPI for the web client (`react-vite`) | `AddOpenApi` / `MapOpenApi`; build-time file with `Microsoft.Extensions.ApiDescription.Server` | `MapOpenApi` is Development-only in the template; generate the client from the build-time file |

## Decision by decision

| Decision | .NET | Write yourself |
|---|---|---|
| SHELL-D01 | Razor layouts / layout routes, one per portal | A test that each portal's pages render in its layout only |
| SHELL-D02 | `_Layout` + the kit's `AppShell`; page title through `ViewData["Title"]` or a router handle | The ` · app name` suffix in one place |
| SHELL-D03 | A view component (`mvc-htmx`) or a component (`react-vite`) for the user menu | Profile only when the portal has one |
| SHELL-D04 | `MenuDefinition` + current-user keys | A unit test: items per key set, empty groups hidden |
| SHELL-D05 | The kit's partials, view components or React components | The token check in the build (colour literals, `style=`) |
| SHELL-D06 | Controllers/services behind the permission and scope checks | An architecture test: no `DbContext` in views or page models of the web project when an API exists |
| SHELL-D07 | `[Display(Name = "Save · บันทึก")]` and bilingual `ErrorMessage` on validation attributes; a `bilingual(en, th)` helper in React | The order from `shell.label_order` in one helper |
| SHELL-D08 | `TimeProvider`, `TimeZoneInfo`, `DateOnly` | One `ToSystemTime(DateTimeOffset)` used by every view |
| SHELL-D09 | Invariant culture + explicit pattern; a parser for typed dates | A unit test table: `th-TH` thread culture, near-midnight instants, พ.ศ. on and off, 31/02 refused |
| SHELL-D10 | `decimal`, `Math.Round(value, n, MidpointRounding.AwayFromZero)` where the document says so | The rounding rule per document type; `Math.Round` defaults to banker's rounding |
| SHELL-D11 | `IQueryable` paging and counting in the database; page size validated against `shell.page_sizes` | Query-string binding of filters, sort, page and page size |
| SHELL-D14 | A paged search endpoint per pickable list | The picker dialog in the kit |
| SHELL-D15 | The audit pack's Activity Log query filtered by document type and id | Reload of page 1 after a command |
| SHELL-D16 | `ModelState.AddModelError(field, message)` for rule errors from services | Mapping the error body's fields to form fields (`react-vite`) |
| SHELL-D17 | Browser only | The shared guard script or hook |
| SHELL-D18 | Browser, plus the API's idempotency rule for important commands | Busy state on every submit button |
| SHELL-D19 | `HX-Trigger` response header for toasts (`mvc-htmx`) | Success toast after a command, error placement |
| SHELL-D21 | Exception handler + status-code pages; 404 view in the portal layout | The connection-failed message on the client |
| SHELL-D22 | 401 from the session check (auth pack) | Client redirect to sign-in with `next` = path + query |
| SHELL-D23 | Route registered only when `!app.Environment.IsProduction()` (`mvc-htmx`); a build flag (`react-vite`) | A test against the production build or environment |
| SHELL-D24 | `<label asp-for>`, `asp-validation-for` | `aria-invalid` and `aria-describedby` on invalid fields; the docs list only `data-val-*` attributes for the tag helpers (unverified that none are added) |

## mvc-htmx

- **Layouts:** `_ViewStart.cshtml` per portal folder sets `Layout`; the sidebar and the user menu are view components reading the current user, so no controller passes menu data.
- **Tables:** the DataTable body and pager are one partial; filters, sort and paging swap only that partial with `hx-get`, `hx-target` and `hx-push-url="true"`, so the address keeps the state (SHELL-D11). The controller binds `page`, `pageSize`, `sort` and filters from the query string.
- **Forms:** server validation re-renders the form partial with `ModelState` errors under each field; rule errors from services become `ModelState.AddModelError`. Set `type="text"` on date inputs: the Input Tag Helper renders `type="date"` or `datetime-local` for date properties and keeps a `type` written in the markup.
- **Antiforgery:** forms get the token from the form tag helper; HTMX requests send it in the header named by `AntiforgeryOptions.HeaderName` (set it in one `htmx:configRequest` listener).
- **Session expired:** for a request with the `HX-Request` header, answer 401 (or 200 with `HX-Redirect` to the sign-in page carrying `next`) instead of a 302, so the sign-in page is never swapped into a partial. With the cookie authentication handler, do it in `CookieAuthenticationEvents.OnRedirectToLogin`.
- **Double submit:** `hx-disabled-elt="this"` on HTMX buttons; plain forms disable their submit button in the kit's script.
- **Unsaved guard:** a shared script marks a form dirty on `input`, asks the kit's confirm on link clicks and boosted navigations, and uses `beforeunload` for reload and close. A full page Back fires `beforeunload`; a Back restored from HTMX history does not.
- **Times:** views call one formatter that converts the UTC value with `TimeZoneInfo.ConvertTime` to the system zone and formats it with the invariant culture.

## react-vite

- **Layouts:** one layout route per portal with an `<Outlet>`; a guard route reads the current user from the API before the layout renders.
- **Data fetching:** one API client generated from the build-time OpenAPI file, behind one wrapper that maps 401 to the sign-in page with `next` = `location.pathname + location.search`, the error body to field errors, and a failed fetch to the connection message (SHELL-D06, SHELL-D16, SHELL-D21, SHELL-D22).
- **Dates in the browser:** `Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' })` with the zone from the API, never the browser's; add 543 only when `shell.calendar` is พ.ศ. Keep calendar dates as `YYYY-MM-DD` strings: `new Date('2026-10-31')` is UTC midnight and shows the day before west of UTC.
- **Language:** bilingual labels need no i18n library; option c) of SHELL-D07 needs one (pick it in the tech-stack doc and check its licence).
- **Unsaved guard:** the router's navigation blocker (React Router `useBlocker`, data routers only (unverified)) plus `beforeunload`.
- **Build and hosting:** the Vite build is static files, served by nginx (`try_files $uri /index.html`) or by the API with `MapStaticAssets`, `UseStaticFiles` and `MapFallbackToFile("index.html")`. Keep `/api/*` out of the fallback so an unknown API path answers 404, not the app.
- **Style guide:** the route is imported only when the build mode is not production (`import.meta.env.PROD` false), so the production bundle does not contain it; a test checks the built output.

## Pitfalls

- `th-TH` defaults to `ThaiBuddhistCalendar`: a server or browser running in Thai prints 2569 for 2026 unless the format is fixed. Never format with the current culture.
- In globalization-invariant mode (`InvariantGlobalization`, common in slim containers) `new CultureInfo("th-TH")` throws, and IANA ids on Windows need ICU. Slim Linux images may lack time zone data (unverified: install `tzdata`); test `FindSystemTimeZoneById` at startup.
- .NET 10 cookie authentication answers 401/403 instead of 302 for detected API endpoints (`[ApiController]`, JSON minimal APIs) but still redirects page endpoints; HTMX calls to page endpoints need the handling above.
- `UseStatusCodePagesWithReExecute` re-runs a failed POST as POST: the status-code endpoint must accept POST and carry `[IgnoreAntiforgeryToken]`.
- `MapStaticAssets` serves no default document and only files in the build manifest; the SPA needs `UseStaticFiles` and `MapFallbackToFile`.
- `Math.Round` rounds half to even by default; money rules usually want `MidpointRounding.AwayFromZero`.
