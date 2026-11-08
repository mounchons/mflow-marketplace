# import-export: requirements

Importing records from an Excel file and exporting a list to one. Each `{import_target}` is described once by a column definition (key, header, required, type, length, allowed values, whether a file may overwrite it); the template and the reader both use it. Each `{list}` has an export definition. Example people: `importer01` holds `{import_key}` of Customer and a `{scope}` of branches `B01` and `B02`; `importer02` holds it too; `clerk01` is signed in without it. A Customer is matched on `code`. The values below are the defaults of `params.md`.

### Requirement: Who may import, and whose batch it is
Every import call SHALL need `{import_key}` of its `{import_target}`; without it the API SHALL answer 403 `ACCESS_DENIED` and do nothing else. A batch SHALL belong to the account that uploaded it. Another account asking for it, and an id that does not exist, SHALL get the same 404 `NOT_FOUND`. (IMPEX-D01)

#### Scenario: Without the key
- **WHEN** `clerk01` posts a file to the import of Customer
- **THEN** the answer is 403 `ACCESS_DENIED`, and no batch is created

#### Scenario: Another importer's batch
- **WHEN** `importer02` asks for the result of a batch `importer01` uploaded
- **THEN** the answer is 404 `NOT_FOUND`, the same as for an unknown id

### Requirement: Column definition and template
Each `{import_target}` SHALL have one column definition in code, and the reader, the check and the template SHALL use only it. `GET {api_prefix}/import-templates/<target>` SHALL build an `.xlsx` from the definition when called: a first sheet holding only the header row, each required column's header ending in ` *`, and code columns formatted as text; and a second sheet `คำอธิบาย` naming each column's rule and an example. The reader SHALL ignore that second sheet, and the template SHALL hold no example row in its data sheet. (IMPEX-D04)

#### Scenario: A new column
- **WHEN** a developer adds a column to the Customer definition
- **THEN** the next template has that column and the reader accepts it, with no other change

#### Scenario: The template uploaded unchanged
- **WHEN** `importer01` downloads the template and uploads it unchanged
- **THEN** the file passes its structure check, and the result says there is no row to import

#### Scenario: A code column keeps its zeros
- **WHEN** `importer01` types `00123` into the `code` column of the template and saves
- **THEN** the cell stays the text `00123`

### Requirement: Accepted import file
`POST {api_prefix}/import-batches` SHALL take one `.xlsx` file and the `target`, whatever `upload.extensions` holds. The file SHALL pass the same content, name and storage rules as an upload: its extension compared without case, more than 0 bytes, content that is an Office spreadsheet, a name cleaned for display, a storage key made by the system. Any other file, including `.xls`, `.csv` and `.xlsm`, SHALL answer 400 `VALIDATION_FAILED` on `file`, naming the rule and telling the user to save as `.xlsx`; no batch SHALL be created and nothing SHALL be stored. Malware scanning, where the project scans, SHALL apply as to any upload. (IMPEX-D02, UPL-D04, UPL-D05, UPL-D06, UPL-D15)

#### Scenario: Old Excel format
- **WHEN** `importer01` uploads `customers.xls`
- **THEN** the answer is 400 `VALIDATION_FAILED` on `file` asking for `.xlsx`, and no batch is created

#### Scenario: A renamed file
- **WHEN** a PDF is uploaded as `customers.xlsx`
- **THEN** the answer is 400 `VALIDATION_FAILED` "not an Excel file"

#### Scenario: Excel is off the attachment list
- **WHEN** an administrator takes .xlsx off `upload.extensions` and `importer01` uploads a good `.xlsx` to the import
- **THEN** the file is accepted

### Requirement: Limits of an import file
A file SHALL be refused whole with 400 `VALIDATION_FAILED` on `file`, naming the limit, when it is over {import-export.import_max_file_mb} MB, has more than {import-export.import_max_rows} rows below the header row, has a sheet with more than {import-export.import_max_columns} columns, has more than {import-export.import_max_sheets} sheets, has a cell over {import-export.import_max_cell_chars} characters, or unpacks to more than {import-export.import_max_unpacked_mb} MB. The unpacked size SHALL be counted from the bytes actually read, before any sheet is read, and SHALL stop at the first byte past the limit. A file that cannot be read SHALL answer 400 `VALIDATION_FAILED`, never 500. (IMPEX-D03)

#### Scenario: Too many rows
- **WHEN** a file has {import-export.import_max_rows} rows and one more below its header
- **THEN** it is refused with a message naming {import-export.import_max_rows} rows, and no row is kept

#### Scenario: A small file that unpacks huge
- **WHEN** a file of a few kilobytes unpacks to more than {import-export.import_max_unpacked_mb} MB
- **THEN** it is refused before any sheet is read, and the server's memory does not grow with the unpacked size

#### Scenario: A broken workbook
- **WHEN** a file passes the content check but one of its sheets cannot be read
- **THEN** it is refused with 400 `VALIDATION_FAILED`, not a server error

### Requirement: Sheets, headers and empty rows
The reader SHALL look at row 1 of each sheet, whatever its name, order or visibility. The data sheet SHALL be the one sheet holding every required column of the definition. No such sheet, or two of them, SHALL refuse the file, naming the required headers or both sheets. A header SHALL match the definition ignoring case, spaces at both ends, a trailing ` *` and the difference between a space and `_`; columns SHALL be accepted in any order. A missing required column, a header twice, and a named column the definition does not know SHALL refuse the file, naming the sheet and each column at fault. A column with an empty header SHALL be skipped. A row whose cells are all empty SHALL be skipped without shifting the row numbers. Hidden rows and hidden columns SHALL be read as any other. A rejected file SHALL answer 400 `VALIDATION_FAILED` on `file` with every problem named. (IMPEX-D05)

#### Scenario: Renamed sheet, moved columns
- **WHEN** the data sheet is named `Sheet7` and its columns are in another order
- **THEN** the file is read as if it were the template

#### Scenario: Wrong headers
- **WHEN** a file has a column headed `Remark` that the definition does not know, and lacks `Name`
- **THEN** it is refused naming `Remark` as unknown and `Name` as missing, and no row is checked

#### Scenario: A second data sheet
- **WHEN** a visible sheet and a hidden sheet both hold every required column
- **THEN** the file is refused naming both sheets

#### Scenario: Other sheets ignored
- **WHEN** a file has the data sheet and a sheet `Notes` of other headers
- **THEN** the file is read, and nothing of `Notes` is checked or kept

#### Scenario: Empty rows between data
- **WHEN** rows 2 and 5 hold data and rows 3 and 4 are empty
- **THEN** two rows are read, numbered 2 and 5

### Requirement: The whole file is checked before anything is saved
A file that passes the structure check SHALL make one batch at stage `Checked` holding one `import_row` per data row with the values as read and all of that row's errors, checked against every rule of the definition and the current data without stopping at the first. Rows SHALL be numbered as Excel numbers them, the header being row 1. No business record SHALL be written by the check. A file checked in the background SHALL end at stage `Checked`, or at `Failed` with its file problems named. The batch and its rows are transient tables. (IMPEX-D06, IMPEX-D15, AUDIT-D07)

#### Scenario: Two wrong cells in one row
- **WHEN** row 9 has an empty `Name` and a `Credit limit` of `abc`
- **THEN** row 9 holds both errors, one for each column

#### Scenario: Nothing written
- **WHEN** a batch is `Checked` and `importer01` looks for its new customers in the list in another tab
- **THEN** none is there

### Requirement: Check result
`GET {api_prefix}/import-batches/<id>` SHALL answer the stage, the file name, the sheet name, the rows done and in all, the rows good and bad, and the counts to create and to update. `GET {api_prefix}/import-batches/<id>/rows` SHALL page the rows, filtered by `status` good or bad, sorted by row number, each with its row number, its action and each error's column and reason. A file with no data row SHALL show that nothing can be imported and SHALL not be committable. (IMPEX-D06)

#### Scenario: Good and bad rows
- **WHEN** a file of 120 rows has 3 bad rows and 100 of its good rows are new
- **THEN** the batch shows 117 good, 3 bad, 100 to create and 17 to update, and the bad filter lists the 3 rows with row number, column and reason

#### Scenario: No data rows
- **WHEN** a file has only its header row
- **THEN** the result says there is no row to import, and a commit answers 409 `IMPORT_NO_ROWS`

### Requirement: A file with bad rows warns first, then saves the good rows
A batch with bad rows SHALL warn before anything is saved: the result SHALL show the counts of good and bad rows, and the user SHALL be able to see each bad row with its row number, column and reason, and download the error report. Confirm SHALL name the records to create, the records to update and the rows that will not be imported. On confirm, the commit SHALL write only the records all of whose rows are good and leave every other row in the error report; a record spread over several rows SHALL be left out whole when one of its rows is bad. Cancel SHALL write nothing. A batch with no good row SHALL keep Confirm off, and its commit SHALL answer 409 `IMPORT_NO_GOOD_ROWS` and write nothing. Where the project takes the whole file or nothing (IMPEX-D07 b), a batch with any bad row SHALL not commit: the commit SHALL answer 409 `IMPORT_HAS_ERRORS` and write nothing. (IMPEX-D07)

#### Scenario: Warned, then confirmed
- **WHEN** `importer01` uploads a batch of 500 rows with 1 bad row, opens the list of bad rows, and confirms
- **THEN** the dialog says 1 row will not be imported, the 499 good rows are saved, and the bad row stays in the error report

#### Scenario: Warned, then cancelled
- **WHEN** `importer01` sees the warning for that batch and presses Cancel
- **THEN** no record is written

#### Scenario: One bad row of a record
- **WHEN** a record spread over three rows has one bad row, and `importer01` confirms
- **THEN** none of the three rows is saved, and all three are in the error report

#### Scenario: Nothing to import
- **WHEN** every row of a batch is bad
- **THEN** Confirm is off, and a commit through the API answers 409 `IMPORT_NO_GOOD_ROWS`

### Requirement: Error report
`GET {api_prefix}/import-batches/<id>/error-report` SHALL answer a `.csv` in UTF-8 with a byte order mark holding every error of the batch, with the columns Row, Sheet, Column and Reason, sorted by row, and the file name of IMPEX-D24. A batch with no error SHALL answer an empty report with its header row. (IMPEX-D08, IMPEX-D22, IMPEX-D24)

#### Scenario: Thai in Excel
- **WHEN** `importer01` downloads the report of a batch with Thai reasons and opens it in Excel
- **THEN** the Thai text is readable and the report holds every error, not only the page shown

### Requirement: Matching and duplicates in the file
Each row SHALL be matched to an existing, not deleted record by `{match_key}`, ignoring case and spaces at both ends. A row with no match SHALL be to create and a row with a match to update, and the commit SHALL write accordingly. A `{match_key}` that appears on more than one row of the file SHALL make every one of those rows bad, reason Duplicate in file. The import SHALL never delete a record. (IMPEX-D09, AUDIT-D06)

#### Scenario: New and existing
- **WHEN** a file has `C100`, which is new, and `c200 `, which exists as `C200`
- **THEN** `C100` is to create and `c200 ` is to update `C200`

#### Scenario: Same code twice
- **WHEN** rows 7 and 40 both have the code `C300`
- **THEN** both rows are reported Duplicate in file

#### Scenario: A deleted record
- **WHEN** the file has the code of a soft-deleted customer
- **THEN** the row is to create, and the deleted row stays as it was

### Requirement: What an update may overwrite
An update SHALL write only columns the definition marks as overwritable. An empty cell SHALL leave the existing value as it is. Status, internal ids and who-and-when columns SHALL be outside the definition. A record whose current state forbids an edit SHALL make its row bad, naming the state. A record not in the file SHALL not be touched. (IMPEX-D10)

#### Scenario: An empty cell
- **WHEN** a row of an existing customer has an empty `Phone`
- **THEN** the customer keeps its phone

#### Scenario: A column the file may not change
- **WHEN** a file updates customer `C200`, whose `credit status` is not in the definition
- **THEN** the status of `C200` is unchanged

#### Scenario: A locked record
- **WHEN** a row updates a record its state locks
- **THEN** the row is bad, and the reason names the state

### Requirement: Data scope of an import
A row SHALL be bad, reason Outside your scope, when the record it creates or updates lies outside the importer's `{scope}` for the `{import_target}`. Existence of a `{match_key}` outside the scope SHALL be looked up only to refuse the row; no other field of that record SHALL be read or shown. One `AccessDenied` Activity Log entry SHALL name the target, the number of such rows and only as many keys as an entry's detail shows (the audit pack's limit), with the importer as actor. (IMPEX-D01, IMPEX-D17)

#### Scenario: A branch outside the scope
- **WHEN** `importer01` imports a row for a customer of branch `B09`
- **THEN** the row is bad with Outside your scope, and one `AccessDenied` entry counts it

#### Scenario: An existing customer outside the scope
- **WHEN** a row has the code of a customer of branch `B09`
- **THEN** the row is bad with Outside your scope, and nothing of that customer is shown

### Requirement: Dates as Excel stores them
A date column SHALL be read from the cell's stored value, whatever the display format or the machine's language: a date cell SHALL give its calendar date. A text cell SHALL be read in the format {import-export.date_text_format} with a four-digit year. A year of {import-export.buddhist_year_from} or later, in a text cell or in a date cell typed that way, SHALL be taken as a Buddhist year: 543 SHALL be subtracted before the date is checked for being real. A plain number in a date column, a date that does not exist and a two-digit year SHALL make the row bad. A workbook set to the 1904 date system SHALL be refused whole. (IMPEX-D11)

#### Scenario: A date cell shown in the Thai calendar
- **WHEN** a date cell stores 15 January 2026 and is formatted to show `15/01/2569`
- **THEN** the date read is 15 January 2026

#### Scenario: A Buddhist year typed as text
- **WHEN** a text cell holds `15/01/2569`
- **THEN** the date read is 15 January 2026

#### Scenario: A Buddhist year typed into a date cell
- **WHEN** a date cell stores the year 2569 because a user typed `15/01/2569` in Excel with a Gregorian calendar
- **THEN** the date read is 15 January 2026

#### Scenario: A leap day in a Buddhist year
- **WHEN** a text cell holds `29/02/2567`
- **THEN** the date read is 29 February 2024

#### Scenario: A date that does not exist
- **WHEN** a text cell holds `31/02/2026`
- **THEN** the row is bad, reason Not a real date

#### Scenario: A plain number
- **WHEN** a date column holds the number `46037` with no date format
- **THEN** the row is bad, reason Not a date

### Requirement: Numbers, formulas and error cells
A number column SHALL read the value the cell stores, not the value it displays. A text cell in a number column SHALL be accepted when it holds digits with an optional sign, thousands commas and decimal point; Thai digits and units SHALL make the row bad. More decimals than the definition allows, and a value outside its range, SHALL make the row bad; the system SHALL not round. A formula cell SHALL give the value saved with it in the file and SHALL never be computed; one with no saved value SHALL be empty. A cell holding an Excel error SHALL make the row bad, naming the error. (IMPEX-D12)

#### Scenario: A number displayed rounded
- **WHEN** a cell stores 1234.567, displays `1,234.57` and the column allows three decimals
- **THEN** the value read is 1234.567

#### Scenario: A number typed as text
- **WHEN** a text cell in a number column holds `1,234.50`
- **THEN** the value read is 1234.50

#### Scenario: A formula with no saved value
- **WHEN** a cell holds a formula saved without a value and the column is required
- **THEN** the row is bad with an empty-value reason, and no formula is computed

#### Scenario: An error cell
- **WHEN** a cell holds `#N/A`
- **THEN** the row is bad and the reason names `#N/A`

### Requirement: Codes and text
A code column SHALL keep the cell as text after trimming spaces at both ends, and SHALL never add or remove leading zeros. A number cell in a code column SHALL be read as its digits with no `.0`; a number of more than 15 digits, or one stored in exponent form, SHALL make the row bad. A definition with a fixed length SHALL make a row bad when the length differs. In text columns CRLF SHALL become LF and spaces at both ends SHALL be trimmed, except in columns the definition keeps as they are; a cell that is empty after trimming SHALL be empty. (IMPEX-D13)

#### Scenario: A code stored as a number
- **WHEN** a code column holds the number 10540
- **THEN** the value read is `10540`, not `10540.0`

#### Scenario: Leading zero lost
- **WHEN** a code of fixed length 5 holds the number 123
- **THEN** the row is bad, reason wrong length, and no zero is added

#### Scenario: A long number
- **WHEN** a code column holds the number 1234567890123456789
- **THEN** the row is bad

### Requirement: Commit
`POST {api_prefix}/import-batches/<id>/commit` SHALL be accepted only at stage `Checked`; any other stage SHALL answer 409 `IMPORT_STAGE` and write nothing. The commit SHALL check again against the current data, and when the counts to create or update differ from the batch it SHALL answer 409 `IMPORT_CHANGED`, write nothing and ask for a new check. It SHALL write every good row in one transaction; a failure SHALL leave no record behind, and the batch at `Checked` with its failure shown. The screen SHALL ask for confirmation naming the counts, including the rows that will not be imported, before it calls commit. (IMPEX-D14)

#### Scenario: Data changed while waiting
- **WHEN** `importer01` holds a batch with `C305` to create, `importer02` creates `C305` on its screen, and `importer01` commits
- **THEN** the answer is 409 `IMPORT_CHANGED`, nothing is written, and the screen asks for a new check

#### Scenario: Failure midway
- **WHEN** the database rejects a row late in a commit
- **THEN** no record of the file exists, and the batch is still `Checked`

#### Scenario: Committed twice
- **WHEN** a `Committed` batch is committed again
- **THEN** the answer is 409 `IMPORT_STAGE`, and nothing changes

### Requirement: Cancel
`POST {api_prefix}/import-batches/<id>/cancel` SHALL be accepted at `Checking` and `Checked`, move the batch to `Cancelled` and write nothing else. A background check SHALL stop at its next step after a cancel. A batch at `Committing` or later SHALL answer 409 `IMPORT_STAGE`. (IMPEX-D14)

#### Scenario: Cancel after the check
- **WHEN** `importer01` cancels a `Checked` batch
- **THEN** the batch is `Cancelled`, no record exists, and a later commit answers 409 `IMPORT_STAGE`

### Requirement: Large files run in the background
A file of {import-export.import_job_file_mb} MB or more SHALL be checked as a background job, and a commit of {import-export.import_job_rows} rows or more SHALL run as one, on the project's background-job mechanism. Their calls SHALL answer with the batch at `Checking` or `Committing`. The batch SHALL report its rows done while the job runs, and the screen SHALL show progress and SHALL still show it after the user leaves and returns. A batch at `Checking` or `Committing` longer than {import-export.import_running_timeout_minutes} minutes SHALL become `Failed`. A background commit writes as its importer and SHALL keep the importer as actor. (IMPEX-D15)

#### Scenario: Progress
- **WHEN** a large file is uploaded and 4,000 of 12,000 rows are checked
- **THEN** the batch answers `Checking` with 4,000 done of 12,000, and the screen shows it

#### Scenario: A job that dies
- **WHEN** the job checking a batch dies and {import-export.import_running_timeout_minutes} minutes pass
- **THEN** the batch is `Failed`, and that target accepts a new upload

### Requirement: One import at a time for a target
At most one batch of an `{import_target}` SHALL be at `Checking` or `Committing`. Another upload or commit of the same target at that time SHALL answer 409 `IMPORT_IN_PROGRESS`, naming who runs it, and the rule SHALL hold across instances of the API. A batch waiting at `Checked` SHALL not block anyone. (IMPEX-D16, IMPEX-D14)

#### Scenario: Two imports at once
- **WHEN** `importer01`'s batch of Customer is `Committing` and `importer02` uploads a file of Customer
- **THEN** the answer is 409 `IMPORT_IN_PROGRESS` naming `importer01`

#### Scenario: A waiting batch
- **WHEN** `importer01` leaves a batch at `Checked` and `importer02` uploads a file of Customer
- **THEN** `importer02`'s upload is accepted

### Requirement: Activity Log of an import
Only a commit SHALL write `Import` entries, in its transaction: one entry of action `Import` with document type `{import_target}`, the batch id, the file name, its sha256 and the counts of records created and updated and of rows not imported, holding the old and new values of each record it changed. The entry's actor SHALL be the account that confirmed, also when the commit ran in the background. Upload, check, cancel, the purge and the error report SHALL write no entry. (IMPEX-D17, AUDIT-D04, AUDIT-D11, AUDIT-D18)

#### Scenario: One commit, one entry
- **WHEN** `importer01` commits a file that creates 90 customers and updates 10
- **THEN** one `Import` entry names the file and the counts, shows the changed fields of as many rows as an entry's detail shows, and holds the row count of 100

#### Scenario: A cancelled batch
- **WHEN** `importer01` cancels a batch
- **THEN** the Activity Log has no new entry

### Requirement: Batch and original file are purged by age
The original file SHALL be kept in the storage of the upload rules. Once a day the purge SHALL delete each batch with its rows and its file at the ages the audit pack sets for staged imports: its closed age for a batch `Committed`, `Cancelled` or `Failed`, counted from that moment, and its open age for a batch still open, counted from its last change. The storage object SHALL be deleted first, then the rows. The purge SHALL write no Activity Log entry and SHALL touch no business record. There SHALL be no download of the original file. (IMPEX-D18, AUDIT-D07, UPL-D06)

#### Scenario: A committed batch past its age
- **WHEN** a batch was committed one day longer ago than the audit pack's closed age, and the purge runs
- **THEN** the batch, its rows and its file are gone, and the records it wrote are unchanged

#### Scenario: An abandoned batch
- **WHEN** a batch at `Checked` was last changed one hour longer ago than the audit pack's open age, and the purge runs
- **THEN** the batch, its rows and its file are gone

### Requirement: Import screen
The screen of an `{import_target}` SHALL show the file picker with the limits in force, a Download template button, the note that nothing is saved before the confirm, and after the upload the result: counts of good and bad rows and of records to create and update, the paged list of bad rows, Download error report, Cancel, and Confirm only when a commit is allowed. A file refused whole SHALL show its message and stay on the picker. Progress SHALL show while a job runs. (IMPEX-D06, IMPEX-D14, IMPEX-D15)

#### Scenario: A file with bad rows
- **WHEN** `importer01` uploads a file with 3 bad rows
- **THEN** the result warns that 3 rows will not be imported and lists them with their reasons, Download error report is on, and Confirm is on for the good rows

#### Scenario: A clean file
- **WHEN** `importer01` uploads a file with no bad row and presses Confirm
- **THEN** a dialog names the counts to create and to update before anything is written

### Requirement: Export availability and format
An export button SHALL appear only on a `{list}` the project has named, and calling the export without `{export_key}` SHALL answer 403 `ACCESS_DENIED`. Each `{list}` SHALL have an export definition in code: its columns and labels, the labels being those of the screen. The file SHALL be one sheet of `.xlsx` with a frozen header row, numbers as number cells, dates as date cells in {import-export.export_date_format}, and instants in the system's time zone. (IMPEX-D19)

#### Scenario: A list without an export
- **WHEN** a list the project did not name is shown
- **THEN** it has no export button

#### Scenario: Cells a spreadsheet can use
- **WHEN** a date and an amount are exported
- **THEN** the date is a date cell shown as {import-export.export_date_format} and the amount is a number cell

### Requirement: Same rows as the screen
An export SHALL use the query of its list with the caller's current filters, sort and data scope, and SHALL hold every matching row, not only the page shown. A filter or sort the list does not name SHALL answer 400 `VALIDATION_FAILED` as the list does. (IMPEX-D20)

#### Scenario: A filtered list
- **WHEN** `importer01` exports customers filtered to one city, sorted by name
- **THEN** the file holds exactly the rows of that filter in that order, only of branches `B01` and `B02`

### Requirement: No hidden or secret data in a file
A file SHALL hold only the columns of the definition. It SHALL have no hidden column, no hidden sheet and no column for a password, a token, a secret or an internal id, and a value the screen masks SHALL be masked the same way in the file. An architecture test or a unit test of each definition SHALL fail on a column of a secret field. (IMPEX-D20)

#### Scenario: A masked value
- **WHEN** a list masks part of a national id and that column is exported
- **THEN** the file holds the masked value

#### Scenario: A secret column
- **WHEN** a developer adds a password column to an export definition
- **THEN** the test fails and names it

### Requirement: Export size
`POST {api_prefix}/exports` SHALL take `list`, `filter` and `sort`, count the rows, and answer 201 with the export row `id`, `status`, `rowCount`, `fileName` and `expiresAt`. Over {import-export.export_max_rows} rows it SHALL answer 409 `EXPORT_TOO_LARGE` naming the count and the limit, and create nothing. Up to {import-export.export_sync_max_rows} rows the file SHALL be made in the request, status `Ready`. Above that the file SHALL be made as a background job, status `Queued`, then `Running`, then `Ready`, and the requester SHALL be told when it is ready. A second export of the same `list` by the same account while one is `Queued` or `Running` SHALL answer that one and start no other. (IMPEX-D21)

#### Scenario: Over the limit
- **WHEN** a filter matches {import-export.export_max_rows} rows and one more
- **THEN** the answer is 409 `EXPORT_TOO_LARGE`, and the screen asks to narrow the filter

#### Scenario: A large export
- **WHEN** `importer01` exports a list above {import-export.export_sync_max_rows} rows
- **THEN** the answer is 201 with status `Queued`, and the requester is told when the file is ready

#### Scenario: Pressed twice
- **WHEN** `importer01` presses Export twice on a list that goes to the background
- **THEN** one export runs, and both calls answer its id

### Requirement: Export download and expiry
`GET {api_prefix}/exports/<id>/content` SHALL stream the file only to the account that requested it, after checking `{export_key}` again, with the headers of the upload rules for a download. Before {import-export.export_link_hours} hours have passed since it was ready the file SHALL download; afterwards the call SHALL answer 404 `NOT_FOUND`, and an hourly purge SHALL delete the file and its row. `GET {api_prefix}/exports` SHALL list the caller's files, newest first, without expired ones. No storage address SHALL reach a user. (IMPEX-D21, UPL-D10)

#### Scenario: Another user's file
- **WHEN** `importer02` asks for the content of `importer01`'s export
- **THEN** the answer is 404 `NOT_FOUND`

#### Scenario: After expiry
- **WHEN** an export is more than {import-export.export_link_hours} hours old
- **THEN** its content answers 404 `NOT_FOUND`, and after the purge its file is gone from the storage

### Requirement: Formula injection is stopped
In every file the system creates (exports, templates, error reports), a text value that begins with `=`, `+`, `-`, `@`, tab or carriage return SHALL be written as text that cannot run: in `.xlsx` a text cell with the quote prefix and its value unchanged; in `.csv` the value prefixed with `'`. A value of a number or date column SHALL be written as a cell of that type and left unchanged. No file SHALL hold a formula built from user data. (IMPEX-D22)

#### Scenario: A formula in a name
- **WHEN** a customer's name is `=HYPERLINK("http://example.com")` and the list is exported
- **THEN** the cell is text showing that same value, and opening or editing the cell does not run it

#### Scenario: A phone number
- **WHEN** a text column holds `+66812345678` and is exported to `.xlsx`
- **THEN** the cell shows `+66812345678` as text

#### Scenario: A negative amount
- **WHEN** an amount of -500.00 is exported
- **THEN** it is a number cell with no prefix

### Requirement: Activity Log of exports
An export of a `{list}` whose definition marks personal data SHALL write one `Export` entry when the file is made, with the list, the filter, the row count and the file name. Exports of other lists SHALL write no entry, and a repeated download SHALL write no entry. The entry's actor SHALL be the requester, also when the job ran in the background. (IMPEX-D23, AUDIT-D11)

#### Scenario: Personal data
- **WHEN** `importer01` exports customers, a list marked personal data
- **THEN** one `Export` entry names the list, the filter and the row count

#### Scenario: A list without personal data
- **WHEN** `importer01` exports a list not marked
- **THEN** the Activity Log has no new entry

### Requirement: File names
An export file SHALL be named `<list>_<yyyyMMdd-HHmm>.xlsx` in the system's time zone, a template `<target>_template.xlsx`, and an error report `<original name>_errors.csv`, `<list>` and `<target>` being short names from the definitions. No value from a filter or a user name SHALL appear in a file name. Thai names SHALL download correctly. (IMPEX-D24, UPL-D10)

#### Scenario: An export name
- **WHEN** `customers` is exported at 09:30 on 15 January 2026 in the system's time zone
- **THEN** the file is named `customers_20260115-0930.xlsx`

#### Scenario: An error report name
- **WHEN** the error report of `ลูกค้า.xlsx` is downloaded
- **THEN** the file is named `ลูกค้า_errors.csv`, and its Thai name arrives readable
