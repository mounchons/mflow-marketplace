# jobs: requirements

How background work runs: which work leaves the request, the catalog of jobs, schedules, one run at a time, retries, what a run records, the screen and alerts. Example people: `admin01` holds `{job_manage_key}`; `viewer01` holds `{job_view_key}` only; `clerk01` holds neither. Example jobs: `purge_sessions` (daily, set by the sign-in pack), `send_mail` (every minute, set by the e-mail pack), `sales_summary` (a project's own recurring job), `export_orders` (a one-off job queued by a request). The values below are the defaults of `params.md`.

### Requirement: Work that leaves the request
A request SHALL not do work that may take longer than {jobs.request_wait_seconds} seconds, that calls another system or sends e-mail, or that works over many records. Such work SHALL run as a background job: the request SHALL save what the user asked for, queue the job, and answer at once. A pack that owns a job MAY name an exception, such as a test button that must answer in the same call. (JOB-D01)

#### Scenario: A large export
- **WHEN** `clerk01` asks for an export of 40,000 orders
- **THEN** the answer is 202 with the run id, and the file is built by the job `export_orders`

#### Scenario: A small save
- **WHEN** `clerk01` edits the note of one order
- **THEN** the save finishes in the request and no job is queued

### Requirement: Catalog of jobs
Every job SHALL be one entry of one catalog in the code, holding its code, its names, whether it is recurring or one-off, its default schedule, its longest run time, whether its schedule may be edited, and the effect of switching it off. Each entry SHALL have one `job_definition` row. A job code that is not in the catalog SHALL not run. (JOB-D02, JOB-D03)

#### Scenario: A code outside the catalog
- **WHEN** code queues a job whose code is not in the catalog
- **THEN** the call fails with an error naming the code, and no run is written

### Requirement: Jobs of the other packs
When the sign-in, e-mail or upload pack is selected, each job it names SHALL be an entry of the catalog and SHALL follow this pack: it SHALL run one at a time, SHALL record its runs and SHALL be on the job screen. Its schedule SHALL be the one that pack sets and SHALL not be editable on the screen; its switch SHALL work. A queue line whose period that pack sets in seconds SHALL keep that period, and SHALL show its last look in `last_checked_at`. Where that pack retries each item, the run itself SHALL not be retried. (JOB-D03, JOB-D05, JOB-D07)

#### Scenario: The sign-in purge
- **WHEN** the sign-in pack is selected and `admin01` opens the job screen
- **THEN** `purge_sessions` is listed with its daily schedule and offers the switch but no schedule form

#### Scenario: An e-mail that fails
- **WHEN** `send_mail` meets an e-mail whose send fails
- **THEN** the e-mail pack's retry of that e-mail applies, and the run of `send_mail` is not retried

### Requirement: Schedules are stored and edited without a deploy
A recurring job's schedule and switch SHALL be read from its `job_definition` row. The default SHALL be the catalog's, written only when the row is created. A holder of `{job_manage_key}` SHALL set a schedule at `PUT {api_prefix}/jobs/<code>/schedule` in one of these forms; the switch `enabled` MAY be sent alone. A save SHALL apply from the next occurrence without a restart.

| Form | Values | Stored as | Reads |
|---|---|---|---|
| every N minutes | N from {jobs.interval_minutes} | `*/N * * * *` | Every N min · ทุก N นาที |
| daily | one or more hours 0–23 and one minute 0–59 | `m h1,h2 * * *` | Daily 02:10, 12:10 · ทุกวัน 02:10, 12:10 |
| days of the month | a first day 1–31, a last day from the first to 31, one or more hours and one minute | `m h d1-d2 * *` | Days 25–31 of the month, 02:00 · วันที่ 25–31 ของเดือน 02:00 |

A form outside the table SHALL answer 400 `VALIDATION_FAILED` naming the field; a form sent for a job whose schedule is not editable SHALL answer 409 `JOB_SCHEDULE_FIXED`; a save from a stale version SHALL answer 409 `JOB_CHANGED`; an unknown code SHALL answer 404 `NOT_FOUND`; a caller without `{job_manage_key}` SHALL get 403 `ACCESS_DENIED`. A run going while its schedule changes SHALL finish. (JOB-D03)

#### Scenario: A new daily time
- **WHEN** `admin01` saves `sales_summary` as daily at hours 6 and 18, minute 30
- **THEN** the stored schedule is `30 6,18 * * *`, the next run moves to the coming 06:30 or 18:30, and no restart is needed

#### Scenario: Every 7 minutes
- **WHEN** a save asks for every 7 minutes and 7 is not in {jobs.interval_minutes}
- **THEN** the answer is 400 `VALIDATION_FAILED` naming the minutes, and nothing is saved

#### Scenario: A schedule set by another pack
- **WHEN** `admin01` sends a form for `purge_sessions`
- **THEN** the answer is 409 `JOB_SCHEDULE_FIXED`, and the schedule is unchanged

### Requirement: Schedules follow the system time zone
Every schedule SHALL be read in {system_time_zone}, never in the server's zone. Start and end times SHALL be stored in UTC and shown in {system_time_zone}. In a zone with daylight saving, an occurrence SHALL neither be lost nor run twice on the days the clock changes. (JOB-D04)

#### Scenario: Two o'clock
- **WHEN** a job is scheduled daily at 02:00, the system time zone is `Asia/Bangkok`, and the server runs in UTC
- **THEN** the job starts at 02:00 Bangkok time, which is 19:00 UTC of the day before

### Requirement: One-off jobs are queued with the save
A one-off job SHALL be queued by writing its `job_run` row, with status `Queued` and its `subject_key`, in the same transaction as the save that causes it. The row SHALL hold ids and options only, never a secret or a whole record. The request SHALL answer 202 with the run id. (JOB-D02)

#### Scenario: A save that fails
- **WHEN** a save would queue `export_orders` but fails on a later check
- **THEN** no `job_run` row exists, and no job runs

#### Scenario: The machine stops after the save
- **WHEN** the API stops right after the save committed
- **THEN** the `Queued` row is still there and the job runs after the start

### Requirement: One run of a job at a time
A job SHALL have at most one `job_run` row in `Queued` or `Running`, per `subject_key` for a one-off job, and one occurrence of a schedule SHALL start at most one run. These rules SHALL be enforced by the database, so they hold with several API containers. A start by the schedule that meets an active run SHALL be skipped with no new row. A one-off job queued again for the same `subject_key` SHALL answer with the active run. A manual start that meets an active run SHALL answer 409 `JOB_RUNNING`. Runs of different jobs SHALL run together, at most {jobs.worker_count} in one process. (JOB-D05)

#### Scenario: A schedule meets a long run
- **WHEN** `sales_summary` from 02:00 is still running at its 03:00 occurrence
- **THEN** no second run starts, and no row is written for 03:00

#### Scenario: Two containers reach one occurrence
- **WHEN** two API containers both find that the 02:00 occurrence of `sales_summary` is due
- **THEN** one run is written and runs, and the other container writes nothing

#### Scenario: One-off queued twice
- **WHEN** `clerk01` presses Export twice for the same order filter while the first run is `Queued`
- **THEN** both answers name the same run, and one job runs

#### Scenario: Different jobs at the same time
- **WHEN** `purge_sessions` and `sales_summary` are due at the same time
- **THEN** both run

### Requirement: Jobs are safe to run again
A job SHALL give the same result when it runs again. A job over several items SHALL save each item on its own, SHALL skip an item already done, and SHALL go on after an item fails. Such a run SHALL end `Failed` with its counts, and the items that succeeded SHALL stay. A job that calls another system SHALL send a key that prevents a second effect where that system accepts one. A job that deletes something outside the database SHALL delete it first and the row after. (JOB-D06)

#### Scenario: One bad item
- **WHEN** a run has 100 items and item 37 fails
- **THEN** 99 items are done, the run ends `Failed` with 99 ok and 1 failed, and the 99 stay

#### Scenario: The next run
- **WHEN** the next run of that job starts
- **THEN** the 99 items are not done again

### Requirement: Retries and what becomes Failed
A one-off job that fails with a temporary error (no answer, a 5xx from another system, a database failure, a timeout, or an error the job does not recognize) SHALL be queued again after the next delay of {jobs.retry_delays_seconds} seconds. After the last delay it SHALL become `Failed` with its last error. An error that needs a fix (wrong data, or a 400, 403 or 422 from another system) SHALL make it `Failed` at once. A recurring job SHALL never be retried by this rule: its next occurrence is its retry, and any run that throws or holds a failed item SHALL end `Failed`. (JOB-D07)

#### Scenario: Another system is down
- **WHEN** `export_orders` fails three times because the storage does not answer, and `jobs.retry_delays_seconds` is `30, 120`
- **THEN** it is tried again 30 seconds and then 120 seconds after a failure, and after the third failure it is `Failed` with the last error

#### Scenario: Wrong data
- **WHEN** `export_orders` fails because its filter names a branch that no longer exists
- **THEN** it is `Failed` at once with no retry

#### Scenario: A recurring job fails
- **WHEN** the 02:00 run of `sales_summary` throws
- **THEN** it ends `Failed`, and the next run starts at its next occurrence

### Requirement: A run that takes too long
Each run SHALL end within its job's limit in the catalog, or {jobs.timeout_minutes} minutes when the job names none. At the limit the run SHALL be told to stop and SHALL stop after the current item, ending `Failed` with `JOB_TIMEOUT`; what it finished SHALL stay. A timeout SHALL count as a temporary error. (JOB-D08)

#### Scenario: Past the limit
- **WHEN** a run of `sales_summary` is still working after {jobs.timeout_minutes} minutes
- **THEN** it stops after the current item and ends `Failed` with `JOB_TIMEOUT` and its counts

### Requirement: A process that dies
A `Running` run SHALL renew `lease_until` every third of {jobs.lease_seconds} seconds. Every process that takes jobs SHALL look for `Running` rows past their `lease_until`. Such a recurring run SHALL become `Interrupted`. Such a one-off run SHALL go back to `Queued` with its attempt counted, or become `Failed` when its attempts are used up. A process SHALL never close a run whose lease is still valid, also not at its own start. A process that fails to renew a lease SHALL stop that run. (JOB-D09)

#### Scenario: A container is killed
- **WHEN** the container running `sales_summary` is killed and {jobs.lease_seconds} seconds pass
- **THEN** the run becomes `Interrupted`, and the next occurrence runs normally

#### Scenario: A one-off job in a dead process
- **WHEN** the container running `export_orders` is killed on its first attempt
- **THEN** the run goes back to `Queued` with attempt 1, and another process takes it

#### Scenario: A restart of another container
- **WHEN** one container restarts while another container runs `sales_summary`
- **THEN** the running row stays `Running`, and the job finishes

### Requirement: What a run records
Every run SHALL keep its job, its trigger (`Schedule`, `Manual`, `Request` or `Retry`), who requested it, its status (`Queued`, `Running`, `Succeeded`, `Failed` or `Interrupted`), its start and end, its attempt, the counts of items (total, ok, failed, skipped), and on failure an error code and a readable text of at most {jobs.error_max} characters. The text SHALL hold no password, token, connection string, record content or stack trace; the stack trace SHALL go to the log with the run id. (JOB-D10)

#### Scenario: A normal run
- **WHEN** `sales_summary` summarizes 120 branches and all succeed
- **THEN** the run is `Succeeded` with 120 total and 120 ok, with start and end times

#### Scenario: An error with a secret in it
- **WHEN** a run fails with an exception whose message holds a connection string
- **THEN** `error_text` names the failure without the connection string, and the log holds the stack trace with the run id

### Requirement: Runs with nothing to do
A job whose period is shorter than {jobs.frequent_minutes} minutes SHALL write no `job_run` row for a run with nothing to do; it SHALL set `last_checked_at` on its `job_definition` row. Any other run SHALL write its row, also when it had nothing to do. (JOB-D10)

#### Scenario: The mail line on a quiet night
- **WHEN** `send_mail` runs every minute for an hour and no e-mail is queued
- **THEN** no `job_run` row is written, and `last_checked_at` shows the last minute

#### Scenario: A purge with nothing to delete
- **WHEN** the daily `purge_sessions` finds nothing to delete
- **THEN** one `Succeeded` run with 0 items is written

### Requirement: Runs are kept for a limited time
A daily purge SHALL delete `job_run` rows that ended more than {jobs.run_retention_days} days ago. Rows in `Queued` or `Running` SHALL never be deleted. The purge SHALL write no Activity Log entry. `job_run` SHALL be on the project's list of transient tables. (JOB-D11, AUDIT-D07)

#### Scenario: Past the retention
- **WHEN** a run ended {jobs.run_retention_days} days and one hour ago, and the purge runs
- **THEN** its row is gone, and the Activity Log has no new entry

#### Scenario: A run still in the queue
- **WHEN** a run has been `Queued` for longer than the retention, and the purge runs
- **THEN** the row stays

### Requirement: The list of jobs and their runs
`GET {api_prefix}/jobs` SHALL answer a holder of `{job_view_key}` with the jobs in catalog order, leaving out retired jobs. Each job SHALL carry its code and names, its kind, its schedule text in English and Thai, or the stored schedule as it stands when it has another form, whether it is on, its latest run with status, start, end, duration, counts and error text, its next run, its failure count, and whether the caller may manage it. A recurring job that is on and whose next run passed more than five times {jobs.tick_seconds} seconds ago SHALL be marked `Late`. `GET {api_prefix}/jobs/<code>/runs` SHALL answer that job's runs, newest first, paged with `items` and `total`, and `GET {api_prefix}/jobs/<code>/runs/<run id>` one run. A caller without `{job_view_key}` SHALL get 403 `ACCESS_DENIED`, and an unknown code or run 404 `NOT_FOUND`. A job library's own dashboard SHALL not be reachable by users. (JOB-D12)

#### Scenario: A job that has not run
- **WHEN** `viewer01` reads the list before `sales_summary` has ever run
- **THEN** it shows no latest run and its next run

#### Scenario: A job that is off
- **WHEN** the switch of `sales_summary` is off and its latest run is `Succeeded`
- **THEN** its row says it is off, shows `Succeeded`, and has no next run

#### Scenario: The scheduler stopped
- **WHEN** `sales_summary` is on and its next run passed long enough ago with no run started
- **THEN** its row is marked `Late`

#### Scenario: No view key
- **WHEN** `clerk01` calls `GET {api_prefix}/jobs`
- **THEN** the answer is 403 `ACCESS_DENIED`

### Requirement: Job screen
The web SHALL show the job screen to holders of `{job_view_key}`: a strip of counts, a warning band while any job has reached the alert count, the table of jobs, and the history of a job. The Run and Edit buttons SHALL show only to holders of `{job_manage_key}`. Run SHALL open a confirmation that states what the job does and that the caller's name is recorded, and a job that is running SHALL be shown and not startable. Edit SHALL open the schedule form, or the switch alone when the schedule is not editable, and switching off SHALL warn of the job's effect first. While a job runs the table SHALL refresh by itself. Dates and times SHALL be shown in {system_time_zone}. Without `{job_view_key}` the menu item SHALL be absent, and the direct address SHALL show the no-access panel and fetch nothing. (JOB-D12, JOB-D13, JOB-D17)

#### Scenario: A view-only user
- **WHEN** `viewer01` opens the job screen
- **THEN** the jobs and their history are shown, and no Run or Edit button appears

#### Scenario: A job that started meanwhile
- **WHEN** Run is pressed for a job that started after the dialog opened
- **THEN** the dialog shows "The job is already running · งานนี้กำลังทำงานอยู่", and nothing else changes

#### Scenario: Refused by the API
- **WHEN** the API refuses a schedule save with 400 naming the minute
- **THEN** the message shows beside the minute, and the dialog stays open

### Requirement: Run a job by hand
`POST {api_prefix}/jobs/<code>/runs` SHALL start a recurring job for a holder of `{job_manage_key}`, whether its switch is on or off, writing a `Queued` run with trigger `Manual` and `requested_by` the caller, and SHALL answer 202 with the run. It SHALL refuse with 409 `JOB_RUNNING` while the job has an active run and write no Activity Log entry, with 409 `JOB_ONE_OFF` for a one-off job, with 404 `NOT_FOUND` for an unknown code, and with 403 `ACCESS_DENIED` without the key. (JOB-D13)

#### Scenario: Run now
- **WHEN** `admin01` starts `sales_summary` while it is idle
- **THEN** the answer is 202 with a new `Queued` run that starts at once, `requested_by` is `admin01`, and the Activity Log holds one `ManualTrigger` entry naming `admin01`

#### Scenario: Run a job whose switch is off
- **WHEN** the switch of `sales_summary` is off and `admin01` starts it
- **THEN** the run starts as any manual run does

#### Scenario: Refused while running
- **WHEN** `admin01` starts `sales_summary` while it runs
- **THEN** the answer is 409 `JOB_RUNNING`, no row is written, and no `ManualTrigger` entry is written

### Requirement: Retry a failed one-off job by hand
`POST {api_prefix}/jobs/<code>/runs/<run id>/retry` SHALL queue a new run with the same `subject_key` and arguments, with trigger `Retry`, `retried_from` the failed run, its attempts from zero, for a holder of `{job_manage_key}`, and SHALL answer 202. A run that is not a `Failed` one-off run SHALL answer 409 `RUN_NOT_FAILED`. (JOB-D13)

#### Scenario: After a fix
- **WHEN** `export_orders` is `Failed` and `admin01` presses Retry
- **THEN** a new `Queued` run names the failed run in `retried_from`, and the Activity Log holds one `ManualTrigger` entry

#### Scenario: A run that succeeded
- **WHEN** a client asks to retry a `Succeeded` run
- **THEN** the answer is 409 `RUN_NOT_FAILED`, and no run is written

### Requirement: Alert on repeated failures
When a run ends `Failed`, or `Interrupted` by a dead process, the job's failure count SHALL go up by one; a retry that is still coming and a stop by a shutdown SHALL not count. A `Succeeded` run SHALL set the count to zero and clear `alerted_at`. When the count reaches {jobs.alert_after_failures} and `alerted_at` is empty, the job SHALL be marked and, where the e-mail pack is selected and `jobs.alert_emails` holds an address, one e-mail SHALL be queued through that pack to those addresses, naming the job, the count, the time of the last failure and the error code, with no secret. The job screen SHALL warn of any job at that count, with or without an e-mail. (JOB-D14)

#### Scenario: Three failures in a row
- **WHEN** `jobs.alert_after_failures` is 3 and three runs of `sales_summary` in a row end `Failed`
- **THEN** one alert e-mail is queued, and the screen shows the warning

#### Scenario: A fourth failure
- **WHEN** a fourth run in a row ends `Failed`
- **THEN** no further e-mail is queued

#### Scenario: Recovery
- **WHEN** the next run is `Succeeded`, and later three runs fail again
- **THEN** the warning cleared on the success, and a new e-mail is queued after the third failure

#### Scenario: A deploy is not a failure
- **WHEN** a run is stopped by a shutdown
- **THEN** the failure count does not change

#### Scenario: No addresses
- **WHEN** `jobs.alert_emails` is empty and the count is reached
- **THEN** the screen warns, and no e-mail is queued

### Requirement: Jobs act as the system
Every business row a job creates or changes SHALL have the `System` actor, whether a schedule or a person started the job. The person who started it SHALL be in `requested_by` and SHALL be the actor of the save that starts it. In a system whose data is separated by organization, a job SHALL run within the organization it belongs to. (JOB-D15, AUDIT-D02)

#### Scenario: A manual run changes a row
- **WHEN** `admin01` starts `sales_summary` by hand and it updates a summary row
- **THEN** that row's `updated_by` is the `System` actor, and the run's `requested_by` is `admin01`

### Requirement: Activity Log of jobs
Rows of `job_run` and the job's own saves of `job_definition` SHALL write no Activity Log entry. A manual start or retry SHALL write one `ManualTrigger` entry with the person and the job. A save of a schedule or switch by a person SHALL write one `SaveSchedule` entry on the job code with the old and new values, and a save that changes nothing SHALL write none. Business rows a job changes SHALL be logged as any save is, with the `System` actor. A purge SHALL write none. (JOB-D16, AUDIT-D13, AUDIT-D07)

#### Scenario: A schedule saved
- **WHEN** `admin01` changes `sales_summary` from `0 2 * * *` to `30 6 * * *`
- **THEN** one `SaveSchedule` entry holds both values

#### Scenario: Nothing changed
- **WHEN** `admin01` saves the schedule `sales_summary` already has
- **THEN** the answer is the job's row, and the Activity Log has no new entry

#### Scenario: A run writes no entry of its own
- **WHEN** a scheduled run of `purge_sessions` ends
- **THEN** the Activity Log has no entry for `job_run` or `job_definition`

### Requirement: Switch a job off without a deploy
While a job's switch is off, the timer SHALL start no run of it and no row SHALL be written for its occurrences; a one-off job already queued SHALL wait and SHALL not be lost; a manual start or retry SHALL still run. A run that is going when the switch goes off SHALL finish. Setting `jobs.runner` to `false` and restarting SHALL stop a process from taking any job, while it goes on answering requests. (JOB-D17)

#### Scenario: Switched off
- **WHEN** the switch of `sales_summary` is off and 02:00 comes
- **THEN** no run starts and none is recorded

#### Scenario: Off while it runs
- **WHEN** `sales_summary` is running and `admin01` switches it off
- **THEN** the switch is saved, and the run ends as it would have

#### Scenario: Queued one-off job while off
- **WHEN** `export_orders` is switched off while a run is `Queued`
- **THEN** the run stays `Queued` and starts after the switch is on again

#### Scenario: A process that takes no jobs
- **WHEN** a container starts with `jobs.runner` `false`
- **THEN** it answers requests, and starts no run

### Requirement: Jobs in tests
With `jobs.mode` `Inline`, a one-off job SHALL run in the same call right after its save, in its own scope, with one attempt and no retry delay, and SHALL write its `job_run` row. No timer SHALL start a run: a test SHALL call the job directly and SHALL set time through the clock service. `jobs.mode` `Inline` SHALL not be allowed in production. (JOB-D18)

#### Scenario: A one-off job in a test
- **WHEN** `jobs.mode` is `Inline` and a test saves what queues `export_orders`
- **THEN** the job has run before the answer returns, and its `job_run` row is `Succeeded`

#### Scenario: No timer in a test
- **WHEN** `jobs.mode` is `Inline` and a test crosses a job's scheduled time
- **THEN** no run starts on its own

### Requirement: Start-up
At each start the system SHALL add a `job_definition` row for each new catalog job, SHALL not overwrite the schedule or switch of an existing row, and SHALL set `retired_at` on a row whose job left the catalog. A retired job SHALL not run and its history SHALL stay. No job work SHALL delay the API from taking requests. (JOB-D19)

#### Scenario: A deploy adds a job
- **WHEN** a release adds a job and `admin01` has edited the schedule of `sales_summary`
- **THEN** the new job appears with its default schedule, and `sales_summary` keeps the edited one

#### Scenario: A job removed from the code
- **WHEN** a release removes a job from the catalog
- **THEN** it is not on the screen and does not run, and its runs stay in the table until the retention

### Requirement: Missed occurrences
When the system was down during one or more occurrences of a recurring job that is on, the job SHALL run once at the next opportunity, not once per missed occurrence. (JOB-D19)

#### Scenario: Three missed occurrences
- **WHEN** the system was down during three hourly occurrences of a job and starts again
- **THEN** one run starts for them

### Requirement: Shutdown
When the process is asked to stop it SHALL take no new run. A running job SHALL be told to stop and SHALL stop after its current item within {jobs.shutdown_seconds} seconds. The run SHALL become `Interrupted`; a one-off run SHALL go back to `Queued` with no attempt counted. (JOB-D20)

#### Scenario: A deploy during a one-off job
- **WHEN** a container stops while `export_orders` is on its second item
- **THEN** it stops after that item, and the run is `Queued` again with its attempts unchanged

#### Scenario: A deploy during a recurring job
- **WHEN** a container stops while `sales_summary` runs
- **THEN** the run is `Interrupted`, and its failure count does not change

### Requirement: Where jobs run
With `jobs.runner` `true`, a process SHALL take jobs, with {jobs.worker_count} at a time. By default the API process SHALL take them. A separate worker SHALL be the same code with `jobs.runner` `true` while the API has it `false`, and SHALL need no change to the data. (JOB-D21)

#### Scenario: Two API containers
- **WHEN** two API containers each have `jobs.runner` `true`
- **THEN** each takes jobs, and no run is done twice

#### Scenario: A separate worker
- **WHEN** the API has `jobs.runner` `false` and a worker has it `true`
- **THEN** the jobs the API queues are run by the worker
