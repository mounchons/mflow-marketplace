---
name: screen
description: Build or adjust prototype screens in the real stack from the theme kit and shared JSON prototype data; also produces the screen inventory from the story map.
disable-model-invocation: true
argument-hint: "inventory [@source] | <screen-name> <what to build or change>"
---

A prototype screen is a model-home room: real walls and switches (real views, routing, ViewModels, components), power from a temporary generator (fake repositories reading JSON). When the customer approves, only the generator is swapped for EF Core; the room stays.

## Preconditions

- `docs/ui/design-system.md` exists. If not, stop and ask พี่ปู to run `/mflow:theme` first; screens without the kit drift apart.
- Data follows [references/prototype-data.md](references/prototype-data.md).

## Mode: `inventory`

Read `docs/vision.md` (story map) and any active source files given (check `docs/source/INDEX.md`; skip `superseded`). Write `docs/ui/screens.md`: one row per screen, grouped by story-map step:

| Screen | Route | Role(s) | Shows | Actions | Calculations / rules | Status |
|---|---|---|---|---|---|---|

Every value in "Calculations / rules" also gets a row in `docs/hotspots/INDEX.md` unless one already covers it. Create nothing else.

Done when: every story-map step in the first release has at least one screen, and พี่ปู has reviewed the table. Create one Backlog task per screen with label `prototype` only after that review.

## Mode: create a screen (`<screen-name>` not yet in the codebase)

1. **Locate it** in `docs/ui/screens.md`; if absent, add the row first and confirm it.
2. **Data:** reuse the JSON files in `PrototypeData/`. Adding a new entity file or a field is a schema change: show the proposed schema change and wait for a yes, because other screens read the same files. Update `PrototypeData/README.md` with any change.
3. **Domain seam:** entity/record + repository interface in the domain or application project; `Fake<Entity>Repository` reads through `PrototypeDataStore` and does filtering, sorting and paging itself, returning `PagedResult<T>` the way EF Core will.
4. **Screen:** controller + ViewModel + views assembled only from the theme components. Lists use `DataTable` + `FilterPanel` (server-side paging, filter panel above, per-column search inside, state in the URL). Forms use `FormField`. Thai labels in the ViewModel.
5. **Fake logic:** every calculation or rule returns a hard-coded plausible value and carries `// PROTOTYPE: <what is faked> — see docs/hotspots/INDEX.md <slug>`; add or update the INDEX row.
6. **Verify:** `dotnet build`; run the app and open the route. If Playwright is set up, add a smoke test that loads the page and takes a screenshot into `docs/ui/screens/<screen>.png`.
7. **Record:** tick the Backlog task, set the row's Status in `screens.md` to `prototype`, update STATUS.md.

Done when: the page builds and loads with JSON data, uses only kit components and tokens, and every faked rule is marked and registered.

## Mode: adjust a screen (`<screen-name>` exists)

Apply the requested change (for example "add a search box for job number and customer name") within the same constraints:
- A new filter goes in `FilterPanel` and/or the column search, implemented server-side in the fake repository.
- A visual change that the kit cannot express is a kit change: stop, and propose `/mflow:theme update <what>` instead of styling this page.
- A data change follows the schema-change rule above.
- A change requested by the customer after the prototype was approved goes to `/mflow:change-request` first.

Done when: the change builds, loads, and the screenshot/test (if any) is refreshed.
