# permission data dictionary

Catalog tables are reference data, changed only by migrations. Role, grant and scope rows follow the audit pack: who and when columns, soft delete, and an `activity_log` row in the same transaction. Every who column (`created_by`, `updated_by`, `deleted_by`) references `actor.id`, and the log's `actor_id` names who acted, `SYSTEM` included. Account tables belong to the auth pack and are keyed by their `actor` row's `id`; this pack adds one column to each.

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
| grant_key | text | a standard kind `View`, `Manage`, `Approve`, `Import`, `Export`, or a checkbox split out later (`Delete`, `Publish`) |
| label_en | text | required |
| label_th | text | required |
| sort_order | int | column order in the grid |

Every screen has a `View` row, and a row for each other standard kind only when the screen has an action of that kind (PERM-D04): `Approve` covers both approve and reject, `Import` the file import of the screen, `Export` the download of its list or report as a file. The grid shows one column per kind in the order View, Manage, Approve, Import, Export, then the split kinds, and a dash where a screen has no row.

## screen_action

| Column | Type | Rule |
|---|---|---|
| screen_id | text | primary key with action; references screen |
| action | text | the action part of `<SCREEN>.<Action>` |
| grant_key | text | references screen_grant (screen_id, grant_key); one checkbox per action |
| label_en | text | the button name the grid lists under its checkbox |
| label_th | text | required |

## access_role

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key |
| name | text | required, at most `permission.role_name_max`; unique ignoring case among rows not deleted |
| is_seed | bool | created by the first-start seed; used once to give seed roles All scope |
| version | int | concurrency token |
| created_at, created_by, updated_at, updated_by | per audit pack | set automatically |
| is_deleted, deleted_at, deleted_by | per audit pack | soft delete |

## role_permission

| Column | Type | Rule |
|---|---|---|
| role_id | uuid | primary key with screen_id and grant_key; references access_role |
| screen_id | text | with grant_key references screen_grant |
| grant_key | text | |
| is_deleted, deleted_at, deleted_by | per audit pack | an unticked grant is soft-deleted and restored on re-tick; the key has no not-deleted filter |

## role_scope

| Column | Type | Rule |
|---|---|---|
| role_id | uuid | primary key with menu; references access_role |
| menu | text | a scoped menu code |
| mode | text | `All` or `List`; no row means nothing in scope |
| is_deleted, deleted_at, deleted_by | per audit pack | soft delete |

## role_scope_item

| Column | Type | Rule |
|---|---|---|
| role_id | uuid | primary key with menu and scope_code; references role_scope |
| menu | text | |
| scope_code | text | references the `{scope}` table; only when mode is `List`; a List holds at least one |

## org_menu

| Column | Type | Rule |
|---|---|---|
| menu_code | text | primary key, a menu of the `{org_portal}` |
| name_en | text | required |
| name_th | text | required |
| sort_order | int | menu order |
| is_account_management | bool | true for the one menu only the locked org role opens |

## org_role

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key |
| name_en | text | required, at most `permission.org_role_name_max`; unique ignoring case among rows not deleted |
| name_th | text | required, at most `permission.org_role_name_max` |
| is_locked | bool | true for the `{org_admin}` org role only |
| sort_order | int | new org roles go last |
| version | int | concurrency token; a stale save answers `ORG_ROLE_CHANGED` |
| is_deleted, deleted_at, deleted_by | per audit pack | soft delete; an org role in use cannot be deleted |

## org_role_menu

| Column | Type | Rule |
|---|---|---|
| org_role_id | uuid | primary key with menu_code; references org_role |
| menu_code | text | references org_menu |
| is_deleted, deleted_at, deleted_by | per audit pack | an unticked menu is soft-deleted and restored on re-tick |

## account columns added by this pack

| Column | Type | Rule |
|---|---|---|
| role_id | uuid | on the `{staff_portal}` account table; required; references access_role (one role per account) |
| org_role_id | uuid | on the `{org_portal}` account table; required; references org_role |
