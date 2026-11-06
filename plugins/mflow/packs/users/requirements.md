# users requirements

Example people: Malee (`admin01`, SuperAdmin), Kong (`staff02`, group Sales), Dao (`helper03`, a group holding only the Manage Users keys), and Nida (`nida@example.com`), the first account of the {org} ORG-001.

### Requirement: Staff account fields managed here
The staff account and its sign-in columns come from the pack auth. This pack SHALL add and manage, for each staff account of the {portal}:
- a username, unique ignoring letter case among staff accounts that are not deleted, shown as the account's short name in lists, menus and the Activity Log, and never used to sign in;
- the full name, at most {users.name_max_length} characters;
- exactly one group.

The sign-in e-mail SHALL be unique ignoring letter case among staff accounts that are not deleted, and at most {users.email_max_length} characters. The username and e-mail of a deleted account SHALL be free for a new account. The same e-mail MAY belong to a staff account and a {org} account, because each portal looks only at its own accounts. (USERS-D03, USERS-D04, USERS-D10, USERS-D14)

#### Scenario: Username taken in other letter case
- **WHEN** an account is saved with username `KONG02` while `kong02` belongs to another staff account that is not deleted
- **THEN** the save is refused and nothing is saved

#### Scenario: Username of a deleted account
- **WHEN** `staff09` was deleted and Malee creates a new account with username `staff09`
- **THEN** it is accepted

#### Scenario: One group only
- **WHEN** a client sends a staff account with two groups
- **THEN** the save is refused, and the form offers no way to add a second group

### Requirement: Manage Users list
A holder of the View key SHALL see the staff accounts that are not deleted, never the system actor, with Username, Full name, Email, Group, Status and Last sign-in, paged on the server with the page sizes {users.page_sizes}. It SHALL search username, full name and e-mail, and filter by group and status, with Search and Clear. An empty list and a search without results SHALL show different messages. (USERS-D12)

#### Scenario: Filter by group and status
- **WHEN** Malee filters group Sales and status Disabled
- **THEN** only the Disabled accounts of Sales are listed

#### Scenario: Search without results
- **WHEN** Malee searches `zzz`
- **THEN** the page shows the no-results message with Clear filters, not the empty-list message

### Requirement: Create a staff account
A holder of the Create key SHALL create a staff account with username, full name, e-mail and one group, after a confirmation. There SHALL be no password field. The group SHALL be within the editor's reach (requirement "Groups within the editor's reach"); otherwise the API SHALL answer 403 `ACCESS_DENIED`, write an Activity Log entry and create nothing. The new account SHALL be Invited, and a password link with the e-mail `account.password_link` SHALL be queued to its e-mail in the same save. A username or e-mail already taken SHALL be refused with a message under that field only, and nothing SHALL be created. The Activity Log SHALL hold the creation. (USERS-D02, USERS-D05)

#### Scenario: New account
- **WHEN** Malee creates `staff05`, `pim@example.com`, Pim Jaidee, group Sales, and confirms
- **THEN** staff05 is listed as Invited, one `account.password_link` with its link is queued to `pim@example.com`, and the Activity Log holds the creation under Malee

#### Scenario: Group beyond the editor
- **WHEN** Dao creates an account in the SuperAdmin group
- **THEN** the API answers 403 `ACCESS_DENIED`, no account and no e-mail are created, and the Activity Log records the refusal

#### Scenario: E-mail taken
- **WHEN** Malee creates an account with `PIM@example.com` while `pim@example.com` belongs to staff05
- **THEN** the save is refused with "Email already in use" under Email, and no account or e-mail is created

### Requirement: Edit a staff account
A holder of the Edit key SHALL change the username, full name, e-mail and status of a staff account after a confirmation, under the uniqueness rules of "Staff account fields managed here". Changing another account's e-mail SHALL also need that account's group to be within the editor's reach; the e-mail counts as changed when it differs after trimming and ignoring letter case. Changing the group SHALL also need the AssignGroup key, and both the current group and the new group within the editor's reach. A refusal for a key or for reach SHALL answer 403 `ACCESS_DENIED`, change nothing, and write an Activity Log entry on the account.

The status SHALL be chosen from Active, Inactive and Disabled; Invited is set by the system, and an account that has not accepted the terms SHALL stay Invited when Active is chosen. A save based on an older version of the account SHALL be refused as changed by someone else. Each change SHALL write an Activity Log entry with the old and new values. (USERS-D05, USERS-D07, USERS-D08)

| Change | Also |
|---|---|
| status away from Active, e-mail | ends the account's sessions |
| group | ends the account's sessions, so the new group's rights hold from its next sign-in |
| full name, username | applies from the account's next sign-in; sessions go on |

#### Scenario: Disable an account
- **WHEN** Malee sets Kong's account to Disabled while Kong is signed in, and confirms
- **THEN** Kong's next request is unauthenticated, and the Activity Log holds the old and new status

#### Scenario: Group change without the key
- **WHEN** an editor holding Edit but not AssignGroup sends a save that moves Kong to another group
- **THEN** the API answers 403 `ACCESS_DENIED`, Kong's group is unchanged, and the Activity Log records the refusal

#### Scenario: E-mail of an account beyond the editor
- **WHEN** Dao changes Malee's e-mail to `dao2@example.com`
- **THEN** the API answers 403 `ACCESS_DENIED`, Malee keeps her e-mail and her sessions, and the Activity Log records the refusal on Malee

#### Scenario: Full name of an account beyond the editor
- **WHEN** Dao changes Malee's full name and keeps her e-mail
- **THEN** the save succeeds and Malee's sessions go on

#### Scenario: Active on an Invited account
- **WHEN** Malee saves staff05, still Invited, with status Active
- **THEN** staff05 stays Invited until its first sign-in accepts the terms

#### Scenario: Two editors
- **WHEN** Malee and another SuperAdmin open Kong's account and both save
- **THEN** the second save is refused as changed by someone else, and the first one stays

### Requirement: An editor's own account
A user SHALL not change their own status or group, and SHALL not delete their own account; each attempt SHALL be refused with a message and change nothing. A user MAY change their own full name and e-mail on the form, since their own group is always within their reach. (USERS-D06)

#### Scenario: Own status
- **WHEN** Malee sets her own account to Inactive
- **THEN** the save is refused with a message, and her status stays Active

#### Scenario: Own e-mail
- **WHEN** Dao changes her own e-mail
- **THEN** the save succeeds

### Requirement: Groups within the editor's reach
A group SHALL be within an editor's reach when every key it grants is a key the editor holds and, on every menu with a data scope, the group's scope lies inside the editor's: All only under the editor's All, a list only under the editor's All or a list holding each of its values, and no scope under any scope. The editor's keys and scope SHALL be those of the editor's session. One's own group SHALL always be within one's own reach, and every group of the seed SHALL be within the reach of the SuperAdmin group. (USERS-D05)

| The group holds | The editor holds | Within reach |
|---|---|---|
| keys K, scope S on every menu | every key of K, a scope covering S on every menu | yes |
| a key the editor lacks | — | no |
| All on a menu | a list on that menu | no |
| a list with a value outside the editor's list on that menu | — | no |
| a list on a menu | All on that menu | yes |
| no scope on a menu | no scope on that menu | yes |

#### Scenario: A key beyond the editor
- **WHEN** a group grants the key to set permissions and the editor does not hold it
- **THEN** the group is not within the editor's reach

#### Scenario: All beyond a list
- **WHEN** a group has All on a menu and the editor has a list on that menu
- **THEN** the group is not within the editor's reach

#### Scenario: A list under All
- **WHEN** a group has a list on a menu and the editor has All on that menu
- **THEN** that menu does not keep the group out of reach

### Requirement: Reset password by an administrator
A holder of the ResetPassword key SHALL send a staff account a new password link with the e-mail `account.password_link`, after a confirmation. It SHALL not change the current password, which keeps working until the link is used, and it SHALL revoke the account's earlier unused links. It SHALL count toward {users.reset_links_per_hour} links an hour of the account, together with forgot-password links; one more SHALL be refused with a message saying so and queue nothing. The Activity Log SHALL hold the reset. No screen SHALL show a password or a link. (USERS-D09)

#### Scenario: Reset password
- **WHEN** Malee presses Reset password on Kong's account and confirms
- **THEN** one `account.password_link` with a new link is queued to Kong, Kong's earlier unused links stop working, his current password still signs in, and the Activity Log holds the reset under Malee

#### Scenario: Over the hourly limit
- **WHEN** Kong already got {users.reset_links_per_hour} links in the last hour and Malee presses Reset password again
- **THEN** the API refuses with a message that the limit was reached and queues nothing

### Requirement: Delete a staff account
A holder of the Delete key SHALL delete a staff account after a confirmation that says it cannot be undone. Deleting SHALL be soft, end the account's sessions, revoke its unused links and write a delete entry to the Activity Log. A deleted account SHALL leave the list and never sign in. Deleting one's own account SHALL be refused. (USERS-D06, USERS-D10)

#### Scenario: Delete own account
- **WHEN** Malee presses Delete on her own account
- **THEN** the delete is refused with "You cannot delete your own account"

#### Scenario: Delete an account
- **WHEN** Malee deletes staff05 and confirms
- **THEN** staff05 leaves the list, its sessions end, signing in as `pim@example.com` gets the generic sign-in failure, and the Activity Log holds the delete

### Requirement: Activity history of an account
The account form SHALL show, to a holder of the View key, the `activity_log` entries whose subject is that account or whose `actor_id` is that account's `actor` row, newest first and paged, each with action, summary, time and the actor's name. They SHALL include its creation, every edit, group change, status change, password link and delete, and its sign-in events. (USERS-D11)

#### Scenario: History after a reset
- **WHEN** Malee reset Kong's password and opens Kong's account
- **THEN** the newest history entry is the reset by Malee with its date and time

### Requirement: Keys of Manage Users
Each button of Manage Users and its endpoint SHALL check its own key: View (list, open, history), Create, Edit, AssignGroup, ResetPassword and Delete. Without the key the button SHALL not show, and the endpoint SHALL answer 403 `ACCESS_DENIED` with an Activity Log entry. In the seed only the SuperAdmin group SHALL hold these keys. (USERS-D01, USERS-D12)

#### Scenario: No key
- **WHEN** Kong opens the Manage Users address directly
- **THEN** the page shows the no-access panel and the API answers 403

### Requirement: Manage Users screens on the {portal}
The {portal} SHALL serve the Manage Users list and the account form (no id for a new account), built from the UI kit. The form SHALL hold username, full name, e-mail, group and status (no status and no password on a new account), and in edit mode the activity history and the Reset password and Delete buttons. Save, Reset password and Delete SHALL ask for confirmation, Delete in the irreversible style. Leaving with unsaved changes SHALL ask first. The Reset password dialog SHALL say that a link is e-mailed, never a temporary password. (USERS-D02, USERS-D09)

#### Scenario: New account form
- **WHEN** Malee presses Create
- **THEN** the form opens with username, full name, e-mail and group, and no password or status field

### Requirement: Organisation account record
When the project has {org} accounts, the system SHALL hold each {org} account with its {org}, its sign-in e-mail, its contact name (at most {users.name_max_length} characters), an optional phone (at most {users.phone_max_length} characters), its role, and its own status, separate from the status of its {org}; the sign-in columns come from the pack auth. The e-mail SHALL be unique ignoring letter case among the {org} accounts that are not deleted of every {org}, so one e-mail is one account of one {org}. A {org} SHALL hold at most {users.org_account_limit} accounts that are not deleted, counted while the {org} row is locked. Accounts SHALL be soft-deleted.

On the {org_portal} an account SHALL read only the accounts of its own {org}. On the {portal} the accounts of a {org} SHALL be read only within the caller's data scope over {org}; a {org} outside it SHALL answer 404 `NOT_FOUND`. (USERS-D13, USERS-D14, USERS-D17, USERS-D22)

#### Scenario: E-mail of another organisation
- **WHEN** an account `NIDA@example.com` is added to ORG-002 while `nida@example.com` belongs to ORG-001
- **THEN** the API answers 400 `VALIDATION_FAILED` on the e-mail field without naming ORG-001, and nothing is saved

#### Scenario: Limit reached
- **WHEN** an account is added to ORG-001, which holds {users.org_account_limit} accounts that are not deleted
- **THEN** the API answers 409 `ACCOUNT_LIMIT_REACHED` and no e-mail is queued

#### Scenario: Two adds for the last place
- **WHEN** two staff members add an account to ORG-001, which has one place left, at the same moment
- **THEN** one account is added and the other request answers 409 `ACCOUNT_LIMIT_REACHED`

#### Scenario: Organisation out of scope
- **WHEN** Kong, whose scope does not hold ORG-120, asks for ORG-120's accounts
- **THEN** the API answers 404 `NOT_FOUND`, and the Activity Log records the refused access

### Requirement: Organisation roles
The roles of the {org_portal} SHALL be stored apart from the staff groups, each opening a set of {org_portal} menus that staff define. The seed SHALL hold one role, the {org} admin, opening every menu; it SHALL be locked against rename, menu change and delete, and only it SHALL open the accounts menu. Every {org} account SHALL hold the {org} admin role unless the project chose sub-roles. An account's menus SHALL be those its role opens, fixed when its session starts; a change of its role or of its role's menus SHALL end its sessions. The dashboard, Profile and Help SHALL always be open. (USERS-D15, USERS-D16)

#### Scenario: Seeded role
- **WHEN** the roles are read on a new database
- **THEN** the {org} admin role exists, opens every menu of the {org_portal}, and cannot be renamed or deleted

#### Scenario: Role of a new account
- **WHEN** staff add an account to ORG-001 with no role
- **THEN** the account holds the {org} admin role

### Requirement: First account of an organisation
The first account of a {org}, added by staff or created by an import, SHALL hold the {org} admin role and be Invited. When the {org} has no primary account, the new account SHALL become its primary account. A primary account SHALL belong to the same {org}. (USERS-D18, USERS-D21)

#### Scenario: First account becomes primary
- **WHEN** staff add Nida as the first account of ORG-001
- **THEN** Nida is Invited with the {org} admin role, and the list of organisations shows her as ORG-001's contact

#### Scenario: Primary of another organisation
- **WHEN** ORG-001's primary account is set to an account of ORG-002
- **THEN** it is refused

### Requirement: Invite with a starting password
Inviting a {org} account SHALL:
- generate a starting password of {users.initial_password_length} characters holding upper-case letters, lower-case letters and digits, inside the password policy of the pack auth;
- keep it only as a hash in an invite token that expires {users.invite_hours} hours later, and revoke every earlier unused invite token of the account;
- leave the account's own password empty and its status Invited;
- queue the e-mail `account.invite` to that account's e-mail only, with the {org} name, its code and the contact name, the starting password travelling in the queue only encrypted and cleared {users.queued_secret_hours} hours after it was queued.

The first sign-in with the starting password SHALL ask for a new password and the terms, as the pack auth describes. (USERS-D19)

#### Scenario: Account invited
- **WHEN** Nida's account is invited on 18/10/2026 at 10:00
- **THEN** one invite token of her account expires {users.invite_hours} hours later, and one `account.invite` is queued to `nida@example.com` with the password encrypted

#### Scenario: Invited again
- **WHEN** an account with an unused invite token is invited again
- **THEN** the earlier token stops working, a new one is made, and a new `account.invite` is queued

### Requirement: Staff manage organisation accounts
On the {portal}, holders of the matching keys SHALL add an account to a {org} within their scope, and edit an account's e-mail, contact name, phone, role and status (Active, Inactive or Disabled; Invited is refused with 400 `VALIDATION_FAILED`, since only the system sets it), with the version the page read. A new account SHALL be Invited and invited while its {org} is Active; while the {org} is not Active it SHALL get no invite until a re-invite. A version older than the stored one SHALL answer 409 `ACCOUNT_CHANGED`; an account deleted or of another {org} SHALL answer 404 `NOT_FOUND`. Each save SHALL write an Activity Log entry with the old and new values and no password or token value. (USERS-D17, USERS-D23)

| The save changes | Result |
|---|---|
| the e-mail, saved Active while the {org} is Active | every unused token revoked, password emptied, terms acceptance cleared, sessions ended; the account becomes Invited and `account.invite` goes to the new e-mail only |
| the e-mail, saved not Active or while the {org} is not Active | as above, with the saved status (Active shows Invited) and no e-mail |
| the role | the account's sessions end; its next sign-in opens the new role's menus |
| the status away from Active | the account's sessions end and it signs in no more |
| the status to Active on an account that has not accepted the terms | the account stays Invited |
| only the contact name or phone | sessions go on |

#### Scenario: E-mail changed to another person
- **WHEN** staff change Nida's Active account to `arun@example.com` while Nida is signed in
- **THEN** the account is Invited with no password and no terms acceptance, Nida's next request is unauthenticated, the old e-mail and password no longer sign in, and one `account.invite` is queued to `arun@example.com` only

#### Scenario: Account added to an organisation that is not Active
- **WHEN** staff add an account to ORG-003, whose status is Suspended
- **THEN** the account is Invited, with no invite token and no e-mail queued

#### Scenario: Contact name only
- **WHEN** staff change Nida's contact name while she is signed in
- **THEN** her session goes on, and the Activity Log holds the old and new name

### Requirement: Organisation admin manages its own accounts
On the {org_portal}, an account whose role opens the accounts menu SHALL add, edit, re-invite and set the primary account for the accounts of its own {org} only, under the rules of "Staff manage organisation accounts", "Re-invite" and "Primary account". It SHALL not change its own status or role, nor delete itself. (USERS-D15)

#### Scenario: Another organisation's account
- **WHEN** Nida saves, under ORG-001, the id of an account of ORG-002
- **THEN** the API answers 404 `NOT_FOUND` and saves nothing

### Requirement: Re-invite
Re-inviting SHALL be allowed only for an Invited account, expired invite or not: every earlier unused invite token SHALL be revoked and the account invited as "Invite with a starting password" says. An account that is not Invited SHALL answer 409 `ACCOUNT_NOT_INVITED` and queue nothing; an Active account that forgot its password uses forgot password. A {org} that is not Active SHALL answer 409 `ORG_NOT_ACTIVE` and queue nothing. The re-invite SHALL write an Activity Log entry. (USERS-D20)

#### Scenario: Expired invite sent again
- **WHEN** staff re-invite Nida, whose starting password expired
- **THEN** a new invite token is made, one `account.invite` is queued, the old starting password no longer signs in and the new one does

#### Scenario: Active account
- **WHEN** staff re-invite an Active account
- **THEN** the API answers 409 `ACCOUNT_NOT_INVITED` and no e-mail is queued

### Requirement: Primary account
A holder of the matching key SHALL make any account not deleted of a {org} within their scope that {org}'s primary account, whatever its status, with the {org}'s version the page read. The primary account SHALL give no management right; it SHALL be the contact the list of organisations shows. The change SHALL write an Activity Log entry with the old and new primary e-mail. (USERS-D21)

#### Scenario: Another contact
- **WHEN** staff make Arun ORG-001's primary account in place of Nida
- **THEN** ORG-001's row shows Arun, Nida's account is unchanged, and the Activity Log names both e-mails

### Requirement: No one sees a password
No response of the API SHALL carry a password, its hash, a token or an encrypted starting password; an account in a response SHALL carry only the date its invite was sent and whether that invite expired. The Activity Log SHALL record a password or token column as changed without its value. The values of a queued e-mail SHALL not hold the password in clear. The only exception SHALL be the prototype mailbox of the pack mail, which exists only in development and prototype stacks. (USERS-D27)

#### Scenario: Account in a detail
- **WHEN** staff read ORG-001's detail after Nida was invited
- **THEN** Nida's account shows e-mail, contact name, Invited, the invite date and "not expired", and no field holds a password or token

#### Scenario: Encrypted password cleared
- **WHEN** an `account.invite` was queued {users.queued_secret_hours} hours ago and the clearing runs
- **THEN** that e-mail no longer holds the encrypted password

### Requirement: Profile shows the organisation and the contact
A signed-in {org} account SHALL read its own Profile on the {org_portal}: its {org}'s code, name and status, read-only, and its own contact name, phone and sign-in e-mail. Profile SHALL be open to every account whatever its menus, and SHALL never show or take another account's data, a password, a hash or a token. No Profile field SHALL change the {org}, a status or the role. (USERS-D24)

#### Scenario: Read own Profile
- **WHEN** Nida opens Profile
- **THEN** it shows ORG-001, its name and status read-only, and her name, phone and `nida@example.com` editable

### Requirement: Edit contact on Profile
An account SHALL change its own contact name, phone and sign-in e-mail on Profile, after a confirmation, under the length rules of "Organisation account record" and the e-mail uniqueness of that requirement; a taken e-mail SHALL be refused on the e-mail field, save nothing and keep what was typed. A changed e-mail SHALL need the account's current password in the same save; a missing or wrong one SHALL be refused on that field only and save nothing, and a wrong one SHALL count as a failed sign-in attempt for the lock of the pack auth. A save over a newer version of the account SHALL answer 409 and save nothing. A saved e-mail SHALL be the sign-in name from the next sign-in on, keep the account's status and password, and end its other sessions. The Activity Log SHALL hold the old and new values. (USERS-D25)

#### Scenario: E-mail changed with the current password
- **WHEN** Nida changes her e-mail to `nida.s@example.com`, gives her current password and confirms, while also signed in on another computer
- **THEN** the e-mail is saved, the other computer's session ends, and the next sign-in works with `nida.s@example.com` only

#### Scenario: E-mail changed without the current password
- **WHEN** Nida changes her e-mail and leaves the current password empty or types a wrong one
- **THEN** only the current password field is flagged and nothing is saved

#### Scenario: Phone only
- **WHEN** Nida changes only her phone
- **THEN** it is saved without asking for the current password, and her session goes on

### Requirement: Change password on Profile
An account SHALL change its own password on Profile with its current password, a new password and its confirmation, after a confirmation. A wrong current password SHALL be refused on that field only, change nothing, and count as a failed sign-in attempt. The new password SHALL follow the password policy and history rule of the pack auth; a refusal SHALL name every rule it breaks. A saved password SHALL set its change time and a new expiry, end the account's other sessions while keeping the one that changed it, and write a password-changed entry without a value. (USERS-D26)

| Case | Answer |
|---|---|
| current password wrong | refused on the current password field; counted for the lock |
| confirmation differs | refused on the confirmation field |
| new password breaks a rule | refused, naming every rule it breaks |
| new password is one of the recent ones | refused as a recent password |
| everything right | saved; other sessions end; expiry reset |

#### Scenario: Confirmation differs
- **WHEN** Nida types the right current password and two different new passwords
- **THEN** the confirmation field is flagged and the password does not change

#### Scenario: Password changed
- **WHEN** Nida changes her password while also signed in on another computer
- **THEN** the other computer's session ends, this session goes on, and the Activity Log holds the change without a value
