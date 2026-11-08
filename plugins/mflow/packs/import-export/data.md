# import-export data

Three transient tables: the import batch, its rows, and the export files. All are technical tables hard-deleted by age, with no Activity Log entry per row and no soft delete (AUDIT-D07). File content is never in the database; each row names its object in the storage of the upload pack by `storage_key` (UPL-D06). Business records are written only by a commit, with the who-and-when columns of the pack audit.

## import_batch

One uploaded file and its check (IMPEX-D06). Belongs to the account that uploaded it. Purged by age with its rows and its file (IMPEX-D18).

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key, uuid v7; the batch id of the API |
| target | text | the `{import_target}`, one of the project's definitions |
| file_name | text | the cleaned name (UPL-D05), shown and used for the report name |
| storage_key | text | unique; made by the system, never from the file name |
| size_bytes | bigint | greater than 0, at most `import-export.import_max_file_mb` MB |
| sha256 | text | 64 lower-case hex characters; goes to the Activity Log entry |
| sheet_name | text | the data sheet found by its headers; empty until read |
| stage | text | CHECK in `Checking`, `Checked`, `Committing`, `Committed`, `Cancelled`, `Failed` |
| rows_total | int | data rows read; 0 until known |
| rows_done | int | rows checked or written so far, for progress |
| rows_good, rows_bad | int | counts after the check |
| to_create, to_update | int | counts after the check; compared again at commit (IMPEX-D14) |
| failure_message | text | what the user may read; no stack trace or path |
| created_by, created_at | uuid, timestamptz | the uploader and the time, UTC |
| updated_at | timestamptz | last change; the age of an open batch counts from it |
| committed_at, cancelled_at | timestamptz | empty until then |

Indexes: unique `(target)` where `stage` in `Checking`, `Committing` (IMPEX-D16); `(created_by)`; `(stage, updated_at)` for the purge.

## import_row

One data row of the file with its values as read and its errors (IMPEX-D06). Holds personal data for as long as the batch lives.

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key, uuid v7 |
| batch_id | uuid | FK `import_batch.id`, deleted with the batch |
| row_no | int | the Excel row number, header being 1 |
| match_value | text | the `{match_key}` as read, trimmed and with its case folded for matching (IMPEX-D09) |
| cell_values | jsonb | the cleaned value of each definition column |
| errors | jsonb | list of column and reason; empty when the row is good |
| action | text | CHECK in `Create`, `Update`, `Reject`; set by the check |
| record_id | uuid | the matched record when `Update`; empty otherwise |

Indexes: unique `(batch_id, row_no)`; `(batch_id)` where `errors` is not empty, for the bad-row page and the report.

## export_file

One file made by an export (IMPEX-D21). Deleted by age with its object; the Activity Log entry, when one is written, stays.

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key, uuid v7 |
| list | text | the `{list}`, one of the project's definitions |
| filter | jsonb | the filters and sort used, for the Activity Log entry |
| status | text | CHECK in `Queued`, `Running`, `Ready`, `Failed` |
| row_count | int | counted before the file is made; at most `import-export.export_max_rows` |
| file_name | text | IMPEX-D24 |
| storage_key | text | unique; empty until the file exists |
| size_bytes | bigint | empty until the file exists |
| failure_message | text | what the user may read |
| created_by, created_at | uuid, timestamptz | the requester and the time, UTC |
| ready_at | timestamptz | when the file became ready |
| expires_at | timestamptz | `ready_at` plus `import-export.export_link_hours` hours; the purge deletes rows past it |

Indexes: `(created_by, created_at)`; `(expires_at)`; unique `(created_by, list)` where `status` in `Queued`, `Running`, so a double press starts one job.
