# Design system

<!-- Written by /mreq:theme. Agent-facing: which component for which need.
     Change the kit with /mreq:theme update <what>; every page follows automatically. -->

The kit is static (HTML, CSS and JavaScript in `mreq/ui/theme/`) and is the reference for the real app. For the builder: `tokens.css` and `app.css` carry over unchanged when the real app keeps Bootstrap 5.3, and `tokens.css` alone when it does not; every component contract below is rebuilt in the app's stack with the same inputs, states and behaviour; where a behaviour serves data (paging, filters, data scope, permission checks, quick-view content), the real app does it on the server. The full contracts are in `mreq/ui/contracts/` (`component-contracts.md`, `responsive.md`, `access-data.md`); the table below names each component and its rules.

## Decisions
- Look: the house style (navy sidebar, white top bar, sky blue, bright hues, Inter + Noto Sans Thai, Font Awesome 6 Free). Adapted: TODO (the customer's CI in the brand family, or none; any other change and why)
- Button contrast: a) the kit's bright fills with white text, below AA for white text on a fill [ยืนยัน] (the user chose the bright fills, 2026-10-10; the other option, b) text-step fills that pass AA, is for a customer who asks for it)
- Breadcrumb: in the top bar (house style), so `PageHeader` has none
- Palette: TODO (values in `mreq/ui/theme/tokens.css`)
- Hues: the house style's bright palette (`--app-hue-*`: sky, blue, indigo, violet, cyan, emerald, green, yellow, amber, red) for statuses, avatars, KPI tiles and category icons
- Status colors: (none yet) <!-- one line per StatusBadge dictionary: status → hue, e.g. jobs: เปิดงาน blue · กำลังส่ง indigo · ส่งแล้ว cyan · ปิดงาน emerald · ยกเลิก red -->
- Font: Inter + Noto Sans Thai, JetBrains Mono for codes and amounts (house style), or TODO
- Density: TODO
- Apps and shells: TODO (each app with screens from AGENTS.md `## Stack` and its shell, e.g. `Web.Backend`: AppShell · `Web.Frontend`: SiteShell)
- Devices: TODO (desktop and laptop only / plus tablet / every size including phones), per app when they differ; acceptance sizes: TODO (e.g. 1366×768, 1920×1080)
- Breakpoints: TODO (default: ≥ 1280 px expanded menu · 768–1279 px icon rail · < 768 px drawer opened by ☰; the site navigation folds behind ☰ below 768 px)
- Layout: fills the window; sidebar and content scroll separately; the top bar stays on top
- Quick view: a section (one icon, a short summary) in a `Dialog`; a whole record in a `SidePanel`
- Icon sets: (none yet) <!-- one line per set when a page adds one: its keys, icons and Thai state words, e.g. coverages: คุ้มครอง / คุ้มครองบางส่วน / ไม่คุ้มครอง -->
- Date format: TODO (default `DD/MM/YYYY`, ค.ศ., today in Asia/Bangkok). One setting in `datepicker.js` drives the DatePicker, table columns and every displayed date; values sent to a server are ISO `YYYY-MM-DD`
- Users and roles: `mreq/ui/data/users.json` and `roles.json` (source in `mreq/ui/data/README.md`)
- Style guide: `mreq/ui/theme/index.html` (`/mreq:theme open`)
- Kit lives in: `mreq/ui/theme/`

## Which component for which need
| Need | Component | Notes |
|---|---|---|
| Page frame of a back-office app, ☰ menu toggle, top bar | `AppShell` | in every page skeleton; pages fill the main area |
| Page frame of a public-facing app, top navigation, footer | `SiteShell` | same tokens and components; menu folds behind ☰ when narrow |
| Page title, breadcrumb, main actions | `PageHeader` | one per page |
| Filters above a list | `FilterPanel` | a panel of its own, never inside the table; collapsible; redraws only the list |
| See a row's details without leaving the list | `QuickView` | an icon or the eye action opens a `Dialog` (one section) or a `SidePanel` (the whole record); real app: its endpoint checks the list's permission and scope |
| Features people compare across rows (coverages, options, documents) | `DataTable` column format `icons` | icons from one icon set; state by shape and color; each icon can open its section in a `QuickView` |
| Any list of records | `DataTable` | pager ‹ 1 … 4 5 6 … 20 ›, sort, page size; header search only on columns marked searchable (none: no search row); wide tables scroll inside their own box; the kit pages sample rows in the browser, the real app pages in the database |
| Any input with label + validation | `FormField` | text, number, money, date, select, multiselect, textarea, checkbox, switch, file |
| One date | `FormField` type `date` | the kit `DatePicker`: typed in the project date format or picked from an English and Thai calendar; value ISO |
| A From and To pair of dates | `DateRangeField` | To earlier than From is refused under To |
| Any action | `Button` | one primary per area; danger always behind `ConfirmDialog`; loading state |
| Grouped content, KPI | `Card` | never a grid of cards for a back-office list of records |
| A short form or a detail in a modal | `Dialog` | focus kept inside; backdrop does not close a form |
| A record's details or edit form beside the list | `SidePanel` | slides in from the right; full width when narrow |
| A message in place (load error, warning, note) | `Alert` | the result of an action is a `Toast` instead |
| Sections of one record | `Tabs` | active tab in the URL |
| More actions | `Dropdown` | items filtered by permission key |
| Label for an icon-only button or a cut-off text | `Tooltip` | never the only place important information lives |
| Waiting for content | `Loading` | spinner in a button, bar on a table or card, skeleton on first load |
| A read-only record | `DetailView` | label and value pairs in the kit grid, grouped in cards |
| Status of a record | `StatusBadge` | status → hue mapping lives in one place; two statuses never share a hue |
| A person or company in a list | `DataTable` column format `person` | initials avatar beside the name; its colors come from the name, never from the page |
| Nothing to show | `EmptyState` | message + primary action |
| Destructive or irreversible action | `ConfirmDialog` | always states what will happen |
| Result feedback | `Toast` | success/error after an action |
| Side navigation | `SidebarMenu` | items from the menu definition in `shell.js`; visibility by permission key only |
| Prototype marker | `PrototypeBanner` | on every kit page; holds the user switcher |

## Page patterns
| Page | Built from |
|---|---|
| List | `PageHeader` · optional KPI `Card`s · `FilterPanel` · `DataTable` (icons where rows are compared) · `QuickView` for details |
| Detail (when a quick view cannot hold it) | `PageHeader` with actions · `Tabs` · `DetailView` in `Card`s |
| Form | `PageHeader` · `Card` per section · `FormField`s in the form grid · one primary `Button` |
| Dashboard | KPI `Card`s · `Card`s holding short `DataTable`s |
| Public page (SiteShell) | `PageHeader` · `Card`s in the kit grid for offers to choose from, or a `DataTable` · `QuickView` |

## Do / don't
- Do show a row's details in place with `QuickView` before building a separate detail page.
- Do build new needs as a component first, add it to the style guide, then use it.
- Do write Thai labels, messages and empty-state text in the page markup or the kit's dictionaries, so wording is reviewable in one place.
- Do color text with the text step (`--app-primary-text`, `--app-<tone>-text`) and fills with the fill step (`--app-primary`, `--app-<tone>`); a light fill color never sets text on a light surface.
- Do take every icon from the kit's icon library (Font Awesome 6 Free, solid, in the house style).
- Do let color carry meaning, brightly: statuses, avatars, KPI tiles and category icons take their hues from the kit's dictionaries (`StatusBadge`, icon sets, the `person` format, the KPI strip); a page never picks a hue.
- Don't put hex colors, inline styles, page-level CSS or page-level scripts in pages.
- Don't build a table by hand, even a small one.
- Don't use the browser's `<input type="date">`, and don't format a date in a page; dates go through `FormField` type `date` and the kit's date format.
- Don't write media or container queries, fixed pixel widths or page-level grids in pages. Forms, filters and dashboards reflow through the kit's grids.
- Don't compare role names. Show or hide through a permission key (`kit.can('<key>')`, `data-can="<key>"`); the real app's endpoint checks the same key, because hiding is not protection.

## Adding a component
1. Write its contract in this file (parameters, states, behaviour).
2. Implement it in `app.css` and the kit script it belongs to.
3. Show every state on the style guide (`index.html`).
