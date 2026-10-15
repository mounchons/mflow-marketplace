# Users, roles and permissions in the kit

The kit is walked through as each kind of user, the way a show house is shown to a buyer and then to a caretaker: the menu, the buttons, the fields and the rows change with who is "signed in". Who that can be, and what each role may do, lives in two JSON files that every page reads directly. Nothing is copied into a script, so changing a grant changes every page at once.

## Files

```
mreq/ui/data/
├─ users.json     ← the sample users the switcher lists
├─ roles.json     ← each role's permission keys, data scope and landing page
└─ README.md      ← the data dictionary: where these came from, the permission keys, later the entities
```

`shell.js` finds the folder from its own address (`new URL("../data/", <shell.js URL>)`), so a page anywhere under `mreq/ui/` reads the same files. Pages must be served (`/mreq:theme open`), never opened as `file://`, because browsers block reading JSON there.

## users.json

An array; one to three users per role, spread across the units the data uses, so switching shows real differences.

```json
[
  { "id": "u-hr-01", "name": "สมหญิง ใจดี", "title": "เจ้าหน้าที่ HR", "roles": ["hr-staff"], "unitId": "hq" },
  { "id": "u-teacher-01", "name": "ประเสริฐ มั่นคง", "title": "ครู", "roles": ["teacher"], "unitId": "school-01" }
]
```

- `id`: stable string; never changes, so links and the remembered choice survive edits.
- `name`, `title`: Thai, realistic, never a real person's data (PDPA); the switcher shows "ชื่อ · ตำแหน่ง (role)".
- `roles`: role codes from roles.json.
- Scope keys the data needs (`unitId`, and so on). A visitor of a public-facing app is a user with no roles, or with a `visitor` role that holds only the public keys.

## roles.json

An array; one entry per role.

```json
[
  {
    "code": "hr-staff",
    "name": "เจ้าหน้าที่ HR",
    "permissions": ["Staff.View", "Staff.Edit", "Leave.Approve"],
    "dataScope": { "staff": "all", "leave": "unit" },
    "landingPage": "../prototype/Web.Backend/index.html"
  }
]
```

- `permissions`: permission keys; `"*"` grants every key (the all-permission user only).
- `dataScope`: per entity, one of `all`, `unit`, `unit-tree`, `own`, `assigned`. A missing entity means `all`.
- `landingPage`: where the role starts, relative to the kit's pages; optional until screens exist.

## Permission keys

`<Area>.<Action>` in PascalCase ASCII: `Jobs.View`, `Jobs.Approve`, `Jobs.ViewCost`. One key per page view, per action, and per field or section that some roles must not see. The keys are the single source for the menu, the buttons, the fields and the quick-view sections, and later for the real app's endpoint checks, which is why they are named for what they allow and never for a role. Every key is listed in README.md with its Thai meaning and the roles that hold it.

## How the kit uses them

- **Current user:** the id remembered by the switcher (local storage key `mreq.user`, read and written inside `try`/`catch`), or the first user when there is none or it no longer exists. It is `kit.user`.
- **`kit.can('<key>')`:** true when any of the user's roles holds the key or `"*"`. `SidebarMenu`, `Button`, `Dropdown`, `Tabs`, `QuickView` and `DetailView` show or leave out their parts through it, and any element with `data-can="<key>"` is removed when it is false.
- **`kit.scope('<entity>')`:** the widest scope the user's roles give that entity. `datatable.js` filters sample rows by it before paging, using the rows' scope keys (`unitId`, `createdBy`, `assignedTo`), so each role visibly sees different rows.
- **Hiding is not protection.** The kit only shows what each role will see. **Real app:** every endpoint checks the same permission key and applies the same data scope in its query; a hidden page opened by URL returns 403.

## Where the grants come from

- **An approved access-control discussion doc** settles roles, permission keys, scopes and the users that show them; its approval writes both files and records the doc and its revision in README.md. Until such a doc exists, a draft settles nothing.
- **No such doc yet:** take the roles from `mreq/project/vision.md` `## Users and roles`. Create one user per role, and give each role the keys its main job there implies, tagged `[เสนอ]` in README.md, so switching already shows the difference. List those grants in theme's report as the part to check; the user's correction is the customer's and is applied as given. When the vision lists no roles, there is one user, `ผู้ดูแลระบบ`, with `"*"` and scope `all`.
- **Changes:** adding a user, a role or a key is part of the work in hand; say it in the summary. Renaming or removing a key, or changing a role code, affects every page that uses it: list those pages with the change, and make it on the user's word. A change to who may do what, once an access-control doc is approved, is a new access-control doc that supersedes it.

## README.md (data dictionary)

Thai, for the user and the builder. It starts with:
- **ที่มา:** the approved access-control doc and its revision, or "ยังไม่ได้ตกลงเรื่องสิทธิ์ สิทธิ์ด้านล่างเป็นข้อเสนอจาก vision" while there is none.
- **Permission keys:** a table `| key | ความหมาย | role ที่มีสิทธิ์ |`.
- **Roles and scopes:** a table `| role | ชื่อ | ขอบเขตข้อมูล |`.

Entity sections (field, Thai label, type, required, key or relation, example) are added later, as data models are agreed and screens are built.
