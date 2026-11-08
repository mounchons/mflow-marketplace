---
pack: import-export
stack: dotnet
---

# import-export on ASP.NET Core

Applies when the back end is ASP.NET Core: profiles `mvc-htmx` (MVC + Razor + HTMX) and `react-vite` (React front end + ASP.NET Core Web API). Guidance for /opsx:propose and apply: which library and framework feature carries each decision and what has to be written by hand. Not code to paste.

Target: .NET 10, EF Core 10 with Npgsql, PostgreSQL, `ClosedXML` 0.105.1. Names checked against Microsoft Learn, the ClosedXML package's own XML docs, or a project the team built; anything marked (unverified) was not.

## Building blocks

| Concern | Use | Note |
|---|---|---|
| Library | `ClosedXML` (MIT, from its nuspec) for reading and writing `.xlsx` | The team uses it in almost every project. Do not take EPPlus: from version 8 it is Polyform Noncommercial 1.0.0, a commercial business needs a paid licence and `ExcelPackage.License.SetCommercial` (EPPlus README, checked 2026-11-08). |
| Port | Your own `IWorkbookReader` / `IWorkbookWriter` in the application layer | ClosedXML types stay in Infrastructure, so the reader can be swapped without touching the checks |
| Open a file | `new XLWorkbook(stream)`; `workbook.Worksheets` | Loads the whole workbook into memory (no streaming read); guard with the package check of IMPEX-D03 first |
| Read a cell | `IXLCell.HasFormula`, `IXLCell.CachedValue`, `IXLCell.Value`, `XLCellValue.Type`, `XLDataType`, `IsDateTime`, `IsError`, `GetText()`, `GetNumber()`, `GetDateTime()`, `GetBoolean()` | Take `cell.HasFormula ? cell.CachedValue : cell.Value`. `Value` computes a formula that needs recalculating; `CachedValue` never does. A formula saved with no value reads as `Blank` |
| Used range | `worksheet.LastRowUsed(XLCellsUsedOptions.Contents)`, `LastColumnUsed(XLCellsUsedOptions.Contents)` | Check rows and columns before touching any cell; walk rows by number so row numbers stay Excel's |
| Package check | `System.IO.Compression.ZipArchive` (read mode), `entry.Open()`; `DocumentFormat.OpenXml`: `SpreadsheetDocument.Open(stream, isEditable: false)`, `OpenXmlReader.Create(workbookPart)` | Count the real bytes read from each entry, never the size the zip claims; stop at the limit |
| 1904 date system | `DocumentFormat.OpenXml.Spreadsheet.WorkbookProperties.Date1904` | No workbook-level setting for it found in ClosedXML's XML docs (unverified that none exists); refuse the file before it is read |
| Parse a text date | `DateOnly.TryParseExact(text, format, CultureInfo.InvariantCulture, DateTimeStyles.None, out date)` | Pass the invariant culture everywhere; `th-TH` formats and parses in the Buddhist calendar |
| Write a file | `new XLWorkbook()`, `AddWorksheet`, `workbook.SaveAs(stream)`; `cell.Style.DateFormat.Format`, `cell.Style.NumberFormat.Format`; `worksheet.SheetView.FreezeRows(1)`; `AdjustToContents(firstRow, lastRow)` | Save to a file in the job's temp folder or a stream, then put it in the storage |
| CSV report | Your own writer, `Encoding.UTF8.GetPreamble()` first | Excel needs the BOM to show Thai |
| Streaming if a limit is raised | Read: `OpenXmlReader` (SAX) or `Sylvan.Data.Excel` (MIT, 0.x, one main maintainer: check before adopting). Write: `OpenXmlPartWriter.Create(worksheetPart)` | SAX code handles shared strings and cell references by hand. Measured on one team project's real file, 32,772 rows by 103 columns: ClosedXML peak 219 MB, `Sylvan.Data.Excel` 57 MB |
| Background | The project's job mechanism; without one, a `BackgroundService` with a scope from `IServiceScopeFactory.CreateScope()` | Hand the job the batch id and read the file from the storage |
| One at a time | Partial unique index, EF Core `HasIndex(...).IsUnique().HasFilter("stage IN ('Checking', 'Committing')")` | Catch `DbUpdateException` whose inner `PostgresException.SqlState` is `PostgresErrorCodes.UniqueViolation` and answer 409 |
| Download | `ControllerBase.File(...)` or `TypedResults.File(stream, contentType, fileDownloadName)` with the headers of the upload stack | Also for the template and the error report; stream the stored object, do not buffer it |

## Decision by decision

| Decision | .NET | Write yourself |
|---|---|---|
| IMPEX-D01 | Permission attribute of the project on every import endpoint; scope filter on reads | Scope check per row; existence lookup of an out-of-scope key with a declared all-scope read that selects only the key and scope column |
| IMPEX-D02, UPL-D04, UPL-D05 | Reuse the upload pack's content check and name cleaner with a fixed extension set of `.xlsx` | A dedicated endpoint; do not read `upload.extensions` |
| IMPEX-D03 | Package check above, then `LastRowUsed` / `LastColumnUsed` | Refuse two entries that name one part; refuse a sheet list naming one part twice; a text budget so shared strings cannot explode when copied; catch reader exceptions and answer 400 |
| IMPEX-D04, IMPEX-D22 | `ColumnDefinition` records per target; `NumberFormat.Format = "@"` for code columns | One template builder driven by the definition; a test that uploads the template |
| IMPEX-D05 | `workbook.Worksheets`, header cells as text | Header normaliser (case, trim, trailing ` *`, `_` as space); definition lookup; every problem collected before answering |
| IMPEX-D06, AUDIT-D07 | EF Core entities, `Add` in chunks; transient tables excluded from the audit save interceptor | Check service over the port; rows written in chunks so memory stays flat |
| IMPEX-D08, IMPEX-D22 | Your CSV writer | Report writer uses the same formula guard as exports |
| IMPEX-D09 | Query existing keys with one `WHERE key IN (...)` per chunk | Case-folded match value; duplicate detection with a dictionary over the file |
| IMPEX-D10 | EF Core update of the mapped columns only | Skip empty cells; refuse state-locked records with the same rule the entity applies |
| IMPEX-D11 | `XLCellValue.IsDateTime`, `GetDateTime()`; `DateOnly.TryParseExact` | Year of `import-export.buddhist_year_from` or later: build the date from the year minus 543, never `AddYears(-543)`. A number with no date format is a bad row |
| IMPEX-D12 | `value.GetNumber()` | Convert with `double.ToString("0.###############", CultureInfo.InvariantCulture)` then parse as `decimal`, so 1234.567 stays exact. Reject `IsError` and Thai digits |
| IMPEX-D13 | `value.Type == XLDataType.Text` and `GetText()`; number cells through the same conversion | Code columns never parsed as numbers; more than 15 digits is a bad row |
| IMPEX-D14 | `db.Database.BeginTransactionAsync(ct)` | Compare counts inside the transaction; on failure roll back and return the stage to `Checked` |
| IMPEX-D15 | The project's job mechanism; `ExecuteUpdateAsync` for `rows_done` every few hundred rows | Thresholds from params; a timer job marks stale `Checking` and `Committing` as `Failed` |
| IMPEX-D16 | Partial unique index above | Answer `IMPORT_IN_PROGRESS` naming the holder |
| IMPEX-D17, AUDIT-D04, AUDIT-D18 | The audit pack's save interceptor; one action name `Import` for the commit | Set the job's actor to the importer so background commits keep the right actor |
| IMPEX-D18, UPL-D06 | Storage interface of the upload pack; `ExecuteDeleteAsync` on `import_batch` and `import_row` | Daily purge: object first, then rows |
| IMPEX-D19, IMPEX-D20 | Reuse the list's query service with its filter and sort | `ExportDefinition` per list; a unit test that fails on a secret field; never read columns outside the definition |
| IMPEX-D21 | `export_file` row; the job writes through the writer port to the storage | Hourly purge by `expires_at`; `GET /content` checks owner and key again |
| IMPEX-D22 | Set the value with a leading `'`: ClosedXML keeps the value without it and sets `IncludeQuotePrefix`; `.csv` keeps the `'` | One guard used by every writer. Plain `cell.Value = "=1+1"` already stores text (run against 0.105.1), but without the prefix Excel makes it a formula when the cell is edited |
| IMPEX-D23, AUDIT-D11 | Service writes `Export` through the audit pack | Flag `PersonalData` on the export definition |
| IMPEX-D24, UPL-D10 | `fileDownloadName`; system time zone from the project's clock | File-name builder from the definition |

## mvc-htmx

- Upload with `hx-post` and `hx-encoding="multipart/form-data"`; the answer swaps in the result fragment. Antiforgery as in the upload stack.
- Progress: an element with `hx-get` and `hx-trigger="every 2s"` (unverified) that stops when the stage leaves `Checking` or `Committing`.

## react-vite

- Upload with `XMLHttpRequest` for upload progress, then poll `GET import-batches/<id>` while the stage runs.
- Confirm and Cancel call the action endpoints; on 409 `IMPORT_CHANGED` show a new check.
- Export: call `POST exports`, then point the browser at the content URL when status is `Ready`.

## Pitfalls

- `IXLCell.GetFormattedString()` applies the display format and computes pending formulas (run against 0.105.1: a formula with no saved value came back computed). Never use it on the read path; values rounded by the display format go into the data unnoticed.
- `IXLCell.Value` evaluates a formula that needs recalculating. Use `CachedValue` when `HasFormula` is true.
- `DateTime.ToString()` under `th-TH` gives Buddhist years. Pass `CultureInfo.InvariantCulture` in every format and parse.
- `AddYears(-543)` silently moves 29 February to the 28th when the Gregorian year is not a leap year; a text date `29/02/2567` cannot be built as year 2567 at all, as 2567 is not a Gregorian leap year. Parse day, month and year as numbers, subtract 543 from the year, then build the `DateOnly` and treat a failure as a bad row.
- A date typed in Buddhist years into a Gregorian Excel is a date cell of year 2569, not text. `IsDateTime` is true, so the year check of IMPEX-D11 is needed.
- A cell's number format, not its stored value, decides `IsDateTime`; a plain number in a date column has `IsDateTime` false and must be refused.
- Applying `ws.Column(n).Style.NumberFormat.Format` after setting date cells overwrites their date format, and the cells read back as numbers.
- `AdjustToContents` without bounds walks every row; give it a row range, for example the first 200 rows.
- ClosedXML holds the whole workbook in memory. Measured on .NET 10: writing 50,000 rows by 12 columns peaks near 190 MB, and reading that file back peaks near 204 MB. A value above the top of the range of `import-export.export_max_rows` or `import-export.import_max_rows` needs a SAX reader or writer; several concurrent jobs add up inside the API container's memory limit.
- Do not buffer a stored file in a `MemoryStream` before returning it; stream the object.
