# Component contracts

Each component is built once and reused everywhere. A contract says what the component takes, which states it must show, and how it behaves. How it looks (colors, type, shape, the icon library) is the kit's visual direction, decided in [visual-direction.md](visual-direction.md) and held in `tokens.css` and `app.css`; no contract fixes it. How the kit behaves at each width, and which sizes it is checked at, is in [responsive.md](responsive.md); the "Narrow" lines below are each component's part of it.

**Where they live.** The kit is static: plain HTML pages, `app.css` for every component's look and layout, and three scripts for behaviour: `shell.js` (the shells, the current user and `kit.can`, the menu definition, `Dialog`, `SidePanel`, `QuickView`, `Toast`, `ConfirmDialog`, `Dropdown`, `Tabs`, `Tooltip`, `StatusBadge` and the icon sets), `datatable.js` (`DataTable`, `FilterPanel`) and `datepicker.js` (`DatePicker`, `DateRangeField`, the date format). Bootstrap 5.3 from a CDN is the CSS and script base, colored by the token bridge in `tokens.css`. Pages use the components through markup and `data-*` attributes the scripts read; no page carries a script or style of its own.

**A behaviour spec for the real app.** Whoever builds the real app rebuilds each contract in its own stack. Where a behaviour serves data (paging, filtering, data scope, permission checks, quick-view content), the kit shows it on sample rows in the browser, and the real app does it on the server. Those lines are marked **Real app:**.

**The kit's script surface.** `shell.js` exposes one global object, `kit`: `kit.user` (the current user from `../data/users.json`), `kit.can('<key>')` (whether the current user's roles grant a permission key, from `../data/roles.json`; see [access-data.md](access-data.md)), `kit.scope('<entity>')` (the data scope those roles give an entity), `kit.toast(tone, text)`, `kit.formatDate(iso)` and `kit.formatMoney(n)`. Any element with `data-can="<key>"` is removed from the page when `kit.can` says no. Pages never compare role names.

## AppShell

The frame of a back-office app (`Backend`). It is built once in each page's skeleton; pages only fill the main area.

- **Structure:** the `PrototypeBanner` on top, then the `SidebarMenu` beside the content column. The content column holds the top bar above the main area. A skip link "ข้ามไปเนื้อหาหลัก" is the first focusable element.
- **Top bar:** on the left the ☰ toggle and the page context: the breadcrumb when design-system.md puts it in the top bar (the house style does, and `PageHeader` then has none), otherwise the page title. On the right, in this order:
  - the global search, only when the product has one, with its shortcut shown as `Ctrl K` (`⌘K` on a Mac);
  - the notifications bell, with a dot while anything is unread;
  - the scope chip, only when data scope divides the data (a branch, a company, a tenant): the unit whose data the user sees, from `kit.user`; it opens a switcher only when the user holds more than one;
  - the current user: an initials avatar, the name and the role, opening the user's menu.
- **Fills the window:** full height (`100dvh`); the sidebar and the content scroll separately; the top bar stays on top (sticky). The main area is a size container (`container-type: inline-size`), so content reflows by its own width. Its width is capped only if design-system.md says so (`--app-content-max`).
- **Sidebar states**, switched at the breakpoints in design-system.md:
  - `expanded`: icon and label, group headings, badges.
  - `rail`: icons only. Each label becomes a tooltip and stays readable to screen readers, group headings become a thin rule, and badges sit on the icon.
  - `drawer`: off-canvas over the page, with a backdrop.
- **☰ toggle:** in the top bar at every width. On wide and medium windows it switches expanded ↔ rail, and the choice is remembered per user (responsive.md §3). Below the drawer breakpoint it opens the drawer and leaves the remembered choice alone.
- **Bottom tab bar** (optional, only when the devices in design-system.md include phones): at phone sizes, 4 or 5 shortcuts along the bottom, each an icon over a short label, from the menu items marked for it and filtered by permission like the menu. The last may be "อื่น", which opens the drawer. The active one carries `aria-current="page"`, and the main area keeps room for the bar.
- **Drawer:** Esc, a tap on the backdrop, choosing a menu item, or any navigation closes it. Build it on Bootstrap 5.3's offcanvas, which already handles focus, Esc and the backdrop.
- **Narrow:** below the drawer breakpoint the top bar keeps one line: the page title replaces the breadcrumb, the search becomes an icon button, the scope chip shows its initials only, the user's name gives way to the avatar, and text buttons become icon buttons with an `aria-label`. Main padding comes from tokens (`--app-main-pad-x`, `--app-main-pad-y`) that `app.css` reduces on narrower windows.
- **Accessibility:** as responsive.md §4.

## SiteShell

The frame of a public-facing app (`Frontend`, `Portal`, `Partner`…): a site for customers or the public rather than a back office for staff. It uses the same tokens and components as `AppShell`; only the frame differs. The kit builds it only when AGENTS.md `## Stack` lists such an app; how it looks is in house-style.md, "Site shell".

- **Structure:** the `PrototypeBanner` on top, then the top navigation, the page body and the footer. A skip link "ข้ามไปเนื้อหาหลัก" is the first focusable element. The navigation and the body sit in a centred column no wider than `--app-site-max`; the body is a size container like `AppShell`'s main area.
- **Top navigation:** the logo and product name on the left (a link to the home page); the menu items as text links (from the menu definition, filtered by `kit.can` like `SidebarMenu`, the active one with `aria-current="page"`); on the right the search when the product has one, then the user block: the initials avatar and name opening the user's menu, or, with no user signed in, a "เข้าสู่ระบบ" `Button` (primary). The navigation stays on top (sticky).
- **Signed out:** a public-facing app often has pages for visitors. The kit's users list may hold a visitor (a user with no roles and only the public permission keys); choosing it in the switcher shows the signed-out navigation.
- **Footer:** contact details, links (terms, privacy policy, help) and the copyright line; optional columns of links on wide windows.
- **Page body:** `PageHeader` and the same components as the back office. A list for the public is still a `DataTable` or, where the rows are offers to choose from (packages, products), a grid of `Card`s with the kit's grid; a record opens in a `QuickView` or its own page.
- **Narrow:** below the drawer breakpoint the menu items fold behind ☰, which opens a drawer from the left (Bootstrap's offcanvas, as `AppShell`); the user block becomes the avatar, or an icon button when signed out; footer columns stack. The bottom tab bar is available here too when the devices include phones.
- **Accessibility:** as responsive.md §4; the drawer behaves as `AppShell`'s.

## DataTable

The most important component; most back-office screens are a DataTable plus a FilterPanel.

- **Input:** a table definition that `datatable.js` reads from a `<script type="application/json">` block beside the table (data, not code): `columns` (key, Thai header, width, align, sortable, searchable (default off), format: text/number/money/date/status/person/icons), `rows` (inline sample rows, or a JSON file under `mreq/ui/data/`), `pageSize`, `rowUrl` (optional), `rowActions` (optional, each with its permission key), `quickView` (optional: what a row and its icons open, see `QuickView`). A list has `rowUrl` or `quickView`, never both: `rowUrl` goes to another page, `quickView` opens in place, and a list with a quick view reaches a full page only through the panel's "เปิดหน้าเต็ม".
- **Paging:** in the kit, `datatable.js` filters, sorts and pages the sample rows in the browser, to show the behaviour; enough sample rows (about 60) that the pager shows its gaps. **Real app:** server-side only, to keep database load and page weight low: the server receives `page`, `pageSize` (10/25/50/100), `sort`, `dir` and the filters, applies the filters and the sort, takes one page inside the database query, counts with the same filters, and returns the page with its total count. Never load all rows into memory or to the browser.
- **Search:** `FilterPanel` is a separate panel above the table, for structured filters; it is never inside the table. The header search is optional: a search input under the header of each column marked `searchable`, debounced 400 ms. A page marks some columns, or none; with none, the search row is not rendered at all. **Real app:** both run on the server.
- **State in the URL:** every filter, sort and page value is a query-string parameter (the script updates it with the History API), so a filtered view can be bookmarked, shared and reloaded.
- **Redraw:** filters, column search, sort and paging redraw only the table body and the pager; the page never reloads.
- **Formats:** money right-aligned with 2 decimals and thousands separators; dates in the project date format (see `DatePicker`), never formatted by a page; status via `StatusBadge`; a person or company (`person`) as an initials avatar beside the name, with an optional second line (a code or a role), the avatar's colors picked by the kit from a stable hash of the name, never by the page; icons as below.
- **Icon column** (format `icons`): a row of small icons for the features people compare across rows, such as the coverages of an insurance package. The column names an icon set; the row gives each key's state.
  - **Icon set:** one dictionary per kind, in `shell.js` like `StatusBadge`: each key has an icon from the kit's icon library, a Thai label, and the Thai words for its three states (for coverages: คุ้มครอง, คุ้มครองบางส่วน, ไม่คุ้มครอง). A set may also give each key a hue (`--app-hue-*`), used where the key stands for a kind of thing (a cost type in a list, a category in a menu); in the icon column the state colors below win. Pages pass keys and states, never icons or colors.
  - **States:** `yes`, `partial` and `no`, told apart by shape as well as color, never by color alone: `yes` filled in `--app-primary`, `partial` outlined with a small mark in `--app-warning`, `no` outlined, struck through and in `--app-text-muted`. Every key of the set keeps its place on every row, so the eye can run down one coverage; a `no` stays in place, muted.
  - **Each icon** carries `aria-label` and a `Tooltip` of "<label>: <state words>". When the column has a quick view, each icon is a `<button>` that opens it on that key's section; otherwise it is `role="img"`. A click on an icon opens only its own section, never the row's whole-record quick view.
  - **Narrow:** the icons wrap inside their cell; on tablet and phone sizes each one keeps a tap area of `--app-touch-target`. The quick view is how touch reaches the tooltip's text.
- **States:** loading (indicator on the table, not the page), empty (`EmptyState`), no results for filter (message + "ล้างตัวกรอง"), error (inline alert with retry). The style guide shows each one.
- **Footer:** "แสดง 1–25 จาก 1,234 รายการ" + pager + page-size select.
- **Pager:** ‹ and › around the page numbers. Up to 7 pages, every number shows. Beyond that it shows the first page, the last page, the current page and one page on each side of it; each gap becomes `…`, except that a gap of a single page shows that page's number instead.

  | Pages | Current | Pager |
  |---|---|---|
  | 5 | 3 | ‹ 1 2 **3** 4 5 › |
  | 20 | 1 | ‹ **1** 2 … 20 › |
  | 20 | 4 | ‹ 1 2 3 **4** 5 … 20 › |
  | 20 | 5 | ‹ 1 … 4 **5** 6 … 20 › |
  | 20 | 20 | ‹ 1 … 19 **20** › |

  ‹ is off on the first page and › on the last. The current page is not a link and carries `aria-current="page"`; ‹ and › carry the labels "หน้าก่อน" and "หน้าถัดไป". Each page is a link with its page in the query string. Paging keeps the filters, sort and page size. A change of filter, sort or page size returns to page 1, and a page past the end (after a filter) shows the last page. Build it on Bootstrap's `.pagination`, which `tokens.css` already colors.
- **Narrow:** a table wider than its box scrolls sideways inside its own box, never the page. The footer wraps under the table, and at the narrowest content step the pager shrinks to ‹ 5 / 20 ›.

## FilterPanel

- **Input:** list of filter fields (each rendered as a `FormField`), a keyword box, "ค้นหา" and "ล้างตัวกรอง" buttons.
- **Behaviour:** a panel of its own above the table, never inside it. Collapsible, remembers open/closed per page; applies to the `DataTable` below it (in the kit, `datatable.js` filters the sample rows; **Real app:** the same list endpoint the table pages from); shows active filters as removable chips above the table. Dates use `FormField` type `date` or `DateRangeField`. Search does not run while a field inside is invalid (`aria-invalid="true"`, such as a wrong date or To before From); focus goes to the first such field, and the browser's own validation bubble is never used.
- **Narrow:** fields sit in a grid of 4 columns that steps down to 3, 2 and 1 as the content narrows. On phones the panel starts collapsed, and the chips still show what is filtered.

## FormField

- **Input:** name, label (Thai), type (text, number, money, date (the kit `DatePicker`), select, multiselect, textarea, checkbox, switch, file), placeholder, help text, required, disabled, options (for selects).
- **States:** default, focus, disabled, read-only, invalid with message, required marker. **Real app:** the server validates again; the browser's checks are a convenience, never the guard.
- **Rules:** label always visible (no placeholder-as-label); money and number inputs right-aligned; type `date` is the kit `DatePicker` everywhere, never the browser's `<input type="date">`.
- **Narrow:** a form lays its fields in the kit's form grid, which becomes one column at the narrowest content step. There, the form's action buttons stretch to full width.

## DatePicker

The one date input of the kit. Pages use it only through `FormField` type `date` or `DateRangeField`, which show its messages. It is a text field typed in the project's date format, plus a calendar that shows English and Thai. It never uses the browser's `<input type="date">`, whose look and format follow the browser's locale, and it never formats dates with `Intl` and a Thai locale, which can print the Buddhist year where the Gregorian one is meant.

- **Date format: one setting for the whole kit.** design-system.md Decisions records it, and one config in `datepicker.js` holds it. The picker, its placeholder and messages, the DataTable `date` column, `kit.formatDate` and every date the kit displays read that config; pages never format dates themselves.
  - Pattern, from a closed set: `DD/MM/YYYY` (default), `DD-MM-YYYY`, `DD.MM.YYYY`, `YYYY-MM-DD`.
  - Year: ค.ศ. (default) or พ.ศ. (the Gregorian year + 543). Only what people see and type changes; the stored and exchanged value stays Gregorian.
  - Today: in Asia/Bangkok unless the decision names another time zone, never the browser's.
- **Value:** an ISO calendar date `YYYY-MM-DD` (Gregorian) in and out, or empty. A hidden input carries the field's `name` with the ISO value, so a submitted form or `FilterPanel` sends `2026-09-27` whatever the display pattern. The change event gets the ISO date as soon as the text is a whole date, and empty while the text is empty or not a date.
- **Input:** value or default value (ISO), name, label (it names the calendar button and the calendar), min and max (ISO), required, disabled, read-only.
- **Typing:** the placeholder is the pattern (`DD/MM/YYYY`). The field accepts the configured order with `/`, `-` or `.` between the parts, one- or two-digit day and month, eight digits with no separator in the configured order, and a pasted ISO date (year first, when the pattern is not year first; always Gregorian). On blur or Enter it rewrites the text in the pattern. No `maxlength`, so a pasted date with spaces still fits. Gregorian years 1900 to 2399 only.
  - Parse with integer year, month and day arithmetic only: never `new Date(text)` or `toISOString()`, which read the browser's time zone and can shift the day.
  - The parser is checked against this table. The style guide runs every row through `datepicker.js` and shows the result with ✓ or ✗; the real app turns the table into a unit test:

    | Setting | Typed | Result |
    |---|---|---|
    | `DD/MM/YYYY`, ค.ศ. | `27/09/2026` | `2026-09-27` |
    | `DD/MM/YYYY`, ค.ศ. | `1/9/2026` | `2026-09-01` |
    | `DD/MM/YYYY`, ค.ศ. | `27-09-2026` or `27.09.2026` | `2026-09-27` |
    | `DD/MM/YYYY`, ค.ศ. | `27092026` | `2026-09-27` |
    | `DD/MM/YYYY`, ค.ศ. | `2026-09-27` (pasted ISO) | `2026-09-27` |
    | `DD/MM/YYYY`, ค.ศ. | `29/02/2028` | `2028-02-29` |
    | `DD/MM/YYYY`, ค.ศ. | `29/02/2027` or `31/02/2026` | format message |
    | `DD/MM/YYYY`, ค.ศ. | `27/09/26` (two-digit year) | format message |
    | `DD/MM/YYYY`, ค.ศ. | `27/09/2569` | wrong-year message (2400 or later is refused, never converted) |
    | `DD/MM/YYYY`, พ.ศ. | `27/09/2569` | `2026-09-27` |
    | `DD/MM/YYYY`, พ.ศ. | `27/09/2026` | wrong-year message (below 2400 is refused, never converted) |
    | `DD/MM/YYYY`, พ.ศ. | `2026-09-27` (pasted ISO) | `2026-09-27` |
    | `YYYY-MM-DD`, ค.ศ. | `2026-9-27` or `20260927` | `2026-09-27` |
    | any | empty | empty, no message |

    Rows written for another setting than the project's are run with that setting passed in, so every row is checked whatever the project chose.
- **Messages,** English · Thai, under the field. They appear on blur or Enter and clear as soon as the text is fixed; `FormField`'s own error takes precedence:
  - format: "Enter a date as DD/MM/YYYY · กรอกวันที่เป็น วว/ดด/ปปปป", in the configured pattern;
  - wrong year: "Use the Gregorian year, such as 2026 · ใช้ปี ค.ศ. เช่น 2026" under ค.ศ., or "Use the Buddhist year, such as 2569 · ใช้ปี พ.ศ. เช่น 2569" under พ.ศ.;
  - outside min or max: "Must not be before <date> · ต้องไม่ก่อน <date>" or "Must not be after <date> · ต้องไม่หลัง <date>", the date in the pattern.
- **Calendar:** the calendar button inside the field, or Alt+↓ in the text, opens a popover (`role="dialog"`) under the field, or above it or right-aligned when it would not fit. It opens on the field's month, or on today's.
  - **Days:** the title shows the English month and year on one line and the Thai month under it ("October 2026" over "ตุลาคม"; under พ.ศ. the year reads 2569). « and » move a year, ‹ and › a month. The week starts on Sunday, and each weekday shows its short English name over the short Thai one: Su อา, Mo จ, Tu อ, We พ, Th พฤ, Fr ศ, Sa ส.
  - **Months:** a click on the title shows the 12 months, English over Thai, three per row, with the year as the title and ‹ › for the year.
  - **Years:** a click on the year shows a page of 12 years, with ‹ › for the page. Picking a year opens its months, and picking a month opens its days, on the same day number cut to the month's length (31 → 30).
  - Month and weekday names are written out in the kit, not taken from `Intl`.
  - The selected day, month or year is filled with `--app-primary`, its text in `--app-on-primary`; today's has a ring in `--app-primary`. Anything wholly outside min and max is struck through in `--app-text-muted` and cannot be picked.
  - Footer, in every view: "Today · วันนี้" (off when today is outside min and max) and "Clear · ล้าง".
  - Keyboard: the arrows move one cell or one row; Home and End go to the ends of the week; PageUp and PageDown move a month (with Shift, a year) in days, a year in months, and 12 years in years; Enter picks. Esc steps back years → months → days, then closes and returns focus to the calendar button.
  - It closes on a pick of a day, Today, Clear, Esc in the days view, a click outside, or Tab out of it. After a pick, focus returns to the text.
- **Reset:** the owning form's reset (FilterPanel "ล้างตัวกรอง") returns the field to its default value and clears its message.
- **States:** empty, filled, focus, invalid, with min and max, disabled, read-only; disabled and read-only turn the calendar button off. The style guide shows each state and the three calendar views.
- **In the kit:** `datepicker.js` turns every date field into a DatePicker on load, and again whenever a `Dialog` or `SidePanel` fills its body, so a date field inside them gets it too.
- **Real app:** the same behaviour in its stack. The visible text input carries the validation and its single message element; the hidden ISO input carries the value that binds, never the display text, whatever the server's culture; and the server checks the ISO value again (required, min, max).

## DateRangeField

A From and To pair: two `FormField` date cells that the filter and form grids lay out as two fields. Input: an id (the inputs are `<id>-from` and `<id>-to`), the two names (default `from` and `to`), labels (default "วันที่เริ่มต้น" and "วันที่สิ้นสุด"), values, min and max, required, disabled, read-only. A To earlier than From shows "Date To must not be before Date From · วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น" under To; the same day is allowed. **Narrow:** the two cells follow the grid, side by side while there is room and stacked at the narrowest step.

## PageHeader

Title, optional subtitle (counts and freshness, such as "รวม 1,247 ราย · อัปเดตล่าสุด 2 นาทีที่แล้ว"), the breadcrumb unless design-system.md puts it in the `AppShell` top bar (one home, never both), up to one primary `Button`, a few secondary actions as outline or icon buttons, and the rest in a `Dropdown`. An optional KPI strip of `Card`s may follow it. **Narrow:** the actions move under the title; the secondary actions stay in the dropdown.

## StatusBadge

`StatusBadge(status)` maps each domain status to a Thai label and a hue (`--app-hue-*`, as house-style.md "Hues" orders them by meaning) in one dictionary in `shell.js`. Two statuses of one dictionary never share a hue; a pipeline longer than the palette pairs a reused hue with an icon. The chip shows a dot and the label, so a status reads without its color. Pages never choose badge colors themselves.

## EmptyState

Icon, short Thai message, optional primary action ("สร้างรายการแรก").

## ConfirmDialog

A `Dialog` with a title, a sentence stating exactly what will happen ("ยกเลิกงาน JOB-0012 และคืนรถให้ว่าง"), confirm button in danger style for destructive actions, cancel. Opened by the kit's script from a `data-confirm` attribute on the trigger, so no page writes its own. **Narrow:** never wider than the window minus 32 px.

## Toast

Success, error, info. Raised by `kit.toast(tone, text)`, so any action can raise one without page-specific script; **Real app:** an action's response can raise one the same way. Toasts stack in the bottom right, at most 380 px wide. **Narrow:** never wider than the window minus 32 px.

## Button

- **Input:** Thai text, variant, size (default, or `sm` in tables and toolbars), an optional icon on the left, icon-only (then an `aria-label` and a `Tooltip` are required), loading, disabled, type (`button` or `submit`), an optional permission key.
- **Variants:** `primary` for the one main action of a page, form or dialog; `secondary` and `outline` for the others; `danger` for destructive actions, always behind `ConfirmDialog`; `link` for a quiet action inside text. A `<button>` acts; an `<a>` only navigates.
- **Behaviour:** while loading, the button shows a spinner in place of its icon, keeps its width, and is disabled, so a double click submits once. A button the user has no permission for is not rendered (`data-can`); it is never shown disabled as a hint.
- **States:** default, hover, focus (ring from `--app-focus-ring`), active, disabled, loading.
- **Narrow:** at least `--app-touch-target` high on tablet and phone sizes. In a form's action row at the narrowest step, buttons stretch to full width, as `FormField` says.
- Bootstrap's `.btn` classes, which the token bridge colors.

## Card

- **Input:** an optional header (title, optional subtitle, optional actions on the right), a body, an optional footer.
- **Use:** groups related content on a detail page, a form section or a dashboard. A KPI card is a Card variant: a label, a value in the kit's number or money format, an optional change against the previous period, and an optional icon in a tinted tile. A strip of KPI cards gives its tiles hues in a fixed order (sky, violet, emerald, amber, then the rest of the palette), so a page never picks one. A list of records in the back office is a `DataTable`, never a grid of cards.
- **States:** default, loading (a `Loading` skeleton in the body), empty (`EmptyState` in the body).
- **Narrow:** cards sit in the kit's grid and stack to one column at the narrowest step; header actions wrap under the title.
- Bootstrap's `.card`.

## Dialog

A modal with content: a short form, a detail view, a picker. `ConfirmDialog` is a Dialog that holds one sentence.
- **Input:** title, body, footer buttons (the main action last, Cancel before it), size (`sm`, default, `lg`), busy.
- **Behaviour:** on opening, focus goes to the first control inside, or to ×, and stays inside the dialog; on closing, it returns to the element that opened it. ×, Esc and Cancel close it. A click on the backdrop closes it only when it holds no form, so typed input is never lost by a stray click. While busy (its action runs), Esc and × do nothing and the main button shows loading. The page behind does not scroll.
- **Use:** a form longer than about six fields, or anything holding a table, is a page or a `SidePanel` instead.
- **Narrow:** never wider than the window minus 32 px. On phone sizes it fills the width; the header and footer stay and the body scrolls inside.
- Bootstrap's modal; the kit's script fills its body.

## SidePanel

A panel that slides in from the right over the page: a record's details, or a form that keeps the list in view. It is called SidePanel so that "drawer" keeps meaning the sidebar's state in `AppShell`. A row's details on a list open in it through `QuickView`.
- **Input:** title, body, footer actions, width (`md` about 480 px, `lg` about 720 px).
- **Behaviour:** a backdrop; ×, Esc and Cancel close it; focus goes in and back to the opener. A panel with unsaved changes asks before closing, through `ConfirmDialog`. It may put the open record in the URL (`?view=JOB-0012`) so a reload reopens it.
- **Narrow:** full width below the drawer breakpoint.
- Bootstrap's offcanvas (`offcanvas-end`); the kit's script fills its content.

## QuickView

A record, or one section of it, shown over the page the user is on, so a list keeps its place while its details are read. On a list page it is the default way to see a row's details. A separate detail page is for what a panel cannot hold, a link to share, or printing.

- **Openers:** an icon in an `icons` cell (opens that key's section), the row action "ดูรายละเอียด" with an eye icon (the whole record), or a link in a cell such as the record's name. A click elsewhere on the row may open the record too (the list then has no `rowUrl`), but the link or the eye action is always there, because a row is not a keyboard target.
- **Where it opens:** one section or a short summary (a coverage's limit and conditions; about six facts, no table) opens in a `Dialog` (`sm` or default). The whole record, or content with a table, `Tabs` or a form, opens in a `SidePanel` (`md`, or `lg` with a table). A page may choose the other one for a reason it writes in its row of the screen list.
- **Content:** built from the kit: `DetailView`, and inside a `SidePanel` also `Tabs` or a small `DataTable`. In the kit, `shell.js` fills it from the sample row (or a sample JSON file) after a short `Loading` skeleton. A section the user may not see (`kit.can` says no) has no icon, and restricted fields are left out, as `DetailView` says. **Real app:** the content comes from an endpoint of the list's page, one per opener kind (`GET <route>/<id>/quick` for the record, `GET <route>/<id>/quick/<section>` for a section); it checks the list's view permission and applies the same data scope, so a typed URL for a row outside the scope gets 403, and a hidden section's endpoint returns 403 too.
- **Behaviour:** the body shows a `Loading` skeleton, then the content. A load error shows an `Alert` with "ลองใหม่" inside the Dialog or SidePanel, never a `Toast`. The list behind keeps its filters, sort, page and scroll, and closing returns focus to the opener. The title repeats what was opened ("ความคุ้มครองอุบัติเหตุ · แพกเกจ PKG-0012") and, for an icon, its state. The footer holds the record's main action when `kit.can` grants it (such as "แก้ไข" or "เลือกแพกเกจนี้") and, in a SidePanel, "เปิดหน้าเต็ม" when a detail page exists. A SidePanel quick view puts the record in the URL (`?view=<id>`, plus `&section=<key>` when opened on a section) so a reload or a shared link reopens it; a Dialog quick view adds nothing to the URL.
- **States:** loading, content, load error with retry, and an empty section ("—" values, or `EmptyState` for a section with nothing in it). The style guide shows the error state with a sample that fails on purpose.
- **Narrow:** as `Dialog` and `SidePanel`.

## Alert

An inline message in a page or a section.
- **Input:** tone (`info`, `success`, `warning`, `danger`), optional title, text, an optional action (such as "ลองใหม่"), optional close button.
- **Use:** something the user must see in place: a load error with retry, a warning about this record, a note at the top of a page. The result of an action is a `Toast`, not an Alert.
- **Behaviour:** `danger` carries `role="alert"`; a waiting state carries `role="status"`; the others no role. Background from the tone's `--app-*-subtle` token, border and icon from its `--app-*` token. Every alert has an icon and text, never color alone.
- **Narrow:** the full width of its container; the action wraps under the text.
- Bootstrap's `.alert`.

## Tabs

- **Input:** the tabs (Thai label, optional count badge, permission key) and the active one, held in the URL (`?tab=history`) so a reload keeps it.
- **Behaviour:** for the sections of one record (ข้อมูลทั่วไป, ประวัติ, เอกสารแนบ). A tab's content loads when it is first opened. The arrow keys move between tabs, as the ARIA tabs pattern says. A tab the user has no permission for is not rendered.
- **Narrow:** the tab list scrolls sideways inside its own box; it never wraps into two rows.
- Bootstrap's `.nav-tabs`.

## Dropdown

- **Input:** a trigger button and items (Thai label, icon, permission key, `danger`, divider).
- **Use:** a row's "more actions", and `PageHeader`'s secondary actions. A `danger` item goes through `ConfirmDialog`.
- **Behaviour:** Enter, Space or ↓ opens it; the arrows move; Esc closes it and returns focus to the trigger. Items the user has no permission for are not rendered, and a dropdown with no visible item is not rendered either.
- **Narrow:** the menu stays inside the window, aligned to the trigger's end when it would overflow.
- Bootstrap's dropdown.

## Tooltip

A short label on hover and on keyboard focus: an icon-only button, the sidebar rail, a cut-off cell. It is never the only place important information lives, and never sits on a disabled element (wrap it). Screen readers get the same text through `aria-label` or `aria-describedby`. **Narrow:** touch has no hover, so the information must also be reachable another way (a `QuickView`, or the full text on the detail page). Bootstrap's tooltip, set up by `shell.js` on load and whenever a `Dialog` or `SidePanel` fills its body.

## Loading

Three forms: a spinner inside a `Button` while its action runs; a thin bar at the top of a `DataTable` or `Card` while its content reloads, with the old content kept and dimmed; a skeleton for the first load of a `Card` or a detail page. Never a full-page overlay for a partial update. It appears only after about 300 ms, so quick responses do not flicker, and the loading region carries `aria-busy="true"`. The kit's scripts set it while they fill content; the style guide can hold each form in place to show it. **Narrow:** the same.

## DetailView

The read-only view of one record: label and value pairs in the kit's grid, grouped into `Card`s by section. Values use the kit's formats (money, the project date format, `StatusBadge`); an empty value shows "—". A field the user may not see is left out, never blanked (in the kit through `data-can`; **Real app:** the server leaves it out of the response). **Narrow:** one column, each label above its value.

## SidebarMenu

- **Input:** the menu definition in `shell.js` (groups, then items with a Thai label, the page, an icon and the permission key that shows it) and the current user (see [access-data.md](access-data.md)).
- **Behaviour:** shows only the items whose key `kit.can` grants; a group with no visible item is hidden; the active item follows the current page and carries `aria-current="page"`. Pages never add menu items in their own markup. A new page adds its item, with its permission key, to the menu definition. **Real app:** the endpoint behind each item checks the same key; hiding a menu item is not security.
- **Icons:** every item has an icon, because the rail shows nothing else. An optional badge shows a pending count.
- **Groups and footer:** items sit in named groups (such as หลัก, ข้อมูลหลัก, ตั้งค่า); an optional footer line shows the app version and its status. The active item is marked by more than color (the house style adds a bar at the sidebar's edge).
- **States:** expanded, rail and drawer, as `AppShell` describes.

## PrototypeBanner

- A slim warning-colored bar at the top: "PROTOTYPE – ข้อมูลจำลอง ยังไม่บันทึกข้อมูลจริง".
- On the right, the user switcher: a select that lists every user in `../data/users.json` as "ชื่อ · ตำแหน่ง (role)", with the current user selected. Changing it remembers the chosen id (local storage, wrapped as responsive.md §3 says) and reloads the page, so the menu, rows, buttons and fields change to that user's roles. With one user only, the select shows that user and changes nothing.
- **Narrow:** the label shortens to "PROTOTYPE"; the switcher stays.
- Always shown in the kit, which is a prototype by nature. **Real app:** the banner, the fake users and the switcher exist only in a development or demo environment, never in production; the real sign-in replaces them.
