# settings requirements

The System settings screen and the rules every value on it follows: one catalog built from the params.md of the selected packs and the project's own keys, values stored in one table, secrets encrypted with a key from env, a check of the whole tab, confirmation of dangerous changes, one save per tab with a version per value, an Activity Log entry per save, and values that apply without a restart. Each value, its range and its effect belong to the pack that owns it. Example people: `admin01` holds `{settings_view_key}` and `{settings_manage_key}`; `viewer01` holds `{settings_view_key}` only; `clerk01` holds neither.

### Requirement: Settings catalog
The system SHALL hold one catalog of settings in code, changed only with the code. It SHALL hold every key of the params.md of each selected pack, except the keys its owning pack keeps off the screen, the keys the system writes itself and the keys that have a screen of their own, plus the project's own keys. A secret SHALL always be in the catalog. Each entry SHALL give its key, its tab, its kind, its unit, its range, choices or length, its default, whether it is per {portal}, its security bound and its confirmation rule when its owning pack marks them, its name in English and Thai, and two lines in English and Thai: what it is and does, and what a change does. There SHALL be one tab per pack, or one per area its owning pack names, in the order of the packs and then the project's tabs; keys SHALL keep the order of their params.md. The database SHALL hold only values. (SET-D01, SET-D02, SET-D06)

#### Scenario: A selected pack's keys show up
- **WHEN** the project selects a pack whose params.md has five keys, one marked as not on the screen
- **THEN** the catalog holds the other four in one tab named after the pack, in the order of its params.md

#### Scenario: Every field explains itself
- **WHEN** the catalog is read
- **THEN** every entry has a name, a what-it-does line and an after-a-change line in English and Thai, a default, and a range, choices or length

#### Scenario: A key with its own screen
- **WHEN** a pack's key is edited on a screen of its own, such as a job's schedule
- **THEN** the catalog does not hold it

### Requirement: Values stored and filled at start
The system SHALL store each value in `system_setting`, one row per key and, for a per-portal key, per {portal}. At every start it SHALL add the row of each catalog key that has none, with the value env seeds (requirement "Values moved from env") or else the default, and SHALL never overwrite a stored value. Rows SHALL never be deleted; a key that left the catalog SHALL keep its row and SHALL not be read. (SET-D04, SET-D20)

#### Scenario: First start
- **WHEN** the API starts on an empty database
- **THEN** every catalog key has a row holding its default, and a per-portal key has one row per portal

#### Scenario: Restart keeps saved values
- **WHEN** `admin01` saved the e-mail rate as 300 and the API restarts on a version whose default is 100
- **THEN** the rate stays 300

#### Scenario: A key leaves the catalog
- **WHEN** a new version drops a key from the catalog
- **THEN** its row stays, the screen does not show it, and nothing reads it

### Requirement: What stays in env
Env SHALL be limited to the database connection, the keys that sign tokens and cookies, the keys that encrypt secrets such as `SETTINGS_SECRET_KEY`, the values that differ per installed machine, such as portal addresses and file paths, and the emergency envs of requirement "Emergency override from env". Every other value a customer adjusts in use SHALL be a catalog key, including the host, port, user, password and sender of outside services such as SMTP, and feature switches such as OTP. When the catalog holds a secret, the API SHALL refuse to start with a `SETTINGS_SECRET_KEY` it cannot read, and in every environment but Development and Prototype also without one, with a message that names the env and shows no value. In Development and Prototype without the key, the API SHALL start, a save that sets a secret SHALL be refused naming the env, the other keys of the tab SHALL not be saved by that request, and the settings page SHALL say the key is missing. (SET-D03, SET-D08)

#### Scenario: Missing secret key
- **WHEN** the API starts in Production without `SETTINGS_SECRET_KEY` while the catalog holds the SMTP password
- **THEN** it stops with a message naming `SETTINGS_SECRET_KEY` and showing no value

#### Scenario: Development without the key
- **WHEN** the API starts in Development without `SETTINGS_SECRET_KEY` while the catalog holds the SMTP password
- **THEN** it starts, the page says the key is missing, and a save that sets the SMTP password is refused naming `SETTINGS_SECRET_KEY` and saves nothing

#### Scenario: A key that cannot be read
- **WHEN** the API starts in Development with a `SETTINGS_SECRET_KEY` it cannot read
- **THEN** it stops with a message naming `SETTINGS_SECRET_KEY` and showing no value

#### Scenario: Outside-service values on the screen
- **WHEN** a selected pack owns the host, port, user, password and sender of an outside service
- **THEN** they are fields of its tab, and none of them is read from env after the first start

### Requirement: Values moved from env
An env value that a catalog key replaces SHALL only seed that key, at a start when the key has no row. An unset or empty env value SHALL seed nothing, and the default SHALL apply. Once the row exists the system SHALL read only the stored value. When the env value is still set and differs from the stored value, the start SHALL write one warning naming the env and the key, with no value. (SET-D07)

#### Scenario: First start seeds from env
- **WHEN** the API first starts with the old env rate set to 300 and the old env allow-list unset
- **THEN** the e-mail rate is 300 and the allow-list holds its default

#### Scenario: Env changed later
- **WHEN** the rate is stored as 300 and the API restarts with the env rate set to 50
- **THEN** the rate stays 300, and the start writes a warning naming the env and the key with no value

#### Scenario: A value saved on the screen survives a restart
- **WHEN** `admin01` sets a value and the API restarts with its env unset
- **THEN** the value stays and no warning is written

### Requirement: Emergency override from env
An owning pack MAY name an emergency env for a key that could lock everyone out. While that env is set, the system SHALL use the value the owning pack fixes for it, from the start of the API, without changing the stored value. The read SHALL name the env on that field, and the page SHALL show "Overridden by env · ถูกบังคับโดย env" with the env's name; a save SHALL still change the stored value, which SHALL apply once the env is removed and the API restarted. No other env SHALL override a stored value. (SET-D22, SET-D07)

#### Scenario: Locked out by a switch
- **WHEN** a portal's code step is on, no code can be sent, and the deployer sets the emergency env the owning pack names and restarts the API
- **THEN** users sign in without a code, the stored switch is unchanged, and the page shows the field as overridden with the env's name

#### Scenario: The env is removed
- **WHEN** the deployer removes the emergency env and restarts the API
- **THEN** the stored value applies again

### Requirement: Value kinds
Each key SHALL be of one kind, checked as follows:

| Kind | Input | Check |
|---|---|---|
| whole number | number with its unit | a whole number within its range |
| on/off | switch | `true` or `false` |
| text | one line | trimmed, within its length, else {settings.text_max} characters, plus its owning pack's format such as one e-mail address |
| list | one item per line | items trimmed, empty lines dropped, duplicates dropped ignoring case, each item passing its owning pack's rule, at most {settings.list_items_max} items and {settings.list_max_chars} characters in all unless its owning pack gives other limits |
| choice | one of a fixed set | one of its choices |
| choices | ticks of a fixed set | only its choices, at least as many as its owning pack asks |
| secret | password field | requirement "Secrets" |

There SHALL be no decimal kind; a pack uses a smaller unit. A field of a kind the page does not know SHALL show its value as read-only text. (SET-D05)

#### Scenario: A list cleaned
- **WHEN** `admin01` saves an allow-list with "@example.com", an empty line and "@example.com" again in capitals
- **THEN** the stored list is one item, "@example.com"

#### Scenario: Not a whole number
- **WHEN** `admin01` saves the e-mail rate as 12.5
- **THEN** the API answers 400 `VALIDATION_FAILED` on that key and nothing is saved

#### Scenario: On/off value
- **WHEN** a save sends `yes` for an on/off key
- **THEN** the API answers 400 `VALIDATION_FAILED` on that key, while `true` is saved

#### Scenario: A choice that is not offered
- **WHEN** a save ticks a choice outside a key's set
- **THEN** the API answers 400 `VALIDATION_FAILED` on that key

### Requirement: Secrets
A key its owning pack marks secret SHALL be stored encrypted with `SETTINGS_SECRET_KEY` and decrypted only where it is used. No answer of the API SHALL carry it: the read SHALL say only whether it is set and whether it can be read. It SHALL never be written to a log, an error message, the page's HTML or the Activity Log, whose entry SHALL say the key changed with no value. In a save, an empty or missing secret SHALL keep the stored one; a secret SHALL be cleared only by an explicit clear in the request, which needs confirmation (requirement "Confirmation of a dangerous change"). A secret SHALL keep its leading and trailing spaces and SHALL be at most {settings.secret_max} characters unless its owning pack gives another limit. (SET-D08, SET-D09, AUDIT-D12)

#### Scenario: The read does not return the secret
- **WHEN** `admin01` reads the settings after the SMTP password was set
- **THEN** the field says it is set, and neither the answer nor the page holds the password or its length

#### Scenario: An empty field keeps the secret
- **WHEN** `admin01` changes the SMTP port and saves with the password field empty
- **THEN** the port is saved, the password stays as it was, and the Activity Log entry lists only the port

#### Scenario: A new secret
- **WHEN** `admin01` types a new SMTP password and saves
- **THEN** the stored value is encrypted, the entry lists the password as changed with no value, and no log line holds it

#### Scenario: An explicit clear
- **WHEN** `admin01` presses Clear on the SMTP password, confirms and saves
- **THEN** the password is not set, and the entry lists it as changed with no value

### Requirement: Changing or losing the secret key
While `SETTINGS_SECRET_KEY_PREVIOUS` holds the previous key, the start SHALL read each secret that key wrote and write it again with `SETTINGS_SECRET_KEY`, in one System entry `RotateSecretKey` naming the keys rewritten with no value. A secret that no given key can read SHALL not stop the system: the read SHALL say it cannot be read, the page SHALL ask for it again, the feature that uses it SHALL treat it as not set, and the start SHALL write a warning naming the key. (SET-D10)

#### Scenario: Key rotation
- **WHEN** the API starts with a new `SETTINGS_SECRET_KEY` and the old one in `SETTINGS_SECRET_KEY_PREVIOUS`
- **THEN** every secret can be read, is now written with the new key, and one `RotateSecretKey` entry by System names the keys with no value

#### Scenario: Key lost
- **WHEN** the API starts with a new key and no previous key
- **THEN** it starts, the SMTP password field reads "Stored value cannot be read. Enter it again. · อ่านค่าที่เก็บไว้ไม่ได้ กรุณากรอกใหม่", the mail line treats the password as not set, and the start writes a warning naming the key

### Requirement: Read the settings
`GET {api_prefix}/settings` SHALL answer a holder of `{settings_view_key}` with every tab of the catalog in order, and for each field its key, its {portal} when per portal, its names, its two lines of text, its kind, unit, range, choices or length, its default, its security bound and confirmation rule when it has them, the env that overrides it when one is set, its current value (for a secret only whether it is set and can be read) and its version, plus any note its owning pack attaches, and whether the caller holds `{settings_manage_key}`. Any other caller SHALL get 403 `ACCESS_DENIED` and no value, and the refusal SHALL be logged as an `AccessDenied` entry. (SET-D06, SET-D19)

#### Scenario: A full read
- **WHEN** `admin01` reads the settings
- **THEN** the e-mail rate shows its value, its range, its unit, its default, its version and both lines in English and Thai, and the answer says `admin01` may save

#### Scenario: View only
- **WHEN** `viewer01` reads the settings
- **THEN** the answer holds every tab and says `viewer01` may not save

#### Scenario: Without the View right
- **WHEN** `clerk01` reads the settings
- **THEN** the API answers 403 `ACCESS_DENIED`, returns no value, and an `AccessDenied` entry is written

#### Scenario: A note from the owning pack
- **WHEN** the SMTP host is still empty and the mail pack attaches the note that SMTP is not set
- **THEN** the answer carries that note on the e-mail tab

### Requirement: Save a tab
`PUT {api_prefix}/settings/<tab>` SHALL save, for a holder of `{settings_manage_key}`, the values of one tab that the request sends, each with the version the caller read, in one transaction, all or nothing. The check SHALL apply to the values the tab would hold after the save, the stored ones included:
- a value of the wrong kind, outside its range, choices or length, past its security bound, or failing its owning pack's rule or a rule between keys of the tab, SHALL answer 400 `VALIDATION_FAILED` listing every refused key with its message in English and Thai;
- a key that is not of that tab, or a value sent without its version, SHALL answer 400 `VALIDATION_FAILED` on that key;
- a version that is no longer the stored one SHALL answer 409 `SETTINGS_CHANGED` naming the keys;
- a caller without `{settings_manage_key}` SHALL get 403 `ACCESS_DENIED` with an `AccessDenied` entry.

Any of these SHALL save nothing. A save SHALL answer the tab as stored, with the new versions. (SET-D13, SET-D16, AUDIT-D10)

#### Scenario: One value saved
- **WHEN** `admin01` saves the e-mail tab with the rate 300 and the version read
- **THEN** the rate is 300 with a new version, and the answer holds the tab as stored

#### Scenario: Every error at once
- **WHEN** `admin01` saves a tab with one value below its range and another text too long
- **THEN** the API answers 400 `VALIDATION_FAILED` naming both keys, and neither is saved

#### Scenario: A rule between keys
- **WHEN** `admin01` saves the password minimum length 20 while the stored maximum stays 16
- **THEN** the API answers 400 `VALIDATION_FAILED` on the minimum length, and nothing is saved

#### Scenario: Key of another tab
- **WHEN** a save of the e-mail tab sends a key of the sign-in tab
- **THEN** the API answers 400 `VALIDATION_FAILED` on that key, and nothing is saved

#### Scenario: Two saves of one value
- **WHEN** `admin01` and another manager both read the rate at the same version, the other saves 200, then `admin01` saves 300
- **THEN** `admin01` gets 409 `SETTINGS_CHANGED` naming the rate, and the rate stays 200

#### Scenario: Two saves of different values
- **WHEN** two managers read the e-mail tab, one saves the rate and the other then saves the company name
- **THEN** both saves succeed

#### Scenario: Without the Manage right
- **WHEN** `viewer01` saves a tab
- **THEN** the API answers 403 `ACCESS_DENIED`, writes an `AccessDenied` entry and saves nothing

### Requirement: Security values are never looser than their bound
A key its owning pack marks as a security value SHALL have a bound: not below a value, not above a value, or never off. A mark without a value SHALL take the default as its bound, and follows the default when the customer's documents set one; a bound the customer's documents give SHALL replace the pack's. A pack-wide statement that names no direction SHALL mean that the ends of each key's range are its bounds. A save past the bound SHALL answer 400 `VALIDATION_FAILED` on the key with a message naming the bound, and save nothing. The range the read answers SHALL start at the bound. This pack SHALL enforce the mark the same way for every key; which keys carry it SHALL be up to their owning packs. (SET-D14)

#### Scenario: Past an explicit bound
- **WHEN** a password expiry of range 1–90 days is marked not above 60, and `admin01` saves 75
- **THEN** the API answers 400 `VALIDATION_FAILED` on it, naming 60, and nothing is saved

#### Scenario: The customer's default becomes the bound
- **WHEN** a security value is marked not above its default, its pack's default is 5, and the customer's documents set 3
- **THEN** the default is 3, saving 4 is refused, and saving 3 is accepted

#### Scenario: A switch that may not be turned off
- **WHEN** a switch is marked never off and its default is on, and `admin01` saves it off
- **THEN** the API answers 400 `VALIDATION_FAILED` on it, and the switch stays on

#### Scenario: Stricter is always allowed
- **WHEN** `admin01` saves a stricter value within the range
- **THEN** it is saved

### Requirement: Confirmation of a dangerous change
A save SHALL be refused with 400 `VALIDATION_FAILED` on each such key, with a message that says confirmation is needed and names the {portal} when per portal, the old and the new value and what the change does, and SHALL save nothing, when it makes a change its owning pack marks for confirmation (a list with items left empty, a switch turned off, a switch turned on) or clears a secret, unless the request says the user confirmed. With the confirmation the save SHALL go on as requirement "Save a tab" says. A save that makes none of these changes SHALL need no confirmation. (SET-D15, SET-D09)

#### Scenario: Allow-list emptied without confirmation
- **WHEN** the allow-list holds "@example.com" and `admin01` saves it empty with no confirmation
- **THEN** the API answers 400 `VALIDATION_FAILED` on the allow-list with the message that confirmation is needed, and the list stays "@example.com"

#### Scenario: Emptied with confirmation
- **WHEN** the same save carries the confirmation
- **THEN** the list is empty, and the Activity Log entry holds "@example.com" as old and an empty list as new

#### Scenario: A switch turned off
- **WHEN** `admin01` turns a portal's OTP switch off without confirmation
- **THEN** the API answers 400 `VALIDATION_FAILED` on that portal's switch with the message that confirmation is needed

#### Scenario: Already empty
- **WHEN** the allow-list is empty and `admin01` saves the e-mail tab with a new rate
- **THEN** no confirmation is needed

### Requirement: Activity Log of a save
A save that changes at least one value SHALL write, in its transaction, one Activity Log entry with action `SaveSettings`, document type `SystemSetting` and document id the tab, holding the old and the new value of every key it changed and the {portal} of a per-portal key; a secret SHALL be listed as changed with no value. A save that changes nothing SHALL write no entry. An effect the owning pack ties to a change, such as working out every password expiry again, SHALL run in the same transaction and write its own entries; if it fails, nothing SHALL be saved. (SET-D17, AUDIT-D04, AUDIT-D12)

#### Scenario: Old and new value
- **WHEN** `admin01` saves the rate from 100 to 300
- **THEN** one `SaveSettings` entry for the e-mail tab holds 100 as old and 300 as new

#### Scenario: Nothing changed
- **WHEN** `admin01` saves a tab with the values it already holds
- **THEN** no entry is written

#### Scenario: An effect fails
- **WHEN** a save changes a key whose owning pack recomputes accounts, and the recompute fails
- **THEN** neither the value nor any account changes, and no entry is written

### Requirement: When a saved value applies
A saved value SHALL apply without a restart, at the next use its owning pack names. The system SHALL read values through a cache that the saving instance drops after the commit and that other instances keep for at most {settings.cache_seconds} seconds. A request, a job run or an upload SHALL read the values it uses once, when it starts, and keep them to its end; work queued but not yet started SHALL use the value in force when it starts. Stored data SHALL not be changed by a new value unless its owning pack says so. (SET-D11, SET-D12)

#### Scenario: No restart
- **WHEN** `admin01` saves the rate 300
- **THEN** the next mail run on the same instance uses 300, and a run on another instance does within {settings.cache_seconds} seconds

#### Scenario: A run already started
- **WHEN** a mail run started with the rate 100 and `admin01` saves 300 during it
- **THEN** that run keeps 100, and the next run uses 300

#### Scenario: An upload in progress
- **WHEN** a 9 MB upload started under a 10 MB limit and `admin01` lowers the limit to 5 MB before it ends
- **THEN** that upload is taken, and the next 9 MB upload is refused

#### Scenario: Stored data stays
- **WHEN** `admin01` removes a file type from a list of accepted types
- **THEN** files of that type already taken stay as they are

### Requirement: Values per portal
A key its owning pack marks per portal SHALL have one row, one value and one version for each {portal}. The read SHALL answer one value per {portal}, the page SHALL show the field once with one input per {portal}, rules between keys SHALL apply within the same {portal}, and the Activity Log SHALL name the {portal} of each change. A {portal} added later SHALL get the default at the next start. A key without the mark SHALL have one value for the whole system. (SET-D20)

#### Scenario: Two portals, two values
- **WHEN** `admin01` sets the idle time-out to 30 minutes on one portal and leaves the other at 480
- **THEN** each portal keeps its own value, and the entry names the portal that changed

#### Scenario: A rule within one portal
- **WHEN** `admin01` saves one portal's idle time-out above that portal's longest session
- **THEN** the API answers 400 `VALIDATION_FAILED` on that portal's idle time-out, whatever the other portal holds

### Requirement: Reset to defaults
Each field SHALL offer Default, which puts the key's default into the draft, and each tab SHALL offer Reset tab, which puts the default of every key of the tab except secrets into the draft. Neither SHALL save by itself: Save SHALL then check, ask for confirmation and log as for any edit. The default SHALL be the project's: the value the customer's documents give, else the owning pack's. (SET-D18)

#### Scenario: One key back to its default
- **WHEN** the rate is 300, `admin01` presses Default beside it and saves
- **THEN** the rate is 100 and the entry holds 300 as old and 100 as new

#### Scenario: A tab back to its defaults
- **WHEN** `admin01` presses Reset tab on a tab whose allow-list holds items and whose SMTP password is set
- **THEN** the draft holds every default, the password is untouched, and Save first asks to confirm emptying the allow-list

### Requirement: Stored values a new version no longer accepts
At start, a stored value the catalog no longer accepts (outside its range or length, past its security bound, or a choice no longer offered) SHALL be set to the nearest value it accepts: the nearest end of its range or bound, or its choices without the withdrawn ones. A single choice, or choices left below their minimum, SHALL return to the default. Each change SHALL be saved by System with a `SaveSettings` entry holding the old and the new value, and the start SHALL write a warning naming the key. A secret SHALL not be touched by this. (SET-D21, AUDIT-D02)

#### Scenario: A range tightened
- **WHEN** a key held 720 and a new version narrows its range to 60–480
- **THEN** after the start it holds 480, a `SaveSettings` entry by System holds 720 as old and 480 as new, and a warning names the key

#### Scenario: A choice withdrawn
- **WHEN** a multi-choice key ticks a choice the new version no longer offers
- **THEN** the choice is removed from the stored value with an entry by System

### Requirement: Access to the settings screen
The settings screen SHALL be one screen of the project's permission catalog with View (`{settings_view_key}`) and Manage (`{settings_manage_key}`); at first start only `{superadmin}` SHALL hold them. A holder of View alone SHALL see every tab read only, with no Save, Cancel, Default, Reset tab or Clear. A user without View SHALL see no menu item, and the address SHALL show the no-access panel and call nothing. (SET-D19)

#### Scenario: Seed
- **WHEN** the first start has run
- **THEN** only `{superadmin}` holds `{settings_view_key}` and `{settings_manage_key}`

#### Scenario: View only on the page
- **WHEN** `viewer01` opens System settings
- **THEN** every field is read only and no tab has Save, Cancel, Default, Reset tab or Clear

#### Scenario: No View
- **WHEN** `clerk01` types the settings address
- **THEN** the menu has no System settings item, the page shows the no-access panel, and no settings call is made

### Requirement: System settings page
The web SHALL show System settings · ตั้งค่าระบบ at `/settings` to holders of `{settings_view_key}`, drawing its tabs and fields from the read only, in the order it answers, with no setting name, range or text of its own. The open tab SHALL be kept in the address. For each field the page SHALL show:
- its name, English · Thai;
- its input by kind (requirement "Value kinds") with its unit beside the value, one input per {portal} for a per-portal key;
- its range, choices or length, and its default;
- what it is and does, and what a change does, each in English and Thai;
- for a secret, "Set · ตั้งแล้ว" or "Not set · ยังไม่ได้ตั้ง", an empty field with "Enter a new value to replace it · กรอกค่าใหม่เพื่อแทนค่าเดิม", and Clear;
- Default while its draft differs from its default.

A tab SHALL show the notes its owning pack attaches and the actions its owning pack adds, such as a test send, which follow that pack's rules and need `{settings_manage_key}`. (SET-D05, SET-D06, SET-D09, SET-D18, SET-D20)

#### Scenario: Opening the page
- **WHEN** `admin01` opens `/settings`
- **THEN** the first tab is open with its fields, each with its name, value and unit, range and default, and its two lines in English and Thai, and the tab has Save, off, Cancel and Reset tab

#### Scenario: A per-portal field
- **WHEN** `admin01` opens a tab holding a per-portal key
- **THEN** the field shows one input per portal under one name

#### Scenario: A secret field
- **WHEN** `admin01` opens the tab of the SMTP password, which is set
- **THEN** the field reads "Set · ตั้งแล้ว" with an empty input and Clear, and the page holds no password

#### Scenario: An action of the owning pack
- **WHEN** the mail pack adds a test send to the e-mail tab
- **THEN** a holder of `{settings_manage_key}` sees it there, and `viewer01` does not

### Requirement: Save, Cancel and leaving on the page
Save SHALL send only the values of the open tab that differ from the ones the page read, each with its version, and SHALL be off while nothing differs. The page SHALL check nothing beyond its inputs' types.
- Before sending a change marked for confirmation or a clear, the page SHALL show a dialog listing each such change as a sentence (name, old value, new value, what it does) with a danger Save; Cancel SHALL send nothing and keep the draft.
- On success the tab SHALL show what the API stored, and a toast "Settings saved · บันทึกการตั้งค่าแล้ว".
- A 400 SHALL show each message under the field it names and keep the draft.
- A 409 SHALL show the banner "These settings were changed by someone else. Reload them. · มีผู้อื่นแก้ไขการตั้งค่านี้แล้ว กรุณาโหลดใหม่" with Reload, and keep the draft until Reload reads the settings again.

Cancel SHALL put back the values the page read. Choosing another tab or leaving the page with unsaved edits SHALL first ask to discard them: Stay keeps the tab and its edits, Discard drops them. (SET-D13, SET-D15, SET-D16)

#### Scenario: A value saved on the page
- **WHEN** `admin01` sets the e-mail rate to 300 and saves
- **THEN** the field shows 300, the toast says the settings are saved, Save is off again, and the Activity Log holds one `SaveSettings` entry

#### Scenario: Only what changed is sent
- **WHEN** `admin01` changes one field of a tab and saves
- **THEN** the save carries that field alone, with the version the page read

#### Scenario: A value the API refuses
- **WHEN** `admin01` sets the e-mail rate to 0 and saves
- **THEN** the API's message shows under that field, the input still holds 0, and nothing is saved

#### Scenario: Changed by someone else
- **WHEN** another manager saves the rate after `admin01` opened the tab, and `admin01` saves
- **THEN** the banner shows with Reload and the field keeps `admin01`'s draft; after Reload the field shows the stored value and Save is off

#### Scenario: The confirmation lists the change
- **WHEN** `admin01` empties an allow-list and turns a portal's OTP switch off, then saves
- **THEN** one dialog lists both changes as sentences, and nothing is sent until it is confirmed

#### Scenario: The confirmation cancelled
- **WHEN** `admin01` cancels that dialog
- **THEN** nothing is saved, the draft stays and Save stays on

#### Scenario: Cancel
- **WHEN** `admin01` changes two fields and presses Cancel
- **THEN** both fields show the values the page read, and Save is off

#### Scenario: Another tab with unsaved edits
- **WHEN** `admin01` changes a field and picks another tab
- **THEN** the page asks to discard the edits; Stay keeps the tab with the edit, and Discard opens the other tab
