---
name: theme
description: Build the project's UI kit as a static preview in mreq/ui/theme/ — the house style adapted to the customer, tokens, one shell per kind of app, shared components, sample users and roles, a style guide and sample pages — then change, approve or open it.
disable-model-invocation: true
argument-hint: "[brand notes | @logo | @CI-guide] | update <what to change> | approve | open"
---

A theme is the shared kit every screen is built from, the way a housing project picks one set of doors, tiles and switches for every house. Screens stay consistent because they can only be assembled from the kit: colors come from tokens, inputs and tables come from components, and nothing is styled on a page.

The kit is a show house built before the estate's roads: plain HTML, CSS and JavaScript in `mreq/ui/theme/`, opened in a browser with no app behind it. The user walks through it, approves the look once for the customer, and can still change it at any time; the builder of the real app later takes `tokens.css` and `app.css` as they are and rebuilds each component to its contract. Its status and revision live in `mreq/ui/theme/README.md`, and only `theme-status.mjs` writes them.

Script commands, run from the project root:
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/theme-status.mjs" status`: whether the kit exists, its status (`draft` or `approved`) and revision, the required files still `missing`, and `problems` in the README.
- `… theme-status.mjs init`: creates the README from [assets/theme-readme.md](assets/theme-readme.md) (`Status: draft`, `Revision: 1`); never overwrites.
- `… theme-status.mjs approve`: sets `Status: approved <today>` and logs it.
- `… theme-status.mjs bump --note "<what changed, and why>"`: adds one to the revision and logs the note; the status stays as it is.
- `… theme-status.mjs contracts`: copies [component-contracts.md](references/component-contracts.md), [responsive.md](references/responsive.md) and [access-data.md](references/access-data.md) into `mreq/ui/contracts/`, so the requirement set carries the contracts for a builder who does not have this plugin; reports the files it `changed`.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs" [--port <n>]`: serves `mreq/ui/` on 127.0.0.1 and prints `{url, port, root}` as its first line.

Run `status` first in every mode. With no `.mreq/config.json` above the folder it fails: suggest `/mreq:init` and stop.

## Which mode

- `open`: see "Mode: open".
- `approve`: see "Mode: approve".
- `update <what>`, or brand notes and files when the kit already exists: see "Mode: update".
- Nothing, or brand notes and files (`@logo`, `@CI-guide`), while no kit exists: build it, steps 1 to 6. With no arguments and a kit that exists, show its status, revision and the command to open it, and stop.

## Before building

- **The foundation topics.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" list`. If `tech-stack` or `code-structure` is not approved (or `nfr`, when the devices and languages are not known yet), say so once: the kit is built on their answers, so the recommended order is to settle them first. It is advice; the user decides whether to go on.
- **What the approved docs settle,** so step 1 does not ask it again:
  - AGENTS.md `## Stack`, Apps table: every app with screens and its kind. A `Web` app for staff (`Backend`) gets the `AppShell`; a `Web` app for customers or the public (`Frontend`, `Portal`, `Partner`…) gets the `SiteShell`; an `Api` or `Worker` gets none; a `Mobile` app gets no shell of its own in a static kit, which the report and design-system.md Decisions say. With no tech-stack doc, build the `AppShell` alone and say the site shell follows when a public-facing app is agreed. App names and kinds follow `${CLAUDE_PLUGIN_ROOT}/skills/init/references/project-name.md`. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.
  - `mreq/project/vision.md`: `## Quality expected` for devices, acceptance sizes and languages; `## Users and roles` for the roles the access data starts from.
  - The customer's CI guide, logo or mockup in `mreq/source/`, or files named in `$ARGUMENTS`.

## 1. Brand input

Collect in one batch only what is still open: logo, primary color or the customer's CI guide, the look in the user's own words (default: the house style, a modern back office), the feel of each app (dense back office or spacious), the Thai font preference, the target devices with their acceptance sizes ([references/responsive.md](references/responsive.md) §1), and the date format (`DatePicker` in [references/component-contracts.md](references/component-contracts.md)): a pattern, a) `DD/MM/YYYY` (recommended), b) `DD-MM-YYYY`, c) `DD.MM.YYYY` or d) `YYYY-MM-DD`, and the year, ค.ศ. (recommended) or พ.ศ. A letter and a year is a full answer. The user's answers are the customer's; nothing is parked for the customer to confirm.

Then decide the visual direction as [references/visual-direction.md](references/visual-direction.md) describes, starting from the house style ([references/house-style.md](references/house-style.md)) and adapting it through the `frontend-design` skill when the session lists it: the customer's CI goes into the brand family, and the hues, sidebar, type, icons and shape stay unless the user asks for a new look. The house style is bright and colorful on purpose (the user's choice): keep the hues as they are. If the customer has no CI, propose three directions rendered on the style guide and let the user choose. A customer mockup is the starting point when one exists: take its colors, type and density, and list every place the kit departs from it.

Done when: the look (the direction, with its primary color and font), density, the shells, target devices, acceptance sizes and the date format are decided, or the direction is explicitly delegated to the three-direction choice.

## 2. Tokens

Create `mreq/ui/theme/tokens.css` from [assets/tokens.css](assets/tokens.css), with the values of the visual direction: brand colors, semantic colors (success, warning, danger, info), the hues, surfaces, text, sidebar, radius and shadow scale, motion, spacing, font stacks, layout (sidebar and rail width, top bar and banner height, main padding, content max width, the site column, touch target), and the Bootstrap 5.3 bridge, so Bootstrap's own classes follow the brand. Light values only; a dark block only if asked.

Done when: every color, radius and font used anywhere in the kit resolves to a token.

## 3. Shells and the access data

- Run `theme-status.mjs init`.
- Every page shares one skeleton: `<html lang="th">`, the viewport meta, then Bootstrap 5.3 CSS from a CDN, Google Fonts (Inter, Noto Sans Thai, JetBrains Mono) and Font Awesome 6 Free from cdnjs, each pinned to an exact version, then `tokens.css`, then `app.css`; at the end Bootstrap's JS bundle, `shell.js`, `datatable.js`, `datepicker.js`. No build step and no npm.
- Build each shell the apps need to its contract in [references/component-contracts.md](references/component-contracts.md): the `AppShell` (sidebar with its expanded, rail and drawer states, the top bar, the optional bottom tab bar when phones are among the devices) and the `SiteShell` (top navigation, page body, footer), both under the `PrototypeBanner` with the user switcher. Write the breakpoints from responsive.md §2 into design-system.md Decisions, adjusted so that each acceptance size lands in the intended state.
- Write `mreq/ui/data/users.json`, `roles.json` and `README.md` as [references/access-data.md](references/access-data.md) describes. `shell.js` reads them directly; nothing is copied into it. Without an approved access-control doc, the grants are proposals from the vision's roles, tagged `[เสนอ]`, and the report lists them for the user to check.

Done when: the style guide renders the `SidebarMenu` sample twice, each with an explicit permission-set stub, and the two show different items. When `users.json` holds more than one user, switching in the banner changes the menu, the buttons and who the top bar shows. At each acceptance size each shell is in the state the breakpoint table names, and ☰ and the drawer behave as the contracts describe.

## 4. Components

Build every component in [references/component-contracts.md](references/component-contracts.md) in `app.css` and the kit script it belongs to (`shell.js`, `datatable.js`, `datepicker.js`). Follow each contract exactly; the contracts are what make screens predictable for people and agents, and what the builder rebuilds. Put the date format in the one config of `datepicker.js`.

Done when: each contract has an implementation, and the style guide shows it: the `DataTable` pager at pages 1, 5 and 20 of 20, one table without header search, an icon column with each state, a `person` column with five different avatars, every status of a sample `StatusBadge` dictionary in its hue, a KPI strip, a `QuickView` open in a `Dialog` and one in a `SidePanel` (with its error state), the `DatePicker` in every state with its three calendar views, and the parser table with every row ✓.

## 5. Style guide and sample pages

`mreq/ui/theme/index.html`: every token swatch (the hues as a row of fill, text and tint), the type scale, every component in every state (default, hover/focus, disabled, error, loading, empty), the `SidebarMenu` sample twice for two stub permission sets, and the DatePicker parser table run live with ✓ or ✗ per row. Sample pages built only from the kit: `list.html` (a `FilterPanel` with a date range above a `DataTable` with the pager and an icon column, whose icons open a section in a `Dialog` while the eye action opens the record in a `SidePanel`), `form.html` (with a `DatePicker` and a `DateRangeField`), `dashboard.html` if the product has a home dashboard, and `site.html` in the `SiteShell` when a public-facing app exists. All text the user reads is Thai. Two sections open the style guide:
- **การตัดสินใจของ theme:** each decision (look and its bold place, palette and hues, font, density, shells, devices and acceptance sizes, breakpoints, date format and year, departures from the mockup) with its source tag, as in discussion docs: `[ที่มา: …]`, `[ยืนยัน]`, `[เสนอ]`.
- **โครงหน้าและเมนู:** the page itself is the shell. Buttons force expanded, rail, auto-by-width and open-drawer, and a table gives window width → menu state → content layout, from design-system.md. A line next to them says "ลองย่อหรือขยายหน้าต่างดู".

This page is what the user approves once, for the customer, instead of approving colors screen by screen.

## 6. Rules for agents

- Write `mreq/ui/design-system.md` from [assets/design-system.md](assets/design-system.md), with every Decisions line filled.
- Run `theme-status.mjs contracts`, so `mreq/ui/contracts/` holds the contracts the kit was built to.
- Write `.claude/rules/ui.md` from [assets/ui-rule.md](assets/ui-rule.md). It loads only when Claude opens a file under `mreq/ui/`.
- Make sure AGENTS.md `## Conventions` has the UI line (`UI: build screens only from the components in mreq/ui/design-system.md; colors and spacing only from the kit's tokens.css.`); add it if it is missing.

## Verify and hand over

1. Serve the kit (as in "Mode: open") and check the style guide and the sample pages at the acceptance sizes as responsive.md §5 describes, with a browser tool when the session has one; otherwise report each size `(unverified)`. Never claim a check that was not looked at. Then do the critique in visual-direction.md.
2. Run `theme-status.mjs status`: `missing` and `problems` are empty.
3. Update `mreq/project/STATUS.md`: `## Now` and one log entry with the theme decisions (look, palette, font, density, shells, devices, breakpoints, date format) and any `(unverified)` check.

Done when: every step's condition holds, the kit README says `draft`, and the user has the URL of the style guide, the access grants to check (when they are proposals), and one next command: `/mreq:theme approve` once the kit looks right, or `/mreq:theme update <what>` to change it.

## Mode: update

The user's instruction is the go-ahead for what it names; the kit may change in any status.
1. **Compare first.** Read the request and the kit as it is (tokens, `app.css`, the scripts, the sample pages, the data files, design-system.md). List only what will change: each file and what changes in it, in a short table. A request the kit already meets gets that answer and nothing more.
2. **Change.** Carry on without asking again. Ask once, for that change alone, only when it reaches past the request: renaming a token or a component, or renaming or removing a permission key or a role code that pages use. A new kind of app in the tech-stack doc means a new shell; a new look means step 1's direction again; a new component means its contract in design-system.md first, then the code, then the style guide.
3. **Follow through.** Keep design-system.md Decisions, the style guide's decision section and `.claude/rules/ui.md` in line with the change, and run `theme-status.mjs contracts`; when it reports a contract `changed` (the plugin was upgraded since the kit was built), bring the kit up to it in this update and list that in the comparison. Verify as in "Verify and hand over" at the sizes the change touches.
4. **Record.** Run `theme-status.mjs bump --note "<what changed, and why in the user's words>"`. An approved kit stays approved: the user's instruction is the customer's approval of the change. Add a log entry to `mreq/project/STATUS.md`.

Done when: the change is in the kit and the style guide, the revision went up with its note, and the user has the URL to look at it.

## Mode: approve

Run `status`. If files are `missing` or the README has `problems`, list them and stop. Otherwise run `theme-status.mjs approve`, change the look's source tag in design-system.md Decisions and on the style guide from `[เสนอ]` to `[ยืนยัน]`, and log the approval in `mreq/project/STATUS.md`. Tell the user the kit can still change at any time through `/mreq:theme update <what>`, and give one next command: the next not-started topic on `mreq/discuss/AGENDA.md` (`/mreq:discuss <slug>`), with one line on why it is next.

## Mode: open

Start `node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs"` as a background command from the project root and read its first line. If the port is in use, start it again with `--port 0` for any free port. Give the user `<url>theme/` (the style guide), say the server runs until the session ends or the background task is stopped, and that without Claude Code the README in `mreq/ui/theme/` has a command that serves the same folder. A kit that does not exist yet has nothing to open: suggest `/mreq:theme`.
