---
pack: auth
stack: dotnet
---

# auth on ASP.NET Core

Applies when the back end is ASP.NET Core: profiles `mvc-htmx` (MVC + Razor + HTMX) and `react-vite` (React front end + ASP.NET Core Web API). Guidance for /opsx:propose and apply: which framework feature carries each decision and what has to be written by hand. Not code to paste. The team standard: accounts and password hashes live in ASP.NET Core Identity; the session rules of this pack are written by hand on top of it.

## Building blocks

| Concern | Use | Note |
|---|---|---|
| Accounts, password hash, security stamp | `AddIdentityCore<TUser>()` + `.AddEntityFrameworkStores<TContext>()` + `.AddSignInManager()` (package `Microsoft.AspNetCore.Identity.EntityFrameworkCore`), `TUser : IdentityUser<Guid>` | `TUser.Id` is `actor.id` of the audit pack. Not `AddDefaultIdentity` / `AddDefaultUI`: the Identity UI pages do not follow this pack's pages |
| Not used | `AddIdentityApiEndpoints` / `MapIdentityApi` | Its bearer tokens are Identity's own format, not JWT, and its endpoints do not follow the pack's order, lock or OTP |
| Password hashing | Identity `PasswordHasher<TUser>` (PBKDF2, `PasswordHasherCompatibilityMode.IdentityV3`) | `PasswordHasherOptions.IterationCount` defaults to 100,000; raise it (OWASP gives 210,000 for PBKDF2-HMAC-SHA512) and time it on the server |
| A web on the API's origin (rendered on the server, or a browser app) | Cookie authentication with `CookieAuthenticationOptions.SessionStore` = an `ITicketStore` over `user_session` | Only a session id reaches the browser; ending the row ends the session at the next request |
| A mobile app, another system, a web on another origin of the same site | `Microsoft.AspNetCore.Authentication.JwtBearer` (`AddJwtBearer`), tokens made with `JsonWebTokenHandler.CreateToken(SecurityTokenDescriptor)` (`Microsoft.IdentityModel.JsonWebTokens`), HS256 with a `SymmetricSecurityKey` from `AUTH_JWT_KEY` | `JsonWebTokenHandler` is the newer handler ASP.NET Core 8+ uses by default |
| Both kinds in one API | `AddPolicyScheme` whose `ForwardDefaultSelector` picks the bearer scheme when an `Authorization` header is present, the cookie scheme otherwise | Only when one API serves both a web with cookies and a client with tokens |
| Everything needs a session | `AddAuthorizationBuilder().SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())` | Sign-in pages and endpoints opt out with `[AllowAnonymous]` |
| Random values and hashes | `RandomNumberGenerator.GetBytes(32)`, `SHA256.HashData`; codes with `HMACSHA256.HashData` keyed from env | Store hashes only |
| Clock | `TimeProvider` injected | Tests move time for expiry, lock and purge |
| Cookie and antiforgery keys | ASP.NET Core Data Protection with keys persisted (`PersistKeysToDbContext<TContext>()`, package `Microsoft.AspNetCore.DataProtection.EntityFrameworkCore`) | Without it a restart or a second container breaks every cookie |
| Extra limiter | `AddRateLimiter` on the anonymous sign-in endpoints | In addition to AUTH-D08, never instead of it |

## Decision by decision

| Decision | .NET | Write yourself |
|---|---|---|
| AUTH-D01, AUTH-D03 | `NormalizedEmail` column of Identity | With several portals set `IdentityOptions.User.RequireUniqueEmail = false`, add a unique EF index on (portal, `NormalizedEmail`) for rows not deleted, and find accounts by portal + normalized e-mail with your own query instead of `FindByEmailAsync` |
| AUTH-D02 | One Identity user table holds the credentials of every portal, with a `Portal` column | The per-portal account tables of `data.md` keep the profile columns, keyed by the same `actor.id` |
| AUTH-D05, AUTH-D06, AUTH-D07 | `SignInManager.CheckPasswordSignInAsync(user, password, lockoutOnFailure: false)` or `UserManager.CheckPasswordAsync` | The sign-in service with the pack's order. Not `PasswordSignInAsync`: it issues Identity's cookie and has its own order |
| AUTH-D08 | — | Identity lockout (`LockoutOptions`) counts only existing users and has no window, so keep `login_attempt` and leave Identity lockout off. Decide one name at a time with a PostgreSQL advisory lock (`pg_advisory_xact_lock`) on portal + e-mail |
| AUTH-D09, AUTH-D10 | Cookie scheme + `ITicketStore`; JwtBearer | Idle and longest-session times come from settings at each use, so enforce them in the ticket store and the refresh endpoint, not with the static `ExpireTimeSpan` / `SlidingExpiration` |
| AUTH-D11 | Antiforgery: built into MVC forms; `[ValidateAntiForgeryToken]` / `AutoValidateAntiforgeryTokenAttribute` | A browser app on the API's origin does not use `IAntiforgery`: write a filter that compares the hash of the `X-CSRF-Token` header with `csrf_token_hash` (`CryptographicOperations.FixedTimeEquals`) and answers 403 `CSRF_FAILED`. Origin check middleware for the endpoints the requirement lists |
| AUTH-D12 | `UserManager.UpdateSecurityStampAsync(user)` | End the account's `user_session` rows in the same transaction. Do not rely on `SecurityStampValidator`: its `ValidationInterval` defaults to 30 minutes |
| AUTH-D13 | `IPasswordValidator<TUser>` | A validator that reads the settings at each call and returns every failure with its numbers. `PasswordOptions` are fixed at start, so relax the built-in ones to the fixed rule only (upper, lower, digit) so errors are not doubled. History: compare the newest `password_history` hashes with `PasswordHasher.VerifyHashedPassword` |
| AUTH-D14, AUTH-D19 | — | Expiry columns and the first-sign-in gate: an authorization filter or middleware that answers 403 `FIRST_LOGIN_REQUIRED` from a session flag (cookie) or a claim (token) |
| AUTH-D16, AUTH-D17, AUTH-D18 | — | Own `password_token` table. Identity's reset tokens (`DataProtectorTokenProvider`) have one lifespan fixed at start (default 1 day) and a new token does not revoke the older ones. After your link check passes, set the password with `GeneratePasswordResetTokenAsync` + `ResetPasswordAsync`, which runs the validators and changes the security stamp |
| AUTH-D20 | `Url.IsLocalUrl` helps | The pack's rule is stricter (no backslash, not a sign-in page): check it yourself |
| AUTH-D22 | `BackgroundService` running daily (or the project's job runner) | The purge queries |
| AUTH-D23, AUTH-D25, AUTH-D26 | — | Own `login_challenge`, `login_code`, `remembered_browser`. Leave Identity two-factor off (`TwoFactorEnabled = false`): its e-mail provider and remember-me cookie cannot follow the code length, lifetime, attempts and hours from settings |
| AUTH-D24 | Read `auth.otp_enabled` at each sign-in | Parse `AUTH_OTP_OFF` at start with `bool.TryParse`; anything else stops the start |
| AUTH-D28 | `UserManager.CreateAsync(user, password)` in a start-up seeder | Only when `IHostEnvironment` is Development or Prototype |
| AUTH-D30 | `CookieSecurePolicy.Always`; `SameAsRequest` in Development and Prototype | Apply to every cookie of the pack |
| AUTH-D31 | — | The refresh endpoint: one transaction, `SELECT … FOR UPDATE` on the session row so two tabs never rotate at once, then the 30-second rule on `previous_token_hash` |
| AUTH-D32 | `TokenValidationParameters`: `ValidateIssuer`, `ValidateAudience` (the portal), `ValidateLifetime`, `ValidateIssuerSigningKey`, `ClockSkew = TimeSpan.FromSeconds(30)`; `JwtBearerOptions.MapInboundClaims = false` | Check the key length (at least 32 bytes) at start. Answer `TOKEN_EXPIRED` from `JwtBearerEvents.OnChallenge` when the failure is a `SecurityTokenExpiredException` |

## mvc-htmx

- Cookie scheme only, unless the project also has a mobile app or another system acting for users.
- HTMX requests: send the antiforgery token in a header (`hx-headers` from the token the layout renders); a 401 answers `HX-Redirect` to `/login?next=…` so the whole page moves, not a fragment.

## react-vite

- Applies to any browser app on an ASP.NET Core API, such as Vue, Angular or a Next.js static export: read React as the project's framework.
- A web on the API's origin (the default): the cookie scheme of the building blocks, and nothing in browser storage. In development the web's dev server forwards `/api` to the API (Vite `server.proxy`, Angular `proxy.conf.json`), so the browser sees one origin.
- At sign-in set two cookies of the portal: the session cookie (`HttpOnly`) and one holding the session's CSRF token with `CookieOptions.HttpOnly = false`. One fetch wrapper copies it into the `X-CSRF-Token` header on every POST, PUT, PATCH and DELETE (AUTH-D11). Angular can do this with `withXsrfConfiguration({ cookieName, headerName })` (unverified).
- On .NET 10 the cookie scheme answers 401 and 403 instead of redirecting for `[ApiController]` and JSON minimal API endpoints; the web goes to the sign-in page from that 401.
- Only for a web on another origin of the same site (sub-domains, AUTH-D09):
  - The API issues and checks JWT; the app keeps the access token in memory (a module variable or context), never in `localStorage` or `sessionStorage`.
  - One refresh in flight per tab: every request waiting on `TOKEN_EXPIRED` awaits the same refresh promise.
  - Put refresh and sign-out under one path, such as `/api/v1/auth/token/refresh` and `/api/v1/auth/token/revoke`, and give the refresh cookie `Path=/api/v1/auth/token`, `HttpOnly`, `SameSite=Strict`; only those two calls use `credentials: 'include'`.
  - `SameSite=Strict` reaches the API only from the same site, so a web on another site is outside this pack.
- A mobile app uses the mobile paths: refresh token in the body, kept in the platform's secure storage.

## Pitfalls

- Microsoft Learn's JWT guidance prefers tokens from an OpenID Connect or OAuth flow, asymmetric signing keys, and a cookie-holding back end for browser apps, and warns against making access tokens from a username/password request. A web on the API's origin therefore uses a cookie (AUTH-D09). Where this pack issues its own tokens it does so on purpose: one API both issues and checks them, they live minutes, refresh tokens rotate and are reuse-checked, and no token sits in browser storage. When another service must check the tokens, or outside clients appear, move to an asymmetric key (ES256 or RS256 with a published public key) or an OpenID Connect server.
- Identity's application cookie defaults to 14 days sliding; never let it stand in for the pack's session rules.
- `MapInboundClaims` left on renames `sub` and other short claims to long URI claim types.
- A shared signing key or Data Protection key across environments lets a Staging token or cookie work in Production; give each deployment its own.
