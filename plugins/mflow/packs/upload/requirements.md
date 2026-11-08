# upload: requirements

Files attached to a `{record}`: which files are accepted, how they are checked, named and stored, how they reach the record through a staging step, who may download them, what removing does, and what the Activity Log keeps. Example people: `clerk01` may edit Order `ORD-0012`; `clerk02` may sign in but `ORD-0012` is outside their scope; `partner01` signs in to an `{org_portal}`. The values below are the defaults of `params.md`.

### Requirement: Accepted file types
The system SHALL know one fixed catalog of file types whose content it can check: .pdf .doc .docx .xls .xlsx .ppt .pptx .csv .txt .jpg .jpeg .png .gif .webp. The accepted list `upload.extensions` SHALL be set on the system settings screen (settings pack) and SHALL hold at least one type of the catalog and nothing else; a save that names another type, such as .svg or .zip, SHALL be refused. An upload whose last extension is not on the list SHALL answer 400 `VALIDATION_FAILED` on `file` with a message naming the accepted extensions, and nothing SHALL be stored. A change of the list SHALL apply to the next upload and SHALL not touch files already taken. (UPL-D01, UPL-D02)

#### Scenario: A PDF on the list
- **WHEN** `clerk01` uploads `quote.pdf` of 220 KB with PDF content
- **THEN** it is accepted into staging

#### Scenario: An extension not on the list
- **WHEN** .gif is not on the list and `clerk01` uploads `photo.gif`
- **THEN** the answer is 400 `VALIDATION_FAILED` naming the accepted extensions, and nothing is stored

#### Scenario: A type outside the catalog
- **WHEN** an administrator saves the list with .pdf and .svg
- **THEN** the save is refused on `upload.extensions`, and the stored list is unchanged

#### Scenario: A list change leaves earlier files alone
- **WHEN** a .png was attached yesterday and an administrator takes .png off the list today
- **THEN** that file stays attached and downloads as before, and the next .png upload is refused

### Requirement: Content matches the extension
The server SHALL check every upload, whatever the browser checked: the file SHALL hold more than 0 bytes, and its content (its leading bytes) SHALL be the type its extension names, the extension compared without case. A .docx, .xlsx or .pptx SHALL be a zip that holds the Office part list, not a plain zip; a .doc, .xls or .ppt SHALL be an Office compound file; a .csv or .txt SHALL be text with no zero byte. The stored type SHALL be the detected one, never the Content-Type the browser sent. A file that fails any check SHALL answer 400 `VALIDATION_FAILED` on `file` with a message naming the rule, and nothing SHALL be stored. (UPL-D04)

#### Scenario: Extension disagrees with content
- **WHEN** a PDF is uploaded as `report.xlsx`
- **THEN** the answer is 400 `VALIDATION_FAILED` "not an Excel file", and nothing is stored

#### Scenario: A renamed archive
- **WHEN** a zip without Office content is uploaded as `report.docx`
- **THEN** it is refused as not a Word document

#### Scenario: An empty file
- **WHEN** a file of 0 bytes is uploaded as `blank.pdf`
- **THEN** it is refused as empty

#### Scenario: Upper-case extension and a wrong browser type
- **WHEN** a PDF is uploaded as `SCAN.PDF` with the Content-Type `image/png`
- **THEN** it is accepted and stored with the type `application/pdf`

#### Scenario: A double extension
- **WHEN** a file is uploaded as `invoice.pdf.exe`
- **THEN** it is refused, as `.exe` is not on the list

### Requirement: Size of a file and of a request
An upload request SHALL carry one file. A file larger than {upload.max_file_mb} MB SHALL answer 400 `VALIDATION_FAILED` on `file` with a message naming {upload.max_file_mb} MB, and nothing SHALL be stored. Every layer that receives the request (proxy, web server, form reader) SHALL refuse a body larger than {upload.request_limit_mb} MB before it is read to the end. `upload.max_file_mb` SHALL be set on the system settings screen within 1 to 100 and never above `upload.request_limit_mb`. (UPL-D03)

#### Scenario: Over the size
- **WHEN** `upload.max_file_mb` is 10 and `clerk01` uploads an 11 MB PDF
- **THEN** the answer is 400 `VALIDATION_FAILED` naming 10 MB, and nothing is stored

#### Scenario: A body over the server ceiling
- **WHEN** a client sends a 500 MB body to the upload call
- **THEN** the request is refused with 413 before the body is read to the end, and nothing is stored

#### Scenario: Two files in one request
- **WHEN** a client sends two files in one upload request
- **THEN** the answer is 400 `VALIDATION_FAILED` on `file`, and nothing is stored

### Requirement: Files per record
When a save of a `{record}` attaches files, the record SHALL hold at most {upload.max_files_per_record} attached files and at most {upload.max_record_mb} MB of them after the save, counting only links that are not removed. Over the count the save SHALL answer 409 `TOO_MANY_FILES` naming the limit, and over the total 409 `FILES_TOO_LARGE`; the save SHALL then change nothing and the staged files SHALL stay staged. Two saves of one record at the same time SHALL not pass the limit together. (UPL-D03)

#### Scenario: One file too many
- **WHEN** Order `ORD-0012` holds {upload.max_files_per_record} files and `clerk01` saves it with one more staged file
- **THEN** the answer is 409 `TOO_MANY_FILES`, nothing is attached, and the staged file is still staged

#### Scenario: Removed files do not count
- **WHEN** `ORD-0012` holds two files fewer than {upload.max_files_per_record} plus three removed ones, and `clerk01` attaches two more
- **THEN** both are attached

#### Scenario: Two saves at the limit
- **WHEN** `ORD-0012` holds one file fewer than {upload.max_files_per_record} and two users each save it with one staged file at the same moment
- **THEN** one save attaches its file, the other answers 409 `TOO_MANY_FILES` or a concurrency error, and the record holds {upload.max_files_per_record} files

### Requirement: File names
The storage key of a file SHALL be made by the system from a random id and SHALL hold no part of the name the user sent. The name the user sent SHALL be kept, after cleaning, for display and as the download name only: the path SHALL be cut at the last `/` or `\`, control characters SHALL be removed, spaces at both ends SHALL be trimmed, and a name longer than {upload.name_max} characters SHALL be shortened in its base part with its extension kept. A name that is empty after cleaning SHALL become `file` with its extension. Thai and other non-Latin letters SHALL be kept. (UPL-D05)

#### Scenario: A path in the name
- **WHEN** a browser sends the name `C:\Users\somchai\Desktop\quote.pdf`
- **THEN** the stored name is `quote.pdf`

#### Scenario: A climbing path
- **WHEN** a client sends the name `../../app/quote.pdf`
- **THEN** the stored name is `quote.pdf`, and the storage key is unrelated to it

#### Scenario: A long Thai name
- **WHEN** a file is uploaded as a Thai name of 260 characters ending in `.docx`
- **THEN** the stored name has {upload.name_max} characters and still ends in `.docx`

### Requirement: Storage behind one interface
File content SHALL be written, read, checked and deleted only through one storage interface, with one implementation for S3-compatible object storage and one for a local folder, chosen by configuration. Content SHALL never be stored under the web root or in the database, and no storage address SHALL reach a user. Writing to a key that already holds content SHALL fail. (UPL-D06)

#### Scenario: No public address
- **WHEN** a file is attached and its record is read through the API
- **THEN** no answer holds a bucket name, a storage key or a storage URL

#### Scenario: Keys are written once
- **WHEN** code writes content to a key that already holds a file
- **THEN** the write fails and the first content stays

#### Scenario: Both implementations
- **WHEN** the storage test suite runs against the local folder and against object storage
- **THEN** both pass the same tests

### Requirement: Files are reached through their record
Each attached file SHALL be one `stored_file` row linked by a row of its record's link table. Code on a user's path SHALL read `stored_file` only through a link table and the record's access rules; an architecture test SHALL fail on any other read. (UPL-D07)

#### Scenario: A direct read of the registry
- **WHEN** a developer adds an endpoint that loads `stored_file` by id without its link table
- **THEN** the architecture test fails and names the location

### Requirement: Upload, then attach on save
`POST {api_prefix}/uploads` SHALL take one file, check it, store it, write one `upload_staging` row and answer 201 with the staging id, the cleaned name, the size, the detected type and the expiry. The create or update call of a `{record}` SHALL take the staging ids to attach; in its transaction it SHALL create the `stored_file` row and the link row for each, keeping the same storage key, and delete each staging row. A staging id SHALL be attachable only by its uploader and only once; any other id SHALL make the save answer 400 `VALIDATION_FAILED` on `files` and change nothing. The uploader SHALL be able to read the staged file at `GET {api_prefix}/uploads/<staging id>/content` and discard it at `DELETE {api_prefix}/uploads/<staging id>`; anyone else SHALL get 404. A save that fails SHALL leave its staged files staged. (UPL-D08)

#### Scenario: Upload on a new record
- **WHEN** `clerk01` picks `quote.pdf` on the new Order form and then saves the form
- **THEN** the upload answers 201 with a staging id, the save creates the order with `quote.pdf` attached, and the staging row is gone

#### Scenario: Form closed without saving
- **WHEN** `clerk01` uploads `quote.pdf` and closes the form
- **THEN** no record holds the file, and it stays staged until the purge

#### Scenario: Another user's staging id
- **WHEN** `clerk02` saves an order with the staging id of `clerk01`'s upload
- **THEN** the answer is 400 `VALIDATION_FAILED` on `files`, and nothing is attached

#### Scenario: One staging id twice
- **WHEN** `clerk01` saves two orders with the same staging id
- **THEN** the first save attaches the file, and the second answers 400 `VALIDATION_FAILED` on `files`

### Requirement: Staged files are purged
Every hour a purge SHALL delete each staging row older than {upload.staging_hours} hours with its content, and each stored object that no staging or `stored_file` row names and that is older than {upload.staging_hours} hours. The purge SHALL write no Activity Log entry and SHALL never touch an attached file. (UPL-D09, AUDIT-D07)

#### Scenario: A staged file past its age
- **WHEN** a file was staged {upload.staging_hours} hours and one minute ago, never attached, and the purge runs
- **THEN** its staging row and its content are deleted, and the Activity Log has no new entry

#### Scenario: A staged file still young
- **WHEN** a file was staged one hour ago and the purge runs
- **THEN** it is still staged and can be attached

#### Scenario: An object without a row
- **WHEN** the storage holds an object two days old that no row names, and the purge runs
- **THEN** the object is deleted

### Requirement: Download through the record
The API SHALL stream an attached file at `GET {api_prefix}/<record route>/<record id>/files/<file id>/content` only to a caller who may view that `{record}`. A record outside the caller's scope, a removed link, a link of another record and an unknown id SHALL each answer 404 `NOT_FOUND` with the same body. The answer SHALL carry `Content-Disposition: attachment` with the cleaned name (with `filename*` in UTF-8), `X-Content-Type-Options: nosniff`, the detected Content-Type and `Cache-Control: private, no-store`. (UPL-D10)

#### Scenario: Download by a user who may view the order
- **WHEN** `clerk01` downloads `ใบเสนอราคา.pdf` from `ORD-0012`
- **THEN** it streams as an attachment named `ใบเสนอราคา.pdf` with type `application/pdf` and `nosniff`

#### Scenario: Outside the scope
- **WHEN** `clerk02` asks for a file of `ORD-0012` by its id
- **THEN** the answer is 404 `NOT_FOUND`, the same as for an id that does not exist

#### Scenario: A removed file
- **WHEN** `clerk01` asks for a file that was removed from `ORD-0012`
- **THEN** the answer is 404 `NOT_FOUND`

### Requirement: Remove and replace
A save of a `{record}` SHALL take the ids of attached files to remove, allowed to whoever may save that record in its current state. Removing SHALL soft-delete the link row with `deleted_by` and `deleted_at`, keep the `stored_file` row, and free the file's place in the limits. Replacing SHALL be a remove and an attach in one save. Soft-deleting the whole record SHALL leave its link rows as they are. (UPL-D12, AUDIT-D05)

#### Scenario: Remove a file
- **WHEN** `clerk01` removes `quote.pdf` from `ORD-0012` and saves
- **THEN** the file is gone from the order's list, its link row has `is_deleted` true and `deleted_by` `clerk01`, and its `stored_file` row remains

#### Scenario: A record that may not be edited
- **WHEN** `ORD-0012` is in a state its rules lock, and `clerk01` saves it with a file to remove
- **THEN** the save is refused as any edit of that record is, and the file stays attached

#### Scenario: Replace a file
- **WHEN** `clerk01` removes `quote.pdf` and attaches `quote-v2.pdf` in one save
- **THEN** the order lists only `quote-v2.pdf`, and both changes are in one Activity Log entry

### Requirement: Content of removed files is purged after a retention
Once a day a purge SHALL delete the stored content of each `stored_file` whose links are all removed, the last one more than {upload.removed_retention_days} days ago, and set its `purged_at`; the row SHALL stay. A file whose record is soft-deleted, or that still has a link that is not removed, SHALL keep its content. The purge SHALL write no Activity Log entry. (UPL-D13)

#### Scenario: Past the retention
- **WHEN** `quote.pdf` was removed from `ORD-0012` {upload.removed_retention_days} days and one day ago, and the purge runs
- **THEN** its content is gone from the storage, and its `stored_file` row remains with `purged_at` set

#### Scenario: A deleted record
- **WHEN** Order `ORD-0013` was soft-deleted 90 days ago with two files attached, and the purge runs
- **THEN** both files keep their content

### Requirement: Checksum
The upload SHALL compute the sha256 of the content while it is received and store it on the staging row and the `stored_file` row. When the same sha256 is already attached to the record the save is for, the save SHALL still attach the file, and the record's answer SHALL name the earlier file as a duplicate. (UPL-D14)

#### Scenario: The stored hash
- **WHEN** `quote.pdf` is attached
- **THEN** its `stored_file.sha256` equals the sha256 of the content read back from the storage

#### Scenario: The same file twice
- **WHEN** `clerk01` attaches `quote.pdf` to `ORD-0012`, which already holds the same content as `quote-old.pdf`
- **THEN** the file is attached, and the answer names `quote-old.pdf` as a duplicate

### Requirement: Malware scan
Where the project scans (UPL-D15), every upload SHALL be scanned after the type checks and before it is stored in staging. A file the scanner finds infected SHALL answer 400 `VALIDATION_FAILED` "the file failed the virus check", and nothing SHALL be stored. When the scanner gives no answer within {upload.scan_timeout_seconds} seconds the upload SHALL answer 503 `SCAN_UNAVAILABLE` with a message to try again, and nothing SHALL be stored. No unscanned file SHALL be staged. (UPL-D15)

#### Scenario: The test virus file
- **WHEN** `partner01` uploads the standard antivirus test file renamed `test.txt`
- **THEN** the answer is 400 `VALIDATION_FAILED`, and nothing is stored

#### Scenario: Scanner down
- **WHEN** the scanner does not answer and `partner01` uploads `quote.pdf`
- **THEN** the answer is 503 `SCAN_UNAVAILABLE`, and nothing is stored

### Requirement: Upload rate on outside portals
On an `{org_portal}`, one account SHALL upload at most {upload.uploads_per_hour} files in any hour. The next upload SHALL answer 429 `TOO_MANY_REQUESTS` with `Retry-After`, and nothing SHALL be stored. Accounts of staff portals SHALL have no count limit. (UPL-D16)

#### Scenario: Over the hourly count
- **WHEN** `partner01` has uploaded {upload.uploads_per_hour} files in the last hour and uploads one more
- **THEN** the answer is 429 `TOO_MANY_REQUESTS` with `Retry-After`, and nothing is stored

#### Scenario: Staff are not counted
- **WHEN** `clerk01` uploads 200 files in an hour
- **THEN** none is refused for their number

### Requirement: Activity Log of files
Uploading to staging, discarding a staged file and both purges SHALL write no Activity Log entry. Attaching and removing SHALL be part of the save of the `{record}` and of its one entry, the detail naming each file with its cleaned name, size and sha256. A save that only attaches files SHALL be named `AttachFile`, and one that only removes files `RemoveFile`. A download SHALL write no entry. (UPL-D17, UPL-D18, AUDIT-D11, AUDIT-D18)

#### Scenario: Upload alone
- **WHEN** `clerk01` uploads `quote.pdf` and does not save the form
- **THEN** the Activity Log has no new entry

#### Scenario: A save that attaches two files
- **WHEN** `clerk01` saves `ORD-0012` with a new delivery date and two staged files
- **THEN** one entry is written for the save, holding the date change and both file names

#### Scenario: Remove only
- **WHEN** `clerk01` removes one file from `ORD-0012` and saves nothing else
- **THEN** one `RemoveFile` entry names the file

#### Scenario: A download
- **WHEN** `clerk01` downloads a file of `ORD-0012`
- **THEN** the Activity Log has no new entry

### Requirement: Upload limits for the client
`GET {api_prefix}/uploads/limits` SHALL answer a signed-in caller with the accepted extensions, `upload.max_file_mb`, `upload.max_files_per_record` and `upload.max_record_mb` in force. The upload field SHALL show these values from this call and SHALL check a file against them before sending it, and the server SHALL check again. (UPL-D19)

#### Scenario: Limits after a settings change
- **WHEN** an administrator sets `upload.max_file_mb` to 5 and `clerk01` then opens an Order form
- **THEN** the limits call answers 5, and the upload field says files up to 5 MB

#### Scenario: Checked before sending
- **WHEN** `clerk01` picks a 12 MB file while the limit is 10 MB
- **THEN** the field shows the size message and sends nothing

### Requirement: Upload field and file list
The form of a `{record}` that carries files SHALL show an upload field with the accepted extensions and the size limit, upload each picked file at once with its own progress and its own error message, list the staged files with a way to drop them before saving, and keep the save disabled while an upload runs. The detail of the record SHALL list its attached files with name, size, who attached them and when, and a Download button that names its file to assistive technology and is disabled while its download runs. A file that may not be removed SHALL offer no remove button. (UPL-D08, UPL-D10, UPL-D12, UPL-D19)

#### Scenario: One bad file among three
- **WHEN** `clerk01` picks three files and one is a renamed archive
- **THEN** two files show as ready, the third shows its refusal message, and the form can be saved with the two

#### Scenario: Download pressed twice
- **WHEN** `clerk01` presses Download twice while the first download runs
- **THEN** the button is disabled during the call, and one file arrives
