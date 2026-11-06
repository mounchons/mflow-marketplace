# audit requirements

The rules every stored business row follows (who acted and when, deletion that hides instead of erasing, an append-only Activity Log with old and new values written in the same transaction), and the Activity Log screen that reads it. Example people: `admin01` holds `{log_view_all_key}`; `clerk01` and `clerk02` hold `{log_view_key}` only.

### Requirement: One registry of actors
Every actor column (`created_by`, `updated_by`, `deleted_by`, `activity_log.actor_id`) SHALL reference the `actor` registry, whose `kind` is one of `{account_kinds}` or `System`. Every account table SHALL use the `id` of its account's `actor` row. Exactly one `System` actor SHALL exist from the first migration, with no account row and so no credential; it SHALL be the actor of every write made without a signed-in account, including jobs, seeds, migrations and purges. A write made through a password link with no session SHALL have the link's owner as its actor. A job started by a person SHALL have that person as the actor of the save that starts it. Registry rows SHALL never be updated or deleted. (AUDIT-D02, AUDIT-D03)

#### Scenario: A job writes a row
- **WHEN** a scheduled job creates a row while no one is signed in
- **THEN** the row's `created_by` and its Activity Log entry's actor are the `System` actor

#### Scenario: A password-link write
- **WHEN** a password change arrives through a valid password link with no session
- **THEN** the link's owner is the actor, not `System`

#### Scenario: Exactly one System actor
- **WHEN** the migrations have run on an empty database
- **THEN** exactly one actor of kind `System` exists, and a second insert of kind `System` is refused

#### Scenario: Registry rows stay
- **WHEN** code tries to update or delete an `actor` row
- **THEN** the save is refused

### Requirement: Who and when columns are set automatically
On insert the save SHALL set `created_at` (UTC) and `created_by`; on update of an editable table it SHALL set `updated_at` and `updated_by`, from the current actor, in the same save. Values that application code sets for these columns SHALL be overwritten. Times SHALL be stored in UTC and shown in the system time zone. (AUDIT-D01)

#### Scenario: Insert and later edit
- **WHEN** `clerk01` creates a row and `clerk02` edits it later
- **THEN** `created_by` is `clerk01`, `updated_by` is `clerk02`, and `updated_at` is later than `created_at`

#### Scenario: Code tries to forge the creator
- **WHEN** a Service sets `created_by` to another actor before saving
- **THEN** the stored `created_by` is the current actor

### Requirement: Business rows are soft-deleted
Deleting a row of a business table SHALL set `is_deleted` to true with `deleted_at`, `deleted_by` and, when given, `deleted_reason` of at most {audit.deleted_reason_max} characters, in the same save, and the row SHALL stay in the table. The database SHALL reject a row whose `is_deleted` and `deleted_at` disagree. (AUDIT-D05)

#### Scenario: Delete a business row
- **WHEN** `clerk01` deletes a row with the reason "created by mistake"
- **THEN** the row remains with `is_deleted` true, `deleted_at` set, `deleted_by` `clerk01` and `deleted_reason` "created by mistake"

#### Scenario: Inconsistent delete columns
- **WHEN** a statement sets `is_deleted` to true while `deleted_at` stays empty
- **THEN** the database rejects it

#### Scenario: Reason too long
- **WHEN** a delete gives a reason one character longer than {audit.deleted_reason_max}
- **THEN** the delete is refused with a validation error on the reason and the row is unchanged

### Requirement: Deleted rows are hidden by one named filter
Queries SHALL exclude deleted rows by default through one filter named `SoftDelete`. Only history views MAY turn off that filter, and they SHALL leave every other filter, such as data scope, on. Unique rules on deletable tables SHALL ignore deleted rows, so a deleted value can be used again. (AUDIT-D06)

#### Scenario: Default query
- **WHEN** a list query runs over a table with one deleted and two live rows
- **THEN** it returns the two live rows

#### Scenario: History view
- **WHEN** a history view turns off only `SoftDelete`
- **THEN** it returns all three rows while every other filter still applies

#### Scenario: Reuse of a unique value
- **WHEN** a row with code `C-100` is deleted and a new row with code `C-100` is created
- **THEN** the new row is saved

### Requirement: Hard delete only for transient tables
Removing a row SHALL be allowed only for the transient tables the project lists: sessions, sign-in attempts, password links, staged uploads, staged imports and logs of calls to other systems. Removing a row of any other table SHALL fail, and the codebase SHALL hold no bulk or raw SQL delete outside those tables; an architecture test SHALL enforce it. A daily purge SHALL delete call logs after {audit.call_log_days} days, and a staged import {audit.import_staging_closed_days} days after it was committed or cancelled, or {audit.import_staging_open_days} days after it was last changed while still open. A purge SHALL write no Activity Log entry and SHALL touch no business row. Packs that own other transient tables set their own ages. (AUDIT-D07)

#### Scenario: Remove a non-transient row
- **WHEN** code removes a row of a business table
- **THEN** the save fails with an error naming the table and nothing is written

#### Scenario: Bulk delete in code
- **WHEN** a developer adds a bulk delete or a raw SQL `DELETE` on a business table
- **THEN** the architecture test fails and names the location

#### Scenario: Purge of call logs
- **WHEN** the purge runs
- **THEN** call log rows older than {audit.call_log_days} days are deleted without an Activity Log entry, and no business row is touched

#### Scenario: Purge of a closed import
- **WHEN** the purge runs one day after a staged import reached {audit.import_staging_closed_days} days since it was committed
- **THEN** the staged import and its rows are deleted without an Activity Log entry

### Requirement: Keys
New rows SHALL get time-ordered uuid (version 7) keys, except `activity_log` (a serial id), catalog tables with natural keys, account tables (the `id` of their `actor` row) and master tables keyed by a code that other systems use. (AUDIT-D08, AUDIT-D09)

#### Scenario: Key order
- **WHEN** two rows are created one after the other
- **THEN** both ids are uuid version 7 and the second sorts after the first

#### Scenario: A master table keyed by its code
- **WHEN** another system sends a record with code `P-0042` for a master table keyed by its code
- **THEN** the record is stored and found by `P-0042` without a lookup to an internal id

### Requirement: Concurrent edits
Tables several people edit SHALL detect a concurrent change: the second save of a stale row SHALL fail with a concurrency error instead of overwriting. (AUDIT-D10)

#### Scenario: Stale edit
- **WHEN** `clerk01` and `clerk02` load the same row, `clerk01` saves, then `clerk02` saves
- **THEN** `clerk02`'s save fails with a concurrency error and `clerk01`'s change stays

### Requirement: Every change leaves an Activity Log entry in the same transaction
Each save that inserts, updates or deletes business rows SHALL write one `activity_log` row per changed row, in the same transaction, holding the actor, the actor's role at that time, the time, the action, the document type and id, the table and row, and the old and new value of every changed field. The action SHALL be the name the Service gives, such as `Approve` or `Revoke`, else `Create`, `Edit` or `Delete`. A field marked secret SHALL be recorded as changed with no value. If the log cannot be written, the business change SHALL not be saved. (AUDIT-D04, AUDIT-D11, AUDIT-D12, AUDIT-D19)

#### Scenario: Edit with a named action
- **WHEN** a Service approves a document, changing `status` from Pending to Approved
- **THEN** one entry is written with action `Approve` and a detail holding `status` old Pending, new Approved

#### Scenario: Plain edit without a named action
- **WHEN** a Service changes a contact's phone number without naming an action
- **THEN** the entry's action is `Edit` with the old and new phone number

#### Scenario: Secret field changed
- **WHEN** a password hash changes
- **THEN** the entry lists the field as changed and holds neither the old nor the new value

#### Scenario: Log write fails
- **WHEN** writing the Activity Log fails
- **THEN** the business change is rolled back

### Requirement: Records that are their own log
Rows that are a record in themselves (work queues such as the mail outbox, logs of sync runs and their items, the send log of each e-mail attempt) SHALL carry their who-and-when columns and keep their own rules, but SHALL write no Activity Log row of their own. The action that creates them SHALL write its one entry, as an approval that queues an e-mail does, and a save of these rows that a Service names, such as a run started by a person, SHALL write its one named entry. (AUDIT-D13)

#### Scenario: A queued e-mail
- **WHEN** an approval queues an e-mail and the sender later marks it sent
- **THEN** the approval's entry is written, and neither the queue row's insert nor its update writes an entry

#### Scenario: A run started by a person
- **WHEN** `admin01` starts a sync job by hand and the save that starts its run is named `ManualTrigger`
- **THEN** that save writes one `ManualTrigger` entry naming `admin01`, and the run's later saves write none

### Requirement: Activity Log is append-only and kept
The application's database role SHALL be unable to update or delete Activity Log rows, and the API SHALL have no call that changes or deletes them. Entries SHALL be kept for at least {audit.log_retention_months} months; no purge SHALL remove them. (AUDIT-D14, AUDIT-D16)

#### Scenario: Attempt to change an entry
- **WHEN** the application's database role runs an UPDATE or a DELETE on `activity_log`
- **THEN** the database refuses it

### Requirement: Read the Activity Log
The API SHALL answer `GET {api_prefix}/activity-log` to a holder of `{log_view_key}` with one page of entries, newest first, with `items` and `total` and the count of each tab. The page size SHALL be 1 to {audit.page_size_max}, {audit.page_size_default} by default. A caller without `{log_view_key}` SHALL get 403 `ACCESS_DENIED` and no rows, and the refusal SHALL be logged as an `AccessDenied` entry. Each entry SHALL hold the time, the actor (id, name, kind, and whether the account is deleted), the role written with the rows, the stored action and its filter group, the document type and id, and its detail. The API SHALL have no call that changes, deletes or exports entries. (AUDIT-D14, AUDIT-D15, AUDIT-D19)

#### Scenario: An approval shows in the log
- **WHEN** `clerk01` approves order `ORD-0012` and then reads the Activity Log
- **THEN** the first entry has action `Approve` in group Approve, document type Order, the order's id, `clerk01` as actor with the role `clerk01` had at the time, and the time of the approval

#### Scenario: Role stays as written
- **WHEN** `clerk01` approved an order as a member of group Purchasing and later moved to another group
- **THEN** the entry of that approval still shows the role Purchasing

#### Scenario: Without the View right
- **WHEN** an account without `{log_view_key}` calls the Activity Log
- **THEN** the API answers 403 `ACCESS_DENIED`, returns no rows, and an `AccessDenied` entry is written

### Requirement: Rows each caller sees
A holder of `{log_view_all_key}` SHALL see every row. Every other holder of `{log_view_key}` SHALL see only the rows they made, whatever the filters ask; asking for another user's rows SHALL return an empty page with no error and no `AccessDenied` entry. The answer SHALL say which of the two the caller has. No data scope SHALL limit the rows. (AUDIT-D17)

| Caller | User filter | Rows |
|---|---|---|
| holds `{log_view_all_key}` | none | every row |
| holds `{log_view_all_key}` | one account | that account's rows |
| `{log_view_key}` only | none | the caller's own rows |
| `{log_view_key}` only | another account | none |

#### Scenario: Every row
- **WHEN** `admin01` reads the Activity Log after `clerk01` approved an order and `clerk02` rejected another
- **THEN** both entries are listed, and the answer says the caller sees all rows

#### Scenario: One user picked
- **WHEN** `admin01` reads the Activity Log with User `clerk01`
- **THEN** only `clerk01`'s entries are listed

#### Scenario: Own rows only
- **WHEN** `clerk01` reads the Activity Log after approving an order
- **THEN** only `clerk01`'s entries are listed, and the answer says the caller sees only their own rows

#### Scenario: Another user asked for
- **WHEN** `clerk01` reads the Activity Log with User `admin01`
- **THEN** the page is empty with total 0, and no `AccessDenied` entry is written

### Requirement: One entry per save
The rows one save wrote SHALL form one entry: they share the actor, the time, the action, the document type and the document id. Rows that differ in any of these SHALL be separate entries. Paging and every count SHALL count entries, not rows. (AUDIT-D18)

#### Scenario: An approval that changed several rows
- **WHEN** `admin01` approves a document and the save writes rows for the document, its files and its recipients
- **THEN** the Activity Log shows one `Approve` entry for the document, and `total` counts it once

#### Scenario: Two saves of one document
- **WHEN** `admin01` saves a notice's audience and then publishes it
- **THEN** the Activity Log shows a `SaveAudience` entry and a `Publish` entry for that notice

### Requirement: Filters
The list SHALL take these filters together:
- **User:** one account or System, from the options of requirement "User options".
- **Action:** one group. Each stored action SHALL belong to exactly one group, and an action the table does not name SHALL belong to Other.
- **Document type:** one of `{document_types}`.
- **Date from** and **Date to:** days in the system time zone, both included, each between {audit.date_min} and {audit.date_max}. A date outside them SHALL answer 400 `VALIDATION_FAILED` on its field and list nothing. A Date to before Date from SHALL answer 400 `VALIDATION_FAILED` on field `to` and list nothing.
- **Tab:** requirement "Tabs and their counts".

The list SHALL always be newest first; a `sort` SHALL answer 400 `VALIDATION_FAILED` on field `sort`. (AUDIT-D20)

| Group | Stored actions |
|---|---|
| SignIn · เข้าสู่ระบบ | Login, Logout, LoginFailed, LoginRefused, LoginLocked |
| Approve · อนุมัติ | Approve |
| Reject · ไม่อนุมัติ | Reject and every action that starts with Reject |
| Create · สร้าง | Create, Add, Upload and every action that starts with Create or Add |
| Edit · แก้ไข | Edit, Save, Set, Enable, Disable, Restore, Reinvite, ResetPassword, PasswordChanged, PasswordLinkRequested, TermsAccepted and every action that starts with Edit, Save or Set |
| Publish · เผยแพร่ | Publish |
| Import · นำเข้าข้อมูล | Import |
| Delete · ลบ | Delete, Remove and every action that starts with Delete or Remove |
| ManualTrigger · สั่งรันด้วยตนเอง | ManualTrigger |
| Other · อื่นๆ | every other action, such as AccessDenied, Download, Acknowledge, Withdraw |

#### Scenario: Approve, Reject and Delete of today
- **WHEN** `admin01` filters Action Approve, then Reject, then Delete, each with Date from and Date to today
- **THEN** each answer lists that day's entries of that group, each with its actor, time, document type and document id

#### Scenario: Sign-in group
- **WHEN** `admin01` filters Action SignIn
- **THEN** the Login, Logout, LoginFailed, LoginRefused and LoginLocked entries are listed, and no other action

#### Scenario: An action the table does not name
- **WHEN** `admin01` filters Action Other after `clerk01` downloaded a file
- **THEN** the `Download` entry is listed

#### Scenario: Date to before Date from
- **WHEN** a search sends a Date to one day before its Date from
- **THEN** the API answers 400 `VALIDATION_FAILED` on field `to` and lists nothing

#### Scenario: A date out of range
- **WHEN** a search sends a Date to after {audit.date_max}
- **THEN** the API answers 400 `VALIDATION_FAILED` on field `to` and lists nothing

#### Scenario: Sort asked for
- **WHEN** a search sends a `sort`
- **THEN** the API answers 400 `VALIDATION_FAILED` on field `sort` and lists nothing

### Requirement: Tabs and their counts
Each entry SHALL belong to the All tab and to exactly one of Access & authorization, Documents and Content. The answer SHALL carry the count of every tab under the other filters, whichever tab is asked for. (AUDIT-D20)

| Entry | Tab |
|---|---|
| a sign-in action, a password or terms action, or `AccessDenied`, on any document type; or document type Account, Group or Permission | Access & authorization |
| document type one of `{business_documents}`, and not an Access row | Documents |
| every other entry | Content |

#### Scenario: Four tab counts
- **WHEN** `admin01` reads the Activity Log
- **THEN** the answer carries counts for All, Access & authorization, Content and Documents, and All equals the other three together

#### Scenario: Access before Documents
- **WHEN** `admin01` asks for the Documents tab after `clerk02` was refused an order
- **THEN** the order's approvals are listed but not the `AccessDenied` entry, which is in the Access & authorization tab

#### Scenario: Counts follow the filters
- **WHEN** `admin01` filters Action Approve
- **THEN** every tab count counts only Approve entries

### Requirement: Detail of an entry
An entry's detail SHALL hold the note, file or related record the Service wrote with the action, and the changed fields of up to {audit.detail_rows_max} of the entry's rows, each with the table, the row, the field and its old and new value, plus the entry's row count. A secret field SHALL show as changed with no value. A document id of an account, a group or a role SHALL also carry its name. (AUDIT-D12, AUDIT-D22)

#### Scenario: Changed fields
- **WHEN** `admin01` renames a group from Sales to Sales Team A
- **THEN** the `Edit` entry's detail shows field `name`, old Sales, new Sales Team A, and the document id carries the name Sales Team A

#### Scenario: A large save
- **WHEN** an import wrote 300 rows in one save
- **THEN** its entry shows the changed fields of {audit.detail_rows_max} rows and a row count of 300

#### Scenario: Note of an action
- **WHEN** `admin01` approves a document whose save noted "sends 2 of 3"
- **THEN** the entry's detail holds the note "sends 2 of 3"

### Requirement: Actor names
An entry's actor SHALL be named "full name (sign-in name)", with "· deleted ลบแล้ว" when the account is deleted. The `System` actor SHALL be named "System · ระบบ", never a person's name, with the role System. (AUDIT-D21, AUDIT-D02)

#### Scenario: A job's entry
- **WHEN** a scheduled job requested a purge and `admin01` filters User System
- **THEN** the entry is listed with actor "System · ระบบ" and role System

#### Scenario: A deleted account
- **WHEN** an account that approved an order has since been deleted
- **THEN** the approval entry names it with "· deleted ลบแล้ว"

### Requirement: User options
The API SHALL answer `GET {api_prefix}/activity-log/users` to a holder of `{log_view_key}` with the accounts the User filter offers, searched by name, sign-in name or e-mail and paged with `items` and `total`, each with its id, name, kind and whether it is deleted. For a holder of `{log_view_all_key}` the options SHALL be System first, then every account of each kind, deleted ones included, in an order that stays the same from page to page when two accounts share a name. Any other caller SHALL get only themselves on the first page, and a later page SHALL be empty with total 1. (AUDIT-D17, AUDIT-D21)

#### Scenario: Options of a full viewer
- **WHEN** `admin01` asks for the user options
- **THEN** the first option is System, and the accounts follow, a deleted one with its tag

#### Scenario: Options of an own-rows caller
- **WHEN** `clerk01` asks for the user options
- **THEN** the only option is `clerk01`, named as the list names them, and page 2 is empty with total 1

### Requirement: Activity Log screen
The web SHALL show the Activity Log on `/activity-log` to a holder of `{log_view_key}`, from the two calls above only; every rule of which rows a caller sees, how rows form entries, the tabs, the counts and the names SHALL stay with the API. A user without `{log_view_key}` SHALL see no menu item, and the address SHALL show the no-access panel and read nothing. The screen SHALL hold, in this order:
- the filters (User with System first, Action Type with All then the groups, Document Type with All then `{document_types}`, Date From and Date To), with Search and Clear; a Date To before Date From SHALL show its message under Date To and SHALL not search;
- the note "You are viewing only your own actions · คุณกำลังดูเฉพาะการดำเนินการของตนเอง" when the answer says the caller sees only their own rows;
- the tabs All activity, Access & authorization, Content and Documents, each with its count;
- the table, {audit.screen_page_sizes} rows a page, newest first, no column sort: Time, User, Role ("—" when none), Action Type (the group, with the stored action under it when it differs), Document Type, Document ID with its name under it, and Detail (the note, file or related record, else the number of rows changed).

The screen SHALL open with the last {audit.default_range_days} days, and Clear SHALL bring that range back. The filters, the tab and the page SHALL be kept in the address. An entry with changed rows SHALL open under its row, one line per changed field, a secret field as "Changed · เปลี่ยนแปลง" with no value, and "Showing N of M rows" when it holds more rows than it shows. The screen SHALL have no button that changes, deletes or exports an entry. An empty list SHALL say "No activity in this scope yet" while no filter differs from the opening range, and "No results for these filters" with Clear filters otherwise; a failed read SHALL show its error with Retry. (AUDIT-D15, AUDIT-D17, AUDIT-D20, AUDIT-D21, AUDIT-D22)

#### Scenario: A full viewer opens the screen
- **WHEN** `admin01` opens Activity Log
- **THEN** the table has Time, User, Role, Action Type, Document Type, Document ID and Detail, the four tabs show their counts, the dates cover the last {audit.default_range_days} days, and no row or page has an edit, delete or export button

#### Scenario: Own actions only
- **WHEN** `clerk01` approves an order and opens Activity Log
- **THEN** the note says they are viewing only their own actions, the approval is listed, and no entry of `admin01` is listed

#### Scenario: Without the View right
- **WHEN** a user without `{log_view_key}` opens `/activity-log`
- **THEN** the menu has no Activity Log item, the page shows the no-access panel, and no Activity Log call is made

#### Scenario: Switching tabs keeps the filters
- **WHEN** `admin01` filters Action Type Edit and picks the Access & authorization tab
- **THEN** the list shows the Edit entries of that tab, the four counts count Edit entries, and the address keeps the filter and the tab

#### Scenario: Clear brings the range back
- **WHEN** a user sets Date From a month back, searches, then presses Clear
- **THEN** the dates cover the last {audit.default_range_days} days again and every other filter is empty

#### Scenario: Detail of a large save
- **WHEN** `admin01` opens the entry of an import that wrote 300 rows
- **THEN** the detail shows the changed fields of {audit.detail_rows_max} rows and says it shows {audit.detail_rows_max} of 300 rows

#### Scenario: A failed read
- **WHEN** the Activity Log call fails
- **THEN** the table shows the error with Retry, and Retry reads the page again
