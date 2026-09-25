# Component contracts

Each component is built once and reused everywhere. A contract says what the component takes, which states it must show, and how it behaves. Implement for ASP.NET Core MVC + Razor + Bootstrap 5 + HTMX unless the project is React.

## DataTable

The most important component; most back-office screens are a DataTable plus a FilterPanel.

- **Input:** a `DataTableModel<TRow>` with `Columns` (key, Thai header, width, align, sortable, searchable, format: text/number/money/date/status), `Rows`, `Page`, `PageSize`, `TotalCount`, `Sort`, `ColumnFilters`, `RowUrl` (optional), `RowActions` (optional).
- **Paging:** server-side only. The controller receives `page`, `pageSize` (10/25/50/100), `sort`, `dir`, and filters; the repository returns `PagedResult<T>` with `TotalCount`. Never load all rows to the browser.
- **Search:** two places, both server-side. `FilterPanel` above the table for structured filters, and a search input under each searchable column header (debounced 400 ms, `hx-trigger="keyup changed delay:400ms"`).
- **State in the URL:** every filter, sort and page value is a query-string parameter (`hx-push-url="true"`), so a filtered view can be bookmarked, shared and reloaded.
- **HTMX:** the table body + pager is a partial; filters, column search, sort and paging swap only that partial (`hx-target`, `hx-indicator`).
- **Formats:** money right-aligned with 2 decimals and thousands separators; dates `dd/MM/yyyy` (Buddhist or Gregorian year decided once in design-system.md); status via `StatusBadge`.
- **States:** loading (indicator on the table, not the page), empty (`EmptyState`), no results for filter (message + "clear filters"), error (inline alert with retry).
- **Footer:** "แสดง 1–25 จาก 1,234 รายการ" + pager + page-size select.

## FilterPanel

- **Input:** list of filter fields (each rendered by `FormField`), a keyword box, "ค้นหา" and "ล้างตัวกรอง" buttons.
- **Behaviour:** collapsible, remembers open/closed per page; submits to the same list endpoint the DataTable uses; shows active filters as removable chips above the table.

## FormField

- **Input:** `asp-for` model expression, label (Thai), type (text, number, money, date, select, multiselect, textarea, checkbox, switch, file), placeholder, help text, required, disabled, options (for selects).
- **States:** default, focus, disabled, read-only, invalid with message (from model validation), required marker.
- **Rules:** label always visible (no placeholder-as-label); money and number inputs right-aligned; date uses one date picker everywhere.

## PageHeader

Title, optional subtitle, breadcrumb, up to one primary action button and a secondary actions dropdown.

## StatusBadge

`StatusBadge(status)` maps each domain status to a label and a semantic color in one dictionary. Screens never choose badge colors themselves.

## EmptyState

Icon, short Thai message, optional primary action ("สร้างรายการแรก").

## ConfirmDialog

Title, a sentence stating exactly what will happen ("ยกเลิกงาน JOB-0012 และคืนรถให้ว่าง"), confirm button in danger style for destructive actions, cancel. Triggered via `hx-confirm` replacement or a small shared script.

## Toast

Success, error, info. Server sets it through an `HX-Trigger` response header (`showToast`), so any action can raise one without page-specific script.

## PrototypeBanner

A slim warning-colored bar at the top: "PROTOTYPE – ข้อมูลจำลอง ยังไม่บันทึกข้อมูลจริง". Rendered by the layout whenever `Prototype:UseFakeData` is true.
