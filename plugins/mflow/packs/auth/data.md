# auth: data dictionary

Every account table reuses the `id` of its row in the audit pack's `actor` registry as its key, so every who/when column and `activity_log.actor_id` point at `actor.id`. Account tables also carry the who/when and soft-delete columns of the audit pack, not repeated here. With one portal there is one account table; with several, AUTH-D02 decides between one table per portal (shown here as `<portal>_account`) and one table with a `portal` column. The users pack adds the management columns (group, phone, invited by …), and the permission pack the rights a session fixes at sign-in. Secrets are stored only as hashes; `portal` holds the portal's code.

## <portal>_account

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key; equals `actor.id` of the account's actor row (kind = the portal) |
| email | text | sign-in name; unique among rows not deleted, compared lower-cased and trimmed (AUTH-D01, AUTH-D03) |
| display_name | text | shown in menus, lists and the Activity Log; never signs in |
| status | text | Active, Invited, Inactive or Disabled (AUTH-D05) |
| organisation_id | uuid | the account's organisation, only when AUTH-D04 holds |
| password_hash | text | salted slow hash such as Argon2id; null until the account sets a password |
| password_changed_at | timestamptz | when the current password was set |
| password_expires_at | timestamptz | `password_changed_at` plus `auth.password_expiry_days`; worked out again when the setting changes |
| terms_accepted_at | timestamptz | null until accepted at the first sign-in |
| terms_version | text | version of the accepted terms text |
| last_login_at | timestamptz | set when a session opens |

## user_session

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key |
| portal | text | the portal the session belongs to |
| account_id | uuid | references `actor.id` |
| token_hash | text | hash of the session cookie's value; unique |
| csrf_token_hash | text | hash of the CSRF token given at sign-in |
| created_at | timestamptz | sign-in time; the session ends `auth.session_max_minutes` after it |
| expires_at | timestamptz | pushed to request time plus `auth.session_idle_minutes` on every request |
| ended_at | timestamptz | set by sign out or an account change; an ended session never works again |

## login_attempt

| Column | Type | Rule |
|---|---|---|
| id | bigint | primary key |
| portal | text | attempts are counted per portal |
| email_typed | text | the e-mail as typed, lower-cased and trimmed, also when no account has it |
| account_id | uuid | the matching account, null for an unknown name |
| kind | text | Password or Code |
| succeeded | bool | true for a sign-in that opened a session |
| at | timestamptz | attempt time; purged after `auth.purge_attempt_days` (AUTH-D22) |

## password_history

| Column | Type | Rule |
|---|---|---|
| account_id | uuid | references `actor.id` |
| password_hash | text | a hash the account used; the newest `auth.password_history` are compared |
| set_at | timestamptz | when that password was set |

## password_token

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key |
| account_id | uuid | references `actor.id` |
| portal | text | the link works only on this portal |
| kind | text | Link or StartingPassword (AUTH-D17, AUTH-D18) |
| token_hash | text | hash of the link token or of the starting password |
| created_at | timestamptz | made at |
| expires_at | timestamptz | `auth.link_hours` or `auth.starting_password_hours` after `created_at` |
| used_at | timestamptz | set once; a used token never works again |
| revoked_at | timestamptz | set when a newer link or invite replaces it |

## login_challenge

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key; the pending sign-in of the code step |
| portal | text | the portal signed in on |
| account_id | uuid | references `actor.id` |
| cookie_hash | text | hash of the pending cookie's value |
| created_at | timestamptz | when the password passed |
| expires_at | timestamptz | `auth.otp_pending_minutes` after `created_at` |
| wrong_codes | int | wrong codes of this pending sign-in |
| ended_at | timestamptz | set at the right code, the last wrong code, the lock, a newer pending sign-in, an account change or the switch off |

## login_code

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key |
| challenge_id | uuid | references `login_challenge.id` |
| account_id | uuid | references `actor.id`; codes per hour are counted per account and portal |
| portal | text | the portal |
| code_hash | text | keyed hash of the code; the code itself is never stored |
| created_at | timestamptz | made at; Resend waits `auth.otp_resend_seconds` after the newest |
| expires_at | timestamptz | `auth.otp_code_minutes` after `created_at` |
| voided_at | timestamptz | set when a newer code of the same challenge is made |

## remembered_browser

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key |
| portal | text | the portal |
| account_id | uuid | references `actor.id`; one account per browser and portal |
| cookie_hash | text | hash of the remember cookie's value |
| created_at | timestamptz | the right code's time |
| ends_at | timestamptz | `auth.otp_remember_hours` after `created_at`; never extended |
