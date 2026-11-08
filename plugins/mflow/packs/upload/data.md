# upload data

Three kinds of table: the staging table (transient, hard-deleted by age, AUDIT-D07), the file registry (one row per attached file, never deleted), and one link table per `{record}` type. File content is never in the database; each row names its object in the storage by `storage_key` (UPL-D06). The who-and-when and soft-delete columns are those of the pack audit.

## upload_staging

A file uploaded but not yet attached (UPL-D08). Transient: rows are deleted when attached, discarded or older than `upload.staging_hours` (UPL-D09); no Activity Log entry, no soft delete, no `updated_*`.

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key, uuid v7; the staging id the upload answers |
| storage_key | text | unique; made by the system from a random id, never from the file name (UPL-D05); kept when the file is attached |
| original_name | text | the cleaned name, at most `upload.name_max` characters |
| extension | text | lower case, one of `upload.extensions` at upload time |
| content_type | text | the detected type, not the browser's |
| size_bytes | bigint | greater than 0, at most `upload.max_file_mb` MB |
| sha256 | text | 64 lower-case hex characters (UPL-D14) |
| uploaded_by | uuid | FK `actor.id`; only this actor may attach, read or discard it |
| created_at | timestamptz | set on insert, UTC |
| expires_at | timestamptz | `created_at` plus `upload.staging_hours` hours; the purge deletes rows past it |

Indexes: `(expires_at)`, `(uploaded_by)`.

## stored_file

The registry of attached files (UPL-D07). One row per file, created by the save that attaches it, never updated except `purged_at`, never deleted. It has no scope column, so it is read only through a link table.

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key, uuid v7; the file id of the download route |
| storage_key | text | unique; the same key the staging row had |
| original_name | text | the cleaned name, shown and used as the download name |
| extension | text | lower case |
| content_type | text | the detected type; sent as Content-Type on download |
| size_bytes | bigint | greater than 0 |
| sha256 | text | 64 lower-case hex characters |
| uploaded_by | uuid | FK `actor.id`; who uploaded it |
| uploaded_at | timestamptz | when it reached staging, UTC |
| scanned_at | timestamptz | when the malware scan passed; empty where the project does not scan (UPL-D15) |
| purged_at | timestamptz | set when the content of a removed file is deleted (UPL-D13); empty while the content exists |
| created_at | timestamptz | set by the attaching save, UTC |
| created_by | uuid | FK `actor.id`; who saved the record that attached it |

Indexes: `(sha256)`, `(purged_at)`.

## {record}_file

One link table per `{record}` type, for example `order_file` (UPL-D07, UPL-D12). Removing a file soft-deletes its link row (AUDIT-D05); the record's rules decide who may do it.

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key, uuid v7; the file id the record's screens and routes use |
| record_id | uuid | FK to the `{record}` table, not null |
| stored_file_id | uuid | FK `stored_file.id`, not null |
| sort_order | int | order in the record's file list, from 1 |
| created_at, created_by | timestamptz, uuid | who attached it and when (audit) |
| is_deleted, deleted_at, deleted_by, deleted_reason | bool, timestamptz, uuid, text | the soft-delete columns of the pack audit; set by a remove |

Indexes: unique `(record_id, stored_file_id)` where `is_deleted` is false; `(record_id)` where `is_deleted` is false, used to count and size the record's live files (UPL-D03).
