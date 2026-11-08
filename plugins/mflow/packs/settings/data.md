# Data dictionary of the settings pack

## system_setting

One row per catalog key, and per `{portal}` for a per-portal key (SET-D04, SET-D20). Values only: names, ranges and texts live in the catalog in code. Rows are never deleted, so the soft-delete group of the audit pack is not used; a key that left the catalog keeps its row unread. Every change writes an Activity Log entry (SET-D17).

| Column | Type | Rule |
|---|---|---|
| key | text | the catalog key as its pack's params.md writes it, such as `mail.max_per_hour`, or a project key; primary key with `portal` (natural key, AUDIT-D08) |
| portal | text | the `{portal}` of a per-portal key; empty text for a whole-system key |
| value | jsonb | the value in the form of its kind: number, true/false, text, array of text; null for a secret |
| secret_cipher | text | a secret encrypted with the settings secret key; null when not set or not a secret (SET-D08). Never read by a list or a log |
| version | bigint | concurrency token, new on every save (AUDIT-D10); the stack may use its own, such as PostgreSQL `xmin` |
| created_at | timestamptz | set by the save, UTC (AUDIT-D01) |
| created_by | uuid | FK `actor.id`; System for a row the start writes (AUDIT-D02) |
| updated_at | timestamptz | set by the save, UTC |
| updated_by | uuid | FK `actor.id` |

## Catalog entry (in code, not stored)

What the catalog holds for each key and the read answers (SET-D01, SET-D06). It changes only with the code.

| Column | Type | Rule |
|---|---|---|
| key | text | as in `system_setting` |
| tab | text | the tab's code, also the Activity Log document id; its name in English and Thai |
| kind | text | `int`, `bool`, `text`, `list`, `choice`, `choices` or `secret` (SET-D05) |
| unit | text | shown beside the value, in English and Thai; empty when none |
| min, max | int | the range of a whole number, the length of a text, the items of a list |
| list_max_chars | int | the whole length of a list |
| choices | jsonb | the set of a `choice` or `choices` key, with `min_choices` |
| default | jsonb | the project's default: the customer's value, else the owning pack's (SET-D18); never for a secret |
| per_portal | bool | one value per `{portal}` (SET-D20) |
| bound | jsonb | not below, not above or never off, with its value (SET-D14) |
| confirm_when | text | `empty`, `off` or `on` (SET-D15) |
| seed_env | text | the env that seeds the key once (SET-D07); empty when none |
| override_env | text | the emergency env its owning pack names (SET-D22); empty when none |
| names, texts | jsonb | name, what it is and does, and what a change does, each in English and Thai |
