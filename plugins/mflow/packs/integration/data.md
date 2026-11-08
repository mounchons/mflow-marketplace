# integration data

The queue of writes, the pull cursors, the call log with its hourly counts, and the inbox of incoming calls. Runs of jobs are stored by the jobs pack. `integration_call_log`, `integration_call_hourly` and `integration_inbox` are transient tables under AUDIT-D07: hard-deleted by age, no Activity Log entry, no who-and-when columns beyond their own time. Rows that are records in themselves write no Activity Log entry of their own (AUDIT-D13). Connection values live in `system_setting` (settings pack).

## integration_outbox

One write waiting for, or done against, an `{external_system}` (INTG-D08). Written in the transaction of the business change. Never deleted.

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key, uuid v7 |
| system | text | the `{external_system}` code |
| operation | text | the `{operation}` |
| owner_type | text | the `{record}` type the write belongs to |
| owner_id | text | the record's id; shown on the monitor |
| idempotency_key | text | unique; made once with the row, sent unchanged on every attempt (INTG-D07) |
| payload | jsonb | the data to send, without secrets and without file content (INTG-D23); cleared after `audit.call_log_days` days from `sent_at` |
| file_key | text | the storage key of a file to send, by the upload pack's rules; empty when there is none |
| status | text | `Pending`, `InFlight`, `Sent`, `Failed`, `Review` or `Superseded` |
| attempts | int | calls made so far; 0 until the first real call |
| next_try_at | timestamptz | when the sender may take it |
| first_failed_at | timestamptz | the first failure; drives the late mark (`integration.late_hours`) |
| in_flight_at | timestamptz | when the current call started; empty when not `InFlight` |
| last_status_code | int | the last answer's code; empty when there was no answer |
| last_error | text | the last message, cut at 1000 characters, without secrets |
| reference_code | text | the reference code of the last failed call (INTG-D10) |
| resend_reason | text | the reason given by the last manual re-send (INTG-D16) |
| sent_at | timestamptz | set when `Sent` |
| created_at, created_by | timestamptz, uuid | set by the business change (audit); `created_by` is the actor who caused it |
| updated_at | timestamptz | set on every status change |
| version | int | concurrency token for a manual re-send (AUDIT-D10) |

Indexes: `(status, next_try_at)` where `status` is `Pending`; unique `(idempotency_key)`; `(owner_type, owner_id)`; `(status, first_failed_at)`.

## integration_cursor

One row per pull `{operation}` (INTG-D09). Written by the job, as `SYSTEM`.

| Column | Type | Rule |
|---|---|---|
| system | text | part of the primary key |
| operation | text | part of the primary key |
| last_end_at | timestamptz | end of the last pull that reached its last page; empty until the first such pull |
| last_page_reached_at | timestamptz | when that pull ended |
| updated_at | timestamptz | set by the job |

## integration_call_log

One real call to an `{external_system}` (INTG-D10). Transient (INTG-D11).

| Column | Type | Rule |
|---|---|---|
| id | bigint | primary key, running number |
| called_at | timestamptz | start of the call, UTC |
| system | text | |
| operation | text | |
| origin | text | `Run`, `Outbox`, `Request`, `Test` or `Webhook` |
| run_id | uuid | the run of the jobs pack, when `Run` |
| outbox_id | uuid | FK `integration_outbox.id`, when `Outbox` |
| actor_id | uuid | FK `actor.id`, when `Request` or `Test` |
| status_code | int | empty when there was no answer |
| outcome | text | `Ok`, `Warning`, `NeedsFix` (Failed, needs a fix), `Retryable` (Failed, retryable), `Review`, `Unauthorized`, `Unavailable` or `Timeout` |
| duration_ms | int | measured here |
| message | text | the other side's message, cut at 1000 characters, without secrets |
| request_id | text | the request id of the API request or job, when there is one |
| reference_code | text | unique when set; set for a failed call, shown to the user |
| request_body | text | masked, cut at `integration.body_log_bytes` bytes; empty for a file |
| response_body | text | masked, cut at `integration.body_log_bytes` bytes; empty for a file |

Indexes: `(system, operation, called_at)`, `(called_at)`, `(reference_code)`.

## integration_call_hourly

Hourly count of successful high-volume reads (INTG-D11). Transient.

| Column | Type | Rule |
|---|---|---|
| hour_start | timestamptz | part of the primary key; the start of the hour |
| system | text | part of the primary key |
| operation | text | part of the primary key |
| calls_ok | int | added on each successful call |
| duration_ms_sum | bigint | |
| duration_ms_max | int | |

## integration_inbox

One incoming call that passed its signature check (INTG-D21). Transient.

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key, uuid v7 |
| system | text | |
| event_id | text | the other side's id for the event; unique with `system` |
| event_type | text | the other side's name for the event |
| signed_at | timestamptz | the time in the signature |
| received_at | timestamptz | set on insert, UTC |
| payload | jsonb | the body, masked as the call log is |
| status | text | `Received`, `Done`, `Failed` or `Review` |
| attempts | int | how often the job tried it |
| processed_at | timestamptz | set when `Done` |
| last_error | text | without secrets |

Indexes: unique `(system, event_id)`; `(status, received_at)`.

## integration_alert_state

One row per `{external_system}` that can raise an alert (INTG-D17). Written after each real call, as `SYSTEM`; no Activity Log entry (AUDIT-D13).

| Column | Type | Rule |
|---|---|---|
| system | text | primary key |
| failures_in_a_row | int | counts real calls from every caller; set to 0 by a good call; compared with `integration.alert_failures` |
| is_alerting | bool | true from the first alert until the back-to-normal e-mail |
| last_alert_at | timestamptz | the last alert sent; drives `integration.alert_repeat_minutes` |
| updated_at | timestamptz | set by the job |
