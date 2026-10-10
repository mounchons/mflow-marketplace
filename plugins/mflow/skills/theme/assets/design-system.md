# Design system

<!-- Written by /mflow:theme. Agent-facing: which component for which need.
     Change the kit with /mflow:theme update; screens follow automatically. -->

## Decisions
- Look: mflow house style (skills/theme/references/house-style.md): navy sidebar, white top bar, sky blue, Inter + Noto Sans Thai, Font Awesome 6 Free. Adapted: TODO (the customer's CI in the brand family, or none; any other change and why)
- Button contrast: a) the kit's bright fills with white text, below AA for white text on a fill [ยืนยัน] (the user chose the bright fills, 2026-10-10; the other option, b) text-step fills that pass AA, is in skills/theme/references/house-style.md, "Contrast", for a customer who asks for it)
- Breadcrumb: in the top bar (house style), so `PageHeader` has none
- Palette: TODO (tokens in the Tokens file of AGENTS.md `## Stack`)
- Hues: the house style's bright palette (`--app-hue-*`: sky, blue, indigo, violet, cyan, emerald, green, yellow, amber, red) for statuses, avatars, KPI tiles and category icons
- Status colors: (none yet) <!-- one line per StatusBadge dictionary: status → hue, e.g. jobs: เปิดงาน blue · กำลังส่ง indigo · ส่งแล้ว cyan · ปิดงาน emerald · ยกเลิก red -->
- Font: Inter + Noto Sans Thai, JetBrains Mono for codes and amounts (house style), or TODO
- Density: TODO
- Devices: TODO (desktop and laptop only / plus tablet / every size including phones); acceptance sizes: TODO (e.g. 1366×768, 1920×1080)
- Breakpoints: TODO (default: ≥ 1280 px expanded menu · 768–1279 px icon rail · < 768 px drawer opened by ☰)
- Layout: fills the window; sidebar and content scroll separately; the top bar stays on top
- Quick view: a section (one icon, a short summary) in a `Dialog`; a whole record in a `SidePanel`
- Icon sets: (none yet) <!-- one line per set when a screen adds one: its keys, icons and Thai state words, e.g. coverages: คุ้มครอง / คุ้มครองบางส่วน / ไม่คุ้มครอง -->
- Date format: TODO (default `DD/MM/YYYY`, ค.ศ., today in Asia/Bangkok). One setting in the kit's format module drives the DatePicker, table columns and every displayed date; values sent to the server are ISO `YYYY-MM-DD`
- Style guide: `/_styleguide` (dev/prototype only)
- Kit lives in: TODO (the paths in AGENTS.md `## Stack`; `docs/ui/theme/` while the kit is a static preview, and a pointer to the frozen preview after port)

## Which component for which need
| Need | Component | Notes |
|---|---|---|
| Page frame, ☰ menu toggle, top bar | `AppShell` | in the layout only; screens fill the main area |
| Page title, breadcrumb, main actions | `PageHeader` | one per page |
| Filters above a list | `FilterPanel` | a panel of its own, never inside the table; collapsible; refreshes only the list, no full page reload |
| See a row's details without leaving the list | `QuickView` | an icon or the eye action opens a `Dialog` (one section) or a `SidePanel` (the whole record); endpoint checks the list's permission and scope |
| Features people compare across rows (coverages, options, documents) | `DataTable` column format `icons` | icons from one icon set; state by shape and color; each icon can open its section in a `QuickView` |
| Any list of records | `DataTable` | server-side paging in the database, pager ‹ 1 … 4 5 6 … 20 ›, sort, page size; header search only on columns marked searchable (none: no search row); wide tables scroll inside their own box |
| Any input with label + validation | `FormField` | text, number, money, date, select, multiselect, textarea, checkbox, switch, file |
| One date | `FormField` type `date` | the kit `DatePicker`: typed in the project date format or picked from an English and Thai calendar; value ISO |
| A From and To pair of dates | `DateRangeField` | To earlier than From is refused under To |
| Any action | `Button` | one primary per area; danger always behind `ConfirmDialog`; loading state |
| Grouped content, KPI | `Card` | never a grid of cards for a list of records |
| A short form or a detail in a modal | `Dialog` | focus kept inside; backdrop does not close a form |
| A record's details or edit form beside the list | `SidePanel` | slides in from the right; full width when narrow |
| A message in place (load error, warning, note) | `Alert` | the result of an action is a `Toast` instead |
| Sections of one record | `Tabs` | active tab in the URL |
| More actions | `Dropdown` | items filtered by permission |
| Label for an icon-only button or a cut-off text | `Tooltip` | never the only place important information lives |
| Waiting for content | `Loading` | spinner in a button, bar on a table or card, skeleton on first load |
| A read-only record | `DetailView` | label and value pairs in the kit grid, grouped in cards |
| Status of a record | `StatusBadge` | status → hue mapping lives in one place; two statuses never share a hue |
| A person or company in a list | `DataTable` column format `person` | initials avatar beside the name; its colors come from the name, never from the screen |
| Nothing to show | `EmptyState` | message + primary action |
| Destructive or irreversible action | `ConfirmDialog` | always states what will happen |
| Result feedback | `Toast` | success/error after an action |
| Side navigation | `SidebarMenu` | items from `MenuDefinition`; visibility by permission only |
| Prototype marker | `PrototypeBanner` | automatic in layout while using fake data; holds the role switcher |

## Page patterns
| Page | Built from |
|---|---|
| List | `PageHeader` · optional KPI `Card`s · `FilterPanel` · `DataTable` (icons where rows are compared) · `QuickView` for details |
| Detail (when a quick view cannot hold it) | `PageHeader` with actions · `Tabs` · `DetailView` in `Card`s |
| Form | `PageHeader` · `Card` per section · `FormField`s in the form grid · one primary `Button` |
| Dashboard | KPI `Card`s · `Card`s holding short `DataTable`s |

## Do / don't
- Do show a row's details in place with `QuickView` before building a separate detail page.
- Do build new needs as a component first, add it to the style guide, then use it.
- Do keep Thai text in ViewModels/resources.
- Do color text with the text step (`--app-primary-text`, `--app-<tone>-text`) and fills with the fill step (`--app-primary`, `--app-<tone>`); a light fill color never sets text on a light surface.
- Do take every icon from the kit's icon library (Font Awesome 6 Free, solid, in the house style).
- Do let color carry meaning, brightly: statuses, avatars, KPI tiles and category icons take their hues from the kit's dictionaries (`StatusBadge`, icon sets, the `person` format, the KPI strip); a screen never picks a hue.
- Don't put hex colors, inline styles or page-level CSS in views.
- Don't build a table by hand, even a small one.
- Don't use the browser's `<input type="date">`, and don't format a date in a screen; dates go through `FormField` type `date` and the kit's date format.
- Don't write media or container queries, fixed pixel widths or page-level grids in screens. Forms, filters and dashboards reflow through the kit's grids.
- Don't compare role names in views or controllers. Check a `Permissions` key with `ICurrentUser.Can(...)`; the endpoint carries the same key.

## Adding a component
1. Write its contract in this file (parameters, states, behaviour).
2. Implement in the Components folder of AGENTS.md `## Stack`.
3. Show every state on `/_styleguide`.
