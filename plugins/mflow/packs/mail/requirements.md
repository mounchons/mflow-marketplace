# mail requirements

Example people in the scenarios: Malee, the administrator; Somchai, a staff member; Napa, Anan and Wit, accounts of the {org} "Acme Parts". All addresses are at example.com or example.org.

## Queue and sending

### Requirement: E-mail is queued with the change that causes it
Every e-mail SHALL be written to `mail_outbox` as Queued in the same transaction as the business change that raises it. No request SHALL open an SMTP connection, except Send test on the settings page (MAIL-D30); the mail line SHALL send queued e-mails on its own. Queuing an e-mail SHALL write no Activity Log entry of its own; the change that queued it is logged once (MAIL-D01).

#### Scenario: Change rolled back
- **WHEN** Somchai approves an order, the approval queues an e-mail, and the save fails on a later check
- **THEN** neither the approval nor the e-mail is stored, and nothing is sent

#### Scenario: Mail server down
- **WHEN** the mail server is unreachable and Somchai approves an order
- **THEN** the approval succeeds at once, and its e-mail waits Queued

### Requirement: E-mail events are fixed in code
The events that send e-mail, the step and row each belongs to, its default template and the tags it fills SHALL be fixed in code. Users SHALL change only the template a row binds and a step's switch (MAIL-D02, MAIL-D03).

#### Scenario: No event added from a screen
- **WHEN** Malee opens the mail binding screen
- **THEN** she can pick templates and switch steps, and can neither add nor remove an event

### Requirement: Account e-mails always send
`account.invite`, `account.password_link` and `account.sign_in_code` SHALL be fixed e-mails: always queued with their own system template, with no row on the binding screen, whatever the step switches say. Their templates SHALL never be switched off; a request to do so SHALL answer 409 `TEMPLATE_ALWAYS_ENABLED`. An administrator's password reset and a new user's first password link SHALL use `account.password_link` (MAIL-D04).

#### Scenario: Forgot password with every step off
- **WHEN** every step is Off and Somchai asks for a password link
- **THEN** one `account.password_link` e-mail is queued to `somchai@example.com` with its system template

#### Scenario: Switching off the invite template
- **WHEN** Malee switches `account.invite` off
- **THEN** the API answers 409 `TEMPLATE_ALWAYS_ENABLED` and the template stays Enabled

### Requirement: Mail sending switch
The mail line SHALL send only while the env switch `MAIL_SEND` is on; it SHALL be off unless set, and an unreadable value SHALL stop the API at start. While it is off, e-mails SHALL still be queued and shown on the prototype mailbox, and no SMTP connection SHALL be opened.

When the API starts with the switch on and no send marker is stored, it SHALL store the start time as the marker; when it starts with the switch off, it SHALL clear the marker. The mail line SHALL take only e-mails queued at or after the marker; earlier ones SHALL stay Queued and never be sent (MAIL-D05).

#### Scenario: Switch off
- **WHEN** the API runs with `MAIL_SEND` unset and Somchai asks for a password link
- **THEN** the e-mail is queued and shown on the mailbox, and no SMTP connection is opened

#### Scenario: Old e-mails stay unsent
- **WHEN** 40 e-mails were queued while the switch was off, and the API restarts with it on at 09:00
- **THEN** the marker is 09:00, the 40 stay Queued and are never sent, and an e-mail queued at 09:05 is sent

#### Scenario: Off and on again
- **WHEN** the switch was on from Monday 09:00, the API restarted with it off on Monday 17:00, and with it on again on Tuesday 09:00
- **THEN** the marker is Tuesday 09:00, and an e-mail queued on Monday 18:00 is never sent

### Requirement: Which queued e-mails are sent
The mail line SHALL look at the queue every {mail.poll_seconds} seconds while the switch is on. It SHALL take `account.sign_in_code` e-mails first, then the others oldest first. Each e-mail SHALL be decided when it is taken, and again before every retry, by the first row that applies (MAIL-D13, MAIL-D14):

| The e-mail | Outcome | Sent |
|---|---|---|
| Queued before the marker | stays Queued | no |
| Its secret is cleared, or can no longer be read | Skipped "Secret expired" | no |
| It has no template | Skipped "No template" | no |
| Its template is switched off | Skipped "Template off" | no |
| It has no recipient | Skipped "No recipient" | no |
| None of its recipients is on a set allow-list | Skipped "Not on the allow-list" | no |
| The rate cap is reached | stays Queued for a later run | no |
| Otherwise | sent to each recipient on the allow-list | yes |

#### Scenario: A sign-in code goes first
- **WHEN** three invites were queued at 09:00 and a sign-in code at 09:01, and the mail line runs at 09:02
- **THEN** the sign-in code is sent before the three invites

#### Scenario: A code already used
- **WHEN** a sign-in code e-mail is queued and Napa types the code from the mailbox before the mail line runs
- **THEN** the e-mail is Skipped "Secret expired" and never sent

#### Scenario: A template switched off while waiting
- **WHEN** an order e-mail is queued, and Malee switches its template off before the mail line takes it
- **THEN** the e-mail is Skipped "Template off" and nothing is sent

### Requirement: Recipients of an e-mail
An e-mail addressed to one account SHALL go to that account's e-mail; a deleted account, or one without an e-mail, SHALL leave it without a recipient.

An e-mail addressed to an {org} SHALL go to each account of that {org} that is Active or Invited, whose {org} is Active, and whose role opens the {area} of the e-mail. Statuses and roles SHALL be read when the mail line takes the e-mail, not when it was queued. Each recipient SHALL get a message of their own (MAIL-D15).

#### Scenario: Accounts whose role opens the area
- **WHEN** an order e-mail to Acme Parts is taken, and Napa (every area) and Wit (orders) are Active while Anan (quality only) is Active too
- **THEN** Napa and Wit each get a message of their own, and Anan gets nothing

#### Scenario: An account not signed in yet
- **WHEN** an order e-mail to Acme Parts is taken while Wit is still Invited
- **THEN** Wit receives it like an Active account

#### Scenario: An organisation that is not Active
- **WHEN** an e-mail to Acme Parts is taken while Acme Parts is Suspended and Napa is Active
- **THEN** nobody receives it, and it is Skipped "No recipient"

### Requirement: Recipient allow-list
The allow-list is the setting `mail.allow_list`. Empty, it SHALL let every recipient through. Set, it SHALL hold domains written with their `@` and whole addresses, separated by commas. A recipient SHALL be on it when it equals a listed address, or its part after the `@` equals a listed domain, both compared without case. A recipient not on it SHALL receive nothing and SHALL be logged. Each run SHALL read the list again (MAIL-D06).

Saving the list empty when it held entries SHALL be refused with `VALIDATION_FAILED` unless the request carries the user's confirmation that e-mail will go to every recipient.

#### Scenario: A listed domain
- **WHEN** the allow-list is `@EXAMPLE.com` and an invite goes to `tester@example.com`
- **THEN** the invite is sent

#### Scenario: A look-alike domain
- **WHEN** the allow-list is `@example.com` and an invite goes to an address at `notexample.com`
- **THEN** the invite is Skipped "Not on the allow-list"

#### Scenario: One of two recipients listed
- **WHEN** the allow-list is `napa@example.com` and an e-mail goes to `napa@example.com` and `wit@example.org`
- **THEN** only Napa gets it, Wit is logged as not on the allow-list, and the e-mail is Sent

#### Scenario: Emptying the list
- **WHEN** the allow-list is `@example.com` and Malee saves it empty without confirming
- **THEN** the save answers `VALIDATION_FAILED` and the list stays `@example.com`

### Requirement: Sending rate
The mail line SHALL send at most {mail.max_per_hour} messages in any 60 minutes, reading the value at each run. Each recipient's message SHALL count as one. When the cap is reached, the remaining e-mails SHALL stay Queued in their order for a later run; none SHALL be dropped or skipped for the cap (MAIL-D07).

#### Scenario: A queue longer than the cap
- **WHEN** the cap is 100 and 130 messages are due at 09:00
- **THEN** 100 go out, and the other 30 go out as the messages of 09:00 leave the 60 minutes

#### Scenario: A sign-in code still goes first
- **WHEN** the cap has room for one message, and a sign-in code and an announcement are due
- **THEN** the sign-in code is sent and the announcement waits

### Requirement: What a sent e-mail holds
A sent e-mail SHALL be plain text in UTF-8, from the one system sender {mail.from_address} with the display name {mail.from_name}, both read when the e-mail is sent, to one recipient. Its subject and body SHALL be its template filled with the tags its event fills. `{{company_name}}` SHALL be `mail.company_name` read when the e-mail is sent, `{{portal_url}}` the address of the recipient's {portal}, and `{{contact_name}}` the recipient's name. Dates SHALL render as {mail.date_format} in the system time zone. No e-mail SHALL carry an attachment or a download link (MAIL-D08, MAIL-D20).

#### Scenario: One order to two accounts
- **WHEN** an order e-mail of Acme Parts goes to Napa and Wit
- **THEN** each message names its own recipient as `{{contact_name}}`, and both hold the order number

#### Scenario: Company name changed
- **WHEN** an e-mail is queued, Malee then changes the company name, and the next run sends it
- **THEN** the sent e-mail carries the new company name

### Requirement: The SMTP connection
The SMTP values SHALL come from the system settings page and SHALL be read when an attempt starts, so a saved change applies to the next attempt without a restart. The mail line SHALL send only over TLS: STARTTLS ({mail.smtp_tls} = `starttls`, the default, on {mail.smtp_port} or else port {mail.smtp_port_starttls}) or TLS from the first byte ({mail.smtp_tls} = `tls`, on {mail.smtp_port} or else port {mail.smtp_port_tls}). It SHALL fail the attempt when the server offers no STARTTLS, and SHALL never send in plain text.

When {mail.smtp_cert_sha256} is set, the server's certificate SHALL be accepted only when its SHA-256 fingerprint equals it; otherwise it SHALL pass the system's certificate checks. The mail line SHALL authenticate only when both {mail.smtp_user} and {mail.smtp_password} are set. {mail.smtp_password} SHALL be a secret of the settings pack: stored encrypted, never sent back to the browser. Host, port, user, password and fingerprint SHALL never appear in a log, an error answer, `mail_log` or the Activity Log; a change of them SHALL write an Activity Log entry with the password masked. While {mail.smtp_host} or {mail.from_address} is empty, the mail line SHALL leave e-mails Queued without counting an attempt, and the settings page and the health answer SHALL say that SMTP is not set (MAIL-D09, MAIL-D10, MAIL-D25, MAIL-D26).

#### Scenario: Pinned self-signed certificate
- **WHEN** {mail.smtp_cert_sha256} holds the fingerprint of the server's self-signed certificate
- **THEN** the connection is accepted and the e-mail is sent

#### Scenario: Another certificate
- **WHEN** the server presents a certificate with another fingerprint
- **THEN** the attempt fails with a certificate refusal in `mail_log`, and nothing is sent

#### Scenario: No STARTTLS
- **WHEN** {mail.smtp_tls} is `starttls` and the server does not offer it
- **THEN** the attempt fails, and nothing is sent in plain text

#### Scenario: Server changed on the page
- **WHEN** Malee saves a new SMTP host on the settings page while e-mails wait in the queue
- **THEN** the next attempt uses the new host without a restart, and the Activity Log holds the change

#### Scenario: SMTP not set yet
- **WHEN** the switch is on and {mail.smtp_host} is empty
- **THEN** e-mails stay Queued with no attempt counted, and the settings page says SMTP is not set

### Requirement: Test the SMTP settings
The e-mail tab of the settings page SHALL offer Send test, which sends one short message with the saved SMTP values to the address typed, by default the e-mail of the user who presses it. It SHALL open the SMTP connection within that request, outside the queue, and answer within {mail.test_timeout_seconds} seconds with Sent or the failure and the SMTP answer, holding no setting value. The address SHALL pass the allow-list. With the switch off it SHALL answer that the environment does not allow sending and open no connection. Every test SHALL write one `mail_log` row and an Activity Log entry naming the address. Only users who may manage the settings page SHALL send a test (MAIL-D30).

#### Scenario: Test after changing the server
- **WHEN** Malee saves a new password for the SMTP user and presses Send test to her own address
- **THEN** the page shows Sent within {mail.test_timeout_seconds} seconds, and Malee gets the message

#### Scenario: Wrong password
- **WHEN** the SMTP server refuses the saved user and password
- **THEN** the page shows the refusal from the server, and neither the password nor the user name appears in it

#### Scenario: Switch off
- **WHEN** `MAIL_SEND` is off and Malee presses Send test
- **THEN** the page says the environment does not allow sending, and no connection is opened

### Requirement: Retries and the send log
Each message attempt SHALL write one `mail_log` row with the e-mail, the time, the attempt number, the recipient, the subject, the body with every secret masked, the result (Sent, Failed or Skipped) and the SMTP answer or the error without any setting value. A Skipped e-mail, and a recipient left out by the allow-list, SHALL write one row with the reason. A `mail_log` row SHALL never be changed or deleted, and SHALL write no Activity Log entry.

An e-mail SHALL become Sent, with its time, when every recipient on the allow-list has been sent. After a failed message the e-mail SHALL be tried again after {mail.retry_minutes} minutes, sending only to the recipients not yet sent. After {mail.max_attempts} failed attempts it SHALL become Failed with the last error and SHALL not be tried again (MAIL-D11, MAIL-D29).

#### Scenario: Sent at the second attempt
- **WHEN** the server is unreachable at 10:00 and reachable at 10:01
- **THEN** the e-mail is sent at 10:01, and `mail_log` holds a Failed row and a Sent row

#### Scenario: One of two recipients fails
- **WHEN** an e-mail goes to Napa and Wit, Napa's message is sent at 10:00 and Wit's fails
- **THEN** at 10:01 only Wit gets it, and the e-mail is Sent when that message goes

#### Scenario: Every attempt fails
- **WHEN** the server refuses the e-mail at 10:00, 10:01 and 10:06
- **THEN** the e-mail is Failed with the last refusal, three Failed rows are in `mail_log`, and it is not tried again

### Requirement: One sender at a time
A message SHALL be sent at most once, even when two runs of the mail line overlap (MAIL-D12).

#### Scenario: Overlapping runs
- **WHEN** a run is still sending while the next run starts
- **THEN** no message is sent twice

### Requirement: Secrets in queued e-mails
A starting password, a password-link token or a sign-in code SHALL never be stored in an e-mail's values. It SHALL be kept with the queued e-mail only encrypted with `MAIL_SECRET_KEY`, and SHALL be cleared:
- when the e-mail is Sent;
- {mail.secret_hours} hours after queueing, for `account.invite` and `account.password_link`;
- for `account.sign_in_code`, as soon as the code can no longer sign in (the right code, a newer code, the sign-in ending), and in any case within {mail.code_secret_grace_minutes} minutes after the code expires.

A Skipped or Failed e-mail SHALL keep its secret until one of these clears it. `mail_log` SHALL always mask it (MAIL-D16).

#### Scenario: A code masked in the log
- **WHEN** a sign-in code e-mail with code 482913 is sent to Napa
- **THEN** Napa gets 482913, and no `mail_log` row holds 482913

#### Scenario: A newer code clears the older one
- **WHEN** Somchai presses Resend code
- **THEN** a second code e-mail is queued, and the first one's code is cleared

#### Scenario: Invite secret after a day
- **WHEN** an invite was queued {mail.secret_hours} hours ago and never sent because the switch is off
- **THEN** its starting password is cleared, and the mailbox says it has expired

### Requirement: Mail settings at start-up
With the switch on, the API SHALL refuse to start, with a message that names the setting and shows no value, when the absolute http(s) address of every {portal} or `MAIL_SECRET_KEY` is missing or unreadable. With the switch off, none of these SHALL be required. The SMTP values on the settings page SHALL never stop the start; saving them SHALL check that {mail.smtp_tls} is `starttls` or `tls`, {mail.smtp_port} is empty or 1–65535, {mail.smtp_cert_sha256} is empty or 64 hex digits with or without colons, and {mail.from_address} is one e-mail address (MAIL-D26).

Env values that seed screen settings (rate, allow-list, company name, and the SMTP values when the project moved them from env) SHALL be readable whenever they are set, switch on or off, and SHALL be used only to seed a setting that does not exist yet; afterwards only the stored setting SHALL count, and a differing env value SHALL write one start-up warning naming the env name and no value (MAIL-D25).

#### Scenario: Missing secret key
- **WHEN** the API starts with `MAIL_SEND=true` and no `MAIL_SECRET_KEY`
- **THEN** it stops with a message naming `MAIL_SECRET_KEY`

#### Scenario: Switch off needs nothing
- **WHEN** the API starts with `MAIL_SEND` unset and no SMTP value on the settings page
- **THEN** it starts

#### Scenario: Switch on before SMTP is set
- **WHEN** the API starts with `MAIL_SEND=true`, the secret key and the portal addresses set, and the SMTP host still empty on the settings page
- **THEN** it starts, e-mails stay Queued, and the settings page says SMTP is not set

#### Scenario: Env no longer wins
- **WHEN** `mail.max_per_hour` is stored as 300 and the API restarts with the env rate set to 50
- **THEN** the cap stays 300, and the start writes a warning naming the env setting and the key

## Templates

### Requirement: Registry of system templates and copies
The registry SHALL hold the system templates, each with a fixed key (such as `account.password_link`), an English and a Thai name, a subject and a body. A system template SHALL never be deleted, and its key and names SHALL never be edited. The registry SHALL also hold the copies users make: a copy has no key and records the system template it descends from (MAIL-D17).

The list SHALL show every template that is not deleted, sorted by system template with its copies after it: the names, the key or "copied from" its system template, the last edited date and Enabled or Disabled.

#### Scenario: A copy in the list
- **WHEN** the registry holds a copy of the order template named "Order — urgent"
- **THEN** it is listed after the order template as copied from it, with no key

### Requirement: System templates are seeded without overwriting
The system templates SHALL be seeded at start with the default steps and bindings, adding only what is missing. A subject, body or Enabled a user changed SHALL never be overwritten; the names of system templates SHALL be brought in line with the code at every start. Every seeded template SHALL pass the tag rules of this pack, and no default binding SHALL raise a tag warning (MAIL-D27).

#### Scenario: Restart keeps an edit
- **WHEN** Malee edits the body of the order template and the API restarts
- **THEN** the order template keeps the edited body

#### Scenario: A new system template on an old database
- **WHEN** a release adds a system template and starts on a database that has the others, one of them edited
- **THEN** the new template is added with its seeded text, and the edited one keeps its text

### Requirement: Tags and rendering
A subject or body SHALL use only the tags fixed in code. Saving one with any other double-brace text, the empty `{{}}` and names with other characters included, SHALL be refused with `VALIDATION_FAILED`, naming the tag and the field. Rendering SHALL replace each tag with its value; a tag with no value, and any other double-brace text, SHALL render as nothing, so no double brace reaches a recipient (MAIL-D18).

#### Scenario: Unknown tag refused
- **WHEN** Malee saves a template whose subject holds a tag that is not on the list
- **THEN** the save is refused on the subject, naming that tag, and nothing changes

#### Scenario: A tag without a value
- **WHEN** a body holding `{{order_no}}` is rendered for an event that does not fill it
- **THEN** the tag is left out and no double brace remains in the text

### Requirement: Required tags of the account e-mails
`account.invite` SHALL keep `{{temp_password}}` and `{{confirm_link}}`, `account.password_link` SHALL keep `{{reset_link}}`, and `account.sign_in_code` SHALL keep `{{code}}`, in its subject or body; `{{code}}` SHALL be in the body only. A save that leaves one out SHALL be refused, naming the missing tag, and the page SHALL disable Save with the same message. A copy of these templates SHALL carry no required tag, because a copy can never be bound to a fixed e-mail (MAIL-D19).

#### Scenario: Reset link removed
- **WHEN** Malee deletes `{{reset_link}}` from the body of `account.password_link`
- **THEN** Save is disabled with a message naming `{{reset_link}}`, and a direct API call is refused with `VALIDATION_FAILED`

#### Scenario: A copy without the tag
- **WHEN** Malee saves a copy of `account.password_link` without `{{reset_link}}`
- **THEN** the save succeeds

### Requirement: Edit subject and body
A holder of the edit key SHALL save a template's subject and body. The subject SHALL be required and at most {mail.subject_max} characters; the body SHALL be required. One subject and one body SHALL serve every language, and the header, footer and layout SHALL stay locked outside the body. A save SHALL write the template and an Activity Log entry with the old and new values in one transaction. A save carrying an older version SHALL answer 409 `TEMPLATE_CHANGED` and change nothing (MAIL-D20, MAIL-D28).

#### Scenario: Empty subject and body
- **WHEN** Malee clears the subject and the body of the order template
- **THEN** Save is disabled with a message under each field, and a direct API call is refused with `VALIDATION_FAILED` on both

#### Scenario: Two editors
- **WHEN** Malee and Somchai open the order template, Malee saves, then Somchai saves
- **THEN** Somchai's save answers 409 `TEMPLATE_CHANGED`, Malee's text stays, and Somchai's page keeps his text with a reload prompt

### Requirement: Preview with sample values
A holder of the preview key SHALL see the subject and body rendered with fixed sample values, with the system sender as From, a sample recipient as To, and the locked header and footer. The preview SHALL follow the text as it is typed, before it is saved, and SHALL list a tag that is not on the list as unknown instead of rendering it.

#### Scenario: Tag inserted at the cursor
- **WHEN** Malee places the cursor in the body and clicks `{{contact_name}}` in the tag palette
- **THEN** the tag is inserted at the cursor, and the preview shows the sample name in its place without saving

### Requirement: Enabled switch
A holder of the switch key SHALL switch a template on or off, except the fixed account templates, which never switch off. A disabled template SHALL never be sent, offered in a pick list or bound. Before a bound template is switched off, the page SHALL confirm and name every step and row it is bound to; switching it off SHALL leave those rows without a template in the same transaction and Activity Log entry. Switching it on again SHALL not bind it back (MAIL-D21).

#### Scenario: Disabling a bound template
- **WHEN** Malee switches off the overdue template while step 4 is bound to it
- **THEN** a confirm names step 4; Cancel keeps it Enabled; Confirm disables it and leaves step 4 without a template

### Requirement: New template by copying
A holder of the create key SHALL create a template by copying any template that is not deleted. The copy SHALL take the source's subject and body, start Enabled, have no key, record the system template it descends from (the source's own when copying a copy), and need an English and a Thai name, each at most {mail.template_name_max} characters and unique, ignoring case, among templates that are not deleted. A name clash found only when the copy is written SHALL answer the same `VALIDATION_FAILED` on the name, never a server error (MAIL-D17).

#### Scenario: Copy of a copy
- **WHEN** Malee copies "Order — urgent" as "Order — weekend"
- **THEN** the new template records the order template as the one it descends from

#### Scenario: Two copies with one name at once
- **WHEN** Malee and Somchai each create a copy named "Order — holiday" at the same moment
- **THEN** one copy is created, and the other request is refused on the English name as already used

### Requirement: Delete a copy
A holder of the delete key SHALL delete a copy after a confirm. The delete SHALL be soft: the copy leaves the list and the pick lists, and an e-mail already queued with it still shows its name. A copy bound to any row SHALL not be deleted; the API SHALL answer 409 `TEMPLATE_IN_USE` with the bound rows. A system template SHALL offer no Delete; a call SHALL answer 409 `TEMPLATE_IS_SYSTEM` (MAIL-D17).

#### Scenario: Bound copy
- **WHEN** Malee deletes "Order — urgent" while a row binds it
- **THEN** the dialog names that row and the copy stays

## Binding events to templates

### Requirement: Steps and rows
The binding screen SHALL show every step with its "when it fires" text in English and Thai and one On / Off switch, and every row of the step with a pick of its template. Each pick SHALL offer every Enabled template that is not deleted, system templates and copies alike; one template MAY be bound to several rows. Under each pick the page SHALL show the default template, or that it changed from the default. Before Save, the page SHALL list each row whose template uses a tag the row's event cannot fill; the user MAY still confirm (MAIL-D18, MAIL-D22).

#### Scenario: Disabled templates are not offered
- **WHEN** Malee opens the pick list of a row
- **THEN** it lists every Enabled template and no Disabled one

#### Scenario: A tag the event cannot fill
- **WHEN** Malee binds the order template, which uses `{{order_no}}`, to an event that does not fill it
- **THEN** the page warns before Save that `{{order_no}}` has no value for that event

### Requirement: Save the binding
A holder of the edit key SHALL save every step switch and every row in one transaction, with an Activity Log entry holding the old and new values, after a confirm that lists every step and row with its template and marks each Off step as sending nothing. An On step with a row without a template, or a row bound to a template that is Disabled or deleted, SHALL not be saved: Save SHALL be disabled with a message naming the step and row, and the API SHALL refuse it with `VALIDATION_FAILED`. An Off step MAY keep rows without a template. A save made from a stale page SHALL answer 409 `MAIL_CONFIG_CHANGED` and change nothing. Saving the binding, resetting to defaults, switching a template off and deleting a copy SHALL run one at a time (MAIL-D22, MAIL-D28).

When a template is switched off, its rows SHALL be left without a template, and while their step is On each SHALL show that no e-mail is sent for it.

#### Scenario: On step without a template
- **WHEN** Malee clears the template of step 3 while it is On
- **THEN** Save is disabled with a message naming step 3

#### Scenario: Two saves at the same moment
- **WHEN** step 3 is Off, and from the same version Malee switches it On while Somchai clears its row, both at once
- **THEN** one save succeeds and the other answers 409 `MAIL_CONFIG_CHANGED`; step 3 is never On without a template

### Requirement: Reset to defaults
A holder of the reset key SHALL restore the default switches and bindings after a confirm that lists each change as "step · row: current → default", or says that everything is already on its default, and warns that unsaved changes on the page will be lost. A default template that is Disabled SHALL leave its row without a template, and the result SHALL name that row. The reset SHALL write its Activity Log entry in the same transaction (MAIL-D22).

#### Scenario: Default template disabled
- **WHEN** the default template of step 3 is Disabled and Malee resets
- **THEN** step 3 is left without a template, and the result names step 3

### Requirement: Queued e-mails follow the step and the binding
When an event with a row is raised, its step switch and row SHALL decide at queue time: an Off step SHALL queue nothing, so no `mail_log` row exists either; an On step SHALL queue the e-mail with the template bound to its row; a row without a template SHALL queue the e-mail without one. A queued e-mail SHALL keep its template when the binding changes later. A fixed e-mail SHALL always be queued with its system template (MAIL-D23).

#### Scenario: Step off
- **WHEN** step 1 is Off and Somchai approves an order
- **THEN** the approval succeeds and no e-mail is queued, and switching step 1 On later does not send it

#### Scenario: Binding changed after queueing
- **WHEN** an order e-mail is queued with the order template, and Malee then binds a copy to the row
- **THEN** the queued e-mail is still sent with the order template

## Access and testing

### Requirement: Access to the mail screens
Each action of the template and binding screens (view, edit, preview, switch, create, delete, reset) SHALL have its own permission key, and every endpoint SHALL check its own key; a caller without it SHALL get 403 `ACCESS_DENIED` and an Activity Log entry. Buttons SHALL follow the caller's keys; without the edit key the screens SHALL be read-only, and a status SHALL show where a switch cannot be used. Leaving a screen with unsaved changes SHALL ask to confirm.

#### Scenario: View only
- **WHEN** Somchai, who holds only the view key, opens a template
- **THEN** the page shows no Save, Discard, New template or Delete, and shows Enabled as a status with no switch

### Requirement: Prototype mailbox
While prototype mode is on, each {portal} SHALL offer a mailbox page, open without a session and linked from the prototype banner, listing the e-mails queued to accounts of that {portal}, newest first. Each SHALL show the time it was queued, the recipient, the template, the rendered subject and body and its state (Queued, Sent, Skipped or Failed). While its secret is held, the body SHALL show the starting password, the password link or the sign-in code; once cleared, the body SHALL say in its place that it has expired. When prototype mode is off, the page SHALL say so and the API SHALL not offer the mailbox (MAIL-D24).

#### Scenario: Starting password of a new account
- **WHEN** Malee creates Anan's account and a tester opens the mailbox without signing in
- **THEN** the newest entry is the invite to Anan with his starting password in the body

#### Scenario: Each portal shows its own accounts
- **WHEN** Somchai asks for a link on one {portal} and Napa on another
- **THEN** each {portal}'s mailbox shows only its own account's e-mail

#### Scenario: A used code shows as expired
- **WHEN** Napa has signed in with the code of her sign-in code e-mail
- **THEN** the mailbox still lists it, and its body says the code has expired

#### Scenario: Production
- **WHEN** prototype mode is off and someone opens the mailbox address
- **THEN** the page says the mailbox is not available, and the API answers nothing for it
