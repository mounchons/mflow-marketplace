# api requirements

The rules every API endpoint shares (where it lives, how errors, lists, dates and stale writes look on the wire, how health and the contract are published, what the logs hold), and the environment the system runs in (one command, one proxy, secrets from the environment, four environments). Example people: `clerk01` and `clerk02` are signed-in users of a {portal}.

### Requirement: Versioned route prefix
Every API endpoint SHALL be served under {api.route_prefix}, and no endpoint SHALL answer outside it; paths outside it belong to the pages of each {portal}. A request to an unknown path under the prefix SHALL answer 404 `NOT_FOUND` with the standard error body, never a page of the web. (API-D01)

#### Scenario: Known endpoint
- **WHEN** a client calls `GET {api.route_prefix}/health`
- **THEN** the API answers from that path

#### Scenario: Unknown API path
- **WHEN** a client calls `GET {api.route_prefix}/does-not-exist`
- **THEN** the API answers 404 with `code` `NOT_FOUND` in a problem body, not an HTML page

### Requirement: Resource names and JSON shape
Paths SHALL name resources with plural kebab-case nouns followed by the record id, such as `/purchase-orders/<id>`. An action that is not a plain save SHALL be `POST` to `.../<id>/<action>`, the action a kebab-case verb such as `approve`. JSON property names and query parameter names SHALL be camelCase. Enum values SHALL travel as their names, never as numbers, and ids SHALL travel as strings. (API-D02)

#### Scenario: An approval
- **WHEN** `clerk01` approves purchase order `PO-0012`
- **THEN** the web calls `POST {api.route_prefix}/purchase-orders/<id>/approve` and the answer holds `status` `Approved`, not a number

### Requirement: Methods and success answers
`GET` SHALL never change data. A `POST` that creates a record SHALL answer 201 with the record, including its id and `version`. A `PUT` SHALL save the whole editable form of a record and answer 200 with the saved record. A `POST` of an action SHALL answer 200 with the record as it is after the action. A `DELETE` SHALL answer 204 with no body; the row is hidden as the audit pack decides. The API SHALL have no `PATCH` endpoint. (API-D02)

#### Scenario: Create
- **WHEN** `clerk01` creates a customer
- **THEN** the API answers 201 with the new customer, its id and its first `version`

#### Scenario: Delete
- **WHEN** `clerk01` deletes a customer with the `version` the page read
- **THEN** the API answers 204 with no body and the customer is no longer listed

### Requirement: Changes that break a client
Within {api.route_prefix} the API SHALL change by adding: new endpoints, new response fields and new optional request fields. Removing or renaming a field, changing its type or meaning, or making an optional field required SHALL be made in the same change that regenerates the contract and every client of the web, so the web and the API are deployed together. (API-D03)

#### Scenario: A renamed field
- **WHEN** a developer renames a response field and runs the tests without regenerating the contract and the web's client
- **THEN** the contract test fails and names the field

### Requirement: Standard error body
Every 4xx and 5xx answer of the API SHALL have the content type `application/problem+json` and an RFC 9457 body: `type`, `title` and `status` of the HTTP status; `detail`, a message for people written in {api.message_language}; and the extensions `code`, an UPPER_SNAKE_CASE identifier that stays the same across releases, and `requestId`. A client SHALL decide what to do from `status` and `code` only, never from the text. No answer SHALL contain a stack trace, SQL text, an exception type name, a file path or a host name. (API-D04, API-D05)

#### Scenario: Unexpected server error
- **WHEN** an endpoint throws an exception that nothing handles
- **THEN** the API answers 500 with `code` `INTERNAL_ERROR`, a general `detail` and the request id, with no stack trace, and the log holds the stack trace under the same request id

#### Scenario: Message language
- **WHEN** a request fails with `NOT_FOUND`
- **THEN** `detail` is written in {api.message_language} and the web shows it without translating `code`

### Requirement: Validation answers list every field
A request whose input is wrong whatever the record's state SHALL answer 400 `VALIDATION_FAILED` with `errors`: one entry for every failing field, all at once, keyed by the field's path as the request names it (such as `lines[0].quantity`), each holding one or more messages in {api.message_language}. A body that is not valid JSON, or a value of the wrong type, SHALL answer the same way, naming the field when it is known. Nothing SHALL be saved. (API-D04, API-D06)

#### Scenario: Two fields wrong
- **WHEN** a save sends an empty `name` and a `quantity` of `-1` on its first line
- **THEN** the API answers 400 `VALIDATION_FAILED` with entries for `name` and `lines[0].quantity` in the same answer, and nothing is saved

#### Scenario: Broken JSON
- **WHEN** a client posts a body that is not valid JSON
- **THEN** the API answers 400 `VALIDATION_FAILED` in a problem body, not 500

### Requirement: Status codes
The API SHALL answer with these statuses and codes, and SHALL not answer 422. A record that does not exist, is deleted, or lies outside the caller's data scope SHALL get the same 404 body apart from `requestId`; which records are in scope, and what is logged, is the permission pack's rule. A refusal because of the record's current state SHALL answer 409 with a code that names the state, such as `ORDER_CLOSED`. (API-D06)

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | the input is wrong whatever the record's state |
| 401 | `UNAUTHENTICATED`, `SESSION_EXPIRED`, `TOKEN_EXPIRED` | no session, or it ended; `TOKEN_EXPIRED` means the access token ran out and the app refreshes once (sign-in pack) |
| 403 | `ACCESS_DENIED`, and the sign-in pack's `CSRF_FAILED` and `ORIGIN_REFUSED` | signed in, but without the right |
| 404 | `NOT_FOUND` | no such record, deleted, outside the caller's scope, or an unknown path |
| 409 | `<RESOURCE>_CHANGED`, or a code that names the state | a stale write, or the current state forbids the action |
| 413 | `PAYLOAD_TOO_LARGE` | the body is larger than the limit |
| 429 | `TOO_MANY_REQUESTS` | over the rate limit |
| 500 | `INTERNAL_ERROR` | anything unexpected |
| 503 | `DATABASE_UNAVAILABLE`, or `<SYSTEM>_UNAVAILABLE` | the database or a system the request needs does not answer |

#### Scenario: A record outside the scope
- **WHEN** `clerk01` opens a customer outside their data scope, and then an id that does not exist
- **THEN** both answers are 404 `NOT_FOUND` with the same body apart from `requestId`

#### Scenario: A state that forbids the action
- **WHEN** `clerk01` approves an order that is already closed
- **THEN** the API answers 409 `ORDER_CLOSED` and nothing changes

### Requirement: Stale writes
Every read model of a record that people edit SHALL carry its `version`. Every `PUT`, action `POST` and `DELETE` on such a record SHALL carry the `version` the page read. A `version` older than the stored one SHALL answer 409 `<RESOURCE>_CHANGED`, such as `ORDER_CHANGED`, and change nothing; a missing `version` SHALL answer 400 `VALIDATION_FAILED` on field `version`. A successful write SHALL return the new `version`. How the version is stored is the audit pack's rule. (API-D07)

#### Scenario: Two people save one order
- **WHEN** `clerk01` and `clerk02` open the same order, `clerk01` saves, then `clerk02` saves
- **THEN** `clerk02` gets 409 `ORDER_CHANGED`, `clerk01`'s change stays, and `clerk02`'s page keeps what was typed and offers to reload

#### Scenario: No version sent
- **WHEN** a client saves an order without `version`
- **THEN** the API answers 400 `VALIDATION_FAILED` on field `version` and nothing is saved

### Requirement: Paged lists
Every endpoint that returns a list SHALL take `page`, starting at 1 and 1 by default, and `pageSize`, from 1 to {api.page_size_max} and {api.page_size_default} by default. It SHALL answer `items`, `total` (every matching row before paging), `page` and `pageSize`. A `page` below 1, or a `pageSize` outside its range, SHALL answer 400 `VALIDATION_FAILED` on that parameter. A page past the end SHALL return an empty `items` with the true `total`. (API-D08)

#### Scenario: Middle page
- **WHEN** 137 rows match and the client asks for `page=2&pageSize=50`
- **THEN** `items` holds rows 51 to 100 and `total` is 137

#### Scenario: Page past the end
- **WHEN** 137 rows match and the client asks for `page=9&pageSize=50`
- **THEN** `items` is empty and `total` is 137

#### Scenario: Page size too large
- **WHEN** the client asks for a `pageSize` one above {api.page_size_max}
- **THEN** the API answers 400 `VALIDATION_FAILED` on `pageSize`

### Requirement: Sort and search
Each list SHALL name its default order and the fields it sorts by. `sort` SHALL take field names separated by commas, a leading `-` meaning descending, such as `sort=-createdAt,code`; a field the list does not name SHALL answer 400 `VALIDATION_FAILED` on `sort`. Every order SHALL end with the record id, so pages neither repeat nor skip a row when values tie. `search` SHALL be trimmed, matched ignoring case as contained in the fields the list names, and hold at most {api.search_max_length} characters, else 400 on `search`; an empty `search` SHALL mean no search. Filters SHALL be named query parameters, combined with AND. (API-D08)

#### Scenario: Unknown sort field
- **WHEN** a client sorts customers by `password`
- **THEN** the API answers 400 `VALIDATION_FAILED` on `sort`

#### Scenario: Equal values across pages
- **WHEN** 60 customers share one city and the client pages through them 50 at a time, sorted by city
- **THEN** the two pages together hold each of the 60 customers exactly once

#### Scenario: Search ignores case and spaces
- **WHEN** a client searches customers for `  acme `
- **THEN** a customer named `ACME Trading` is listed

### Requirement: Dates and times on the wire
Instants SHALL be sent as ISO-8601 in UTC with `Z`, and accepted with any explicit offset; an instant without an offset SHALL answer 400 `VALIDATION_FAILED` on its field. Calendar dates without time SHALL travel as `YYYY-MM-DD`. Instants SHALL be stored in UTC and calendar dates as dates. Today, a due date reached, and a day range SHALL be worked out in {api.time_zone}; the filters `from` and `to` SHALL be days in {api.time_zone}, both included, and a `to` before `from` SHALL answer 400 on `to`. Formatting for people SHALL happen only in the web. (API-D09)

#### Scenario: An instant in an answer
- **WHEN** an answer holds an instant stored as 26 September 2026, 17:30 UTC
- **THEN** the JSON value is `2026-09-26T17:30:00Z`, never a formatted date such as `26/09/2026`

#### Scenario: An instant without an offset
- **WHEN** a client sends `2026-09-26T17:30:00` with no offset
- **THEN** the API answers 400 `VALIDATION_FAILED` on that field

#### Scenario: A day in the system time zone
- **WHEN** a row was saved at 23:30 on 26 September 2026 in {api.time_zone} and a client filters `from=2026-09-26&to=2026-09-26`
- **THEN** the row is listed, whatever its date in UTC

### Requirement: One clock
Every rule that reads the current time or today, such as expiry, retention, due dates, scheduled jobs and who-and-when columns, SHALL read one clock service. Business code SHALL not read the machine's time itself, and an architecture test SHALL fail on such a read outside the clock. Tests SHALL replace the clock to set and move time. No endpoint SHALL move the clock. (API-D10)

#### Scenario: An expiry in a test
- **WHEN** a test sets the clock one minute before a link expires and moves it two minutes on
- **THEN** the link is refused as expired, with no waiting

#### Scenario: Code reads the machine's time
- **WHEN** a developer reads the machine's current time in a Service
- **THEN** the architecture test fails and names the location

### Requirement: Liveness and readiness
`GET {api.route_prefix}/health` SHALL answer 200 while the process serves, without touching the database, with `status` and whether prototype mode is on. `GET {api.route_prefix}/health/ready` SHALL answer 200 when the database answers, and 503 `DATABASE_UNAVAILABLE` in a problem body when it does not. Neither SHALL need a sign-in or count toward the rate limit, and neither SHALL reveal a connection string, a host name, a credential or a library version. (API-D11, API-D23)

#### Scenario: Healthy
- **WHEN** the database answers
- **THEN** both endpoints answer 200

#### Scenario: Database down
- **WHEN** the database cannot be reached
- **THEN** `/health` answers 200, and `/health/ready` answers 503 `DATABASE_UNAVAILABLE` with no connection details

### Requirement: Published API contract
The OpenAPI document SHALL be generated from the API's code and committed at {api.contract_path}. The test suite SHALL fail when the committed file differs from the document the API produces, and name the difference. Every endpoint SHALL declare its success answer and its error answers with the problem body. Every client of the web that calls the API SHALL be generated from that file, not written by hand. Testing controls SHALL not be in the contract. (API-D12)

#### Scenario: Endpoint added without updating the contract
- **WHEN** a developer adds an endpoint and runs the tests without regenerating {api.contract_path}
- **THEN** the contract test fails and names the new path

### Requirement: API documents by environment
In Development, Prototype and Staging the API SHALL serve the OpenAPI document at `{api.route_prefix}/openapi.json` and a page to read and try it at `{api.route_prefix}/docs`. In Production both SHALL answer 404. (API-D13, API-D22)

#### Scenario: Staging
- **WHEN** a tester opens `{api.route_prefix}/docs` on Staging
- **THEN** the page lists every endpoint of the contract

#### Scenario: Production
- **WHEN** someone opens `{api.route_prefix}/openapi.json` on Production
- **THEN** the API answers 404

### Requirement: Request id on every answer
Every request SHALL have one request id: the incoming {api.request_id_header} when it holds 1 to 64 letters, digits, `.`, `_` or `-`, else a new random value. Every answer, success or error, SHALL carry it in {api.request_id_header}; every error body SHALL carry it in `requestId`; every log line written for the request SHALL carry it. The web SHALL show it on an unexpected error, so the user can quote it. (API-D14)

#### Scenario: A new id
- **WHEN** a request arrives without {api.request_id_header}
- **THEN** the answer carries a new request id in that header, and the request's log lines carry the same value

#### Scenario: An id that is not safe
- **WHEN** a request arrives with a {api.request_id_header} of 200 characters
- **THEN** the API replaces it with a new id and logs the new one

### Requirement: Structured logs
The API SHALL write its logs to standard output, one JSON object per line, each with the time in UTC, the level, the message, the request id and, for a signed-in request, the actor id, never an e-mail or a name. Each finished request SHALL write one line with the method, the route template, the status and the duration. Debug lines SHALL be written only in Development. A 5xx SHALL log the exception with its stack trace; a 4xx SHALL log its `code` without one. (API-D14)

#### Scenario: A server error
- **WHEN** a request ends in 500
- **THEN** the log holds one error line with the stack trace and the request id, and the request line with status 500

#### Scenario: A refused request
- **WHEN** a request ends in 404 `NOT_FOUND`
- **THEN** the log holds the request line with status 404 and `code` `NOT_FOUND`, and no stack trace

### Requirement: No secrets in logs or answers
Logs SHALL never hold the value of a password, a token, an OTP code, a cookie, the `Authorization` header, a CSRF token, a connection string or a key; such values SHALL be written as `***`. Request and response bodies SHALL not be logged. No response model SHALL have a property whose name contains `password`, `secret`, `token` or `otp`, except names listed with a reason in one allow list; an architecture test SHALL enforce it. (API-D15)

#### Scenario: A request with an Authorization header
- **WHEN** a request carrying `Authorization: Bearer abc123` is logged
- **THEN** no log line contains `abc123`

#### Scenario: A response model with a secret-looking property
- **WHEN** a developer adds a response model with a property named `PasswordHash`
- **THEN** the architecture test fails and names the model

### Requirement: Rate limit on anonymous requests
Requests without a session SHALL be limited to {api.anonymous_requests_per_minute} a minute per client address; the next one SHALL answer 429 `TOO_MANY_REQUESTS` with `Retry-After` in seconds, and run nothing. The client address SHALL be read from the proxy's forwarded header only for a request that came from the known proxy. The health endpoints SHALL not count. Signed-in requests SHALL not be limited by this rule, and the sign-in pack's lock after repeated failures SHALL count on its own. (API-D16)

#### Scenario: Over the limit
- **WHEN** one address sends {api.anonymous_requests_per_minute} forgot-password requests within a minute and then one more
- **THEN** the last answers 429 `TOO_MANY_REQUESTS` with `Retry-After`, and no e-mail is queued for it

#### Scenario: A forged address
- **WHEN** a client that is not the proxy sends its own forwarded header with another address
- **THEN** the limit counts the client's real address

### Requirement: Cross-origin requests
The web and the API SHALL share one origin through the proxy, and the API SHALL send no CORS allow headers by default, so a browser page of another origin cannot read its answers. When {api.cors_origins} lists origins, only those, matched on scheme, host and port, SHALL get allow headers, with credentials; `*` SHALL never be used. (API-D17)

#### Scenario: Another site calls the API
- **WHEN** a page on another origin calls `GET {api.route_prefix}/customers` from a browser
- **THEN** the answer carries no CORS allow header and the browser does not hand it to the page

### Requirement: Reverse proxy routing and request size
One proxy SHALL stand in front of the system. For each {portal} it SHALL serve the web, forward every path under {api.route_prefix} to the API with the host, port and scheme the browser used and the client's address, and answer an unknown page path with that {portal}'s 404 page. It SHALL refuse a body over {api.body_max_mb} MB with 413 without passing it on, and the API SHALL refuse the same size with 413 `PAYLOAD_TOO_LARGE`. Outside Development and Prototype it SHALL serve HTTPS only and redirect HTTP to HTTPS. Every answer SHALL carry `X-Content-Type-Options: nosniff`, and pages SHALL not be framed by other sites. Each {portal} SHALL have its own host name or port, so one can be closed to the internet. (API-D18)

#### Scenario: Body over the limit
- **WHEN** a client posts a body one megabyte over {api.body_max_mb} MB to any API path
- **THEN** the proxy answers 413 and the API never sees the request

#### Scenario: Host and port reach the API
- **WHEN** a browser calls the API through the proxy on a local stack at `http://localhost:8090`
- **THEN** the API sees the host `localhost:8090` and the scheme `http`

#### Scenario: Plain HTTP in Production
- **WHEN** a browser opens a page of Production over HTTP
- **THEN** the proxy redirects it to the same address over HTTPS

### Requirement: Secrets only from the environment
Credentials, such as the database password, the SMTP password and the keys of other systems, SHALL come only from environment variables or the host's secret store. No committed file SHALL hold a real secret, and `.env.example` SHALL hold placeholders only. When a required secret is missing, the API SHALL stop at start with a message that names the setting and no value. Outside Development, a secret equal to its placeholder in `.env.example` SHALL stop the API at start the same way. (API-D19)

#### Scenario: Missing database password
- **WHEN** the API starts without the database password setting
- **THEN** it stops with a message naming that setting

#### Scenario: Placeholder in Staging
- **WHEN** the API starts in Staging with the SMTP password still equal to its placeholder
- **THEN** it stops with a message naming the SMTP password setting and no value

### Requirement: One command starts the stack
`docker compose up` with the project's compose file SHALL start the proxy, the API, the database and every web container. The database SHALL have a healthcheck, and the API SHALL start after it is healthy. After that, every {portal} and `{api.route_prefix}/health/ready` SHALL answer through the proxy. (API-D20)

#### Scenario: Fresh start
- **WHEN** a developer copies `.env.example` to `.env` and runs the compose command on a clean machine
- **THEN** each {portal} answers its first page and `{api.route_prefix}/health/ready` answers 200 through the proxy

### Requirement: Memory limits
Every container SHALL have a memory limit: the proxy {api.memory_proxy_mb} MB, the API {api.memory_api_mb} MB including the background jobs it runs, each server-rendered web {api.memory_web_mb} MB, and the database {api.memory_db_mb} MB. (API-D20)

#### Scenario: Limits in the compose file
- **WHEN** the stack is running
- **THEN** the container limits read {api.memory_proxy_mb} MB for the proxy, {api.memory_api_mb} MB for the API and {api.memory_db_mb} MB for the database

### Requirement: Database ready before the API serves
At start the API SHALL wait up to {api.db_wait_seconds} seconds for the database, apply the pending migrations as the schema owner, and only then serve requests as the application's role. If the database does not answer in time, or a migration fails, the process SHALL exit with an error and never answer a request. The schema SHALL change only through migrations, and the tables of the background-job library SHALL live in their own schema, outside the application's migrations. (API-D21)

#### Scenario: Migration fails
- **WHEN** a pending migration fails at start
- **THEN** the API process exits with an error and never answers a request

#### Scenario: Database starts late
- **WHEN** the database becomes ready 20 seconds after the API starts
- **THEN** the API applies the migrations and then serves

#### Scenario: Background-job tables
- **WHEN** the API has started once on an empty database
- **THEN** the background-job tables are in their own schema and the migration history lists only application migrations

### Requirement: Environments
One setting SHALL name the environment: Development, Prototype, Staging or Production; a missing or other value SHALL stop the API at start, naming the setting. The environments SHALL differ only as this table says, plus what other packs tie to prototype mode. (API-D22, API-D23)

| | Development | Prototype | Staging | Production |
|---|---|---|---|---|
| Runs on | a developer's machine | a server the customer tries | a server the customer tests on before go-live | the live server |
| Prototype mode | on | on | off | off |
| Seed accounts and example data | yes | yes | no | no |
| API document and docs page | yes | yes | yes | no |
| HTTPS only | no | no | yes | yes |
| Lowest log level | Debug | Information | Information | Information |
| Other systems | a fake or a test copy, as each integration decides | a fake or a test copy | their test copies | live |

#### Scenario: Unknown environment
- **WHEN** the API starts with the environment setting `Test`
- **THEN** it stops with a message naming the setting

#### Scenario: Staging is not a prototype
- **WHEN** the API runs in Staging
- **THEN** there are no seed accounts, the docs page answers, and plain HTTP is redirected to HTTPS

### Requirement: Prototype mode only where it belongs
The environment switch for prototype mode SHALL be on only in Development and Prototype; the API SHALL refuse to start with it on in Staging or Production, naming the setting. What other packs keep for prototype mode, such as seed accounts, the user switcher, the prototype mailbox and testing controls, SHALL not exist while it is off, and their endpoints SHALL answer 404. The answer of `{api.route_prefix}/health` SHALL say whether it is on, so the web can show its banner. (API-D23)

#### Scenario: Switch on in Production
- **WHEN** the API starts in Production with prototype mode on
- **THEN** it stops with a message naming the prototype mode setting

#### Scenario: A prototype tool with the mode off
- **WHEN** prototype mode is off and a client calls the prototype mailbox
- **THEN** the API answers 404 `NOT_FOUND`
