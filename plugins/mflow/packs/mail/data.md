# mail data dictionary

Every table also carries the who-and-when columns of the audit pack (`created_at`, `created_by`, `updated_at`, `updated_by`, each `*_by` pointing at `actor.id`), and its changes write `activity_log` entries as the audit pack says. Exceptions: `mail_outbox` is a work queue (rows never deleted; its own changes write no `activity_log` entry, the change that queued it is logged once); `mail_log` is append-only with `created_at` only and writes no `activity_log` entry. `account_id` below is the recipient's account (auth pack), not an actor.

## email_template

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key |
| key | text | system templates only, unique where set, fixed by the seed (`account.password_link`); null on copies |
| name_en | text | required, at most `mail.template_name_max`; unique ignoring case among rows not deleted; fixed on system templates |
| name_th | text | as `name_en` |
| subject | text | required, at most `mail.subject_max`; only tags fixed in code |
| body | text | required; one body for every language; header and footer stay outside it |
| enabled | bool | the fixed account templates are always true |
| is_system | bool | true on seeded rows; a system row is never deleted |
| copied_from_id | uuid | copies only; references the system template it descends from, also for a copy of a copy |
| is_deleted | bool | soft delete, copies only |
| version | int | raised on every save; a stale save answers 409 |

## mail_step

| Column | Type | Rule |
|---|---|---|
| step_no | int | primary key; the steps are seeded, never added or removed by users |
| fires_when_en | text | required, seeded text |
| fires_when_th | text | required, seeded text |
| enabled | bool | the step's one switch, covering every row of the step |

## mail_step_template

| Column | Type | Rule |
|---|---|---|
| step_no | int | primary key with `target`; references `mail_step` |
| target | text | the row inside the step (`any` when the step has one row) |
| template_id | uuid | references `email_template`; only Enabled, non-deleted templates; required while the step is On; null after its template is switched off |
| version | int | shared version of the binding; a stale save answers 409 `MAIL_CONFIG_CHANGED` |

## mail_outbox

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key |
| event | text | the event key fixed in code |
| template_id | uuid | references `email_template`; set at queue time, kept when the binding changes; null when the row had no template |
| account_id | uuid | the one recipient account, for e-mails to one account |
| audience | text | the {org} or group the e-mail goes to, for e-mails to several accounts |
| model | jsonb | the event's tag values fixed at queue time; never a secret |
| secret | text | the starting password, link token or code, encrypted with `MAIL_SECRET_KEY`; cleared as MAIL-D16 says |
| status | text | Queued, Sent, Skipped or Failed |
| reason | text | the Skipped reason or the last error, without any setting value |
| attempts | int | 0 to `mail.max_attempts` |
| next_try_at | timestamptz | when a failed e-mail is tried again |
| sent_at | timestamptz | set exactly while Sent |
| created_at | timestamptz | queue time; orders the queue and is compared with the send marker |
| updated_at | timestamptz | stamped on every change |

## mail_log

| Column | Type | Rule |
|---|---|---|
| id | bigint | primary key |
| outbox_id | uuid | references `mail_outbox` |
| attempt | int | the attempt number |
| recipient | text | the address of this message |
| subject | text | as sent |
| body_masked | text | as sent, with every secret masked |
| result | text | Sent, Failed or Skipped |
| answer | text | the SMTP answer, the error or the Skipped reason, without any setting value |
| created_at | timestamptz | append-only: no update, no delete |

## Settings keys

The settings below live in the system settings table of the settings pack under their `params.md` keys, as do the `mail.smtp_*` and `mail.from_*` keys; `mail.send_since` is written by the API only and never shown on the page.

| Column | Type | Rule |
|---|---|---|
| mail.max_per_hour | int | set on the settings screen |
| mail.allow_list | text | set on the settings screen; emptying a set list needs confirmation |
| mail.company_name | text | set on the settings screen |
| mail.send_since | timestamptz | the send marker; stored when the API starts with the switch on and none is stored, cleared when it starts with the switch off |
