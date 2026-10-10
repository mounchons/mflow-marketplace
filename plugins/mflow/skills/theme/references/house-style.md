# House style

mflow's default look for a back-office kit: a dark navy sidebar, a white top bar, sky-blue as the brand color, Inter with Noto Sans Thai, and Font Awesome icons. It comes from a back-office UI kit the user chose on 2026-10-10 (a UI kit page and its sample list, master-data and dashboard pages). Every value below was read from that kit, except those marked `[อนุมาน]`, which were inferred from its screenshots and may be replaced by the kit's own tokens file when it is available.

[assets/tokens.css](../assets/tokens.css) holds these values. [visual-direction.md](visual-direction.md) says how a project starts from them: a customer's CI replaces the brand family and keeps the rest, and the `frontend-design` skill adapts and critiques rather than inventing a new look, unless the user asks for one. The contracts in [component-contracts.md](component-contracts.md) say what each part does; this file says how it looks, and its rules land in the kit's stylesheet.

## Palette

| Role | Token | Value | Notes |
|---|---|---|---|
| Primary (fill) | `--app-primary` | `#0ea5e9` | buttons, active states, focus ring, icons, active nav bar |
| Primary dark | `--app-primary-hover` | `#0284c7` | hover |
| Primary text | `--app-primary-text` | `#0369a1` | links and codes on light surfaces, 5.93:1 |
| Primary 50 | `--app-primary-subtle` | `#f0f9ff` | active filter chip, selected row |
| Secondary | `--app-secondary` | `#6366f1` | indigo; secondary badges and accents |
| Sidebar | `--app-sidebar-bg` | `#0f172a` | navy |
| Success · Warning · Error · Info | `--app-success` … `--app-info` | `#22c55e` · `#f59e0b` · `#ef4444` · `#3b82f6` | fills, dots, icons |
| Their text steps | `--app-<tone>-text` | `#15803d` · `#b45309` · `#b91c1c` · `#1d4ed8` | text on white and on the tint `[อนุมาน]` |
| Their tints | `--app-<tone>-subtle` | `#f0fdf4` · `#fffbeb` · `#fef2f2` · `#eff6ff` | badge and alert backgrounds `[อนุมาน]` |
| N-50 surface | `--app-surface-muted` | `#fafafa` | table header, hover |
| N-100 app background | `--app-bg` | `#f5f5f5` | behind cards |
| N-200 border | `--app-border` | `#e5e5e5` | |
| Control border | `--app-control-border` | `#cbd5e1` | outline buttons and button groups, 1.5px |
| N-400 hint | `--app-text-hint` | `#a3a3a3` | placeholders and decoration only (2.52:1) |
| N-500 subtext | `--app-text-muted` | `#737373` | |
| N-700 body | `--app-text` | `#404040` | |
| N-900 heading | `--app-heading` | `#171717` | |

Statuses of a long pipeline each take a hue of their own in the `StatusBadge` dictionary; the kit's job pipeline used blue, violet, indigo, cyan, amber, yellow, green, emerald and red. Two statuses never share a hue, and the dot plus the label carry the meaning, never the color alone.

## Contrast

Each color has two jobs. The fill step (the kit's own hue) colors fills, dots, icons, focus rings, tints and the sidebar's active state. The text step colors text on light surfaces. So a code link in a table is `--app-primary-text`, never `--app-primary`, which would read at 2.77:1.

Solid buttons with white text are the one place the house style sits below WCAG AA: white on primary is 2.77:1, on success 2.28:1, on warning 2.15:1, on danger 3.76:1, on info 3.68:1. The kit's look uses them as they are, and the shipped tokens keep them. design-system.md Decisions records the choice:
- a) the kit's fills exactly, below AA for button text (the shipped default);
- b) solid buttons filled with the text step (`#0369a1`, `#15803d`, `#b45309`, `#b91c1c`, `#1d4ed8`), which pass, darker than the kit.

`--app-text-muted` is 4.74:1 on white and 4.35:1 on `--app-bg`; under b) it becomes `#6b6b6b` (4.89:1 on `--app-bg`).

## Type

- **Families:** `Inter` for Latin and digits, `Noto Sans Thai` for Thai, in one stack (`--app-font`); `JetBrains Mono` for codes, plate numbers and amounts in tables (`--app-font-mono`). Google Fonts: Inter 400, 500, 600, 700; Noto Sans Thai 400, 500, 600, 700; JetBrains Mono 400, 500, 700. All three are under the SIL Open Font License 1.1; record them in the Libraries table of `## Stack`.
- **Scale:** display 28 / 700 / -0.02em; page title 22 / 700; section 18 / 600; card title 14 / 600; body 14 / 400; small 12 / 500 in `--app-text-muted` (`--app-fs-*`). Headings in `--app-heading`, body in `--app-text`.
- **Numbers:** amounts and counts in tables and KPI cards use the mono face or tabular figures, right-aligned, so digits line up.
- **Labels:** sidebar group headings and table headers are small, uppercase and tracked (Thai has no case, so only Latin text changes). Content headings are never uppercase.

## Icons

Font Awesome 6 Free, solid style, one library for the menu, buttons, table actions and icon columns. 14px in body text, 16px in buttons, 18px in KPI and icon cards. An icon the free set lacks is an inline SVG drawn to match. Licence: icons CC BY 4.0, fonts SIL OFL 1.1, code MIT; record it in the Libraries table of `## Stack`. Load it from cdnjs, or self-host `@fortawesome/fontawesome-free`.

Common icons: house, gauge (dashboard), truck, file-invoice, receipt, users, user, magnifying-glass, filter, bell, gear, pen, trash, plus, check, xmark, eye, download, print, calendar, clock, circle-check, circle-exclamation, triangle-exclamation, arrow-right, chevron-down, ellipsis.

## Shape and depth

- Radius: 4px small controls, 8px buttons and inputs, 12px cards, dialogs and side panels, full for chips, badges and avatars.
- Spacing on a 4-point scale (4, 8, 12, 16, 24, 32, 48).
- Cards in the page flow: white, 1px `--app-border`, `--app-shadow-sm` `[อนุมาน]`. Only what floats (dropdowns, dialogs, side panels, the drawer) gets `--app-shadow-float` `[อนุมาน]`.
- Motion: drawers and panels slide in over 250ms; the backdrop is navy at 50%.

## Navigation

**Sidebar** (expanded, 240px): full height in `--app-sidebar-bg`.
- Brand block on top: a 28px rounded square logo (gradient from primary to secondary when the customer has no logo `[อนุมาน]`) and the product name in white, 600; a hairline in `--app-sidebar-border` under it.
- Groups (MAIN, MASTER DATA, SETTING): heading 11px, uppercase, tracked, `--app-sidebar-muted`.
- Items: icon 16px and label 14px in `--app-sidebar-text`, about 40px tall `[อนุมาน]`, radius 8px, inset 8px from the edges; hover `--app-sidebar-hover-bg`.
- Active item: `--app-sidebar-active-bg`, a 3px bar in `--app-sidebar-accent` at the sidebar's left edge, label in `--app-sidebar-active-text`, icon in the accent.
- Count badge on the right: a small pill, muted on dark; on the active item it takes the primary tint.
- Footer: the app version and a status dot ("v1.0.0 · Online").
- **Rail** (mflow's medium state, not in the kit): the same colors and active bar, icons only, labels in tooltips.

**Top bar** (60px, white, 1px `--app-border` underneath):
- Left: ☰, then the breadcrumb (house icon for the first crumb, chevrons between crumbs, the current page in 600). In the house style the breadcrumb lives here, so `PageHeader` shows no breadcrumb of its own.
- Right, in order: the global search (a field in `--app-bg`, radius 8px, placeholder "ค้นหาทั้งระบบ…", a shortcut hint `Ctrl K`, shown as `⌘K` on a Mac), the bell with a red dot for unread items, the scope chip (an initials square and the current branch or tenant), and the user (initials on a gradient circle, name over role in small muted text).

**Page header** (on `--app-bg`, under the top bar): page title, a muted subtitle with counts and freshness ("รวม 1,247 ราย · อัปเดตล่าสุด 2 นาทีที่แล้ว"), actions on the right: icon buttons (refresh), outline buttons (import, an export dropdown), then the one primary button with its icon. A KPI strip may follow: cards with a small label, a 28px value (mono for money), a change line in the success or danger text step with an arrow, and a tinted icon square in the corner.

**Narrow** (below the drawer breakpoint):
- Top bar 56px `[อนุมาน]`: ☰, the page title instead of the breadcrumb, search and bell as icons.
- Drawer: the same navy sidebar slides in from the left over the backdrop.
- Phone sizes, when the devices include phones: an optional bottom tab bar of 4 or 5 shortcuts (icon over an 11px label; active in primary), as `AppShell` describes.
- The kit switched to the drawer at 980px and had no rail; mflow keeps its three states and takes the breakpoints from the project's decision.

## Components

- **Buttons:** solid with the icon on the left, 600 weight, radius 8px. Outline and ghost buttons have a 1.5px `--app-control-border` frame, text in the tone's text step, and a tinted hover. Sizes small, default and large. Icon-only buttons are square. A button group shares one frame.
- **Inputs:** at least 36px tall (`--app-control-height`), 1px `--app-border`, radius 8px, focus border in primary with the focus ring. Checkboxes and radios 1.25em; switches 2.6em by 1.4em.
- **Table:** header row in `--app-surface-muted`, 12px uppercase tracked, `--app-text-muted`; rows 14px, hover in `--app-surface-muted`. Record codes are links in the mono face and `--app-primary-text`; amounts in mono, right-aligned; a person or company shows an initials avatar beside the name. Row actions are icon buttons (eye, pen, ellipsis).
- **Status chip** (`StatusBadge`): a pill with the tone's tint, a dot in the fill step and the label in the text step.
- **Tabs:** underlined; the active tab in `--app-primary-text` with a primary underline; a count pill beside each label.
- **Filter chips:** an active chip has `--app-primary-subtle` behind it, a primary border and a × to remove it.
- **Pager:** the current page filled in primary; the other pages in the text step.
- **Dialog and SidePanel:** radius 12px, `--app-shadow-float`, the navy backdrop.
