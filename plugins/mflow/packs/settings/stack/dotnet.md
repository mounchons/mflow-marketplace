---
pack: settings
stack: dotnet
---

# settings on ASP.NET Core

Applies when the back end is ASP.NET Core: profiles `mvc-htmx` (MVC + Razor + HTMX) and `react-vite` (React front end + ASP.NET Core Web API). Guidance for /opsx:propose and apply: which framework feature carries each decision and what has to be written by hand. Not code to paste. Target: .NET 10, EF Core 10, PostgreSQL with Npgsql.

## Building blocks

| Concern | Use | Note |
|---|---|---|
| Catalog | A hand-written static list of definition records, one file per owning pack | Filled from the project's filled pack files. No reflection, no `IConfiguration` |
| Env values | `IConfiguration` with `AddOptions<T>().Bind(...).ValidateOnStart()`, read through `IOptions<T>` | Only what SET-D03 leaves in env |
| Reading stored values | A hand-written singleton reader that keeps one snapshot of all rows in `IMemoryCache` under one key, with `AbsoluteExpirationRelativeToNow` of `settings.cache_seconds` | Not an `IConfiguration` provider and not `IOptionsMonitor<T>`: see Pitfalls |
| One value set per job | A scoped snapshot taken from the reader once per request; a job creates one scope per run with `IServiceScopeFactory` | Carries SET-D12 |
| Dropping the cache | `IMemoryCache.Remove` after `SaveChangesAsync` returns | Before the commit, another request can cache the old row again |
| Several instances | The time limit above, or `HybridCache` from `Microsoft.Extensions.Caching.Hybrid` (`GetOrCreateAsync`, `RemoveAsync`) | Microsoft Learn: invalidation does not reach the in-memory cache of other servers, so the time limit is needed either way |
| Secrets | `IDataProtectionProvider.CreateProtector("settings.secret.v1")`, then `Protect` and `Unprotect` | `Unprotect` throws `CryptographicException` on a payload it cannot read: catch that type only |
| Key ring | `AddDataProtection().SetApplicationName(...).PersistKeysToDbContext<TContext>().ProtectKeysWithCertificate(cert)`, package `Microsoft.AspNetCore.DataProtection.EntityFrameworkCore`, `TContext` implements `IDataProtectionKeyContext` | A key ring pointed at a repository is not encrypted at rest unless a `ProtectKeysWith*` call is made |
| The key from env | `SETTINGS_SECRET_KEY` holds a PKCS#12 file in base64, loaded with `X509CertificateLoader.LoadPkcs12` | A password for the file, when it has one, is another env value |
| Without a certificate | `System.Security.Cryptography.AesGcm` with `new AesGcm(key, 16)`, a 32-byte key in base64, and a new 12-byte nonce per write stored with the cipher text | Hand-written. The constructors without a tag size are obsolete (SYSLIB0053). Choose one way per project; this one is the simpler default, since a developer needs only a generated 32-byte value |
| Stored value | `HasColumnType("jsonb")` on a string property | Serialize by kind in one place |
| Key of the table | `HasKey(x => new { x.Key, x.Portal })` | Natural key, AUDIT-D08 |
| Concurrency | `xmin` as a `uint` property with `IsRowVersion()` on Npgsql | Answer 409 on `DbUpdateConcurrencyException` |
| Errors | `TypedResults.ValidationProblem(errors)` in a minimal API, `ValidationProblem(ModelState)` in a controller | With the body the api pack sets |
| Start-up | One step after `Database.MigrateAsync()` and before `app.Run()` | Runs SET-D04, SET-D07, SET-D10 and SET-D21 in that order |

## Decision by decision

| Decision | .NET | Write yourself |
|---|---|---|
| SET-D01, SET-D02, SET-D05, SET-D06 | Static catalog, serialized by the read endpoint | A unit test that compares the catalog with the filled pack's keys, ranges and defaults |
| SET-D03, SET-D08 | `ValidateOnStart()` on the options that hold `SETTINGS_SECRET_KEY` | The check that needs the key only when the catalog holds a secret and the environment is not Development or Prototype (`IHostEnvironment`); a key that is present but unreadable stops every environment; messages name the setting, never the value |
| SET-D04, SET-D07 | EF Core `Add` of the missing rows in the start-up step, as `System` | Compare env with the stored value and write the warning; the first-start race between instances if the project runs several |
| SET-D09 | Request model with write-only `NewValue` and `Clear`, answer model with `IsSet` and `CanRead` | No property in any answer model can hold the secret |
| SET-D10 | Data Protection rolls its own keys. For a new certificate: `ProtectKeysWithCertificate(newCert)` with `UnprotectKeysWithAnyCertificate(oldCert)` | `Unprotect` then `Protect` of every secret at start, and the `RotateSecretKey` entry. With `AesGcm`: try the current key, then the previous one |
| SET-D11, SET-D12 | Reader and scoped snapshot above | Which point in each job takes the snapshot |
| SET-D13, SET-D14 | — | One validator over the catalog that returns `Dictionary<string, string[]>` with every error, in both languages, working on the stored values merged with the request |
| SET-D15 | A `confirmed` flag on the request model | The rule that finds each marked change, on the server, before saving |
| SET-D16, AUDIT-D10 | One `SaveChangesAsync` is one transaction. `Entry(row).Property(x => x.Version).OriginalValue = sentVersion` | Map the concurrency error to `SETTINGS_CHANGED` and name the rows from `DbUpdateConcurrencyException.Entries` |
| SET-D17, AUDIT-D04, AUDIT-D12 | The audit pack's `SaveChangesInterceptor` writes the rows in the same save | Mark `secret_cipher` with the audit pack's secret marker, name the action `SaveSettings`, and run owning-pack effects before the one save |
| SET-D18 | — | Page only: default values come from the read answer |
| SET-D19 | The permission pack's endpoint keys on read and save | Seed View and Manage for `{superadmin}` in a migration |
| SET-D20 | One row per portal in the same table | Rules between keys grouped by portal in the validator |
| SET-D21 | The start-up step, as `System`, with the `SaveSettings` action | The nearest-value rule by kind |
| SET-D22 | Read the emergency env once at start into a singleton | The reader returns the forced value; the read answer names the env |

## mvc-htmx

- Render a secret field with an always empty value from a separate view-model property; never bind it to the stored row.
- Post each tab with `hx-post` and keep the antiforgery token. htmx does not swap 4xx answers by default, so configure it to swap the tab on 400 and 409 (`htmx.config.responseHandling`) (unverified).
- The confirmation dialog and the unsaved-edits question are small page scripts driven by `data-` attributes from the catalog.

## react-vite

- Keep the draft per tab in component state and compare with the read answer to turn Save on; after a save, replace the read data with the save's answer.
- Guard leaving the page with the router's blocker (`useBlocker` in TanStack Router) (unverified).

## Pitfalls

- Do not load database values through a custom `ConfigurationProvider`. The sample on Microsoft Learn reads at start only, and a reload would need its own signal per instance. Secrets would also become visible through `IConfigurationRoot.GetDebugView()`.
- A key ring in the same database as the secrets, with no `ProtectKeysWith*`, gives no protection: anyone with a database copy can read both.
- Keep the key ring out of the audit interceptor: use a small separate `TContext` for it.
- Never delete rows of the key ring table. Microsoft Learn: data protected by a deleted key is permanently undecipherable, while expired keys still decrypt.
- Keep a replaced certificate in `UnprotectKeysWithAnyCertificate` until the key ring holds no key it protected. Whether the ring still loads without it is (unverified); test on a copy first.
- Leave `EnableSensitiveDataLogging` off outside development, and keep request bodies of the save endpoint out of HTTP logging (`[HttpLogging]` or `WithHttpLogging` on that endpoint). `Microsoft.Extensions.Compliance.Redaction` with `AddRedaction` helps with classified fields, but the first defence is never to pass a secret to a logger.
- `ExecuteUpdate` skips the change tracker and the audit interceptor, so never use it on `system_setting`.
- Sending the version the client read needs the `OriginalValue` line: setting the property alone changes nothing in the concurrency check.
