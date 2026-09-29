# Prototype data contract

All prototype screens read one shared set of JSON files, so the same customer, driver or product appears consistently on every screen, like one warehouse supplying every room of a model home.

Paths, C# and `Prototype:UseFakeData` below are the `mvc-htmx` form. Under another profile, the Prototype data and Prototype-mode flag rows of AGENTS.md `## Stack` give the equivalents; the rules stay the same.

## Location and shape

```
src/<App>.Web/PrototypeData/
├─ README.md          ← data dictionary (per entity: field, Thai label, type, required, key/relation, example), deliberate edge cases
├─ customers.json     ← array of objects, camelCase fields, stable string/Guid ids
├─ drivers.json
├─ jobs.json          ← references customerId, driverId
├─ users.json         ← fake logged-in users for the role switcher
└─ roles.json         ← role → permissions, data scope, landing route
```

- One file per aggregate root; child collections nested inside their root (a job's stops live inside the job).
- Relations by id only; the fake repository joins what a screen needs.
- JSON field names are the future entity property names in camelCase, so the swap to EF Core needs no mapping. The JSON stays nested per aggregate root even when the approved data-model doc stores the children in their own table; the README lists that child table and its foreign key.
- `README.md` is the living data dictionary. Approving a data-model discussion doc writes that aggregate's section, even before any screen shows it, and the section cites the doc and its revision. After the OpenSpec change that builds an aggregate is archived, that aggregate's section becomes a one-line pointer to its entity and migration.
- Ids are stable across regenerations so screenshots, links and test data do not break.
- Mark the files as content copied to output (`<Content Include="PrototypeData/**" CopyToOutputDirectory="PreserveNewest" />`).

## Data quality (the customer reacts to data, not layout)

- Volume: at least 200 rows for any entity shown in a list, so paging and search are real.
- Realistic Thai content: names, addresses with real province names, plausible amounts, phone formats.
- Every status of every lifecycle is present, including cancelled and reversed.
- Deliberate edge cases, listed in README.md: very long names, zero amounts, missing optional fields, dates at month/year boundaries, records with many children.
- No real customer personal data. If a real sample is needed for realism, mask names, IDs and phone numbers first (PDPA).
- Visible differences between roles: every entity with a data scope carries its scope keys (`unitId`, `createdBy`, `assignedTo`, as the scope needs). Rows are spread across several units and owners, and include at least one edge case, such as a record created before its owner moved branch. Otherwise every role sees the same rows, and the review cannot confirm anything.

## Store

```csharp
public sealed class PrototypeDataStore(IWebHostEnvironment env)
{
    private readonly ConcurrentDictionary<string, object> _cache = new();
    private static readonly JsonSerializerOptions Opt = new(JsonSerializerDefaults.Web);

    public IReadOnlyList<T> Load<T>(string file) =>
        (IReadOnlyList<T>)_cache.GetOrAdd(file, f =>
            JsonSerializer.Deserialize<List<T>>(
                File.ReadAllText(Path.Combine(env.ContentRootPath, "PrototypeData", f)), Opt) ?? []);
}
```

Registered as a singleton. Writes during a prototype session may update an in-memory copy; they never write back to the JSON files.

## Fake repository rule

The fake repository accepts the same query object the EF Core repository will, and applies filtering, sorting and paging itself, returning `PagedResult<T>` with `TotalCount`. The controller and views therefore never change when `Prototype:UseFakeData` flips to false.

## Current user, permissions and the role switcher

The customer walks through the prototype as each role, the way a model home is shown to a buyer and then to a caretaker. The walls are real: permission keys, the menu definition, endpoint checks, data-scope filters and field masking. The generator is temporary: fake users and role grants from JSON, plus a switcher for who is logged in. `/mflow:theme` builds these seams with the app shell; every screen uses them.

**Real, kept at go-live:**
- **Permission keys:** string constants per screen and action (`Jobs.View`, `Jobs.Approve`, `Jobs.ViewCost`) in one `Permissions` class. They always live in code, even when roles become configurable, because a configurable role still grants code-defined keys. They are the single source for the menu, the endpoint checks and the buttons.
- **`ICurrentUser`** (application layer): `Id`, `Name`, `Roles`, `UnitId`, `Can(permission)`, `ScopeFor(entity)`.
- **`MenuDefinition`:** groups and items (Thai label, route, icon, required permission) in story-map order. The `SidebarMenu` component shows only the items the current user `Can` see.
- **Endpoint check:** a permission requirement and a handler that reads `ICurrentUser`, applied to every controller action (for example `[HasPermission(Permissions.Jobs.View)]`). A hidden screen opened by URL returns 403, in the prototype too. Hiding a menu item is not security.
- **Data scope:** the repository query applies `ScopeFor(entity)` (`all`, `unit`, `unit-tree`, `own`, `assigned`) before paging. The fake repository does this in LINQ; the EF Core one uses a query filter or a specification. Controllers and views never filter by role.
- **Field visibility:** the ViewModel mapping blanks or masks restricted fields through `Can(...)`. Exports and APIs reuse that mapping.

**Temporary, swapped at go-live:**
- `PrototypeData/users.json`: fake users (`id`, `name`, `title`, `roles[]`, `unitId`). One to three per role, spread across the units that the data uses.
- `PrototypeData/roles.json`: per role, `code`, Thai `name`, `permissions[]`, `dataScope` (`{ "<entity>": "unit" }`), and `landingRoute`. This is the machine home of the role, permission and scope facts. `docs/vision.md` keeps only role names and main jobs.
- `FakeCurrentUser` reads the chosen user id from the `proto-user` cookie (default: the first user) and resolves grants from `roles.json`.
- The role switcher in `PrototypeBanner` posts to `/_prototype/switch-user`, which sets the cookie and reloads the page.
- **Production safety:** `FakeCurrentUser`, the switcher partial and the `/_prototype/switch-user` endpoint are registered inside the same `Prototype:UseFakeData` branch as the fake repositories. A production build cannot contain them.
- **Go-live:** register the claims-based `ICurrentUser`, and replace `roles.json` with the role-to-permission store that the approved access-control discussion doc decided (code or database tables). Controllers, views and the menu do not change.

**Source:** `users.json` and `roles.json` come from the approved access-control discussion doc (`docs/discuss/NN-*.md`, status `approved`). JSON has no comments, so `PrototypeData/README.md` records the doc and its revision. With no approved doc there is one user, `ผู้ดูแลระบบ`, with every permission and scope `all`; suggest `/mflow:discuss access-control`. A draft doc settles nothing.

**React + Vite:** the same contract applies. The API enforces permissions and scope, and the UI reads the user's permission keys only to show or hide things.

## Schema changes

Adding an entity file, adding/renaming/removing a field, changing an id format, or changing `users.json`/`roles.json` affects every screen that reads the file. Propose the change, list the screens affected (search the solution for the file name), wait for a yes, then update README.md in the same change.
