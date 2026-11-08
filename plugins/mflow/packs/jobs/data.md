# jobs data

Two tables: `job_definition`, one row per job of the catalog, and `job_run`, one row per run. `job_run` is both the record of what ran and the queue of one-off jobs (JOB-D02). It is a record in itself, so it writes no Activity Log row (AUDIT-D13), and it is added to the project's transient tables (AUDIT-D07). The who-and-when columns are those of the pack audit.

## job_definition

One row per catalog job, written by the start-up step (JOB-D19) and by the schedule screen (JOB-D03, JOB-D17). A catalog table with a natural key (AUDIT-D08). Saves by the job itself (`last_checked_at`, `next_run_at`, the failure count) write no Activity Log entry (AUDIT-D13).

| Column | Type | Rule |
|---|---|---|
| code | text | primary key, the job's code in the catalog, lower-case letters and `_` |
| kind | text | `Recurring` or `OneOff` |
| schedule | text | five-field cron in `{system_time_zone}`; empty for a one-off job and for a queue line whose period its owning pack sets in seconds |
| schedule_editable | bool | false for a job whose schedule its owning pack sets |
| enabled | bool | the switch of JOB-D17; true by default |
| next_run_at | timestamptz | next start of a recurring job that is on, UTC; empty when off, one-off or a queue line |
| last_checked_at | timestamptz | when the timer last looked at this job, also when the run had nothing to do (JOB-D10) |
| consecutive_failures | int | from 0; raised by a run that ends Failed or Interrupted by a dead process, set to 0 by a Succeeded run (JOB-D14) |
| alerted_at | timestamptz | when the alert of the current failures was queued; emptied by a Succeeded run |
| retired_at | timestamptz | set when the job left the catalog; such a job is hidden and never runs (JOB-D19) |
| version | int | raised by every save from the screen; a stale save answers 409 (AUDIT-D10) |
| created_at, created_by | timestamptz, uuid | System for the start-up step (audit) |
| updated_at, updated_by | timestamptz, uuid | who saved the schedule or the switch last (audit) |

## job_run

One row per run of any job (JOB-D10). Transient: hard-deleted `jobs.run_retention_days` days after `finished_at` (JOB-D11). No soft delete.

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key, uuid v7; the run id the API answers |
| job_code | text | FK `job_definition.code` |
| trigger | text | `Schedule`, `Manual`, `Request` or `Retry` |
| scheduled_for | timestamptz | the occurrence this run belongs to, UTC; empty unless `trigger` is `Schedule` |
| subject_key | text | what the one-off job works on, at most 200 characters, for example `order:<id>`; empty for a recurring job |
| arguments | jsonb | ids and options of a one-off job only; never a secret or a whole record (JOB-D02) |
| status | text | `Queued`, `Running`, `Succeeded`, `Failed` or `Interrupted` |
| attempt | int | attempts started, from 0 |
| max_attempts | int | 1 for a recurring job; one more than the values of `jobs.retry_delays_seconds` for a one-off job |
| next_attempt_at | timestamptz | when a `Queued` run may be taken, UTC |
| locked_by | text | the process that holds a `Running` run |
| lease_until | timestamptz | renewed while the run works; a `Running` row past it is reaped (JOB-D09) |
| requested_by | uuid | FK `actor.id`; the person who queued or started it; empty for a schedule |
| retried_from | uuid | FK `job_run.id`; the Failed run a manual retry repeats (JOB-D13) |
| started_at | timestamptz | start of the last attempt, UTC |
| finished_at | timestamptz | set when the run ends, UTC |
| items_total, items_ok, items_failed, items_skipped | int | counts of the run, 0 by default |
| error_code | text | short code such as `JOB_TIMEOUT`, `JOB_INTERRUPTED` (a dead process) or `JOB_STOPPED` (a shutdown); empty on success |
| error_text | text | readable and without secrets, at most `jobs.error_max` characters (JOB-D10) |
| created_at, created_by | timestamptz, uuid | System for a schedule; the person for a request or a manual start (audit, AUDIT-D02) |

Constraints (JOB-D05): unique `(job_code, coalesce(subject_key, ''))` where `status` is `Queued` or `Running`; unique `(job_code, scheduled_for)` where `scheduled_for` is not empty.

Indexes: `(status, next_attempt_at)`; `(status, lease_until)`; `(job_code, created_at desc)`; `(finished_at)`.
