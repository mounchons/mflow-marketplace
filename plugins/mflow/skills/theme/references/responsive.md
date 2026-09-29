# Responsive back-office layout

A back-office app lives on a desktop most of the day. The rest of the time it is opened on a small laptop, a tablet at the warehouse, a phone in a meeting, or a desktop window split in half. The kit decides once how every page behaves at every width, so no screen carries its own layout rules. The shell and each component's narrow-width behaviour are contracts in [component-contracts.md](component-contracts.md) (`AppShell`, `SidebarMenu` and the "Narrow" lines). This file holds the decisions and the checks.

## 1. Target devices and acceptance sizes

Ask in theme step 1's batch, unless AGENTS.md, `docs/vision.md` or an active source already states it:

| Option | Means |
|---|---|
| a) | Desktop and laptop only (≥ 1280 px wide) |
| b) | Desktop and tablet (≥ 768 px) |
| c) | Every size, phones included (≥ 360 px) |

Ask also for the **acceptance sizes**: the window sizes the customer will test on, for example 1366×768 and 1920×1080, plus 768×1024 for b) or 390×844 for c). Record both in `docs/ui/design-system.md` Decisions.

- The shell gets all three sidebar states whatever the answer. They cost little, and a narrow window happens on a desktop too, through split screen or 200% zoom. The answer decides which sizes are verified and which sizes screens must look right at.
- If AGENTS.md, `docs/vision.md` or an active source states a device range that differs from the answer, raise it with the user; never resolve it silently. The user's answer settles it. An example is "desktop only" when one public page must work on a phone. A page-level exception goes in that page's row of `docs/ui/screens.md`.

## 2. Breakpoints

Two mechanisms, each with its own job:
- **Window width** (media queries) drives the shell: the sidebar state, main padding, and the top bar on phones.
- **Content width** (container queries on the main area) drives everything inside a page. The sidebar state changes the content width without changing the window, so a filter grid must follow its own box, not the window.

Default table, written into design-system.md Decisions:

| Window | Sidebar | Content |
|---|---|---|
| ≥ 1280 px | expanded; ☰ switches to rail | filter grid 4 columns, dashboard 2 columns |
| 768–1279 px | icon rail with tooltips; ☰ switches to expanded | filter grid 2–3 columns; cards stack when narrow |
| < 768 px | hidden; ☰ opens a drawer over the page | filters and forms 1 column; tables scroll sideways inside their own box |

- Choose the numbers so that each acceptance size lands in the state you intend. With 1280 as the cut, a 1366×768 laptop shows the expanded menu.
- Content steps (container widths of the main area): about 1100, 860 and 560 px. Filter grids step 4 → 3 → 2 → 1 columns, forms become one column at the last step, and side-by-side cards stack at the middle one.
- CSS custom properties cannot be used inside media queries. The numbers live as a decision in design-system.md and appear in CSS only in the kit's stylesheet. Screens contain no media or container queries.

## 3. Remembered choices

The ☰ choice (expanded or rail) and each FilterPanel's open or closed state are remembered per user, so a page reload keeps them.
- In `mvc-htmx`, use a cookie, so the server renders the right state and the page does not flash.
- In a client-rendered profile, local storage is fine; wrap it so that a blocked storage call does not break the page.

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

No acceptance sizes in `docs/ui/design-system.md` yet (a kit built before mflow 0.11): ask for them as §1 describes, write the Devices and acceptance-size lines, then check.

How to check: when the E2E framework is set up, open the page at each size through its viewport setting and look at the screenshots. Without one, report each size check as `(unverified)` in the report and STATUS.md, the way `/mflow:init` marks commands it could not run. A size check is never claimed without having been looked at.

The style guide, and every screen built or changed, pass these checks at each acceptance size in `docs/ui/design-system.md`. With more than two sizes, check at least the largest and the smallest.
- The page never scrolls sideways. A table may scroll inside its own box.
- The sidebar is in the state the breakpoint table names for that width. ☰ switches it as described; below the drawer breakpoint, ☰ opens the drawer, and Esc closes it with focus back on ☰.
- Nothing overlaps, is cut off or wraps into a broken line: top bar, page header actions, filter chips, dialog, toast.
- Text is readable without zoom.

Screenshots, when the E2E framework is set up: every role in the screen's `Role(s)` at the largest acceptance size, as `docs/ui/screens/<screen>.<role>.png`. Add one role at the smallest size, as `docs/ui/screens/<screen>.<role>.<width>.png`. That is enough; do not multiply roles by sizes.
