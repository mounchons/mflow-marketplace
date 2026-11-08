---
pack: users
stack: dotnet
---

# users on ASP.NET Core

Applies when the back end is ASP.NET Core: profiles `mvc-htmx` (MVC + Razor + HTMX) and `react-vite` (React front end + ASP.NET Core Web API). Guidance for /opsx:propose and apply: which framework feature carries each decision and what has to be written by hand. Not code to paste. Accounts are the Identity users of the auth pack's stack file.

## Building blocks

| Concern | Use | Note |
|---|---|---|
| Create an account | `UserManager<TUser>.CreateAsync(user)` without a password, then the invite or link of the auth pack | The account gets a password only through a link or a starting password |
| Change the e-mail | `UserManager.SetEmailAsync` + `UpdateNormalizedEmailAsync` | Ends sessions (auth pack) |
| Change status, group | Own columns; `UserManager.UpdateSecurityStampAsync` | Ends sessions where the auth pack says so |
| Change own password | `UserManager.ChangePasswordAsync(user, current, new)` | Runs the auth pack's password validator; keep the current session |
| Delete | Soft delete of the audit pack | Identity `DeleteAsync` is never called on accounts |
| Concurrency | Identity's `ConcurrencyStamp` or the audit pack's version column | Two administrators saving one account: the second gets 409 |

## Decision by decision

| Decision | .NET | Write yourself |
|---|---|---|
| USERS-D02, USERS-D19, USERS-D20 | `RandomNumberGenerator` for starting passwords; hash with Identity's `PasswordHasher` | Store it in the auth pack's `password_token`, never as the account's password |
| USERS-D03 | `IdentityUser.UserName` set to the e-mail | Show the display name, never `UserName`, in lists |
| USERS-D06 | — | Self-edit rules in the service, not in the screen only |
| USERS-D08 | `UpdateSecurityStampAsync` + end `user_session` rows | In the same transaction as the change |
| USERS-D09 | — | Reset = a password link of the auth pack; the administrator never sees or types a password |
| USERS-D10 | Audit pack soft delete | Keep the e-mail reusable as the audit pack's unique-index rule says |
| USERS-D25, USERS-D26 | `ChangePasswordAsync`; `SetEmailAsync` after the confirmation the decision asks for | Profile endpoints act only on the signed-in account |
| USERS-D27 | Never return `PasswordHash`, `SecurityStamp` or `ConcurrencyStamp` | Response models list their fields; no entity is returned as is |

## Pitfalls

- Returning the Identity user entity from an API leaks `PasswordHash` and `SecurityStamp`; always map to a response model.
- `UserManager.UpdateAsync` overwrites with what was loaded; load, change and save in one request.
