# integration: requirements

How this system talks to each `{external_system}`: through one port, with which timeouts and retries, how a write happens only once, what waits in a queue, what is logged, what users see when the other side is down, the monitor, the fake used in development, and how incoming calls are taken in. Runs of jobs, their schedules and their manual trigger are the jobs pack's rules. Example people: `clerk01` works with Orders and Invoices; `admin01` holds `{integration_view_key}` and `{integration_manage_key}`; `viewer01` holds `{integration_view_key}` only, and their data scope is a list of customers. The example system is `erp`, with the operations `SearchOrders`, `PostInvoice` and `Token`. The values below are the defaults of `params.md`.

### Requirement: One port per external system
Business code SHALL reach an `{external_system}` only through its port, one method per `{operation}`, taking and returning this system's own types. No code outside the port's folder SHALL open an HTTP connection to an external system, and an architecture test SHALL fail on any that does. A port SHALL have one live implementation and one fake implementation with the same methods. (INTG-D01)

#### Scenario: A direct call from business code
- **WHEN** a developer adds an HTTP call to `erp` inside an order Service
- **THEN** the architecture test fails and names the location

#### Scenario: The fake replaces the live one
- **WHEN** the test suite runs with `erp` in fake mode
- **THEN** every port method answers without a network connection, and business code is unchanged

### Requirement: The table of external systems
Each `{operation}` SHALL be listed once with its `{external_system}`, its direction (pull, push or incoming), its trigger (schedule, event, button or webhook), and the owner of the data. The port SHALL offer no method that the table does not list. When the two sides hold different values for data the other side owns, the owner's value SHALL win at the next sync, and the change SHALL be recorded as an Activity Log entry by `SYSTEM`. (INTG-D02, AUDIT-D02)

#### Scenario: Data owned by the other side
- **WHEN** `erp` owns the Customer's credit limit, `clerk01` has no way to edit it here, and the next pull brings a new limit
- **THEN** the local value becomes the new limit, and one Activity Log entry by `SYSTEM` holds the old and the new value

#### Scenario: A method outside the table
- **WHEN** a reviewer compares the port with the table
- **THEN** every port method has its row, and no row lacks its owner

### Requirement: Connection values on the settings page
The address, the user and the secret of each `{external_system}` SHALL be values of the system settings page (settings pack), one tab per system, the secret of the secret type. They SHALL apply at the next call without a restart. When a value is missing, the API SHALL still start; a push SHALL wait in the queue without counting as an attempt; a request that needs the system SHALL answer 503 `<SYSTEM>_UNAVAILABLE`; and the monitor SHALL say the system is not set up. No value SHALL be in a log line, an error answer or the HTML of a page. (INTG-D03, SET-D03, SET-D08, SET-D09)

#### Scenario: A new password
- **WHEN** `admin01` saves a new password for `erp` and the next call runs
- **THEN** the call uses the new password with no restart, and no API answer holds it

#### Scenario: Not set up yet
- **WHEN** the system has no `erp` address and `clerk01` issues an Invoice that pushes to `erp`
- **THEN** the Invoice is saved, its `integration_outbox` row stays Pending with `attempts` 0, and the monitor shows `erp` as not set up

### Requirement: Only allowed hosts
In live mode the API SHALL refuse to start while `integration.allowed_hosts` is empty, naming the setting. A saved address SHALL be refused when its host is not on `integration.allowed_hosts`, as a 400 `VALIDATION_FAILED` on that key; a call SHALL be refused again at send time, with no network connection, when the host is not on the list. Outside Development and Prototype an address SHALL be https only. No call SHALL follow a redirect. (INTG-D04)

#### Scenario: A copy of the Production database
- **WHEN** a Staging machine restores a copy of Production that holds the live `erp` address, and its `integration.allowed_hosts` holds only the test host
- **THEN** no call reaches the live host, and the call log and the monitor name the refused host

#### Scenario: An address outside the list
- **WHEN** `admin01` saves an `erp` address whose host is not on the list
- **THEN** the save answers 400 `VALIDATION_FAILED` on that key, and the stored value does not change

#### Scenario: A redirect from the other side
- **WHEN** `erp` answers 302 to another host
- **THEN** the redirect is not followed, and the call is recorded as Failed

### Requirement: Timeouts on every call
Every call SHALL have a timeout: {integration.connect_timeout_seconds} seconds to connect; within a user's request {integration.request_timeout_seconds} seconds per attempt and {integration.request_total_seconds} seconds in all; in a background job {integration.job_timeout_seconds} seconds per attempt; for a file {integration.file_timeout_seconds} seconds. A user closing the page or the process stopping SHALL cancel the call. (INTG-D05)

#### Scenario: The other side hangs on a request
- **WHEN** `erp` does not answer a read made in `clerk01`'s request
- **THEN** the request ends within {integration.request_total_seconds} seconds with 503 `ERP_UNAVAILABLE`

#### Scenario: A job waits longer
- **WHEN** `erp` answers a pull after 60 seconds
- **THEN** the job takes the answer, because its limit is {integration.job_timeout_seconds} seconds

### Requirement: Access token
A port that needs a token SHALL get one before its first call and reuse it until {integration.token_refresh_minutes} minutes before it expires, then get a new one before the next call. The token SHALL be held in memory only, never in the database or a log. On a 401 the port SHALL get a new token once and send the same call once more; a second 401 SHALL be the outcome Unauthorized and SHALL not be sent a third time. (INTG-D06)

#### Scenario: Renewed before it expires
- **WHEN** the token's life is 60 minutes and a call is made 58 minutes after it was issued
- **THEN** the port gets a new token first, and the call log holds one `Token` call and the call

#### Scenario: One 401 in a run
- **WHEN** `SearchOrders` answers 401 once and succeeds after a new token
- **THEN** the result is used, and the call log holds the 401, the `Token` call and the success

#### Scenario: 401 twice
- **WHEN** a call answers 401, a new token is issued, and the resent call answers 401
- **THEN** the outcome is Unauthorized, and the call is not sent a third time

### Requirement: Outcome of each answer
The port SHALL turn each answer into one outcome from this table, in one place. The answer's own success flag, where the other side has one, SHALL be read together with the status code. (INTG-D06)

| Answer | Outcome | Automatic retry |
|---|---|---|
| 2xx | Ok, or Warning when the answer says so; an empty search is Ok | no |
| 400, 403, 422 and other 4xx not named here | Failed, needs a fix | never |
| 401 | one new token and one resend, then Unauthorized | once |
| 404 | Review; on a delete, Ok | never |
| 409 | Review | never |
| 408, 429, 500, 502, 504 | Failed, retryable; `Retry-After` is obeyed | yes |
| 503 | Unavailable | yes, in a later run |
| no answer in time, or the connection dropped | Timeout | a read yes; a write only after the check of "A write happens once" |

#### Scenario: Needs a fix
- **WHEN** `PostInvoice` answers 422
- **THEN** the outcome is Failed, needs a fix, the row is `Failed`, and it is not sent again by itself

#### Scenario: Delete of something already gone
- **WHEN** a delete call answers 404
- **THEN** the outcome is Ok, and the record counts as deleted on the other side

#### Scenario: Throttled
- **WHEN** `SearchOrders` answers 429 with `Retry-After: 20`
- **THEN** the next attempt comes no sooner than 20 seconds later

#### Scenario: An empty search
- **WHEN** `SearchOrders` answers 200 with no rows
- **THEN** the outcome is Ok with an empty result, not an error

### Requirement: Retry within one call
A read SHALL be tried at most {integration.read_attempts} times within one call, with a longer gap each time, for the outcomes the table marks as retryable. A write SHALL be sent once per call and SHALL never be retried within the call; a write that fails SHALL return to the queue, or fail to the user when it is a direct call. (INTG-D06)

#### Scenario: A read recovers
- **WHEN** `SearchOrders` answers 500 and then 200
- **THEN** the outcome is Ok, and the call log holds both calls

#### Scenario: A read keeps failing
- **WHEN** `SearchOrders` answers 500 every time
- **THEN** it is sent {integration.read_attempts} times and the outcome is Failed, retryable

#### Scenario: A write is not repeated in the call
- **WHEN** `PostInvoice` answers 500
- **THEN** the call log holds one call, and the row goes back to Pending with its next try set

### Requirement: A write happens once
Every write SHALL carry one idempotency key, made once when the write is created and sent unchanged on every attempt, in the `Idempotency-Key` header when the other side accepts it. Where the other side does not accept a key, after a Timeout the port SHALL read from the other side whether the write already happened before it sends again. When the read cannot tell, the row SHALL become `Review` and SHALL not be sent by itself. (INTG-D07)

#### Scenario: The same key on a retry
- **WHEN** `PostInvoice` for Invoice `INV-0012` times out and is sent again from the queue
- **THEN** both calls carry the same `Idempotency-Key`

#### Scenario: The write had happened
- **WHEN** a `PostInvoice` without key support times out, and the read finds Invoice `INV-0012` on `erp`
- **THEN** the row becomes `Sent` with no second write

#### Scenario: The read cannot tell
- **WHEN** a `PostInvoice` without key support times out and `erp` has no way to look it up
- **THEN** the row becomes `Review`, and the monitor lists it

### Requirement: Writes wait in an outbox
A write that must survive a crash SHALL be one `integration_outbox` row, written in the transaction of the business change that causes it. A background job SHALL take Pending rows whose next try is due, oldest first, and send them; two senders SHALL never take the same row. Each row SHALL be `InFlight` while its call runs and then `Sent`, `Pending` (with `attempts` raised and `next_try_at` set from {integration.outbox_retry_minutes}), `Failed` or `Review`. A row left `InFlight` for longer than its timeout plus {integration.inflight_grace_minutes} minutes SHALL be taken again as a Pending row, with the check of "A write happens once". A row whose write no longer applies SHALL become `Superseded` and SHALL not be sent. A retryable failure SHALL keep being retried at the last gap, with no limit on attempts. One failing row SHALL not stop the others. Rows SHALL never be deleted; the payload of a `Sent` row SHALL be cleared after {audit.call_log_days} days. (INTG-D08)

#### Scenario: The business change rolls back
- **WHEN** saving Invoice `INV-0012` fails after its outbox row was added
- **THEN** no row remains, and nothing is sent

#### Scenario: A crash after the save
- **WHEN** the API stops right after `INV-0012` commits
- **THEN** its Pending row is sent after the restart

#### Scenario: A crash during the send
- **WHEN** the API stops during the `PostInvoice` call of a row, and its timeout plus {integration.inflight_grace_minutes} minutes have passed
- **THEN** the row is taken again, and the check of "A write happens once" decides whether to send it

#### Scenario: One bad row
- **WHEN** ten rows are due, and the third answers 422
- **THEN** nine are sent, the third is `Failed`, and the run reports one failure

#### Scenario: A later change replaces the write
- **WHEN** a Pending row writes status `Open` and a newer change of the same record writes `Closed`
- **THEN** the older row becomes `Superseded` and is never sent

### Requirement: Direct calls
A read, and a write the project lists as direct, SHALL be called within the request. A failed direct write SHALL leave no change saved here and SHALL answer the user with the outcome: 503 `<SYSTEM>_UNAVAILABLE` for Unavailable and Timeout, and 409 `<SYSTEM>_REJECTED` for Failed, needs a fix, each with the reference code of the call. (INTG-D08)

#### Scenario: A rejected direct write
- **WHEN** a direct `PostInvoice` answers 422 to `clerk01`
- **THEN** the answer is 409 `ERP_REJECTED` with a reference code, and the Invoice is not issued

### Requirement: Sync cursor for pulls
Each pull `{operation}` SHALL keep one `integration_cursor` row with the end of its last pull that reached the last page. A run SHALL read from that time minus {integration.cursor_overlap_minutes} minutes until now, {integration.page_size} rows a page. A run that stops before the last page SHALL not move the cursor. A pull with no cursor yet SHALL read with no lower bound. Taking in the same row twice SHALL leave the same result. (INTG-D09)

#### Scenario: The next run overlaps
- **WHEN** the last pull that reached its last page ended at 02:10
- **THEN** the next run reads from 02:05

#### Scenario: A run stopped halfway
- **WHEN** a run takes in the first page and the second page answers 503
- **THEN** the rows of the first page stay, the cursor does not move, and the next run reads the same range

#### Scenario: A row seen twice
- **WHEN** an Order from the overlap was taken in by the last run and comes again unchanged
- **THEN** no new Order is created, and no Activity Log entry is written

### Requirement: Failed items in a pull
Each row of a pull SHALL be judged by itself, and a failing row SHALL not stop the other rows. A row that a later run may redo SHALL be retried by the next run before it reads further; a row that needs a fix SHALL wait for a person. A value that cannot be mapped SHALL make the row `Review` with no guessed value. (INTG-D09, INTG-D22)

#### Scenario: One row keeps failing
- **WHEN** a run has 100 rows and row 37 fails on every try
- **THEN** 99 rows are taken in, row 37 is waiting for a retry, and the run reports one failure

#### Scenario: A value with no mapping
- **WHEN** a row holds a unit code the mapping table does not know
- **THEN** that row is `Review` and no Order is created for it

### Requirement: Call log
Every real call SHALL write one `integration_call_log` row, a `Token` call included: the time, the system, the `{operation}`, the caller (run, outbox row or account), the status code, the outcome, the measured duration, the other side's message, the request id, and the request and response bodies cut at {integration.body_log_bytes} bytes. Before storing, the value of any field whose name contains one of {integration.masked_fields} SHALL be replaced by `***`, at any depth of the body. Headers SHALL not be stored. A file's content SHALL not be stored. A failed call SHALL get a reference code; the error message the user sees SHALL show the same code. (INTG-D10, AUDIT-D12)

#### Scenario: A failed call the user can quote
- **WHEN** `clerk01`'s request calls `erp` and it times out
- **THEN** the call log holds one row with a reference code, and `clerk01`'s error message shows the same code

#### Scenario: A secret in a body
- **WHEN** a `Token` call sends a JSON body whose `password` field holds `abc`
- **THEN** the stored body holds `***` for the password, and no log line holds `abc`

#### Scenario: Headers are not kept
- **WHEN** a call carries `Authorization: Bearer abc123`
- **THEN** no stored field and no log line holds `abc123`

### Requirement: Age of the call log
A purge SHALL delete `integration_call_log`, `integration_call_hourly` and `integration_inbox` rows older than {audit.call_log_days} days, with no Activity Log entry. A successful read of an `{operation}` the project marks high volume SHALL add one to its hour in `integration_call_hourly` with the summed and the longest duration, instead of writing a row; a failed call of that `{operation}` SHALL always write a row. (INTG-D11, AUDIT-D07, AUDIT-D13)

#### Scenario: Past the age
- **WHEN** a call log row is {audit.call_log_days} days and one minute old and the purge runs
- **THEN** it is gone, and the Activity Log has no new entry

#### Scenario: A successful high-volume read
- **WHEN** a file download marked high volume succeeds at 12:13
- **THEN** no call log row is written, and the 12:00 count of that `{operation}` grows by one

### Requirement: When an external system is down
A page that needs no external system SHALL work as usual while one is down, and data already pulled SHALL be shown with the time of its last pull. A request that needs the system SHALL answer 503 `<SYSTEM>_UNAVAILABLE` with a reference code and SHALL not wait beyond its timeout. Writes SHALL wait in the queue. A pull that meets 503, a second 401 or a refused connection SHALL stop at once and end as a failed run, the rows it took in SHALL stay, and its next run SHALL be {integration.down_rerun_minutes} minutes later. (INTG-D12)

#### Scenario: A read while the system is down
- **WHEN** `erp` is down and `clerk01` opens an Order that was already pulled
- **THEN** the Order opens, with the time of its last pull

#### Scenario: A pull while the system is down
- **WHEN** `SearchOrders` answers 503 on the first page at 12:10
- **THEN** the run stops as failed, and its next run is at 12:25

#### Scenario: Writes keep waiting
- **WHEN** `clerk01` issues an Invoice while `erp` is down
- **THEN** the Invoice is saved, its row is Pending, and it is sent when `erp` is back

### Requirement: No hand-tuned circuit breaker
The port SHALL have no circuit breaker of its own, beyond the default one of the HTTP library. The stop rule of "When an external system is down" and the timeouts SHALL be what protects the other side. (INTG-D13)

#### Scenario: A short outage
- **WHEN** `erp` fails for two minutes and the next run succeeds
- **THEN** no switch or state must be cleared by a person

### Requirement: Monitor API
Holders of `{integration_view_key}` SHALL get, at `GET {api_prefix}/integrations`, for the last {integration.monitor_hours} hours or a chosen number of hours within the log's age: per system and `{operation}` the number of calls, ok, warnings and failed, the time and outcome of the last call, the average duration, the cursor of a pull, and whether the system is live, fake or not set up. They SHALL get, paged and newest first, the failed calls with their reference codes, and the queue rows that are `Pending`, `Failed` or `Review`, oldest first. A queue row waiting more than {integration.late_hours} hours since its first failure SHALL be marked late. Counts SHALL add the hourly counts to the logged calls. A caller without the key SHALL get 403 `ACCESS_DENIED`. (INTG-D14, INTG-D11, INTG-D15)

#### Scenario: Counts with hourly reads
- **WHEN** the last 24 hours hold 811 successful downloads in hourly counts and 1 failed download in the log
- **THEN** that `{operation}` shows 812 calls, 811 ok and 1 failed

#### Scenario: A late row
- **WHEN** a Pending row first failed 25 hours ago
- **THEN** it is marked late

#### Scenario: No key
- **WHEN** `clerk01` calls the monitor API
- **THEN** the answer is 403 `ACCESS_DENIED`

### Requirement: Monitor page
The page SHALL show one table of systems and operations, the failed calls, the waiting queue with late rows marked in a danger color, the latest job runs from the jobs pack, and a badge for a system that is fake or not set up. Without `{integration_view_key}` the menu item SHALL be absent and the direct URL SHALL show the no-access panel. A failed load SHALL show an error with Retry, never a 0. (INTG-D14, INTG-D15)

#### Scenario: Opening the page
- **WHEN** `admin01` opens the monitor
- **THEN** every `erp` operation shows its figures, and a late row stands out

#### Scenario: A failed load
- **WHEN** the monitor API cannot be read
- **THEN** the page shows the error with Retry, not a 0

### Requirement: Single records on the monitor
Rows that name a single record SHALL go only to a caller whose data scope covers every record such rows can hold, by the permission pack's rule; other callers SHALL get the same counts with no row. Figures per system and `{operation}` SHALL be the same for every holder of `{integration_view_key}`. (INTG-D15)

#### Scenario: A list scope
- **WHEN** `viewer01`, whose scope is a list of customers, reads the failed calls
- **THEN** the answer holds their number and no row

#### Scenario: Scope of every record
- **WHEN** `admin01`, whose scope is All, reads the failed calls
- **THEN** the answer holds the rows with their reference codes

### Requirement: Manual re-send and re-pull
A holder of `{integration_manage_key}` SHALL be able to re-send one `Failed` or `Review` row of the queue with `POST {api_prefix}/integrations/outbox/<id>/resend`, giving a reason. The row SHALL become Pending with the same idempotency key, and one Activity Log entry `ResendIntegration` SHALL name the system, the operation, the owner and the reason. A row in another status SHALL answer 409 `INTEGRATION_ITEM_NOT_WAITING`. A re-pull SHALL start the pull job as the jobs pack's manual trigger does, from the cursor or from a chosen time at most {integration.repull_max_days} days back; a chosen time SHALL not move the cursor. (INTG-D16)

#### Scenario: Re-send after a fix
- **WHEN** `admin01` fixes the customer code and re-sends a `Failed` row
- **THEN** the row is Pending with the same `idempotency_key`, and the Activity Log holds `ResendIntegration` with the reason

#### Scenario: Re-send a row already sent
- **WHEN** `admin01` re-sends a `Sent` row
- **THEN** the answer is 409 `INTEGRATION_ITEM_NOT_WAITING`, and nothing changes

#### Scenario: A pull from an earlier time
- **WHEN** `admin01` re-pulls `SearchOrders` from seven days ago
- **THEN** the run reads from that time, and the cursor keeps its value

#### Scenario: No manage key
- **WHEN** `viewer01` re-sends a row
- **THEN** the answer is 403 `ACCESS_DENIED`, and the row does not change

### Requirement: Alerts
A job's failed runs SHALL alert by the jobs pack's rule. In addition, an alert e-mail SHALL go through the mail pack's queue to the people of that alert when one `{external_system}` answers {integration.alert_failures} real calls in a row with a failure, counting every caller, or when a queue row has been late for {integration.late_hours} hours. The same alert SHALL not be sent again within {integration.alert_repeat_minutes} minutes, and one e-mail SHALL say when the system is back. An alert SHALL hold no business data and no secret, only the system, the counts and a link to the monitor. (INTG-D17)

#### Scenario: Failures repeat
- **WHEN** users' calls to `erp` fail {integration.alert_failures} times in a row
- **THEN** one alert is sent, and no second one within {integration.alert_repeat_minutes} minutes

#### Scenario: Back to normal
- **WHEN** `erp` answers calls well again after an alert
- **THEN** one e-mail says it is back, and later good calls send nothing

### Requirement: A fake of each external system
`<SYSTEM>_MODE` SHALL accept only `fake` or `live`, and SHALL default to `fake` in Development and Prototype. In fake mode the port SHALL answer from a fake that keeps its own data, in the same shape as the live answers. The API SHALL refuse to start with fake mode in Staging or Production, naming the setting. In fake mode a testing control SHALL make a chosen `{operation}` answer a chosen code or a timeout for the next N calls. In live mode the testing control SHALL answer 404 `NOT_FOUND`. The health endpoint SHALL report each system's mode. (INTG-D18)

#### Scenario: Fake in Production
- **WHEN** the API starts in Production with `ERP_MODE=fake`
- **THEN** it stops with a message naming `ERP_MODE`

#### Scenario: A chosen failure
- **WHEN** the control sets `SearchOrders` to 503 for the next call, and the job runs
- **THEN** the run stops as failed, and the search after that answers normally

#### Scenario: Live mode
- **WHEN** the API runs with `ERP_MODE=live` and a client calls the testing control
- **THEN** the answer is 404 `NOT_FOUND`

### Requirement: Test the connection
Each system's tab of the settings page SHALL offer Test connection to whoever may manage the settings. It SHALL call the lightest read of that system with the saved values, inside that request and outside the queue, and answer within {integration.test_timeout_seconds} seconds with 200 and `ok`, the status code and the duration, holding no setting value. A missing value SHALL answer 200 with `ok` false, saying the value is not set. In fake mode it SHALL use the fake and say so. It SHALL change no business data. Every test SHALL write one `integration_call_log` row and one Activity Log entry `TestConnection` naming the system. (INTG-D19)

#### Scenario: A good test
- **WHEN** `admin01` saves a new `erp` address and presses Test connection
- **THEN** the page shows success with the time it took, and the Activity Log holds `TestConnection`

#### Scenario: A wrong password
- **WHEN** `erp` answers 401 to the test
- **THEN** the page shows the failure and the status 401, with no setting value in the answer

### Requirement: Contract tests
A contract test suite SHALL call the other side's test copy with credentials from the environment, and SHALL run only by hand, never in CI. It SHALL only read, and SHALL store one sample answer per `{operation}` without any secret or real data. A unit test SHALL prove that the fake answers in the shape of each sample. Without credentials every contract test SHALL be skipped, not failed. (INTG-D20)

#### Scenario: No credentials
- **WHEN** the test suite runs without `erp` credentials
- **THEN** every contract test is skipped

#### Scenario: The fake drifts
- **WHEN** a stored sample has a date format the fake does not produce
- **THEN** the unit test that compares them fails

### Requirement: Incoming webhooks
Each `{external_system}` that calls this system SHALL have its own route under `{api_prefix}/webhooks/`, taking no session. The API SHALL check the HMAC-SHA256 signature of the raw body with `integration.webhook_secret` in constant time, and that the signed time is within {integration.webhook_tolerance_seconds} seconds of now; a failed check SHALL answer 401 `UNAUTHENTICATED`, the reason unsaid. A passing call SHALL write one `integration_inbox` row, unique by system and event id, and SHALL answer 200 at once, leaving the business work to a background job. A repeated event id SHALL answer 200 and do nothing. A body that fails after a good signature SHALL answer 400 `VALIDATION_FAILED`, and the failed call SHALL be logged. (INTG-D21)

#### Scenario: A good event
- **WHEN** `erp` posts a signed `order.updated` with event id `evt-1`
- **THEN** one inbox row is written, the answer is 200, and the job applies the change once

#### Scenario: The same event again
- **WHEN** `erp` posts `evt-1` a second time
- **THEN** the answer is 200, and no second change is made

#### Scenario: A forged call
- **WHEN** a client posts with a wrong signature
- **THEN** the answer is 401 `UNAUTHENTICATED`, and no inbox row is written

#### Scenario: A replay of an old call
- **WHEN** a correctly signed call arrives with a time older than {integration.webhook_tolerance_seconds} seconds
- **THEN** the answer is 401 `UNAUTHENTICATED`, and no inbox row is written

### Requirement: Versions and field mapping in one place
The other side's API version SHALL be one constant of its port. The mapping of fields and codes between the two sides SHALL be one table per `{operation}` in the port, and SHALL be the only place that names the other side's fields. (INTG-D22)

#### Scenario: A renamed field on the other side
- **WHEN** `erp` renames a field in a new version
- **THEN** the change is made in the port's mapping, and no business code changes

### Requirement: Files through an external system
A file sent to an `{external_system}` SHALL be held by the upload pack's storage first and SHALL be referred to from the `integration_outbox` row by its key; its content SHALL never be in the payload or a log. A file received SHALL be checked and stored by the upload pack's rules before any `{record}` uses it. No address of the other side SHALL reach a browser. (INTG-D23, INTG-D10)

#### Scenario: A file waits for the other side
- **WHEN** a file is pushed while `erp` is down
- **THEN** the row stays Pending, holding only the file's key, and the file is sent when `erp` is back

#### Scenario: A bad file from outside
- **WHEN** a pull brings a file whose content does not match its extension
- **THEN** the file is refused by the upload pack's check, and the row is `Review`

### Requirement: Personal data sent outside
Each `{operation}` that sends personal data outside this system SHALL say so in the table of external systems, with its fields and the agreed reason, and SHALL send only those fields. Those field names SHALL be on `integration.masked_fields`, so they do not reach the log in clear. (INTG-D24, INTG-D10)

#### Scenario: A personal field in a push
- **WHEN** a push sends `national_id`, which the project added to the masked list
- **THEN** the other side receives it, and the stored body holds `***` for that field
