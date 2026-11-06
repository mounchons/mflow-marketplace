# permission requirements

Example people used in the scenarios: Dao (member of {superadmin}), Krit (member of group Sales-North), Nok (member of group Planning), Ploy (an account of {org} ORG-005 on the {org_portal}). Screen codes (`HOME`, `ORDERS`, `NEWS`, `CUSTOMERS`, `GROUPS`) and scope codes (`C001`…) are examples; the project's catalog replaces them.

### Requirement: Screen, grant and action catalog
The system SHALL hold a catalog of the {staff_portal} screens that can be granted. Each screen SHALL have a View checkbox and, when it has any write button, one or more write checkboxes; by default one Manage checkbox covers every action that View does not. View SHALL cover reading, preview and download. Each fine-grained action `<SCREEN>.<Action>` SHALL belong to exactly one checkbox of its own screen. Every screen SHALL have at least one checkbox and every checkbox SHALL cover at least one action. The catalog SHALL change only through a database migration. Screens that need no right (sign-in, forgot password, help, the session warning) SHALL not be in the catalog. (PERM-D03, PERM-D04)

#### Scenario: Action belongs to one checkbox
- **WHEN** the catalog is read for `ORDERS.Approve`
- **THEN** it is covered by the Manage checkbox of `ORDERS` and by no other checkbox

#### Scenario: Catalog integrity
- **WHEN** the catalog check runs after the migrations
- **THEN** every catalog screen has a View checkbox, and every checkbox covers at least one action

#### Scenario: Screen with a split checkbox
- **WHEN** the catalog is read for `NEWS`, whose Publish checkbox was split out of Manage
- **THEN** `NEWS.Publish` and `NEWS.Withdraw` are covered by Publish, and `NEWS.Create` stays under Manage

### Requirement: Groups hold grants per screen
A {staff_portal} account SHALL belong to exactly one group, and rights SHALL be granted to groups only, never to a person. A group SHALL hold any of the checkboxes of a catalog screen. Holding any checkbox other than View SHALL imply View on that screen and no other checkbox. Removing View SHALL remove every other checkbox of that screen. An unticked grant SHALL be kept as a deleted row and restored when ticked again, never inserted twice. (PERM-D01, PERM-D02, PERM-D05)

#### Scenario: Write checkbox implies View
- **WHEN** a group is given Manage on `ORDERS` and nothing else
- **THEN** it holds View and Manage on `ORDERS`

#### Scenario: Publish does not imply Manage
- **WHEN** a group is given only Publish on `NEWS`
- **THEN** it holds View and Publish on `NEWS` and not Manage

### Requirement: Seed groups and their rights
On first start, the system SHALL create the seed groups named by the customer's role table, {superadmin} among them, each with View on each screen its role opens and the checkbox that covers each write action its role may take. {superadmin} SHALL hold every checkbox of the group management screen; no other seed group SHALL hold any. When a migration adds a screen, a database whose seed groups already exist SHALL get that screen's checkboxes for {superadmin} only, written by `SYSTEM` with one `SetPermissions` Activity Log entry per checkbox. The prototype groups SHALL follow the same rules. (PERM-D15, PERM-D21)

#### Scenario: Rights follow the role table
- **WHEN** the system starts for the first time and the role table gives Sales View and Approve on orders
- **THEN** the Sales group holds View and Manage on `ORDERS` and nothing on `GROUPS`

#### Scenario: New screen on an existing database
- **WHEN** the migration that adds a `SETTINGS` screen runs on a database whose seed groups exist
- **THEN** only {superadmin} holds View and Manage on `SETTINGS`, and two `SetPermissions` entries name {superadmin}, the checkboxes and `SYSTEM`

#### Scenario: New screen on an empty database
- **WHEN** the same migration runs before any group exists
- **THEN** it adds no grant and no entry, and the seed then gives {superadmin} the screen

### Requirement: Keys for the current user
`GET /api/v1/me` SHALL return, for the signed-in user: the portal, the display name, the group or role, the fine-grained action keys the group's checkboxes cover, the menus of an {org_portal} account, the landing route, and, for a session still due for its first sign-in, what it still needs and then no action keys and no menus. It SHALL never return checkbox names in place of action keys, and never a password, token or secret. (PERM-D10)

#### Scenario: Keys, not checkbox names
- **WHEN** Krit, whose group holds Manage on `ORDERS`, calls `GET /api/v1/me`
- **THEN** the keys include `ORDERS.Approve` and `ORDERS.Reject` and the response holds no key named `Manage`

#### Scenario: Account of the {org_portal}
- **WHEN** Ploy, whose role opens Orders and Invoices, calls `GET /api/v1/me`
- **THEN** the response lists those two menus and no `<SCREEN>.<Action>` keys

#### Scenario: First sign-in still due
- **WHEN** a new account that has not yet accepted the terms signs in and calls `GET /api/v1/me`
- **THEN** the response says the terms are due and carries no keys and no menus

### Requirement: Server-side check on every endpoint
Every {staff_portal} endpoint SHALL declare the action key it needs, and every {org_portal} endpoint the menu it needs. A call without that key or menu SHALL answer 403 `ACCESS_DENIED`, return no data, and write an Activity Log entry naming the user and the refused key or menu. An endpoint that only needs a signed-in user of its portal SHALL declare that instead, and a public endpoint SHALL declare itself public. An endpoint with no declaration, or with a key missing from the catalog, SHALL fail the architecture test. (PERM-D08)

#### Scenario: Approve without the right
- **WHEN** Nok, whose group holds View only on `ORDERS`, posts to the order approve endpoint directly
- **THEN** the API answers 403 `ACCESS_DENIED`, the order is unchanged, and an Activity Log entry records the refused `ORDERS.Approve`

#### Scenario: Menu missing on the {org_portal}
- **WHEN** Ploy, whose role does not open Invoices, calls an invoice endpoint
- **THEN** the API answers 403 `ACCESS_DENIED` and writes an Activity Log entry

#### Scenario: Endpoint without a declaration
- **WHEN** a developer adds an endpoint with no key, menu, signed-in or public declaration
- **THEN** the architecture test fails and names the endpoint

### Requirement: Activity Log entries record the actor's role
Every Activity Log entry SHALL record the role of its actor at the time of the action: the group name for a {staff_portal} account, the portal's account type for an {org_portal} account, and `System` for jobs and writes made without a signed-in account. Moving a user to another group later SHALL not change entries already written. (PERM-D11)

#### Scenario: Role at the time of the action
- **WHEN** Krit approves an order while in Sales-North and is moved to Planning the next day
- **THEN** the approve entry still has role `Sales-North`

#### Scenario: Seed at first start
- **WHEN** the system creates the seed groups
- **THEN** their entries have role `System`

### Requirement: Rights change at the next sign-in
A change to a group's grants or scope SHALL apply from each member's next sign-in. A session SHALL keep the rights and scope it started with until it ends, at the latest at its absolute end set by the sign-in rules. Moving a user to another group SHALL end that user's sessions. Removing a menu from an {org_portal} role SHALL end the sessions of every account holding that role. In prototype mode, switching user SHALL count as a new sign-in. (PERM-D07)

#### Scenario: Grant removed during a session
- **WHEN** Dao removes Manage on `ORDERS` from Sales-North while Krit is signed in
- **THEN** Krit can still approve until he signs out or his session reaches its absolute end, and cannot after signing in again

#### Scenario: Scope narrowed during a session
- **WHEN** Dao changes Sales-North's Customers scope from C001–C050 to C001–C010 while Krit is signed in
- **THEN** Krit's customer list totals 50 until he signs in again, and 10 after

#### Scenario: User moved during a session
- **WHEN** Dao moves Krit from Sales-North to Planning while Krit is signed in
- **THEN** Krit's next request answers 401 `UNAUTHENTICATED`, and his next sign-in holds Planning's keys and scope

### Requirement: Menus and buttons follow the keys
The web app SHALL show a menu item only when the user has the View key of its screen, and SHALL hide a menu heading with no visible items. A menu SHALL carry the note "· view" only when its screen has a checkbox other than View and the user's group holds none of them. A button SHALL appear only when the user has its action key; when the user has the key but the record's state does not allow the action, the button SHALL show disabled with the reason. A screen opened by URL without its View key SHALL show the no-access panel with none of its data. (PERM-D09)

#### Scenario: Screen opened by URL
- **WHEN** Nok types the address of `GROUPS`
- **THEN** the page shows the no-access panel with no group data, and the API call behind it answers 403

#### Scenario: Read-only menu
- **WHEN** Nok signs in while Planning holds View only on `ORDERS`
- **THEN** the Orders menu shows with the "· view" note and no Approve button

#### Scenario: Key held, state does not allow
- **WHEN** Krit opens an order that is already approved
- **THEN** Approve shows disabled with the reason that the order is approved

### Requirement: Prototype current user and switcher
While prototype mode is on, the {staff_portal} SHALL offer a user switcher in its prototype banner, shown only after a sign-in, listing the Active {staff_portal} accounts that are not deleted. Switching SHALL end the current session and open a session of the chosen account without asking for its password, with a `Login` Activity Log entry that names the switch. Without a session the switch SHALL answer 401 `UNAUTHENTICATED`; a session due for its first sign-in SHALL get 403 `FIRST_LOGIN_REQUIRED`. The {org_portal} SHALL have no switcher, and its switch endpoint SHALL answer 404 `NOT_FOUND`. With prototype mode off, the switcher and its endpoints SHALL not exist. (PERM-D26)

#### Scenario: Switch after signing in
- **WHEN** Dao signs in on the {staff_portal} and picks Nok in the switcher
- **THEN** no password is asked, the page reloads as Nok with Planning's menus, Dao's session is ended, and the Activity Log holds a `Login` of Nok noting the switch

#### Scenario: Disabled account not offered
- **WHEN** Dao opens the switcher while a disabled account exists
- **THEN** the disabled account is not listed, and a switch to its id answers 404 `NOT_FOUND`

#### Scenario: Prototype mode off
- **WHEN** a client calls the switch endpoint with prototype mode off
- **THEN** the endpoint does not exist and answers 404

### Requirement: Data scope per group and menu
A {staff_portal} group SHALL hold a {scope} scope for each menu that has scoped data. For each menu the scope SHALL be All, or a List of {scope} codes. A menu without a setting SHALL mean that nothing is in scope, a new group SHALL start with no setting, and the scope of each menu SHALL be independent of the others. (PERM-D12, PERM-D13)

#### Scenario: Different scope per menu
- **WHEN** Planning holds Orders = List C001–C100 and Customers = All
- **THEN** its Orders scope is exactly those 100 codes and its Customers scope is every {scope}

#### Scenario: New group sees nothing yet
- **WHEN** Dao creates a group and grants it View on `CUSTOMERS`
- **THEN** its members' customer list is empty until a Customers scope is set

### Requirement: Seed groups see every {scope}
On first start the seed groups SHALL get All on every scoped menu. A database created before scope existed SHALL be completed once: each seed group that has never had a scope setting SHALL get All on every scoped menu; a group whose settings were removed on purpose SHALL not get them back. (PERM-D16)

#### Scenario: Existing database
- **WHEN** a database whose seed groups have no scope setting starts with the release that adds scope
- **THEN** each seed group holds All on every scoped menu, and a restart adds nothing

### Requirement: Scope of the caller
Every read of data owned by a {scope} SHALL use the scope of the caller and SHALL fail closed: a {staff_portal} account gets its group's scope per menu; an {org_portal} account gets its own {org} only, on every menu, and the code never comes from the request; a sign-in, forgot-password or set-new-password request of the {org_portal} gets the {org} of the one account its e-mail or link names, never that of a session the browser still holds, and finding that account SHALL be the only read across {org} on a request path; background work (migration, seeding, jobs) gets All only when that work states it for itself; a caller who is not signed in gets nothing. (PERM-D18)

#### Scenario: Not signed in
- **WHEN** customer contacts are read for a caller who is not signed in
- **THEN** no contact is returned

#### Scenario: {org_portal} account
- **WHEN** contacts are read for Ploy of ORG-005
- **THEN** only ORG-005's contacts are returned

#### Scenario: Sign-in with another account's session still open
- **WHEN** the browser still holds a session of ORG-001 and Ploy of ORG-005 signs in
- **THEN** her session opens with ORG-005's menus, and no read of that request sees ORG-001

#### Scenario: Job without the system scope
- **WHEN** a background job reads scoped data without stating the system scope
- **THEN** it gets nothing outside a caller's scope, never All

### Requirement: Scope cannot be switched off
Queries of scoped data SHALL always apply the scope of that data's menu, through one named filter that no query path turns off. Views that turn off the soft-delete filter SHALL keep the scope. Reads SHALL not use raw SQL outside migrations and seeding. The {scope} table itself SHALL carry no such filter, so records keep showing their owner; every user-facing read of it SHALL state the menu whose scope applies. (PERM-D14)

#### Scenario: Code turns the filter off
- **WHEN** a developer writes a query that turns off the scope filter and runs the architecture tests
- **THEN** the tests fail and name the method

#### Scenario: Raw SQL read
- **WHEN** a developer adds a raw SQL read of scoped data in a service
- **THEN** the architecture tests fail and name the method

#### Scenario: History view keeps scope
- **WHEN** a history view turns off only the soft-delete filter while Krit (Customers C001–C050) reads contacts
- **THEN** deleted contacts of C001–C050 are included and no contact outside that list appears

### Requirement: Out of scope answers not found
A record outside the caller's scope SHALL answer 404 `NOT_FOUND` with the same body as a record that does not exist, and SHALL return no part of the record. The request SHALL write an Activity Log entry `AccessDenied` with the record's document type and its id or code. (PERM-D17)

#### Scenario: Record outside the scope
- **WHEN** Krit (Customers C001–C050) opens customer C120 by typing its address
- **THEN** the API answers 404 `NOT_FOUND`, and an `AccessDenied` entry names Krit, document type `Customer` and `C120`

### Requirement: Splitting a checkbox keeps the rights already held
When a migration moves actions out of a checkbox into a new checkbox of the same screen, every group that holds the old checkbox on that screen SHALL get the new checkbox in the same migration, so no member loses a button. Each grant added this way SHALL write an Activity Log entry `SetPermissions` with the group, the added checkbox and `SYSTEM` as actor. Deleted groups SHALL gain nothing, and a database with no group SHALL get nothing from this step. (PERM-D06)

#### Scenario: Split on a database with groups
- **WHEN** the migration that splits Publish out of Manage on `NEWS` runs where Planning holds Manage on `NEWS` and Sales-North holds View only
- **THEN** Planning also holds Publish, Sales-North gains nothing, and one entry per added grant names the group, the checkbox and `SYSTEM`

#### Scenario: Split on an empty database
- **WHEN** that migration runs before any group exists
- **THEN** no grant and no entry is added, and the seed then gives the groups their rights

### Requirement: List groups
The group management screen SHALL list the groups with name, number of users and a short permission summary, paged as every list is: the number of screens the group can view and the number of screens where it holds any checkbox other than View. Only a holder of `GROUPS.View` SHALL see it. (PERM-D21)

#### Scenario: Summary counts a screen once
- **WHEN** a group holds View, Manage and Publish on `NEWS` and View only on `CUSTOMERS`
- **THEN** its summary counts 2 screens it can view and 1 it can change

### Requirement: Create and rename a group
A holder of `GROUPS.Create` SHALL create a group with a required name of at most {permission.group_name_max} characters, and a holder of `GROUPS.Edit` SHALL rename it. The name SHALL be unique ignoring case among groups that are not deleted; a duplicate SHALL be refused with a field error and nothing saved. The save SHALL ask for confirmation. A new group SHALL start with View on {permission.new_group_screen} only and no scope. (PERM-D19, PERM-D21)

#### Scenario: Duplicate name
- **WHEN** Dao creates a group named "planning" while Planning exists
- **THEN** the form shows a duplicate-name error and no group is created

#### Scenario: New group
- **WHEN** Dao confirms a new group "Viewers"
- **THEN** the group holds View on {permission.new_group_screen} only, and its members see only that screen and Help

### Requirement: Set grants per screen
A holder of `GROUPS.SetPermissions` SHALL tick the checkboxes of each catalog screen for a group. The grid SHALL list every catalog screen with one column per checkbox kind the catalog holds, show a checkbox only where the screen has it and a dash elsewhere, and list under each checkbox the buttons it covers. Ticking any checkbox other than View SHALL tick View; unticking View SHALL untick the screen's other checkboxes. Saving SHALL ask for confirmation and apply at the members' next sign-in; a failed save SHALL keep the previous rights and show an error. (PERM-D05, PERM-D07)

#### Scenario: Grant Manage
- **WHEN** Dao ticks Manage on `ORDERS` for Viewers and confirms
- **THEN** View on `ORDERS` is ticked too, and at their next sign-in the members see Approve and Reject

#### Scenario: Unticking View clears the screen
- **WHEN** Dao unticks View on `NEWS` for Planning, which holds View, Manage and Publish there
- **THEN** Manage and Publish on `NEWS` are unticked too

### Requirement: Set data scope per menu
A holder of `GROUPS.SetPermissions` SHALL set a group's scope on its group page: for each scoped menu, All or a List of {scope} codes. A menu's row SHALL show only when the group holds View on that menu's screen, with "Sees N of M". The list editor SHALL offer only codes within the editor's own scope for that menu, be searchable by code or name, and let the user select every code shown. Saving SHALL ask for confirmation, replace the group's scope on all menus together, and apply at the members' next sign-in; a failed save SHALL keep the previous scope. The save SHALL be refused with a field error, and nothing saved, when a code does not exist, a code is added outside the editor's own scope (codes already in the list and outside it are kept and shown as codes only), a menu is set to All while the editor's own scope for it is not All, or a List is empty. (PERM-D13, PERM-D20)

#### Scenario: Narrow a scope
- **WHEN** Dao sets Sales-North's Customers menu to C001–C060 and confirms
- **THEN** the row shows "Sees 60 of M", and after signing in again Krit's customer list totals 60

#### Scenario: Row follows View
- **WHEN** Dao opens a group that holds nothing on `ORDERS`
- **THEN** the scope box shows no Orders row

#### Scenario: Code outside the editor's scope
- **WHEN** an editor whose own Customers scope is C001–C050 gives a group C120
- **THEN** the API answers 400 with a field error naming C120 and nothing is saved

#### Scenario: All beyond the editor's scope
- **WHEN** that editor sets a group's Customers menu to All
- **THEN** the API answers 400 with a field error and nothing is saved

### Requirement: See users in a group
A holder of `GROUPS.ViewUsersInGroup` SHALL see the users of a group, read only, with full name, sign-in name and status, and no way to add or move users there; users move on the user management screen. The list SHALL hold the group's accounts that are not deleted, and the users count of the groups list SHALL count the same accounts. A group without users SHALL say that no user is in it and that users move on the user management screen. (PERM-D22)

#### Scenario: Members follow user management
- **WHEN** Dao creates an account in Planning and deletes another member of Planning
- **THEN** the users of Planning list the new account and not the deleted one, and the groups list counts them the same way

### Requirement: Every group change is recorded
Creating or renaming a group and every change of its grants or scope SHALL write Activity Log entries in the same transaction, naming the actor, the group, and the old and new names, grants or scope. (PERM-D21)

#### Scenario: Grants changed
- **WHEN** Dao removes Manage on `ORDERS` from Sales-North
- **THEN** a `SetPermissions` entry records the group, the removed grant and Dao as actor

#### Scenario: Scope changed
- **WHEN** Dao changes Sales-North's Orders scope from C001–C030 to All
- **THEN** `SetScope` entries record the group, the old List, the new All and Dao as actor

### Requirement: Only {superadmin} manages groups by default
In the seed, only {superadmin} SHALL hold any `GROUPS` grant. Another group SHALL reach group management only after {superadmin} grants it. (PERM-D21)

#### Scenario: Another group opens group management
- **WHEN** Nok types the address of `GROUPS`
- **THEN** the page shows the no-access panel and the API answers 403

### Requirement: Roles of the {org_portal}
When the system has an {org_portal}, its accounts SHALL each hold one role, kept apart from the {staff_portal} groups. A role SHALL open one or more {org_portal} menus and serve every {org}. {org_admin} SHALL open every menu, including account management, and be locked; no other role SHALL open account management. A holder of `GROUPS.View` SHALL get the roles that are not deleted, in sort order, each with its id, its English and Thai names, its menus in menu order, the number of accounts not deleted that hold it within the caller's scope, whether it is locked, and its version. (PERM-D23, PERM-D24)

#### Scenario: Role list
- **WHEN** Dao asks for the roles
- **THEN** the list holds {org_admin} (locked, every menu) and the other roles in sort order, each with its number of accounts

#### Scenario: Without the key
- **WHEN** Krit, whose group holds no `GROUPS` grant, asks for the roles
- **THEN** the API answers 403 `ACCESS_DENIED` and the Activity Log records the refusal

### Requirement: Create a role
A holder of `GROUPS.CreateRole` SHALL create a role with an English and a Thai name, each required and at most {permission.role_name_max} characters, the English name unique ignoring case among roles not deleted, and one or more menus other than account management. The new role SHALL go last in the sort order, and the creation SHALL write a `CreateRole` entry with the names and menus in the same save. A duplicate English name, a blank or over-long name, no menu, account management or an unknown menu SHALL answer 400 `VALIDATION_FAILED` on that field and create nothing. (PERM-D23, PERM-D24)

#### Scenario: New role
- **WHEN** Dao creates Planning with Orders and Forecast
- **THEN** Planning is listed last with those menus and no account, and the Activity Log holds `CreateRole`

#### Scenario: Account management refused
- **WHEN** Dao creates a role with Orders and account management
- **THEN** the API answers 400 `VALIDATION_FAILED` on `menus` and no role is created

### Requirement: Edit a role
A holder of `GROUPS.EditRole` whose scope on the menu of {org} records is All SHALL save a role's names and menus with the version the page read; a caller without that All SHALL get 403 `ACCESS_DENIED` with an `AccessDenied` entry, since a role spans every {org}. Changing the menus SHALL end the sessions of every account holding the role; changing only the names SHALL not. Any change to {org_admin} SHALL answer 409 `ROLE_LOCKED`, a stale version 409 `ROLE_CHANGED`, and a deleted or unknown role 404 `NOT_FOUND`, with nothing saved. The save SHALL write an `EditRole` entry with the old and new names and menus. (PERM-D07, PERM-D24)

#### Scenario: Menu removed while signed in
- **WHEN** Dao removes Invoices from a role while Ploy, who holds it, is signed in
- **THEN** Ploy's next request answers 401, and after signing in again her menus no longer include Invoices

#### Scenario: Rename only
- **WHEN** Dao renames that role while Ploy is signed in
- **THEN** the name changes and Ploy's session goes on

#### Scenario: Locked role
- **WHEN** Dao saves {org_admin} without one of its menus
- **THEN** the API answers 409 `ROLE_LOCKED` and {org_admin} keeps every menu

### Requirement: Delete a role
A holder of `GROUPS.DeleteRole` whose scope on the menu of {org} records is All SHALL soft-delete a role that no account not deleted holds, with the version the page read; its English name SHALL be free again, and the delete SHALL write a `DeleteRole` entry. A role in use SHALL answer 409 `ROLE_IN_USE`, {org_admin} 409 `ROLE_LOCKED`, a stale version 409 `ROLE_CHANGED`, a deleted or unknown role 404 `NOT_FOUND`, and a caller without All 403 `ACCESS_DENIED`. A delete and an account save that assigns the role SHALL never interleave: no account is left holding a deleted role. (PERM-D23, PERM-D24)

#### Scenario: Role in use
- **WHEN** Dao deletes a role that Ploy holds
- **THEN** the API answers 409 `ROLE_IN_USE` and the role stays

#### Scenario: Delete and assignment at once
- **WHEN** Dao deletes an unused role while another admin saves an account with that role
- **THEN** either the account holds the role and the delete answers 409 `ROLE_IN_USE`, or the role is deleted and the account save answers 400 `VALIDATION_FAILED` on `roleId`

### Requirement: Role screen on the {staff_portal}
The group management screen SHALL show no roles box while every {org_portal} account holds {org_admin}, and SHALL make no call to the role endpoints; the role endpoints SHALL stay on the API with their keys under the `GROUPS` Manage checkbox, ready for a screen later. (PERM-D25)

#### Scenario: No roles box
- **WHEN** Dao, who holds every `GROUPS` key, opens group management
- **THEN** the page shows the groups list and no roles box, and makes no call to the role endpoints
