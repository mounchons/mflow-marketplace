---
pack: upload
stack: dotnet
---

# upload on ASP.NET Core

Applies when the back end is ASP.NET Core: profiles `mvc-htmx` (MVC + Razor + HTMX) and `react-vite` (React front end + ASP.NET Core Web API). Guidance for /opsx:propose and apply: which framework feature carries each decision and what has to be written by hand. Not code to paste.

Target: .NET 10, EF Core 10 with Npgsql, PostgreSQL. Names checked against Microsoft Learn; anything marked (unverified) was not.

## Building blocks

| Concern | Use | Note |
|---|---|---|
| Receive one file | `IFormFile` bound from the form; `IFormFile.OpenReadStream()` | Files over 64 KB are buffered to a temp file on disk (`ASPNETCORE_TEMP`), not memory. Up to 100 MB this is fine; above it, read the body with `MultipartReader` (`Microsoft.AspNetCore.WebUtilities`) |
| Request body ceiling | `KestrelServerLimits.MaxRequestBodySize` (default 30,000,000 bytes), `FormOptions.MultipartBodyLengthLimit` (default 128 MB), per action `[RequestSizeLimit]` and `[RequestFormLimits(MultipartBodyLengthLimit = …)]`, per request `IHttpMaxRequestBodySizeFeature` | Set all of them from `upload.request_limit_mb`, plus the reverse proxy in front (nginx `client_max_body_size`). IIS in-process adds `IISServerOptions.MaxRequestBodySize` and `maxAllowedContentLength` |
| Hash while copying | `IncrementalHash.CreateHash(HashAlgorithmName.SHA256)` (unverified) + `AppendData`, or `SHA256.HashDataAsync(Stream)` on the staged copy | One pass: read buffer → hash → write to storage |
| Office zip check | `System.IO.Compression.ZipArchive` + `GetEntry("[Content_Types].xml")` | Only after the zip signature matched; open read-only, never extract |
| Storage interface | Your own `IFileStorage` (put, open read, exists, delete, list older than) | One implementation over `AWSSDK.S3` (`IAmazonS3`, `PutObjectRequest`, `GetObjectAsync`, `AmazonS3Config.ServiceURL` + `ForcePathStyle = true` for MinIO); one over a folder, writing with `FileMode.CreateNew` so an existing key throws `IOException`. Chosen by config at start-up |
| Download | `ControllerBase.File(Stream, contentType, fileDownloadName, enableRangeProcessing)` or `TypedResults.File(stream, contentType, fileDownloadName)` | Passing `fileDownloadName` makes an `attachment` disposition with `filename` and `filename*`; for a hand-built header use `ContentDispositionHeaderValue.SetHttpFileName` (`Microsoft.Net.Http.Headers`) |
| Upload rate | `AddRateLimiter` + `UseRateLimiter`, a named policy built with `RateLimitPartition.GetSlidingWindowLimiter` (unverified) keyed by account id, applied with `RequireRateLimiting` or `[EnableRateLimiting]` | `RejectionStatusCode` defaults to 503: set 429 and add `Retry-After` in `OnRejected` |
| Purge jobs | `BackgroundService` + `PeriodicTimer.WaitForNextTickAsync`, a scope from `IServiceScopeFactory.CreateScope()` for the `DbContext` | Or the project's scheduler when it has one (for example a Hangfire recurring job) |
| Registry access rule | An architecture test over the assemblies, with the architecture test library of the foundation pack, or a reflection test of your own | Only the file service and link-table queries may touch `DbSet<StoredFile>` |

## Decision by decision

| Decision | .NET | Write yourself |
|---|---|---|
| UPL-D01, UPL-D02 | Settings value read through the settings service of the project; validation of the saved list against a static catalog array | The catalog: extension → detected type → signature check. No package needed for this short list |
| UPL-D03 | Body limits above; record limits in the attaching service | Count and sum of live links inside the save's transaction; bump the record's concurrency token (`xmin` or `row_version`, AUDIT-D10) so two parallel attaches conflict |
| UPL-D04 | Read the first 8 KB of `OpenReadStream()` into a buffer | Signature table: `%PDF-`, `FF D8 FF`, PNG 8-byte header, `GIF87a`/`GIF89a`, `RIFF....WEBP`, OLE2 `D0 CF 11 E0 A1 B1 1A E1`, zip `PK\x03\x04` + Office part list; text = no zero byte. Ignore `IFormFile.ContentType` |
| UPL-D05 | `char.IsControl`; Razor encodes names on output | Cut at the last `/` or `\` yourself, trim, shorten base name by text elements so a Thai vowel is not split, key = `files/yyyy/MM/{Guid}` from the server clock |
| UPL-D06 | `IFileStorage` registered as singleton | Both implementations and one shared test class run against each (MinIO in Testcontainers or compose) |
| UPL-D07 | EF Core entities `StoredFile` and one `<Record>File` per owner, `HasOne/WithMany` | The architecture test; no `DbSet<StoredFile>` query in controllers |
| UPL-D08 | Upload endpoint returns the `UploadStaging` id; owner command DTO carries `StagingIds` | Attach inside the owner's `SaveChangesAsync`: insert `StoredFile` + link, remove staging rows, check `UploadedBy == current actor` |
| UPL-D09, UPL-D13 | `BackgroundService` hourly and daily; `ExecuteDeleteAsync` is allowed on `upload_staging` only (AUDIT-D07) | Delete the object first, then the row; orphan sweep lists objects older than the age and checks both tables. Take a PostgreSQL advisory lock so only one instance purges |
| UPL-D10 | `File(...)` with `fileDownloadName`; global middleware adding `X-Content-Type-Options: nosniff`; `Response.Headers.CacheControl = "private, no-store"` | Load the link through the owner's query (scope filters apply), return `NotFound()` for every miss. Stream `GetObjectResponse.ResponseStream` straight to the response |
| UPL-D12 | Soft delete per the audit pack (`is_deleted` + named query filter) | Remove = set the soft-delete columns on the link in the owner's save |
| UPL-D14 | `IncrementalHash` | Store lower-case hex (`Convert.ToHexStringLower`); duplicate check by `(record_id, sha256)` over live links |
| UPL-D15 | A clamd client, for example the `nClam` package (unverified), or the clamd TCP `INSTREAM` command written by hand | Scan the staged temp stream before `PutAsync`; timeout from `upload.scan_timeout_seconds` with a `CancellationTokenSource`; ClamAV runs as its own container |
| UPL-D16 | Rate limiter policy on the upload endpoint of `{org_portal}` only | Partition key = account id from the claims, never the IP alone |
| UPL-D17 | The audit pack's save interceptor writes the entry | Put file name, size and sha256 in the entry detail; name the action `AttachFile` / `RemoveFile` when only files changed |
| UPL-D19 | A small `GET uploads/limits` endpoint | Return the values in force, read from settings on each call (or a short cache cleared on settings save) |

## mvc-htmx

- Upload field: `hx-post` to the upload action with `hx-encoding="multipart/form-data"` (htmx), one request per file, progress from the `htmx:xhr:progress` event (unverified), the answer swaps in a staged-file row holding a hidden `StagingIds` input.
- Antiforgery: `AutoValidateAntiforgeryToken` on MVC; send the token header on every HTMX request.
- File names in Razor are encoded on output; never put them in `@Html.Raw`.

## react-vite

- Minimal API endpoints that bind `IFormFile` require antiforgery since .NET 8. A browser app's writes already pass the sign-in pack's CSRF check or carry a bearer token, so call `DisableAntiforgery()` on those endpoints and keep that one check.
- Upload progress needs `XMLHttpRequest.upload.onprogress` (browser API; fetch has no upload progress).
- Download with cookie sign-in: point the browser at the download URL. With bearer tokens: fetch as blob and take the name from `Content-Disposition`; cross-origin, expose it with `CorsPolicyBuilder.WithExposedHeaders("Content-Disposition")` (unverified).

## Pitfalls

- The smallest of the body limits wins: proxy, Kestrel, `FormOptions`, attribute. A proxy limit shows up as a dropped connection or 413 from the proxy, not your JSON error.
- `Path.GetFileName` on Linux does not split on `\`; a Windows path from a browser survives it.
- Do not copy the S3 response into a `MemoryStream` before returning it: a 100 MB file then sits in memory per download.
- Do not serve files with `inline` disposition or from `wwwroot`/`UseStaticFiles`; both break UPL-D10.
- `IFormFile.FileName` and `IFormFile.ContentType` are whatever the client sent; use the name only after cleaning and never use the type.
- Hosted services are singletons: never inject the `DbContext` into the purge service directly.
- A business save never deletes storage objects; only the purge jobs do, object first and then the row. Deleting a missing key is harmless on S3 and on a folder (`File.Delete`), so a retry after a failure is safe.
