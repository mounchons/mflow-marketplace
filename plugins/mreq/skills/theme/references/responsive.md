# Responsive layout

A back-office app lives on a desktop most of the day. The rest of the time it is opened on a small laptop, a tablet at the warehouse, a phone in a meeting, or a desktop window split in half. A public-facing app is opened on phones as often as on desktops. The kit decides once how every page behaves at every width, so no screen carries its own layout rules. The shells and each component's narrow-width behaviour are contracts in [component-contracts.md](component-contracts.md) (`AppShell`, `SiteShell`, `SidebarMenu` and the "Narrow" lines). This file holds the decisions and the checks.

## 1. Target devices and acceptance sizes

Take them from `mreq/project/vision.md` `## Quality expected` when the approved `nfr` doc put them there. Otherwise ask in theme step 1's batch, per app with screens when the apps differ:

| Option | Means |
|---|---|
| a) | Desktop and laptop only (≥ 1280 px wide) |
| b) | Desktop and tablet (≥ 768 px) |
| c) | Every size, phones included (≥ 360 px) |

Ask also for the **acceptance sizes**: the window sizes the customer will test on, for example 1366×768 and 1920×1080, plus 768×1024 for b) or 390×844 for c). Record both in `mreq/ui/design-system.md` Decisions.

- The back-office shell gets all three sidebar states whatever the answer. They cost little, and a narrow window happens on a desktop too, through split screen or 200% zoom. The answer decides which sizes are verified and which sizes screens must look right at.
- If `mreq/project/vision.md`, an approved discussion doc or a customer document in `mreq/source/` states a device range that differs from the answer, raise it with the user; never resolve it silently. The user's answer settles it. An example is "desktop only" when one public page must work on a phone. A page-level exception goes in that page's row of the screen list when screens are listed.

## 2. Breakpoints

Two mechanisms, each with its own job:
- **Window width** (media queries) drives the shells: the sidebar state, the site navigation, main padding, and the top bar on phones.
- **Content width** (container queries on the main area) drives everything inside a page. The sidebar state changes the content width without changing the window, so a filter grid must follow its own box, not the window.

Default table, written into design-system.md Decisions:

| Window | Back office (`AppShell`) | Public-facing (`SiteShell`) | Content |
|---|---|---|---|
| ≥ 1280 px | sidebar expanded; ☰ switches to rail | full top navigation | filter grid 4 columns, dashboard 2 columns |
| 768–1279 px | icon rail with tooltips; ☰ switches to expanded | full top navigation while the items fit, else ☰ | filter grid 2–3 columns; cards stack when narrow |
| < 768 px | hidden; ☰ opens a drawer over the page | ☰ opens a drawer over the page | filters and forms 1 column; tables scroll sideways inside their own box |

- Choose the numbers so that each acceptance size lands in the state you intend. With 1280 as the cut, a 1366×768 laptop shows the expanded menu.
- Content steps (container widths of the main area): about 1100, 860 and 560 px. Filter grids step 4 → 3 → 2 → 1 columns, forms become one column at the last step, and side-by-side cards stack at the middle one.
- CSS custom properties cannot be used inside media queries. The numbers live as a decision in design-system.md and appear in CSS only in `app.css`. Screens contain no media or container queries.

## 3. Remembered choices

The ☰ choice (expanded or rail) and each FilterPanel's open or closed state are remembered per user, so a page reload keeps them.
- In the kit (static pages), `shell.js` keeps them in local storage. Every read and write is wrapped in `try`/`catch`, so a blocked storage call (a private window, a locked-down browser) leaves the default state and never breaks the page.
- The real app may keep them in a cookie instead, so the server renders the right state and the page does not flash; the kit only shows the behaviour.

A drawer's open state is never remembered.

## 4. Accessibility baseline

- A skip link to the main area is the first focusable element.
- The focus ring comes from a token and is visible on every interactive element.
- The active menu item carries `aria-current="page"`.
- In the rail, labels are visually hidden but still read by screen readers, and each icon has a tooltip.
- ☰ has an `aria-label`, `aria-controls` and a correct `aria-expanded`.
- The drawer moves focus in when it opens and back to ☰ when it closes. A closed drawer is out of the tab order.
- Motion respects `prefers-reduced-motion`.
- On touch sizes (b and c), tap targets are at least `--app-touch-target` high.

## 5. Verify at the acceptance sizes

No acceptance sizes in `mreq/ui/design-system.md` yet: ask for them as §1 describes, write the Devices and acceptance-size lines, then check.

How to check: serve the kit (`/mreq:theme open`). When the session has a browser tool (such as Claude in Chrome), open each page, resize the window to each acceptance size, and look at the screenshots. Without one, report each size check as `(unverified)` in the report and in `mreq/project/STATUS.md`. A size check is never claimed without having been looked at.

The style guide and the sample pages, and every screen built or changed later, pass these checks at each acceptance size in `mreq/ui/design-system.md`. With more than two sizes, check at least the largest and the smallest.
- The page never scrolls sideways. A table may scroll inside its own box.
- The sidebar is in the state the breakpoint table names for that width, and the site navigation likewise. ☰ switches it as described; below the drawer breakpoint, ☰ opens the drawer, and Esc closes it with focus back on ☰.
- Nothing overlaps, is cut off or wraps into a broken line: top bar, site navigation, page header actions, filter chips, dialog, toast.
- Text is readable without zoom.

Screenshots are looked at, not stored in the project, unless the user asks for them.
