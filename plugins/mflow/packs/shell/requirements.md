# shell requirements

The behaviour every screen of the web shares: the layout of each {portal}, the menu, the language of labels, dates, times and numbers, lists, picking a record, the history of a record, forms, messages, error pages and an expired session. How it looks is the UI kit's; these requirements say what the user gets. Example people: `clerk01` holds only the View key of Orders; `admin01` holds every key.

### Requirement: One layout per portal
Each {portal} SHALL have its own layout built from the project's UI kit, with its own menu, {app_name} and {start_page}. A page of one {portal} SHALL never open in the layout of another. Sign-in pages SHALL use a sign-in layout with no menu, and public pages, when the system has them, a public layout with no menu of a {portal}. (SHELL-D01)

#### Scenario: Each portal its layout
- **WHEN** a signed-in user of a {portal} opens its {start_page}
- **THEN** the page shows that {portal}'s layout, menu and {app_name}

#### Scenario: A page of another portal
- **WHEN** a user of one {portal} opens the address of a page that belongs to another {portal}
- **THEN** the page is not shown in this {portal}'s layout, and the 404 page shows instead

### Requirement: The frame of every page
Every signed-in page SHALL sit in the kit's shell: a sidebar beside a content column, with a top bar over the main area. The sidebar SHALL show icons with labels on wide windows, icons only on medium windows and an off-canvas drawer on narrow windows, at the breakpoints the kit records, and the ☰ toggle in the top bar SHALL switch it at every width. The page SHALL never scroll sideways. A screen SHALL fill only the main area. The browser tab SHALL show the page's title followed by ` · {app_name}`. (SHELL-D02)

#### Scenario: Wide window
- **WHEN** a page opens at the kit's widest acceptance size
- **THEN** the sidebar shows icons with labels, and the page has no sideways scroll

#### Scenario: Narrow window
- **WHEN** the window is below the drawer breakpoint and ☰ is pressed
- **THEN** the menu opens as a drawer over the page, and Esc closes it with the focus back on ☰

#### Scenario: Tab title
- **WHEN** `clerk01` opens the Orders list
- **THEN** the browser tab shows the page's title followed by ` · {app_name}`

### Requirement: User menu
The top bar SHALL show the signed-in user's name and role, opening a menu that holds Profile, when the {portal} has a Profile page under the users pack, and Sign out. Sign out SHALL be on every signed-in page. (SHELL-D03)

#### Scenario: Open the user menu
- **WHEN** `clerk01` opens the user menu on any signed-in page
- **THEN** it shows Sign out, and Profile only on a {portal} that has a Profile page

#### Scenario: Sign out
- **WHEN** `clerk01` presses Sign out
- **THEN** the session ends and the sign-in page shows

### Requirement: Menu follows the user's keys
The menu SHALL show an item only when the user holds the View key of its screen, from the keys the permission pack gives the web at sign-in, and SHALL hide a menu group with no item left. Every item SHALL be declared once, with its key, in the menu definition; a screen SHALL never add a menu item of its own. The active item SHALL follow the current page. Hiding an item SHALL never replace the server's check. (SHELL-D04)

#### Scenario: Items by key
- **WHEN** `clerk01` signs in
- **THEN** the menu shows Orders, and no group is left without an item

#### Scenario: Address typed without the key
- **WHEN** `clerk01` types the address of a screen whose item is hidden
- **THEN** the server refuses the data, and the page shows no data of that screen

### Requirement: Screens built only from the kit
Every screen SHALL be assembled from the components of the project's UI kit. A need the kit does not meet SHALL be added to the kit first and shown in every state on the style guide before a screen uses it. Every colour, size, radius and space SHALL come from the kit's tokens; a colour literal, an inline style or page-level CSS in a screen SHALL fail the project's check, which names the file. (SHELL-D05)

#### Scenario: Colour literal in a screen
- **WHEN** a developer writes a hex colour in a screen file and runs the checks
- **THEN** the check fails and names the file

#### Scenario: A list on a new screen
- **WHEN** a new screen needs a list of records
- **THEN** it uses the kit's DataTable, never a table written in the page

### Requirement: Data only through the server layer
Screens SHALL read and write data only through the one server layer that checks permission and data scope: the system's API or, in a server-rendered web, the application services that layer uses. A screen SHALL never open the database, and the browser SHALL never call another system directly. A screen SHALL never show raw response text: JSON, an exception, a stack trace or SQL. (SHELL-D06)

#### Scenario: Validation error shown
- **WHEN** a call answers 400 with the standard error body
- **THEN** the page shows the body's message in the project's label language and no JSON text

#### Scenario: A body that is not the error body
- **WHEN** a call answers with an HTML page from a proxy instead of the standard error body
- **THEN** the page shows the generic error message with Retry, not the body

### Requirement: Labels in both languages
Every label, column header, button, menu item, message and page title SHALL show both languages in one label, in the order {shell.label_order}, joined by ` · `. The web SHALL have no language switch. A message from the server SHALL show both of its languages the same way. Values that users typed SHALL show as typed. (SHELL-D07)

#### Scenario: A button
- **WHEN** a form shows its save button
- **THEN** the button shows its English and Thai label in the order {shell.label_order} ("Save · บันทึก" for `English · ไทย`)

#### Scenario: A server message
- **WHEN** the server answers with an English and a Thai message
- **THEN** the page shows both, in the order {shell.label_order}

### Requirement: Times stored in UTC and shown in the system time zone
Instants SHALL be stored and exchanged in UTC, with an offset on the wire, and SHALL be shown in {shell.time_zone}, whatever the time zone of the browser or the server. Calendar dates without a time, such as a due date, SHALL be stored and exchanged as dates and SHALL never be shifted by a time zone. "Today" SHALL be the date in {shell.time_zone}. (SHELL-D08)

#### Scenario: Instant near midnight
- **WHEN** the server sends `2026-09-26T17:30:00Z`
- **THEN** the page shows it in {shell.time_zone} (27/09/2026 00:30 for `Asia/Bangkok`), also on a computer set to UTC−5

#### Scenario: A due date
- **WHEN** a record's due date is `2026-10-31`
- **THEN** every browser shows 31/10/2026, whatever its time zone

#### Scenario: Today
- **WHEN** a date filter opens at 23:30 UTC on 31/10/2026
- **THEN** its "today" is the date in {shell.time_zone} (01/11/2026 for `Asia/Bangkok`)

### Requirement: Date and time format
Dates SHALL show as {shell.date_format} and date-times as {shell.datetime_format} on a 24-hour clock, with the year in {shell.calendar}, through one format module of the kit. A screen SHALL never format a date itself, and the format SHALL never follow the locale of the browser or the server. A date field SHALL accept the format it shows and SHALL send the server an ISO date (`YYYY-MM-DD`) with the Gregorian year. A date that cannot be read SHALL be refused under the field. (SHELL-D09)

#### Scenario: Browser set to Thai
- **WHEN** a browser set to Thai shows the date `2026-09-27`
- **THEN** the page shows it in {shell.date_format} with the year in {shell.calendar} (27/09/2026 for ค.ศ.), never the year the browser's locale picks

#### Scenario: Buddhist year chosen
- **WHEN** the project shows the year as พ.ศ. and a field holds `2026-09-27`
- **THEN** the field shows 27/09/2569 and sends `2026-09-27`

#### Scenario: Date that does not exist
- **WHEN** a user types 31/02/2026 in a date field
- **THEN** the field shows an error under it, and the form does not send

### Requirement: Numbers and money
Numbers SHALL use a comma between thousands and a point before decimals. Money SHALL show {shell.money_decimals} decimals, right-aligned, with no currency sign in the cell; the column header or the label SHALL name the currency. A negative value SHALL carry a leading minus sign. Rounding SHALL happen on the server; the page SHALL show the value it receives. (SHELL-D10)

#### Scenario: Money cell
- **WHEN** a total of 1234567.5 is shown
- **THEN** the cell shows it with thousands separators and {shell.money_decimals} decimals, right-aligned (1,234,567.50 for two decimals)

#### Scenario: Negative value
- **WHEN** a credit of minus 250 is shown
- **THEN** it reads -250.00

### Requirement: The data table standard
Every list SHALL be the kit's DataTable fed one page at a time by the server, with the page size chosen from {shell.page_sizes}, the first value by default; sorted by the columns the screen marks; searched through the filter panel above the table, and the header search where the screen marks a column. Every filter, the sort, the page and the page size SHALL be in the address, so a reload or a shared link shows the same rows. A change of filter, sort or page size SHALL go back to page 1. The table SHALL show its loading, empty, no-results (with Clear filters) and failed (with Retry) states, and the total under the table. (SHELL-D11)

#### Scenario: First open
- **WHEN** `clerk01` opens a list of 137 rows
- **THEN** the table shows the first page with the first value of {shell.page_sizes} rows, the pager and the total 137

#### Scenario: Shared link
- **WHEN** `clerk01` filters by status, sorts by date, goes to page 2 and sends the address to `admin01`
- **THEN** `admin01` sees the same filter, sort and page

#### Scenario: No results
- **WHEN** the filter matches no row
- **THEN** the table shows the no-results message with Clear filters, not the empty message

#### Scenario: Failed read
- **WHEN** the read of a page fails
- **THEN** the table shows the error with Retry, and Retry reads the page again

### Requirement: Rows open the record
A row SHALL open its record's detail page through a link that works from the keyboard and in a new tab or, on a list the screen marks for it, the kit's quick view; one table SHALL never mix the two. A row with content of its own MAY open it under the row through a toggle that says whether it is open; opening a row SHALL leave the other rows as they are, and a new page SHALL start with every row closed. A row without such content SHALL show no toggle. (SHELL-D12)

#### Scenario: Row link
- **WHEN** `clerk01` presses Enter on a focused row link, and later opens the same link in a new tab
- **THEN** the record's detail page opens both times

#### Scenario: Two rows open
- **WHEN** the second row opens, then the third, then the second closes
- **THEN** the third row stays open

#### Scenario: New page
- **WHEN** the user goes to page 2
- **THEN** every row is closed

### Requirement: Export only where decided
A list SHALL have no export unless the import-export topic gives it one. A list with an export SHALL export every row of its current filter in its current sort, not only the page shown. (SHELL-D13)

#### Scenario: List without an export
- **WHEN** a list that the import-export topic does not name is shown
- **THEN** it has no export button

#### Scenario: Export of a filtered list
- **WHEN** a list with an export is filtered by status and exported while page 1 of 3 shows
- **THEN** the file holds every row of that filter, in the order shown

### Requirement: Pick one record from a long list
A choice among a fixed list of at most {shell.select_max} options SHALL be a select. A choice of one record from a list that grows with the data SHALL be a picker field, which SHALL show the picked record's name or its empty text, a Choose button and, while a record is picked, a Clear button. Choose SHALL open a dialog that searches and pages the list on the server, {shell.picker_page_size} rows a page, where one record is picked at a time; the dialog SHALL open with the field's record picked and keep the pick across searches and pages. Confirm SHALL put the record in the field; Cancel or Esc SHALL leave the field as it was. A disabled field SHALL offer neither button. A form or a filter panel SHALL read the picked record's key. (SHELL-D14)

#### Scenario: Pick a record
- **WHEN** the user opens the field, searches, picks one record, picks a second and confirms
- **THEN** only the second record is in the field, with the Clear button

#### Scenario: Cancel leaves the field
- **WHEN** a field holding a record opens its dialog, another record is picked, and Cancel is pressed
- **THEN** the field still holds the first record

#### Scenario: A list of twenty thousand
- **WHEN** the list holds 20,000 customers
- **THEN** the dialog asks the server for one page at a time and never loads the whole list

### Requirement: History table of a detail page
The detail page of a record that changes SHALL end with a History section holding a DataTable of the record's Activity Log entries, newest first, with the columns When (date and time), By (the actor's name, or System), Action (the action's label), Status (Before → After for an entry that changed it, the one status for the entry that created the record, "—" otherwise) and Note ("—" when empty). It SHALL read one page at a time from the server, with the page size from {shell.page_sizes}, and SHALL offer no other sort and no column search. "No history yet" SHALL show only when the server answers no entry; a read that fails SHALL show the server's message with Retry. After a command on the page changes the record, the table SHALL read its first page again. (SHELL-D15)

#### Scenario: Paging through the server
- **WHEN** a record has 45 entries and the page size is 20
- **THEN** the table shows the newest 20, a pager of 3 pages and the total 45, and page 3 asks the server for page 3 and shows the 5 oldest

#### Scenario: Reload after a command
- **WHEN** `admin01`, on page 2 of a record's history, approves the record
- **THEN** the table reads page 1 again, and the Approve entry is first with its status change

#### Scenario: Read that fails
- **WHEN** the history read fails
- **THEN** the table shows the error with Retry, not "No history yet"

### Requirement: Required marks and field errors
Every field SHALL show its label at all times, tied to the field, and a required field SHALL carry the required mark. The browser SHALL check required fields and formats before sending and show each error under its field; the form SHALL not send while a field is invalid, and the focus SHALL go to the first invalid field. Values typed SHALL stay after any error. (SHELL-D16)

#### Scenario: Required field left empty
- **WHEN** a user saves a form with a required field empty
- **THEN** the error shows under that field, the focus moves to it, and nothing is sent

#### Scenario: Values kept
- **WHEN** a save fails for any reason
- **THEN** every value the user typed is still in the form

### Requirement: Server errors land on their fields
A validation error from the server that names a field SHALL show under that field, and one that names no field SHALL show as an alert at the top of the form. The server's answer SHALL win over the browser's check. (SHELL-D16)

#### Scenario: Code already used
- **WHEN** the server refuses a save because the code is already used
- **THEN** the message shows under the code field, and the focus moves there

#### Scenario: Error without a field
- **WHEN** the server refuses a save because someone else changed the record first
- **THEN** the alert at the top of the form says so, and the values stay

### Requirement: Unsaved changes guard
A screen holding unsaved edits SHALL ask before it is left. Leaving through the menu, the breadcrumb, the top bar or a link on the screen SHALL first show the kit's confirm "Leave without saving?", and Cancel SHALL keep the user on the screen with the edits. Reloading or closing the tab SHALL get the browser's own prompt. The browser's Back inside the web SHALL ask too where the web's router can stop it. A screen without unsaved edits, or right after a successful save, SHALL leave at once. (SHELL-D17)

#### Scenario: Menu with unsaved edits
- **WHEN** `clerk01` edits a field and presses another menu item
- **THEN** the confirm asks; Cancel keeps the edits on screen, and confirming opens the item

#### Scenario: Reload with unsaved edits
- **WHEN** `clerk01` has unsaved edits and reloads the page
- **THEN** the browser asks before it leaves the page

#### Scenario: Nothing to save
- **WHEN** `clerk01` opens a form and presses a menu item without changing anything, or right after a successful save
- **THEN** the item opens with no confirm

### Requirement: One submit per press
A button that sends a command SHALL show that it is busy and SHALL ignore further presses, Enter included, until the answer arrives; then it SHALL return to its normal state. The same SHALL hold for the confirm button of a dialog. (SHELL-D18)

#### Scenario: Double click
- **WHEN** a user double-clicks Save on a new record
- **THEN** one request is sent and one record is created

#### Scenario: Slow answer
- **WHEN** the answer takes five seconds
- **THEN** the button shows busy for those seconds, and pressing Enter sends nothing more

### Requirement: Success and error messages
A command that succeeds SHALL show a success toast that closes by itself after {shell.toast_seconds} seconds. An error SHALL show where it happened: under the field, at the top of the form, in the table or in the dialog. An error of a command with no place on the page, such as an action of a row, SHALL show as an error toast that stays until the user closes it. A message SHALL be the server's message in the project's label language and SHALL never be JSON, an internal code alone or a stack trace. (SHELL-D19)

#### Scenario: Save succeeds
- **WHEN** a save succeeds
- **THEN** a success toast shows and closes after {shell.toast_seconds} seconds

#### Scenario: Row action fails
- **WHEN** the action of a row fails
- **THEN** an error toast with the server's message shows and stays until closed

#### Scenario: Form save fails
- **WHEN** a form's save fails
- **THEN** no success toast shows, and the error shows in the form

### Requirement: Confirm before a destructive action
A delete, a cancel or any other action that cannot be undone SHALL ask first in the kit's confirm dialog, whose sentence names the record by its number or name and says what will happen to it. The confirm button SHALL be in the danger style, and the focus SHALL start on Cancel. While the action runs, a second confirm SHALL do nothing; a failure SHALL show inside the dialog. A normal save SHALL not ask. (SHELL-D20)

#### Scenario: Delete a customer
- **WHEN** `admin01` presses Delete on customer C-0012
- **THEN** the dialog says that customer C-0012, with its name, will be deleted, and Cancel has the focus

#### Scenario: Enter pressed at once
- **WHEN** the dialog opens and Enter is pressed at once
- **THEN** the dialog closes and nothing is deleted

#### Scenario: Delete fails
- **WHEN** the delete fails
- **THEN** the dialog stays open and shows the server's message

### Requirement: Error pages
An address the web does not have SHALL show the 404 page in the {portal}'s layout with a link to {start_page}. An unexpected failure SHALL show the 500 page, or an alert in the failed part when the rest of the page still works, with the request's reference and Retry and with no technical detail. A call that cannot reach the server SHALL say the connection failed and offer Retry. A page opened without its View key SHALL show the permission pack's no-access panel. A record that does not exist and a record outside the user's scope SHALL show the same not-found message. (SHELL-D21)

#### Scenario: Unknown address
- **WHEN** a signed-in user opens `/no-such-page`
- **THEN** the 404 page shows in the {portal}'s layout with a link to {start_page}

#### Scenario: Server failure
- **WHEN** a page's read answers 500
- **THEN** the page shows the error with a reference the team can find in the logs and Retry, and no stack trace

#### Scenario: Network down during a save
- **WHEN** the network drops while a form saves
- **THEN** the form says the connection failed, keeps the values and lets the user send again

#### Scenario: Record outside the scope
- **WHEN** a user opens the address of a record outside the user's scope
- **THEN** the page shows the same not-found message as for a record that does not exist

### Requirement: Session expired during use
An expired access token (`TOKEN_EXPIRED`) is not an expired session: the web SHALL refresh it and repeat the call without the user noticing. When any call answers that the session is missing or has expired, the web SHALL go to the sign-in page of its {portal} with `next` set to the current page's path and query, and SHALL say that the session timed out. After sign-in the user SHALL return to that page under the auth pack's rule for `next`. Unsaved values SHALL not be kept. (SHELL-D22)

#### Scenario: Expired on a list
- **WHEN** `clerk01` is on `/orders?status=open`, the session has expired, and `clerk01` moves to page 2
- **THEN** the web shows the sign-in page with the timeout message and `next` holding `/orders?status=open`, and after sign-in shows that list

#### Scenario: Expired during a save
- **WHEN** the session has expired and `clerk01` saves an open form
- **THEN** the web shows the sign-in page with `next` holding the form's address, and the typed values are not kept

### Requirement: Style guide only outside production
The style guide page SHALL show every kit component in every state in development, test and prototype builds, and SHALL be absent from production: the production build SHALL hold no style guide page, or its address SHALL answer 404. (SHELL-D23)

#### Scenario: Production
- **WHEN** a user opens the style guide's address on the production web
- **THEN** the 404 page shows

#### Scenario: Development
- **WHEN** a developer opens the style guide on the development web
- **THEN** it shows every component of the kit in every state

### Requirement: Accessibility basics
Every page SHALL meet these basics: every field has a label tied to it; every action works from the keyboard in a sensible order; the focus is always visible; a dialog takes the focus when it opens, keeps it inside and gives it back to its opener when it closes; a status never shows by colour alone; text contrast is at least {shell.text_contrast_min} against its background through the kit's tokens; and an icon-only button has an accessible name. (SHELL-D24)

#### Scenario: Keyboard only
- **WHEN** a user filters a list, opens a record, edits it and saves, using only the keyboard
- **THEN** every step works, and the focus is visible at each step

#### Scenario: Dialog focus
- **WHEN** a confirm dialog opens and then closes
- **THEN** the focus moves into the dialog and back to the button that opened it

#### Scenario: Status without colour
- **WHEN** a status badge shows
- **THEN** it carries its label as well as its colour

### Requirement: Supported browsers
The web SHALL work on the latest {shell.browser_versions} major versions of {shell.browsers} on desktop, and on tablet and phone browsers when the kit's devices include them. It SHALL not support Internet Explorer. The automated tests SHALL run on Chromium, and the other supported browsers SHALL be checked by hand before each delivery. (SHELL-D25)

#### Scenario: Each supported browser
- **WHEN** the style guide, a sample list and a sample form open on each supported browser
- **THEN** they work and look as they do on Chromium
