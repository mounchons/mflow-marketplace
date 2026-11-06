# permission data dictionary

Catalog tables are reference data, changed only by migrations. Group, grant and scope rows follow the audit pack: who and when columns, soft delete, and an `activity_log` row in the same transaction. Every who column (`created_by`, `updated_by`, `deleted_by`) references `actor.id`, and the log's `actor_id` names who acted, `SYSTEM` included. Account tables belong to the auth pack and are keyed by their `actor` row's `id`; this pack adds one column to each.

## screen

| Column | Type | Rule |
|---|---|---|
| screen_id | text | primary key, the screen code (`ORDERS`) |
| name_en | text | required |
| name_th | text | required |
| sort_order | int | menu and grid order |

## screen_grant

| Column | Type | Rule |
|---|---|---|
| screen_id | text | primary key with grant_key; references screen |
| grant_key | text | `View`, `Manage` or a split checkbox (`Publish`, `Delete`, `Approve`) |
| label_en | text | required |
| label_th | text | required |
| sort_order | int | column order in the grid |

Every screen has a `View` row.

## screen_action

| Column | Type | Rule |
|---|---|---|
| screen_id | text | primary key with action; references screen |
| action | text | the action part of `<SCREEN>.<Action>` |
| grant_key | text | references screen_grant (screen_id, grant_key); one checkbox per action |
| label_en | text | the button name the grid lists under its checkbox |
| label_th | text | required |

## access_group

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key |
| name | text | required, at most `permission.group_name_max`; unique ignoring case among rows not deleted |
| is_seed | bool | created by the first-start seed; used once to give seed groups All scope |
| version | int | concurrency token |
| created_at, created_by, updated_at, updated_by | per audit pack | set automatically |
| is_deleted, deleted_at, deleted_by | per audit pack | soft delete |

## group_permission

| Column | Type | Rule |
|---|---|---|
| group_id | uuid | primary key with screen_id and grant_key; references access_group |
| screen_id | text | with grant_key references screen_grant |
| grant_key | text | |
| is_deleted, deleted_at, deleted_by | per audit pack | an unticked grant is soft-deleted and restored on re-tick; the key has no not-deleted filter |

## group_scope

| Column | Type | Rule |
|---|---|---|
| group_id | uuid | primary key with menu; references access_group |
| menu | text | a scoped menu code |
| mode | text | `All` or `List`; no row means nothing in scope |
| is_deleted, deleted_at, deleted_by | per audit pack | soft delete |

## group_scope_item

| Column | Type | Rule |
|---|---|---|
| group_id | uuid | primary key with menu and scope_code; references group_scope |
| menu | text | |
| scope_code | text | references the `{scope}` table; only when mode is `List`; a List holds at least one |

## org_menu

| Column | Type | Rule |
|---|---|---|
| menu_code | text | primary key, a menu of the `{org_portal}` |
| name_en | text | required |
| name_th | text | required |
| sort_order | int | menu order |
| is_account_management | bool | true for the one menu only the locked role opens |

## org_role

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key |
| name_en | text | required, at most `permission.role_name_max`; unique ignoring case among rows not deleted |
| name_th | text | required, at most `permission.role_name_max` |
| is_locked | bool | true for the `{org_admin}` role only |
| sort_order | int | new roles go last |
| version | int | concurrency token; a stale save answers `ROLE_CHANGED` |
| is_deleted, deleted_at, deleted_by | per audit pack | soft delete; a role in use cannot be deleted |

## org_role_menu

| Column | Type | Rule |
|---|---|---|
| role_id | uuid | primary key with menu_code; references org_role |
| menu_code | text | references org_menu |
| is_deleted, deleted_at, deleted_by | per audit pack | an unticked menu is soft-deleted and restored on re-tick |

## account columns added by this pack

| Column | Type | Rule |
|---|---|---|
| group_id | uuid | on the `{staff_portal}` account table; required; references access_group (one group per account) |
| role_id | uuid | on the `{org_portal}` account table; required; references org_role |
