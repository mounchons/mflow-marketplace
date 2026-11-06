# Data dictionary of the audit pack

## actor

The registry every actor column references (AUDIT-D03). One row per account of any portal, plus one System row. Rows are never updated or deleted.

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key; an account table's `id` equals its actor row's `id` |
| kind | text | one of `{account_kinds}` or `System`; exactly one `System` row, enforced by a partial unique index |
| created_at | timestamptz | set on insert, UTC |

## Columns of every business table

Who-and-when and soft-delete columns (AUDIT-D01, AUDIT-D05). Tables that are never edited after insert skip the `updated_*` pair; transient tables skip the soft-delete group.

| Column | Type | Rule |
|---|---|---|
| created_at | timestamptz | set by the save on insert, UTC; code cannot set it |
| created_by | uuid | FK `actor.id`, not null; the current actor |
| updated_at | timestamptz | set by the save on every update, UTC |
| updated_by | uuid | FK `actor.id`; the current actor |
| is_deleted | bool | not null, default false |
| deleted_at | timestamptz | set with `is_deleted`; a CHECK keeps the two in agreement |
| deleted_by | uuid | FK `actor.id`; set with `is_deleted` |
| deleted_reason | text | at most `audit.deleted_reason_max` characters, optional |
| row_version | bigint | concurrency token on tables several people edit (AUDIT-D10); the stack may use its own (for example PostgreSQL `xmin`) |

## activity_log

One row per changed business row; the rows of one save form one entry (AUDIT-D04, AUDIT-D18). Append-only: the application's database role has no UPDATE or DELETE on it (AUDIT-D14).

| Column | Type | Rule |
|---|---|---|
| id | bigint | serial primary key (AUDIT-D08 exception) |
| at | timestamptz | time of the save, UTC; same for every row of one save |
| actor_id | uuid | FK `actor.id`, not null |
| actor_role | text | the role at the time: the group name, the account kind or `System` (AUDIT-D19) |
| action | text | the name the Service gave, else `Create`, `Edit` or `Delete` (AUDIT-D11) |
| document_type | text | one of `{document_types}` |
| document_id | text | the id of the document the action was on |
| table_name | text | the table of the changed row |
| row_id | text | the key of the changed row |
| detail | jsonb | changed fields with old and new values; a secret field as changed with no value (AUDIT-D12); the note, file or related record the Service wrote |
| save_id | uuid | the same for every row one save wrote; entries are grouped by it |

Indexes: `(at desc)`, `(actor_id, at desc)`, `(document_type, document_id)`, `(save_id)`.
