---
pack: mail
stack: dotnet
---

# mail on ASP.NET Core

Applies when the back end is ASP.NET Core: profiles `mvc-htmx` (MVC + Razor + HTMX) and `react-vite` (React front end + ASP.NET Core Web API). Guidance for /opsx:propose and apply: which framework feature carries each decision and what has to be written by hand. Not code to paste.

## Building blocks

| Concern | Use | Note |
|---|---|---|
| SMTP | MailKit (`MailKit.Net.Smtp.SmtpClient`) and MimeKit (`MimeMessage`, `TextPart("plain")`) | Microsoft Learn marks `System.Net.Mail.SmtpClient` as not recommended for new development and points to MailKit |
| The mail line | One `BackgroundService` with a `PeriodicTimer` of `mail.poll_seconds` | Reads the SMTP values from the settings reader at the start of each attempt |
| Taking rows | PostgreSQL `SELECT … FOR UPDATE SKIP LOCKED` inside a transaction (raw SQL through `FromSql` on the outbox entity) | Two runs never take the same row (MAIL-D12) |
| Secrets in queued e-mails | `System.Security.Cryptography.AesGcm` with the key from `MAIL_SECRET_KEY` | Nonce per row, stored with the cipher text |
| SMTP password on the settings page | The settings pack's secret type (ASP.NET Core Data Protection) | Never logged, never sent to the browser |
| Clock | `TimeProvider` | Retry times and secret clearing in tests |

## Decision by decision

| Decision | .NET | Write yourself |
|---|---|---|
| MAIL-D01 | EF Core: add the `mail_outbox` row to the same `DbContext` before `SaveChangesAsync` | Never call MailKit from a request, except the test button (MAIL-D30) |
| MAIL-D05, MAIL-D06, MAIL-D26 | `IConfiguration` / environment for `MAIL_SEND`, `MAIL_SECRET_KEY`, portal URLs, checked in a start-up validation (`IValidateOptions<T>` with `ValidateOnStart()`) | Start-up messages name the setting, never the value. SMTP values on the page never stop the start |
| MAIL-D09, MAIL-D10 | `SmtpClient.ConnectAsync(host, port, SecureSocketOptions.StartTls or SecureSocketOptions.SslOnConnect)`; `SmtpClient.ServerCertificateValidationCallback` for the SHA-256 pin; `AuthenticateAsync` only when user and password are set | Compare the pin against `X509Certificate2.GetCertHash(HashAlgorithmName.SHA256)`; on no pin, keep the default validation |
| MAIL-D11, MAIL-D13, MAIL-D14 | — | The pick order, the per-recipient retry and the decisions taken at pick time |
| MAIL-D16 | `AesGcm` | Clearing jobs and masking in `mail_log` |
| MAIL-D18, MAIL-D19 | — | A small tag renderer over `{{tag}}`; save refuses unknown tags. No Razor or template engine: subjects and bodies are user text |
| MAIL-D25 | The settings reader of the settings pack | Seed from env once, then the stored value wins |
| MAIL-D30 | MailKit with a `CancellationTokenSource` of `mail.test_timeout_seconds` | The only request that opens SMTP; returns the server's answer with no setting value |

## mvc-htmx

- The test button posts with `hx-post` and swaps the result line; keep the antiforgery token.

## react-vite

- The test call is an ordinary API call; show its result inline on the e-mail tab.

## Pitfalls

- A `MailKit` exception message can hold the host name or user; map it to the server's reply code and text before it reaches `mail_log` or the page.
- Running the mail line in several API containers is safe only with `SKIP LOCKED`; without it, mail goes out twice.
- Don't cache the SMTP values at start: the page change must reach the next attempt.
