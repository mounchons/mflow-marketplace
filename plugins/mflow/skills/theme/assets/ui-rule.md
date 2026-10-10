---
paths:
  - "src/**/Views/**/*.cshtml"
  - "src/**/Pages/**/*.cshtml"
  - "src/**/wwwroot/css/**/*.css"
---

# UI rules

Read `docs/ui/design-system.md` before building or changing a screen.

- Assemble screens from the shared components only (`PageHeader`, `FilterPanel`, `DataTable`, `FormField`, `DateRangeField`, `Button`, `Card`, `Dialog`, `SidePanel`, `QuickView`, `Alert`, `Tabs`, `Dropdown`, `Tooltip`, `Loading`, `DetailView`, `StatusBadge`, `EmptyState`, `ConfirmDialog`, `Toast`). A missing component is added to the kit and the style guide first, then used.
- Colors, spacing, radius and fonts come from `tokens.css` variables or, if the kit uses Bootstrap, its utility classes. Hex values, `style="..."`, and per-page `<style>` blocks belong nowhere in views.
- Every list uses `DataTable`: server-side paging in the database, the filter panel as its own panel above the table, and header search only on the columns the screen marks searchable (none is fine), with state in the query string.
- A row's details open in place through `QuickView` (a `Dialog` for one section, a `SidePanel` for the whole record), from an endpoint that checks the list's view permission and data scope. Features compared across rows use the `DataTable` icon column and an icon set from the kit, never icons picked in a screen.
- Dates are entered only through `FormField` type `date` or `DateRangeField`, never `<input type="date">`, and shown only through the kit's date format. The server receives ISO `YYYY-MM-DD`.
- Screens contain no media or container queries, fixed pixel widths or page-level grids. Forms, filters and dashboards use the kit's grids, which reflow with the content width. A screen that must look different when narrow needs a kit change first (`/mflow:theme update`).
- Menu items and buttons are shown or hidden only through `ICurrentUser.Can(Permissions.X)`; never by comparing role names. Hiding is not protection: the endpoint checks the same key (see `docs/ui/design-system.md`).
- Labels, messages and validation text are Thai and come from the page's ViewModel or resource file, so wording is reviewable in one place. The exception is the kit's own date-picker text (the English and Thai calendar names, "Today · วันนี้", "Clear · ล้าง" and its English · Thai messages), which lives in the kit, not in screens.
