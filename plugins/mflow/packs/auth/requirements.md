# auth: requirements

Every number comes from params.md through its key in braces, such as {auth.lock_minutes}. Example people: Dao (`dao@example.com`, Active), Krit (`krit@example.com`, Active), Nim (`nim@example.com`, Invited), a former employee (`former@example.com`, Disabled), and `nobody@example.com`, which has no account.

### Requirement: Sign-in by e-mail
Each {portal} SHALL sign a user in with the e-mail and password of one of its own accounts that is not deleted, the e-mail compared ignoring letter case and surrounding spaces. A display name or username SHALL never sign anyone in. The check SHALL run in this order:
1. The lock (requirement "Lock after repeated failures").
2. The e-mail and the password: the account's own password, then, when AUTH-D18 holds, its starting passwords.
3. The account status: Active and Invited go on, every other status stops; when AUTH-D04 holds, the {org} must be Active too.
4. With the portal's OTP switch on and the browser not remembered for the account, the sign-in code (requirements "Sign-in code" and "Remembered browser").
5. Whether the first sign-in is still due (requirement "First sign-in").

| Case | Answer |
|---|---|
| E-mail locked on this portal | the lock message, whatever the password |
| No account of this portal has the e-mail (unknown, an account of another portal, the system actor, a deleted account), the password does not match, or the account has no password yet | the generic failure, e.g. `Invalid email or password · อีเมลหรือรหัสผ่านไม่ถูกต้อง` |
| Password matches, the account may not sign in | `Please contact the system administrator · กรุณาติดต่อผู้ดูแลระบบ`, never naming the status |
| Password matches, may sign in, OTP switch on, browser not remembered | `OTP_REQUIRED`: the user goes to the sign-in code page, and the rows below apply after the right code |
| Password matches, may sign in, first sign-in due | signed in; the user goes to the first sign-in page |
| Password matches, Active, nothing due | signed in; the user goes to the page asked for, or {start_page} |

The generic failure SHALL be the same, letter for letter, for every case of its row. Every attempt SHALL be counted for the lock with the e-mail as typed, lower-cased, except the right password that leads to a code, which counts neither as a failure nor as a success. A successful sign-in SHALL set the account's last sign-in time when its session opens. (AUTH-D01, AUTH-D05, AUTH-D06, AUTH-D07)

#### Scenario: Wrong password and unknown e-mail look the same
- **WHEN** `dao@example.com` with a wrong password and `nobody@example.com` with any password sign in
- **THEN** both get the generic failure, letter for letter, and nobody is signed in

#### Scenario: Disabled account with the right password
- **WHEN** `former@example.com` (Disabled) signs in with its right password
- **THEN** the answer is the contact-the-administrator message, it does not say Disabled, and nobody is signed in

#### Scenario: Username does not sign in
- **WHEN** Dao types her display name and her right password
- **THEN** the answer is the generic failure

#### Scenario: Invited account before its password
- **WHEN** Nim, Invited with no password yet, signs in with any password
- **THEN** the answer is the generic failure

#### Scenario: Letter case and spaces
- **WHEN** `DAO@example.com ` signs in with Dao's right password
- **THEN** Dao is signed in, goes to {start_page}, and her last sign-in time is set

### Requirement: Accounts of each portal
An e-mail SHALL belong to at most one account of a {portal} among the accounts that are not deleted; the same e-mail on two portals SHALL be two accounts with their own passwords, locks and sessions. Every account table SHALL use the `id` of the account's row in the audit pack's `actor` registry as its key, so every who/when column and `activity_log.actor_id` point at `actor.id`. An account, a session, a password link or a remembered browser of one portal SHALL never sign anyone in on another portal, even when the portals share a host name. (AUTH-D02, AUTH-D03)

#### Scenario: Account of another portal
- **WHEN** Krit, who has an account only on another portal, signs in on this {portal} with that account's password
- **THEN** the answer is the generic failure

#### Scenario: Same e-mail on two portals
- **WHEN** `dao@example.com` has an account on two portals and is locked on one of them
- **THEN** a sign-in with the right password on the other portal succeeds

#### Scenario: Second account with the same e-mail
- **WHEN** a second account of the same {portal} is saved with `dao@example.com`
- **THEN** the save is refused and names the e-mail as taken

### Requirement: Accounts under an organisation
This requirement applies when AUTH-D04 holds. An account SHALL sign in only while its {org} is Active as well. With the right password and an {org} that is not Active, the answer SHALL be the contact-the-administrator message, never saying that the {org} is the reason. Saving an {org} with a status other than Active SHALL end the sessions and pending sign-ins of all its accounts; saving it still Active SHALL end none. (AUTH-D04, AUTH-D12)

#### Scenario: Organisation suspended during a session
- **WHEN** an administrator saves Dao's {org} as Suspended while Dao and Krit of that {org} are signed in
- **THEN** both of their next requests answer 401, and a new sign-in gets the contact-the-administrator message

#### Scenario: Organisation renamed
- **WHEN** an administrator renames Dao's {org} and keeps it Active
- **THEN** Dao's session goes on

### Requirement: Lock after repeated failures
When an e-mail has {auth.lock_failures} failed attempts within {auth.lock_window_minutes} minutes on one portal, with no successful sign-in on that portal after the first of them, sign-in with that e-mail on that portal SHALL be refused with the lock message, e.g. `Too many attempts. Please try again in {auth.lock_minutes} minutes · ลองผิดหลายครั้ง กรุณาลองใหม่ใน {auth.lock_minutes} นาที`, until {auth.lock_minutes} minutes after the failure that reached the count. The three values SHALL be read at each attempt, so a change applies at once to the attempts already recorded.

Each portal SHALL count its own attempts. Names that match no account SHALL be counted and locked the same way. A wrong code SHALL count as a failure, and so SHALL a starting password that expired, was revoked or was used. When a code is asked, the sign-in SHALL count as a success only at the right code. A sign-in from a remembered browser SHALL count as a success at the password. Attempts refused by the lock SHALL not be counted. Sign-ins and codes of one name on one portal SHALL be decided one at a time, so requests sent at the same moment never get more checks than {auth.lock_failures} before the lock. The lock SHALL refuse new sign-ins and codes only: a session already open SHALL keep working. (AUTH-D08, AUTH-D25)

#### Scenario: The try after the count with the right password
- **WHEN** someone types Dao's password wrong {auth.lock_failures} times within {auth.lock_window_minutes} minutes and then the right one
- **THEN** that try gets the lock message, and Dao signs in with the right password once {auth.lock_minutes} minutes have passed after the last failure

#### Scenario: Unknown name is locked too
- **WHEN** `nobody@example.com` fails {auth.lock_failures} times within {auth.lock_window_minutes} minutes and tries again
- **THEN** the try gets the same lock message as an existing account

#### Scenario: A success clears the count
- **WHEN** Dao fails one time fewer than {auth.lock_failures}, signs in, signs out and fails once more, all within {auth.lock_window_minutes} minutes
- **THEN** she is not locked

#### Scenario: Guesses sent in parallel
- **WHEN** a script sends twice {auth.lock_failures} sign-ins with wrong passwords for Dao at the same moment
- **THEN** {auth.lock_failures} of them get the generic failure, the rest get the lock message, and {auth.lock_failures} failed attempts are recorded

#### Scenario: Open session keeps working
- **WHEN** Dao is signed in on one computer and her e-mail gets locked from another
- **THEN** her open session keeps working

### Requirement: Where the user goes after sign-in
The sign-in SHALL take the page the user asked for (`next`) and answer where to go. It SHALL accept `next` only when it is a path of the web the user signs in on: it starts with a single `/`, holds no scheme, host or backslash, and is not a sign-in page. Otherwise the user SHALL go to {start_page}. When a code is asked, the user SHALL go to the sign-in code page, which keeps `next`, and after the right code to where the sign-in would have gone. When the first sign-in is due, the user SHALL go to the first sign-in page, which keeps `next` for later. A page opened without a session SHALL go to the sign-in page with `next` set to that page's path and query; public pages SHALL open without a session. (AUTH-D20)

#### Scenario: Deep link
- **WHEN** Dao, signed out, opens `/orders` and signs in
- **THEN** the web goes to `/login?next=/orders` and, after sign-in, to `/orders`

#### Scenario: Next pointing away
- **WHEN** a user signs in from `/login?next=//evil.example.com/x` or `/login?next=https://evil.example.com`
- **THEN** the user goes to {start_page}

#### Scenario: Next to a sign-in page
- **WHEN** a user signs in from `/login?next=/login`
- **THEN** the user goes to {start_page}

#### Scenario: Through the code and the first sign-in
- **WHEN** Nim, due for the first sign-in, opens `/orders` with the OTP switch on, passes the password, types the right code and completes the first sign-in
- **THEN** the web goes to the sign-in code page, then the first sign-in page, then `/orders`

### Requirement: Server-side sessions
A sign-in SHALL open a session held on the server and named by a random cookie of the {portal} that scripts cannot read; the database SHALL keep only a hash of the cookie's value. An account MAY hold several sessions at once. Every request of a session SHALL push its expiry to the time of the request plus {auth.session_idle_minutes} minutes, but never past {auth.session_max_minutes} minutes after its sign-in, however busy the session is. Each portal SHALL have its own two values, read again on every request, so a change applies to open sessions from their next request without a deploy. A request with an expired session SHALL answer 401 `SESSION_EXPIRED`, and one without a session 401 `UNAUTHENTICATED`; the web SHALL then go to the sign-in page with `reason=timeout` and `next`. What the session fixed at sign-in, such as the rights of the permission pack, SHALL be read again only at the next sign-in. The cookie SHALL be marked Secure, except in Development and Prototype, where it is Secure only when the request came over HTTPS. (AUTH-D09, AUTH-D10, AUTH-D30)

#### Scenario: Page left for two hours
- **WHEN** Dao signs in at 09:00, last uses the portal at 09:30 and comes back at 11:30, with {auth.session_idle_minutes} longer than two hours
- **THEN** the session still works and now expires {auth.session_idle_minutes} minutes after 11:30

#### Scenario: Busy past the longest session
- **WHEN** Dao signs in at 09:00 and uses the portal every few minutes until {auth.session_max_minutes} minutes have passed
- **THEN** the next request answers 401 `SESSION_EXPIRED`, and Dao signs in again with the rights of that moment

#### Scenario: Cookie on another portal
- **WHEN** Dao is signed in on one portal and opens another portal on the same host in the same browser
- **THEN** the other portal does not know Dao

#### Scenario: HTTP on a test server
- **WHEN** the API runs in Prototype and a sign-in arrives over HTTP
- **THEN** the session cookie is not marked Secure, and the sign-in works in the browser

#### Scenario: Other environments
- **WHEN** the API runs in any environment but Development and Prototype and a sign-in arrives over HTTP behind the proxy
- **THEN** the session cookie is marked Secure

#### Scenario: Two computers
- **WHEN** Dao signs in on two computers
- **THEN** both sessions work at the same time

### Requirement: Sign out
Sign out SHALL end the session on the server, clear the session cookie and go to the sign-in page. The cookie of an ended session SHALL never work again. Every signed-in page SHALL offer Sign out in the user menu. (AUTH-D09)

#### Scenario: Old cookie after sign out
- **WHEN** Dao signs out and a client sends her old session cookie again
- **THEN** the API answers 401 `UNAUTHENTICATED`

### Requirement: Writes need the session's CSRF token
Every POST, PUT, PATCH and DELETE of a signed-in session SHALL carry a header equal to the CSRF token the session got at sign-in, which the web reads from a cookie of its own portal that its scripts can read. A write without it, or with another session's value, SHALL answer 403 `CSRF_FAILED` and change nothing. Sign-in, the sign-in code, forgot password, the link check and set new password have no session and need no token. (AUTH-D11)

#### Scenario: Write without the header
- **WHEN** a client posts to a write endpoint with Dao's session cookie but without the CSRF header
- **THEN** the API answers 403 `CSRF_FAILED` and nothing is saved

#### Scenario: Token of another session
- **WHEN** a client sends Dao's session cookie with the CSRF token of Krit's session
- **THEN** the API answers 403 `CSRF_FAILED`

### Requirement: Sign-in requests come from the portal's own pages
The sign-in, sign-in code, resend code, forgot-password and set-new-password requests SHALL carry an `Origin` whose scheme, host and port are those of the portal's own address. A request without an `Origin`, or with another one, SHALL answer 403 `ORIGIN_REFUSED`, sign nobody in, count no attempt, queue nothing and change nothing. (AUTH-D11)

#### Scenario: Page of another site
- **WHEN** a page on `https://evil.example.com` makes a browser post a sign-in with an attacker's e-mail and password
- **THEN** the API answers 403 `ORIGIN_REFUSED` and the browser holds no session

#### Scenario: Another portal on the same host
- **WHEN** a page of one portal posts a sign-in to another portal on the same host
- **THEN** the API answers 403 `ORIGIN_REFUSED`

#### Scenario: No Origin
- **WHEN** a client posts a forgot-password request without an `Origin`
- **THEN** the API answers 403 `ORIGIN_REFUSED` and nothing is queued

### Requirement: Account changes end its sessions
These changes SHALL end the sessions and pending sign-ins of the account they concern: its status away from Active, its deletion, a change of its sign-in e-mail, a change of its password, a change of what fixes its rights (the group or role of the permission pack), and, when AUTH-D04 holds, its {org} saved with a status other than Active. A password or e-mail changed by the account holder SHALL keep the session that changed it. The next request of an ended session SHALL answer 401 `UNAUTHENTICATED`.

The ending SHALL hold whatever the order in which such a change and a sign-in of the same account commit: a session opened by a sign-in that read the account before the change committed SHALL answer 401 `UNAUTHENTICATED` from its first request after the change. A change that ends nothing (a display name, a phone number) SHALL leave every session as it was. (AUTH-D12)

#### Scenario: Disabled during a session
- **WHEN** an administrator sets Dao to Disabled while she is signed in
- **THEN** her next request answers 401 and the web goes to the sign-in page

#### Scenario: E-mail changed
- **WHEN** an administrator changes Dao's e-mail while she is signed in
- **THEN** her sessions end, and she signs in with the new e-mail only

#### Scenario: Name changed
- **WHEN** an administrator changes Dao's display name while she is signed in
- **THEN** her session goes on

#### Scenario: Own password on two computers
- **WHEN** Dao is signed in on two computers and sets a new password on one of them
- **THEN** the session that set it goes on and the other one ends

#### Scenario: A sign-in that read the account before the change
- **WHEN** Dao signs in while an administrator sets her to Disabled, and her sign-in read the account while it was still Active but committed its session after the save
- **THEN** that session's first request answers 401 `UNAUTHENTICATED`

### Requirement: Password policy
A new password SHALL be {auth.password_min_length} to {auth.password_max_length} characters and hold at least one upper-case letter (A–Z), one lower-case letter (a–z) and one digit (0–9); these three rules SHALL always apply. While {auth.password_require_special} is on, it SHALL also hold a character that is none of A–Z, a–z and 0–9. It SHALL differ from the account's {auth.password_history} most recent passwords. The values SHALL be read whenever a new password is checked, so a change applies to the next password set, and a password set before keeps signing in until it expires or is changed.

A password SHALL be stored only as a salted, slow one-way hash such as Argon2id. A refused password SHALL name every rule it breaks, with the current numbers. The confirmation SHALL match the new password. (AUTH-D13, AUTH-D15, AUTH-D27)

| New password | Answer |
|---|---|
| upper-case, lower-case and a digit, within the length | accepted |
| one character shorter than {auth.password_min_length} | refused: the length |
| one character longer than {auth.password_max_length} | refused: the length |
| no upper-case letter | refused: an upper-case letter |
| no lower-case letter | refused: a lower-case letter |
| no digit | refused: a digit |
| one of the {auth.password_history} most recent | refused: not one of the last {auth.password_history} |

#### Scenario: Policy table
- **WHEN** Dao sets each new password of the table above
- **THEN** the answer is the table's answer for that row

#### Scenario: Several rules at once
- **WHEN** Dao sets `abc`
- **THEN** the refusal names the length, an upper-case letter and a digit

#### Scenario: Minimum length raised
- **WHEN** an administrator raises {auth.password_min_length}, and Dao then sets a password one character shorter than the new value
- **THEN** the refusal names the new length, and Krit's shorter password set before still signs in

#### Scenario: Special character switched on
- **WHEN** {auth.password_require_special} is on and Dao sets `Abcdefg1`
- **THEN** the refusal names a character other than A–Z, a–z and 0–9, and `Abcdef1!` is accepted

### Requirement: Password expiry
A password SHALL expire {auth.password_expiry_days} calendar days after it is set, at the same time of day in the system time zone. When {auth.password_expiry_days} changes, every account that has a password SHALL get its expiry worked out again from the moment its password was set, in the same save as the setting: a shorter value can expire passwords at once, and a longer one can bring an expired password back. An account whose password has expired SHALL sign in and be asked for a new one before anything else (requirement "First sign-in"). (AUTH-D14)

#### Scenario: Expiry
- **WHEN** Dao sets a new password on a Thursday at 09:00 system time
- **THEN** it expires {auth.password_expiry_days} calendar days later at 09:00, weekends and holidays counted

#### Scenario: Expiry shortened
- **WHEN** Krit's password was set longer ago than a new, shorter {auth.password_expiry_days}, and an administrator saves that value
- **THEN** Krit's password has expired, and his next sign-in asks for a new password

#### Scenario: Expiry lengthened
- **WHEN** Dao's password expired yesterday and an administrator saves a {auth.password_expiry_days} long enough to cover it
- **THEN** Dao signs in with that password, which now expires on the new date

### Requirement: Password rules for the pages
`GET /auth/password-rules` SHALL answer, without a session, the rules a new password must meet on that portal: the minimum and maximum length, whether a special character is required, and how many recent passwords it must differ from, as requirement "Password policy" reads them at that moment. It SHALL answer nothing about the lock or the expiry, and SHALL write no Activity Log entry. Every page that sets a password SHALL show under the new password a hint built from this answer, read once when the page opens; when the answer cannot be read, the hint SHALL name only the fixed rule (an upper-case letter, a lower-case letter and a digit), and a refused password still names every rule with its numbers. (AUTH-D13)

#### Scenario: Rules after a change
- **WHEN** an administrator raises {auth.password_min_length} and switches {auth.password_require_special} on, and a browser then reads the rules
- **THEN** the answer holds the new length and a special character required

#### Scenario: Rules that cannot be read
- **WHEN** the call for the rules fails as the set-new-password page opens
- **THEN** the hint names only the fixed rule, and the page still saves a password the API accepts

### Requirement: Forgot password
Forgot password SHALL take an e-mail and always answer the same neutral reply, e.g. `If the e-mail belongs to an account, we have sent a link to set a new password · หากอีเมลนี้มีบัญชีอยู่ ระบบได้ส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว`, whatever happened. It SHALL look only at the accounts of the portal it is asked on. When the e-mail is that of an account that is not deleted, may sign in (Active or Invited, and its {org} Active when AUTH-D04 holds), and has had fewer than {auth.link_requests_per_hour} links in the last hour, it SHALL make a password link and queue the e-mail `account.password_link` to that account (requirement "Password link"). Otherwise nothing SHALL be queued. The link SHALL travel only in the queued e-mail's encrypted secret of the mail pack, never in its plain values. (AUTH-D16)

#### Scenario: Known e-mail
- **WHEN** Dao asks for a link with `dao@example.com`
- **THEN** the page shows the neutral reply and one `account.password_link` is queued to Dao

#### Scenario: Unknown e-mail
- **WHEN** someone asks for a link with `nobody@example.com`
- **THEN** the page shows the same neutral reply and nothing is queued

#### Scenario: Too many links in an hour
- **WHEN** Dao has had {auth.link_requests_per_hour} links in the last hour and asks again
- **THEN** the reply is the neutral one and nothing is queued; an hour after the first, a request queues one

#### Scenario: Disabled account
- **WHEN** someone asks for a link with `former@example.com`
- **THEN** the reply is the neutral one and nothing is queued

#### Scenario: Invited account
- **WHEN** Nim, Invited, asks for a link
- **THEN** one `account.password_link` is queued, and after setting a password Nim is still Invited until the first sign-in

### Requirement: Password link
A password link SHALL hold a random token, valid {auth.link_hours} hours by the API clock and once; the database SHALL keep only its hash. A new link of an account SHALL revoke the account's earlier unused links and starting passwords. The link SHALL open the set-new-password page of the account's own portal, with the token after `#` in the address, so neither the web server nor the API logs it, and the page SHALL send it to the API only in a request body. A link SHALL work only on the portal of its account. The page SHALL check the link when it opens. Saving a password through a link SHALL apply the password policy; set the password, its change time and its expiry; mark the link used and revoke the account's other unused links and starting passwords; end the account's sessions; and leave an Invited account Invited, so its first sign-in still asks for {terms}. An expired, used, revoked or unknown link, or a link of another portal, SHALL answer the same message, e.g. `This link has expired or was already used. Please ask for a new one · ลิงก์นี้หมดอายุหรือถูกใช้แล้ว กรุณาขอลิงก์ใหม่`. The save SHALL show that it succeeded and offer Sign in; it SHALL not sign the user in. (AUTH-D17)

#### Scenario: Link used in time
- **WHEN** Dao saves `Newpass26` through a link {auth.link_hours} hours minus one minute after it was made
- **THEN** the password is set, the page shows success with Sign in, and the link no longer works

#### Scenario: Link too late
- **WHEN** Dao opens a link one minute after its {auth.link_hours} hours
- **THEN** the page shows the expired-link message and saves nothing

#### Scenario: Older link after a new one
- **WHEN** Dao asks for two links and opens the first
- **THEN** the page shows the expired-link message, and the second link works

#### Scenario: Link opened on another portal
- **WHEN** a token of Dao's link is posted to another portal's set-new-password page
- **THEN** the page shows the expired-link message and nothing is saved

### Requirement: Starting password
This requirement applies when AUTH-D18 holds. A starting password, sent by the users pack in the invite e-mail, SHALL be random, valid {auth.starting_password_hours} hours and once, and stored only as a hash. A new invite SHALL revoke the account's earlier unused starting passwords and links. A sign-in whose password matches a starting password that expired, was revoked or was used SHALL answer, e.g., `Your starting password has expired. Use Forgot password, or ask for a new invitation · รหัสผ่านเริ่มต้นหมดอายุแล้ว ใช้ลืมรหัสผ่าน หรือขออีเมลเชิญใหม่`, and count as a failed attempt. A sign-in with a valid starting password SHALL be due for the first sign-in, which marks it used. (AUTH-D18)

#### Scenario: Starting password in time
- **WHEN** Nim is invited at 10:00 and signs in with the starting password at 15:00, within {auth.starting_password_hours} hours
- **THEN** Nim is signed in, still Invited, and goes to the first sign-in page

#### Scenario: Starting password too late
- **WHEN** Nim signs in with a starting password older than {auth.starting_password_hours} hours
- **THEN** the answer is the starting-password-expired message, nobody is signed in, and the attempt counts toward the lock

#### Scenario: Starting password after the first sign-in
- **WHEN** Nim has completed the first sign-in and signs in again with the starting password
- **THEN** the answer is the starting-password-expired message

### Requirement: First sign-in
A signed-in account SHALL be due for its first sign-in when it signed in with a starting password, when its password has expired, when it has not accepted {terms} yet, or any of these together. While it is due, the web SHALL show only the first sign-in page, holding a new password with its confirmation and the policy hint when a new password is due, and {terms} in a scrollable frame with an accept tick when they are not accepted yet; every API call but the current user, the first sign-in save and sign out SHALL answer 403 `FIRST_LOGIN_REQUIRED`. Save SHALL stay disabled until every due part is filled in and ticked. Saving SHALL apply the password policy to a new password, mark the starting password used and revoke the other unused starting passwords and links, record the time and version of the accepted {terms}, turn Invited into Active, end the account's other sessions when the password changed, and send the user to the page asked for or {start_page}. The page SHALL not be skipped; an account that leaves it stays as it was and is due again at its next sign-in. (AUTH-D19)

| Own password | {terms} accepted | The page asks for |
|---|---|---|
| none (signed in with a starting password) | no | a new password and {terms} |
| expired | yes | a new password |
| set through a link while Invited | no | {terms} |
| expired | no | both |

#### Scenario: Expired password only
- **WHEN** Dao, whose password expired and whose {terms} are accepted, signs in
- **THEN** the page shows the new password fields and no {terms} box, and saving `Newpass26` sends Dao to {start_page}

#### Scenario: Terms only
- **WHEN** Nim, Invited with a password set through a link, signs in and ticks {terms}
- **THEN** the page shows no password fields, and after Save Nim is Active with the time and version recorded

#### Scenario: Another API before the first sign-in
- **WHEN** Nim, due for the first sign-in, calls a list endpoint directly
- **THEN** the API answers 403 `FIRST_LOGIN_REQUIRED` and returns no data

### Requirement: Activity Log of sign-in
These events SHALL write an Activity Log entry of the audit pack under the account they concern, with its portal:
- `Login`: a session opened, after the right code when one is asked, with the note `remembered browser` when a remembered browser skipped the code;
- `Logout`: a sign out;
- `LoginFailed`: a wrong password, an account without a password yet, a starting password that expired, was revoked or was used, a wrong code (note `wrong code`), and a code typed after its time (note `code expired`);
- `LoginRefused`: the right password of an account that may not sign in;
- `LoginLocked`: an attempt refused by the lock, at the password or at the code;
- `PasswordLinkRequested`: a password link queued;
- `PasswordChanged`: a password set through a link, at the first sign-in, or by the users pack's change password;
- `TermsAccepted`: {terms} accepted at the first sign-in.

A name that matches no account of the portal SHALL write no entry; it stays only in the attempt counter. The right password that leads to a code, and a code sent, SHALL write no entry; the queued e-mail records the send. No entry SHALL hold a password, a hash, a token, a code, or the text typed in a password or code field. (AUTH-D21)

#### Scenario: A real and an unknown name
- **WHEN** `dao@example.com` and `nobody@example.com` each fail once
- **THEN** the Activity Log holds one `LoginFailed` under Dao and nothing for `nobody@example.com`

#### Scenario: Password changed
- **WHEN** Dao saves a new password through a link
- **THEN** the Activity Log holds `PasswordChanged` under Dao, showing that the password changed without any value

#### Scenario: Login only after the code
- **WHEN** the OTP switch is on, Dao passes the password, types one wrong code, then the right one
- **THEN** the Activity Log holds `LoginFailed` with note `wrong code`, then one `Login`, and neither holds the code

### Requirement: Sign-in tables are purged by age
A daily purge SHALL delete sessions {auth.purge_session_days} days after they expired; attempts after {auth.purge_attempt_days} days or, when {auth.lock_window_minutes} plus {auth.lock_minutes} is longer, after that long; pending sign-ins one day after they started; remembered browsers once their end time has passed; and password links and starting passwords {auth.purge_link_days} days after they expired, so an expired link can still be told from an unknown one in between. It SHALL write no Activity Log entry and touch no business row. (AUTH-D22)

#### Scenario: Daily purge
- **WHEN** the purge runs
- **THEN** rows past their age are deleted, newer rows stay, and the Activity Log is unchanged

#### Scenario: Attempts kept for a long lock
- **WHEN** {auth.lock_window_minutes} plus {auth.lock_minutes} is longer than {auth.purge_attempt_days} days
- **THEN** the purge keeps every attempt younger than that sum

### Requirement: Sign-in pages
Each {portal} web SHALL serve these pages in a sign-in layout without the portal menu, built from the UI kit:
- `/login`: Email, Password, Sign in, the Forgot password link and a line naming whom to contact; arriving with `?reason=timeout` it SHALL show that the session ended because it was left idle, and with `?reason=code` that the sign-in code is no longer valid;
- `/forgot-password`: Email, Send reset link, the neutral reply;
- `/reset-password`: with a valid `#token=`, New password, Confirm, the policy hint and Save; otherwise the expired-link message and a way to ask for a new link;
- `/first-login`: the parts of requirement "First sign-in";
- `/sign-in-code`: requirement "Sign-in code page".
(AUTH-D06, AUTH-D19)

#### Scenario: Timeout note
- **WHEN** a user arrives at `/login?reason=timeout`
- **THEN** the page shows the idle-timeout note above the form

#### Scenario: Sign out from a page
- **WHEN** Dao presses Sign out on any signed-in page
- **THEN** the session ends and the web shows `/login`

### Requirement: Email OTP switch per portal
Each {portal} SHALL have its own Email OTP switch `AUTH_OTP_<PORTAL>`, read from the environment when the API starts. A switch SHALL be off when it is not set, and SHALL accept only `true` or `false`, ignoring letter case; the API SHALL refuse to start with any other value, naming the setting but not its value. With a portal's switch off, sign-in on that portal SHALL work as if there were no code step: no code is asked, no `account.sign_in_code` is queued, and no pending sign-in or remembered browser is made. A switch changed by a restart SHALL act from the next sign-in: it SHALL never end an open session, and with the switch off a pending sign-in of that portal SHALL answer as ended. (AUTH-D23, AUTH-D24)

#### Scenario: Switch off
- **WHEN** the switch of Dao's portal is not set and Dao signs in with the right password
- **THEN** Dao is signed in at once and no code is queued

#### Scenario: Each portal has its own switch
- **WHEN** one portal's switch is `true` and another's is not set
- **THEN** a sign-in on the first asks for a code and a sign-in on the second does not

#### Scenario: A value the API cannot read
- **WHEN** the API starts with the switch set to `yes`
- **THEN** it does not start, and its message names the setting

#### Scenario: Turned off while mail is down
- **WHEN** the switch is on, no code reaches anyone, and IT sets it to `false` and restarts the API
- **THEN** users sign in with the password alone, and open sessions are kept

### Requirement: Sign-in code
When a portal's switch is on, a sign-in that has passed the password, starting passwords included, and the status checks, from a browser not remembered for that account, SHALL NOT open a session. The API SHALL instead:
- open a pending sign-in for that account on that portal, lasting {auth.otp_pending_minutes} minutes and named by a random cookie of that portal that scripts cannot read, marked Secure as the session cookie is; the database SHALL keep only a hash of the cookie's value;
- make a code of {auth.otp_digits} digits from a cryptographic random source, valid {auth.otp_code_minutes} minutes, and keep only a keyed hash of it;
- queue the e-mail `account.sign_in_code` to the account's e-mail with the code;
- answer `OTP_REQUIRED` with the route of the sign-in code page, keeping the page asked for;
- set no session or CSRF cookie and write no `Login`.

Until the right code, every API call SHALL answer as for a request without a session. The right code, in time and while the pending sign-in lasts, SHALL open the session as the sign-in would have opened it, set the session and CSRF cookies, end the pending sign-in so neither the code nor the pending cookie works again, and answer the route. A change of requirement "Account changes end its sessions" made after the password step SHALL end the pending sign-in: the right code then SHALL answer `OTP_RESTART` and open nothing. A new pending sign-in of an account on a portal SHALL end its earlier ones there, and a new code SHALL void the earlier codes of its pending sign-in. Resend SHALL make a new code within the same pending sign-in no sooner than {auth.otp_resend_seconds} seconds after the last one; earlier it SHALL answer `OTP_RESEND_WAIT` with the seconds left and make nothing. An account SHALL get at most {auth.otp_codes_per_hour} codes an hour on a portal; past that, the right password and Resend SHALL answer `OTP_LIMIT`, queue nothing and open nothing, and the lock counts such a sign-in neither as a failure nor as a success. The code SHALL never appear in an API answer, a URL, a log or an Activity Log entry. (AUTH-D23, AUTH-D25)

#### Scenario: Code asked, then signed in
- **WHEN** the switch is on, Dao signs in with the right password and types the code of the queued e-mail in time
- **THEN** the password step answers `OTP_REQUIRED` and sets no session cookie, the code opens her session, and the Activity Log holds one `Login`

#### Scenario: No session before the code
- **WHEN** Dao has passed the password and calls the current-user endpoint with the pending cookie
- **THEN** the API answers 401 `UNAUTHENTICATED`

#### Scenario: Resend too early
- **WHEN** Dao presses Resend before {auth.otp_resend_seconds} seconds have passed, then again after
- **THEN** the first press answers `OTP_RESEND_WAIT` and queues nothing; the second queues a new code, and the first code no longer signs in

#### Scenario: A new sign-in ends the earlier one
- **WHEN** Dao passes the password on one computer and then on another, and types each computer's code
- **THEN** the first computer's code answers `OTP_RESTART`, and the second signs her in

#### Scenario: Disabled while a code is pending
- **WHEN** Dao has passed the password and an administrator sets her to Disabled before she types the code
- **THEN** the right code answers `OTP_RESTART` and no session opens

### Requirement: Wrong and expired codes
A pending cookie that names no pending sign-in SHALL answer `OTP_RESTART`. For every other one, the code step SHALL check the lock first, then whether the pending sign-in has ended, then the code's time, then the code. Code checks of one e-mail on one portal SHALL be decided one at a time. Each wrong code SHALL count as a failed attempt of the account's e-mail on that portal, and the {auth.otp_wrong_codes}th wrong code of a pending sign-in SHALL end it. A code typed after its time SHALL not be counted. A pending sign-in SHALL end after {auth.otp_pending_minutes} minutes, at the right code, at its last allowed wrong code, at a refusal by the lock, at a new pending sign-in of the account on that portal, and when the portal's switch is off. (AUTH-D25)

| The code step meets | Answer |
|---|---|
| The account's e-mail locked on that portal | the lock message; the pending sign-in ends |
| No pending sign-in, or one that has ended | 401 `OTP_RESTART`: please sign in again |
| The right code in time | signed in (requirement "Sign-in code") |
| A wrong code, before the last allowed | 400 `OTP_WRONG`: the code is not correct; counted |
| The {auth.otp_wrong_codes}th wrong code | 401 `OTP_RESTART`, counted; the pending sign-in ends |
| A code past its time, the pending sign-in still lasting | 410 `OTP_EXPIRED`: press Resend code; not counted |

#### Scenario: Wrong codes up to the limit
- **WHEN** Dao types {auth.otp_wrong_codes} wrong codes
- **THEN** the last answers `OTP_RESTART`, the page goes back to sign-in, and when that reaches {auth.lock_failures} failures the right password gets the lock message

#### Scenario: Code typed late
- **WHEN** Dao types her code after {auth.otp_code_minutes} minutes, while the pending sign-in lasts
- **THEN** the answer is `OTP_EXPIRED`, nothing is counted, and Resend gives a code that signs her in

#### Scenario: Pending sign-in over
- **WHEN** Dao types a code or presses Resend after {auth.otp_pending_minutes} minutes
- **THEN** the answer is `OTP_RESTART`, and she signs in again with the password

### Requirement: Remembered browser
When the right code signs a user in and the portal's {auth.otp_remember_hours} is above 0, the browser SHALL get a random cookie of that portal that scripts cannot read, marked Secure as the session cookie is, lasting that many hours from the right code; the database SHALL keep only a hash of its value with the account, the portal and the end time. The hours SHALL be read when a code is passed, so a change applies to the next code passed; 0 is read at every sign-in and asks every browser, those already remembered included. A sign-in on that portal from a browser whose cookie names the signing-in account, before its end, SHALL open the session without a code. A remembered browser SHALL never skip the password, the lock or the status checks; SHALL never be extended by use; and SHALL remember one account per portal, so passing a code for another account replaces its cookie. A change of the account's password, or of what fixes its rights, SHALL forget every remembered browser of that account. (AUTH-D26)

#### Scenario: Same browser later
- **WHEN** Dao passes a code at 09:00, her session ends, and she signs in again on the same browser before {auth.otp_remember_hours} hours have passed, and again after
- **THEN** the first of those asks no code, and the second asks for one

#### Scenario: Another browser
- **WHEN** Dao passes a code on her work computer and signs in on a laptop the same evening
- **THEN** the laptop asks for a code

#### Scenario: Password changed
- **WHEN** Dao's browser is remembered and she sets a new password
- **THEN** her next sign-in on that browser asks for a code

#### Scenario: Two accounts on one browser
- **WHEN** Dao passes a code on a browser, then Krit passes one on the same browser, then Dao signs in there again
- **THEN** Dao is asked for a code

### Requirement: Sign-in code page
Each web SHALL serve `/sign-in-code` in its sign-in layout: that a code of {auth.otp_digits} digits was sent to the account's e-mail, shown only masked (its first character, `***`, then `@` and the domain), and how long it works; Code, taking {auth.otp_digits} digits, with Verify disabled until they are typed; Resend code, disabled with a countdown until Resend is allowed; and Back to sign in, which keeps the page asked for. The page SHALL show the answers of requirement "Wrong and expired codes" above the form. `OTP_RESTART`, and the page opened without a pending sign-in, SHALL go to `/login?reason=code` with the page asked for. (AUTH-D23)

#### Scenario: After the password
- **WHEN** Dao passes the password with the switch on
- **THEN** the web shows `/sign-in-code` with `d***@example.com` and Resend code counting down

#### Scenario: Opened without a pending sign-in
- **WHEN** someone opens `/sign-in-code` without a pending cookie
- **THEN** the web goes to `/login?reason=code` and shows the code note there

### Requirement: Adjustable values
The values of params.md SHALL be kept with the system's settings, read again at each use, and changed only within their ranges, never looser than the defaults; a value the customer's documents set SHALL be the default instead. A change SHALL write an Activity Log entry with the old and the new value. A minimum above its maximum, or an idle time above the longest session of the same portal, SHALL be refused and save nothing. (AUTH-D27)

#### Scenario: Looser than the default
- **WHEN** an administrator saves {auth.password_min_length} below its default
- **THEN** the save is refused and names the setting

#### Scenario: Idle longer than the longest session
- **WHEN** an administrator saves {auth.session_idle_minutes} above {auth.session_max_minutes} of the same portal
- **THEN** the save is refused and nothing changes

### Requirement: Seed accounts for development and prototype
In Development and Prototype only, the first start SHALL create the example accounts of each {portal}, including one Disabled account, all with the shared password of that portal's environment value `PROTOTYPE_<PORTAL>_PASSWORD`, which SHALL pass the password policy; the API SHALL refuse to start in those environments without it. No other environment SHALL create seed accounts, and no password SHALL be in the repository. (AUTH-D28)

#### Scenario: Seed in Prototype
- **WHEN** the API starts in Prototype for the first time with the portal's password set
- **THEN** the example accounts exist and sign in with that password

#### Scenario: Production start
- **WHEN** the API starts in Production
- **THEN** no seed account is created

### Requirement: Prototype user switcher
In prototype mode only, a signed-in user of a portal that is not open to the internet SHALL be able to switch to another account of the same portal without a password or a code; the switch SHALL open a new session for that account with its own rights, end the previous one, and write `Login` with a note that it was a switch. Without a session the switcher SHALL not show, and nobody SHALL be signed in automatically. A portal open to the internet SHALL have no switcher. (AUTH-D29)

#### Scenario: Switch after sign-in
- **WHEN** an administrator signs in on the prototype and switches to Dao
- **THEN** the web shows Dao's menus and data, and the Activity Log holds `Login` under Dao noting the switch

#### Scenario: No session
- **WHEN** a visitor opens the prototype without signing in
- **THEN** the sign-in page shows, and no switcher is offered
