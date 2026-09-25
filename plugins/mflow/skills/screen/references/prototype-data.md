# Prototype data contract

All prototype screens read one shared set of JSON files, so the same customer, driver or product appears consistently on every screen, like one warehouse supplying every room of a model home.

## Location and shape

```
src/<App>.Web/PrototypeData/
├─ README.md          ← entity list, fields, relations, deliberate edge cases
├─ customers.json     ← array of objects, camelCase fields, stable string/Guid ids
├─ drivers.json
└─ jobs.json          ← references customerId, driverId
```

- One file per aggregate root; child collections nested inside their root (a job's stops live inside the job).
- Relations by id only; the fake repository joins what a screen needs.
- Ids are stable across regenerations so screenshots, links and test data do not break.
- Mark the files as content copied to output (`<Content Include="PrototypeData/**" CopyToOutputDirectory="PreserveNewest" />`).

## Data quality (the customer reacts to data, not layout)

- Volume: at least 200 rows for any entity shown in a list, so paging and search are real.
- Realistic Thai content: names, addresses with real province names, plausible amounts, phone formats.
- Every status of every lifecycle is present, including cancelled and reversed.
- Deliberate edge cases, listed in README.md: very long names, zero amounts, missing optional fields, dates at month/year boundaries, records with many children.
- No real customer personal data. If a real sample is needed for realism, mask names, IDs and phone numbers first (PDPA).

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

## Schema changes

Adding an entity file, adding/renaming/removing a field, or changing an id format affects every screen that reads the file. Propose the change, list the screens affected (search the solution for the file name), wait for a yes, then update README.md in the same change.
