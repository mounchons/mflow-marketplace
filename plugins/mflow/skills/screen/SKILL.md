---
name: screen
description: Build or adjust prototype screens in the real stack from the theme kit and shared JSON prototype data; also produces the screen inventory from the story map.
disable-model-invocation: true
argument-hint: "inventory [@source] | <screen-name> <what to build or change>"
---

A prototype screen is a model-home room: real walls and switches (real views, routing, ViewModels, components), power from a temporary generator (fake repositories reading JSON). When the customer approves, only the generator is swapped for EF Core; the room stays.

## Preconditions

These apply to creating and adjusting a screen. `inventory` needs none of them: it only writes `docs/ui/screens.md` and hotspot rows, so it can run while the kit is still a static preview.

- AGENTS.md has `## Stack` with a profile. If it is missing or its profile is `TODO`, ask first, as "Asking" in `${CLAUDE_PLUGIN_ROOT}/skills/init/references/stacks.md` describes, and write the section before anything else. Names below (controller, ViewModel, `PrototypeDataStore`, `Prototype:UseFakeData`) are the `mvc-htmx` form; under another profile, build the equivalents at the paths `## Stack` gives.
- `docs/ui/design-system.md` exists. If not, stop and ask the user to run `/mflow:theme` first; screens without the kit drift apart.
- The kit is in the stack, not only in a static preview. If `docs/ui/theme/README.md` says `Status: draft` or `Status: approved`, stop and suggest `/mflow:theme port`, or first an `/opsx:propose` change that scaffolds the app if it does not exist yet. A README with no status line predates mflow 0.12; the check above is enough.
- Data follows [references/prototype-data.md](references/prototype-data.md).
- The access seams exist (`Permissions`, `ICurrentUser`, `MenuDefinition`, `FakeCurrentUser`, `users.json`, `roles.json`; see "Current user, permissions and the role switcher" in that file). A kit built before them needs `/mflow:theme update access` first.

## Mode: `inventory`

Read `docs/vision.md` (story map), any active source files given (check `docs/source/INDEX.md`; skip `superseded`), and every approved discussion doc (`node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" list`, status `approved`). Approved docs settle roles, menus and data visibility: fill `Role(s)` from them and cite the doc; a draft doc settles nothing yet. Write `docs/ui/screens.md`: one row per screen, grouped by story-map step:

| Screen | Route | Role(s) | Shows | Actions | Calculations / rules | Status |
|---|---|---|---|---|---|---|

Every value in "Calculations / rules" also gets a row in `docs/decisions/hotspots/INDEX.md` unless one already covers it. Each aggregate that the screens show and that has no approved data-model doc gets an `<aggregate>-data` row on `docs/decisions/discuss/AGENDA.md`, unless it has one: the screens that use it as the reason, `ก่อนหน้าจอแรกของ <กลุ่มข้อมูล>` as the stage, the most widely shared first (run `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" agenda init` if the file is missing, then `agenda`). List them in the report. It is a suggestion; screens can be built without one. Besides these rows, create nothing else.

Done when: every story-map step in the first release has at least one screen, and the user has reviewed the table. Create one Backlog task per screen with label `prototype` only after that review.

## Mode: create a screen (`<screen-name>` not yet in the codebase)

1. **Locate it** in `docs/ui/screens.md`; if absent, add the row first. Take its roles, and the permission for viewing and for each action, from the approved access-control discussion doc. Add missing keys to `Permissions` and the grants to `roles.json` (a schema change, below). **No approved doc yet:** still declare the keys, endpoint checks and menu entry so the seams stay real; the single admin user holds every key. Write `access not confirmed` in the row's Role(s) cell, skip the per-role checks in step 6, and suggest `/mflow:discuss access-control`.
2. **Data:** reuse the JSON files in `PrototypeData/`. Adding a new entity file or a field this screen needs is a schema change inside this instruction: make it, and list it in the summary, because other screens read the same files. Renaming or removing a field, or changing an id format, waits for the user's word ("Schema changes" in that file). Update `PrototypeData/README.md` with any change. A new entity takes its fields from its section in the README, which an approved data-model doc writes; with no section, propose the fields as usual and add the section. A scoped entity carries its scope keys, with rows spread across units and owners, so each role visibly sees different rows.
3. **Domain seam:** entity/record + repository interface in the domain or application project; `Fake<Entity>Repository` reads through `PrototypeDataStore` and does filtering, sorting and paging itself, returning `PagedResult<T>` the way EF Core will. It applies `ICurrentUser.ScopeFor(<entity>)` before paging.
4. **Screen:** controller + ViewModel + views assembled only from the theme components. Lists use `DataTable` + `FilterPanel` (server-side paging, filter panel above, header search only on the columns this screen marks searchable, state in the URL). Forms use `FormField`. Thai labels in the ViewModel. No layout rules in the screen: no media or container queries and no fixed widths; forms and filters use the kit's grids. Every action carries its permission check; the menu item goes into `MenuDefinition` with the view permission; buttons appear through `Can(...)`; restricted fields are masked in the ViewModel mapping.
5. **Fake logic:** every calculation or rule returns a hard-coded plausible value and carries `// PROTOTYPE: <what is faked> — see docs/decisions/hotspots/INDEX.md <slug>`; add or update the INDEX row.
6. **Verify:** run the build command from AGENTS.md; run the app and open the route. Check the page at the acceptance sizes in `docs/ui/design-system.md`, as §5 of `${CLAUDE_PLUGIN_ROOT}/skills/theme/references/responsive.md` describes. Then use the role switcher: as a user of each role in `Role(s)`, check the rows that role's scope allows and only that role's buttons; as a user of one role outside `Role(s)`, check the menu item is gone and the URL returns 403. If the E2E framework is set up, add a smoke test that loads the page as each role and takes the screenshots that §5 names: every role at the largest acceptance size, one role at the smallest.
7. **Record:** tick the Backlog task, set the row's Status in `screens.md` to `prototype`, update STATUS.md.

Done when: the page builds and loads with JSON data, uses only kit components and tokens, passes at the acceptance sizes in `docs/ui/design-system.md` (or reports them `(unverified)`, as §5 of `${CLAUDE_PLUGIN_ROOT}/skills/theme/references/responsive.md` allows), every faked rule is marked and registered, and each role in `Role(s)`, plus one role outside it, was checked through the switcher (or the row says `access not confirmed`), and the user has the next step: the page's URL to try as each role, then the next screen in `docs/ui/screens.md` without a prototype (`/mflow:screen <name> …`), or, once a set of screens is ready, a test or review with users followed by `/mflow:review-notes @notes`.

## Mode: adjust a screen (`<screen-name>` exists)

Apply the requested change (for example "add a search box for job number and customer name") within the same constraints:
- A new filter goes in `FilterPanel` and/or the header search of a column (marking it searchable), implemented server-side in the fake repository. A date filter is a `FormField` type `date` or a `DateRangeField`.
- A visual change that the kit cannot express is a kit change: stop, and propose `/mflow:theme update <what>` instead of styling this page.
- A data change follows the schema-change rule above. A field-level change to an entity with an approved data-model doc stays at that level: update the README dictionary, no new doc. A structural change (new aggregate, key, relationship, storage decision) needs `/mflow:discuss` first.
- A change to who sees a screen, a row, a field or a button that differs from the approved access-control discussion doc does not go into `roles.json` directly. It needs a new discussion doc (`/mflow:discuss`) that supersedes the old one, or `/mflow:change-request` if it is already built.
- A change the user asks for is made: the user's word is the customer's, and the prototype exists to be refined. Only a change to a screen already built for real (archived in `openspec/specs/`) goes to `/mflow:change-request` first.

Done when: the change builds, loads, the screenshot/test (if any) is refreshed, and the user has the page's URL and the next step: another change, the next screen, or `/mflow:review-notes` after trying it with users.
