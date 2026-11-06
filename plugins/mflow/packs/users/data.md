# users data

The staff account and the organisation account tables, their sign-in columns (e-mail, status, password hash and times, terms acceptance, last sign-in), sessions and password tokens belong to the pack auth. Groups and their keys, the org roles and their menus (`org_role`, `org_role_menu`), and the `group_id` and `role_id` columns of the account tables belong to the pack permission; the outbox, templates and encrypted secrets of queued e-mails belong to the pack mail. This pack adds the columns and tables below. Every account row shares its `id` with its `actor` row of the pack audit, so every who-and-when column and `activity_log.actor_id` point at `actor.id` whichever portal the account belongs to. Every table also carries the who-and-when and soft-delete columns of the pack audit.

## staff account (columns this pack adds)

| Column | Type | Rule |
|---|---|---|
| username | text | required; unique ignoring letter case among rows not deleted; short name, never a sign-in name |
| full_name | text | required; at most `users.name_max_length` characters |
| version | int | raised on every save; a save with an older version is refused |

## org (columns this pack adds)

The {org} table itself comes from the project's master data.

| Column | Type | Rule |
|---|---|---|
| primary_account_id | uuid | optional; an org account of the same org, not deleted |
| status | text | Active, Inactive or Suspended; an org that is not Active gets no invite |
| version | int | raised on every save of the org or its primary account |

## org account (columns this pack adds)

| Column | Type | Rule |
|---|---|---|
| org_id | uuid | required; the org the account belongs to, never changed; the org table's own key type when that table is keyed by a code |
| contact_name | text | required; at most `users.name_max_length` characters |
| phone | text | optional; at most `users.phone_max_length` characters |
| from_import | bool | true when an import created it; at most one per org among rows not deleted |
| version | int | raised on every save, from either portal |

The sign-in e-mail of an org account is unique ignoring letter case among org accounts that are not deleted, across every org. At most `users.org_account_limit` rows not deleted per org, counted with the org row locked.

## password token (purpose this pack adds)

| Column | Type | Rule |
|---|---|---|
| purpose | text | `Invite` added beside the purposes of the pack auth; the token holds only the hash of the starting password, expires after `users.invite_hours` hours, and a new invite revokes the account's earlier unused ones |
