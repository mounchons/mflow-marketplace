---
paths:
  - "mreq/ui/**"
---

# UI rules

Read `mreq/ui/design-system.md` before building or changing a page under `mreq/ui/`.

- Assemble pages from the shared components only (`AppShell` or `SiteShell`, `PageHeader`, `FilterPanel`, `DataTable`, `FormField`, `DateRangeField`, `Button`, `Card`, `Dialog`, `SidePanel`, `QuickView`, `Alert`, `Tabs`, `Dropdown`, `Tooltip`, `Loading`, `DetailView`, `StatusBadge`, `EmptyState`, `ConfirmDialog`, `Toast`). A missing component is added to the kit and the style guide first (`/mreq:theme update`), then used.
- Colors, spacing, radius and fonts come from `tokens.css` variables or Bootstrap's utility classes. Text takes a text step (`--app-primary-text`, `--app-<tone>-text`), fills take a fill step. Statuses, avatars, KPI tiles and category icons get their hue from the kit (`StatusBadge`, icon sets, the `person` format, the KPI strip), never from the page. Icons come only from the kit's icon library. Hex values, `style="..."`, per-page `<style>` blocks and per-page scripts belong nowhere in pages; the one exception is a `<script type="application/json">` block holding a table definition or sample rows for the kit's scripts to read.
- Every list uses `DataTable`, with the filter panel as its own panel above the table, and header search only on the columns the page marks searchable (none is fine), with state in the query string. The kit pages its sample rows in the browser; the real app pages on the server.
- A row's details open in place through `QuickView` (a `Dialog` for one section, a `SidePanel` for the whole record). Features compared across rows use the `DataTable` icon column and an icon set from the kit, never icons picked in a page.
- Dates are entered only through `FormField` type `date` or `DateRangeField`, never `<input type="date">`, and shown only through the kit's date format. Values sent anywhere are ISO `YYYY-MM-DD`.
- Pages contain no media or container queries, fixed pixel widths or page-level grids. Forms, filters and dashboards use the kit's grids, which reflow with the content width. A page that must look different when narrow needs a kit change first (`/mreq:theme update`).
- Menu items, buttons, tabs, sections and fields are shown or hidden only through a permission key (`kit.can('<key>')` or `data-can="<key>"`), never by comparing role names. Keys and grants live in `mreq/ui/data/roles.json`. Hiding is not protection: the real app's endpoint checks the same key.
- Pages are served, never opened as `file://`: `/mreq:theme open`.
- Labels, messages and validation text are Thai and live in the page markup or the kit's dictionaries, so wording is reviewable in one place. The exception is the kit's own date-picker text (the English and Thai calendar names, "Today · วันนี้", "Clear · ล้าง" and its English · Thai messages), which lives in the kit, not in pages.
