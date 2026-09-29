---
name: screen
description: Build or adjust prototype screens in the real stack from the theme kit and shared JSON prototype data; also produces the screen inventory from the story map.
disable-model-invocation: true
argument-hint: "inventory [@source] | <screen-name> <what to build or change>"
---

A prototype screen is a model-home room: real walls and switches (real views, routing, ViewModels, components), power from a temporary generator (fake repositories reading JSON). When the customer approves, only the generator is swapped for EF Core; the room stays.

## Preconditions

- AGENTS.md has `## Stack` with a profile. If it is missing or its profile is `TODO`, ask first, as "Asking" in `${CLAUDE_PLUGIN_ROOT}/skills/init/references/stacks.md` describes, and write the section before anything else. Names below (controller, ViewModel, `PrototypeDataStore`, `Prototype:UseFakeData`) are the `mvc-htmx` form; under another profile, build the equivalents at the paths `## Stack` gives.
- `docs/ui/design-system.md` exists. If not, stop and ask พี่ปู to run `/mflow:theme` first; screens without the kit drift apart.
- Data follows [references/prototype-data.md](references/prototype-data.md).
- The access seams exist (`Permissions`, `ICurrentUser`, `MenuDefinition`, `FakeCurrentUser`, `users.json`, `roles.json`; see "Current user, permissions and the role switcher" in that file). A kit built before them needs `/mflow:theme update access` first.

## Mode: `inventory`

Read `docs/vision.md` (story map), any active source files given (check `docs/source/INDEX.md`; skip `superseded`), and every approved discussion doc (`node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" list`, status `approved`). Approved docs settle roles, menus and data visibility: fill `Role(s)` from them and cite the doc; a draft doc settles nothing yet. Write `docs/ui/screens.md`: one row per screen, grouped by story-map step:

| Screen | Route | Role(s) | Shows | Actions | Calculations / rules | Status |
|---|---|---|---|---|---|---|

Every value in "Calculations / rules" also gets a row in `docs/hotspots/INDEX.md` unless one already covers it. In the report, list each aggregate that the screens show and that has no approved data-model doc (`<aggregate>-data`) as a `/mflow:discuss` candidate, the most widely shared first. It is a suggestion; screens can be built without one. Create nothing else.

Done when: every story-map step in the first release has at least one screen, and พี่ปู has reviewed the table. Create one Backlog task per screen with label `prototype` only after that review.

## Mode: create a screen (`<screen-name>` not yet in the codebase)

1. **Locate it** in `docs/ui/screens.md`; if absent, add the row first and confirm it. Take its roles, and the permission for viewing and for each action, from the approved access-control discussion doc. Add missing keys to `Permissions` and the grants to `roles.json` (a schema change, below). **No approved doc yet:** still declare the keys, endpoint checks and menu entry so the seams stay real; the single admin user holds every key. Write `access not confirmed` in the row's Role(s) cell, skip the per-role checks in step 6, and suggest `/mflow:discuss access-control`.
2. **Data:** reuse the JSON files in `PrototypeData/`. Adding a new entity file or a field is a schema change: show the proposed schema change and wait for a yes, because other screens read the same files. Update `PrototypeData/README.md` with any change. A new entity takes its fields from its section in the README, which an approved data-model doc writes; with no section, propose the fields as usual and add the section. A scoped entity carries its scope keys, with rows spread across units and owners, so each role visibly sees different rows.
3. **Domain seam:** entity/record + repository interface in the domain or application project; `Fake<Entity>Repository` reads through `PrototypeDataStore` and does filtering, sorting and paging itself, returning `PagedResult<T>` the way EF Core will. It applies `ICurrentUser.ScopeFor(<entity>)` before paging.
4. **Screen:** controller + ViewModel + views assembled only from the theme components. Lists use `DataTable` + `FilterPanel` (server-side paging, filter panel above, per-column search inside, state in the URL). Forms use `FormField`. Thai labels in the ViewModel. Every action carries its permission check; the menu item goes into `MenuDefinition` with the view permission; buttons appear through `Can(...)`; restricted fields are masked in the ViewModel mapping.
5. **Fake logic:** every calculation or rule returns a hard-coded plausible value and carries `// PROTOTYPE: <what is faked> — see docs/hotspots/INDEX.md <slug>`; add or update the INDEX row.
6. **Verify:** run the build command from AGENTS.md; run the app and open the route. Then use the role switcher: as a user of each role in `Role(s)`, check the rows that role's scope allows and only that role's buttons; as a user of one role outside `Role(s)`, check the menu item is gone and the URL returns 403. If the E2E framework is set up, add a smoke test that loads the page as each role and takes a screenshot into `docs/ui/screens/<screen>.<role>.png`.
7. **Record:** tick the Backlog task, set the row's Status in `screens.md` to `prototype`, update STATUS.md.

Done when: the page builds and loads with JSON data, uses only kit components and tokens, every faked rule is marked and registered, and each role in `Role(s)`, plus one role outside it, was checked through the switcher (or the row says `access not confirmed`).

## Mode: adjust a screen (`<screen-name>` exists)

Apply the requested change (for example "add a search box for job number and customer name") within the same constraints:
- A new filter goes in `FilterPanel` and/or the column search, implemented server-side in the fake repository.
- A visual change that the kit cannot express is a kit change: stop, and propose `/mflow:theme update <what>` instead of styling this page.
- A data change follows the schema-change rule above. A field-level change to an entity with an approved data-model doc stays at that level: update the README dictionary, no new doc. A structural change (new aggregate, key, relationship, storage decision) needs `/mflow:discuss` first.
- A change to who sees a screen, a row, a field or a button that differs from the approved access-control discussion doc does not go into `roles.json` directly. It needs a new discussion doc (`/mflow:discuss`) that supersedes the old one, or `/mflow:change-request` if it is already built or was confirmed by the customer.
- A change requested by the customer after the prototype was approved goes to `/mflow:change-request` first.

Done when: the change builds, loads, and the screenshot/test (if any) is refreshed.
