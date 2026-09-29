# Component contracts

Each component is built once and reused everywhere. A contract says what the component takes, which states it must show, and how it behaves. Implement for the profile in AGENTS.md `## Stack`. The Razor and HTMX details below are the `mvc-htmx` form; `react-vite` keeps the same inputs, states and URL state with React components that call the API. How the kit behaves at each width, and which sizes it is checked at, is in [responsive.md](responsive.md); the "Narrow" lines below are each component's part of it.

## AppShell

The frame every page sits in. It is built once in the layout; screens only fill the main area.

- **Structure:** the `PrototypeBanner` (prototype mode only) on top, then the `SidebarMenu` beside the content column. The content column holds the top bar (☰ toggle, page context, notifications slot, current user) above the main area. A skip link "ข้ามไปเนื้อหาหลัก" is the first focusable element.
- **Fills the window:** full height (`100dvh`); the sidebar and the content scroll separately; the top bar stays on top (sticky). The main area is a size container (`container-type: inline-size`), so content reflows by its own width. Its width is capped only if design-system.md says so (`--app-content-max`).
- **Sidebar states**, switched at the breakpoints in design-system.md:
  - `expanded`: icon and label, group headings, badges.
  - `rail`: icons only. Each label becomes a tooltip and stays readable to screen readers, group headings become a thin rule, and badges sit on the icon.
  - `drawer`: off-canvas over the page, with a backdrop.
- **☰ toggle:** in the top bar at every width. On wide and medium windows it switches expanded ↔ rail, and the choice is remembered per user (responsive.md §3). Below the drawer breakpoint it opens the drawer and leaves the remembered choice alone.
- **Drawer:** Esc, a tap on the backdrop, choosing a menu item, or any navigation closes it. In `mvc-htmx`, build it on Bootstrap 5.3's offcanvas, which already handles focus, Esc and the backdrop, and close it after an HTMX-boosted navigation.
- **Narrow:** below the drawer breakpoint the top bar keeps one line: the user's name gives way to the avatar, and text buttons become icon buttons with an `aria-label`. Main padding comes from tokens (`--app-main-pad-x`, `--app-main-pad-y`) that the kit's stylesheet reduces on narrower windows.
- **Accessibility:** as responsive.md §4.

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
- **Narrow:** a table wider than its box scrolls sideways inside its own box, never the page. The footer wraps under the table.

## FilterPanel

- **Input:** list of filter fields (each rendered by `FormField`), a keyword box, "ค้นหา" and "ล้างตัวกรอง" buttons.
- **Behaviour:** collapsible, remembers open/closed per page; submits to the same list endpoint the DataTable uses; shows active filters as removable chips above the table.
- **Narrow:** fields sit in a grid of 4 columns that steps down to 3, 2 and 1 as the content narrows. On phones the panel starts collapsed, and the chips still show what is filtered.

## FormField

- **Input:** `asp-for` model expression, label (Thai), type (text, number, money, date, select, multiselect, textarea, checkbox, switch, file), placeholder, help text, required, disabled, options (for selects).
- **States:** default, focus, disabled, read-only, invalid with message (from model validation), required marker.
- **Rules:** label always visible (no placeholder-as-label); money and number inputs right-aligned; date uses one date picker everywhere.
- **Narrow:** a form lays its fields in the kit's form grid, which becomes one column at the narrowest content step. There, the form's action buttons stretch to full width.

## PageHeader

Title, optional subtitle, breadcrumb, up to one primary action button and a secondary actions dropdown. **Narrow:** the actions move under the title; the secondary actions stay in the dropdown.

## StatusBadge

`StatusBadge(status)` maps each domain status to a label and a semantic color in one dictionary. Screens never choose badge colors themselves.

## EmptyState

Icon, short Thai message, optional primary action ("สร้างรายการแรก").

## ConfirmDialog

Title, a sentence stating exactly what will happen ("ยกเลิกงาน JOB-0012 และคืนรถให้ว่าง"), confirm button in danger style for destructive actions, cancel. Triggered via `hx-confirm` replacement or a small shared script. **Narrow:** never wider than the window minus 32 px.

## Toast

Success, error, info. Server sets it through an `HX-Trigger` response header (`showToast`), so any action can raise one without page-specific script. Toasts stack in the bottom right, at most 380 px wide. **Narrow:** never wider than the window minus 32 px.

## SidebarMenu

- **Input:** `MenuDefinition` and `ICurrentUser` (see "Current user, permissions and the role switcher" in `skills/screen/references/prototype-data.md`).
- **Behaviour:** shows only the items whose permission the user `Can`; a group with no visible item is hidden; the active item follows the current route and carries `aria-current="page"`. Screens never add menu items in views. A new screen adds its item, with its permission, to `MenuDefinition`.
- **Icons:** every item has an icon, because the rail shows nothing else. An optional badge shows a pending count.
- **States:** expanded, rail and drawer, as `AppShell` describes.

## PrototypeBanner

- A slim warning-colored bar at the top: "PROTOTYPE – ข้อมูลจำลอง ยังไม่บันทึกข้อมูลจริง".
- On the right, the role switcher: a select that lists every fake user as "ชื่อ · ตำแหน่ง (role)", with the current user selected. Changing it posts to `/_prototype/switch-user` and reloads the page, so the menu, rows and buttons change to that role.
- **Narrow:** the label shortens to "PROTOTYPE"; the switcher stays.
- Rendered by the layout only when the prototype-mode flag in `## Stack` is on (`Prototype:UseFakeData` in `mvc-htmx`), and never otherwise.
