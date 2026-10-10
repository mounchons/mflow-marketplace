# Visual direction

How theme decides what the kit looks like. The starting point is mflow's house style ([house-style.md](house-style.md)): a modern back-office look with a navy sidebar, a white top bar, sky blue, a bright palette of hues for statuses, avatars and icons, Inter with Noto Sans Thai, and Font Awesome icons. A project adapts it to its customer: a CI replaces the brand family (primary and secondary, with their hover, text and tint steps) and keeps the hues, sidebar, type, icons, shape and layout. A wholly new direction is made only when the user asks for one; then the rest of this file is the method. The contracts in [component-contracts.md](component-contracts.md) say what each component does; the direction says how all of them look. It is decided once, in step 1, and lands only in the tokens and the kit's stylesheet, so every screen follows it without carrying a style of its own.

## The frontend-design skill

- **When the session lists it:** if the available skills include `frontend-design` (under any plugin prefix, such as `frontend-design:frontend-design`), invoke it with the Skill tool in step 1, before any token is written, and hand it the brief below. The house style is the brief's look, so the skill adapts it (fitting the customer's CI into the brand steps, choosing the icon sets, checking the plan against the brief) and critiques the result; it invents a new look only when the user asked for one. Follow its process inside the limits of this file: plan, check the plan against the brief, build, then critique with screenshots. Where it and this file disagree, this file and the contracts win, because they hold the customer's decisions.
- **When it is not there** (not installed, or another tool such as Codex): follow the same process from this file alone. Nothing below depends on the skill.
- mflow never installs it. The README names it as a recommended companion: `/plugin install frontend-design@claude-plugins-official`.
- **Questions stay decisions.** The skill may want to confirm the subject or the audience with the client. The user's step-1 answers are that confirmation: the user speaks for the customer. Anything still open goes to the user as a lettered choice in the same batch as step 1, never as a question parked for the customer.

## The brief

Write it from what step 1 collected, so the skill has nothing left to ask:

```
Subject: <system name>: <one line from docs/vision.md>, for <customer and industry>.
Audience: back-office staff (<roles from the access-control doc or docs/ui/screens.md>), all day, on <devices>.
Primary job: find records fast, read a record's details without leaving the list (quick views), act on it.
Look: mflow's house style (house-style.md: palette, hues, type, icons, sidebar, top bar), adapted to this customer; in the user's words: "<their words>".
      Bright and colorful, as the kit is: statuses, avatars, KPI icon tiles and category icons each take a hue
      (house-style.md, "Where color lives"); surfaces stay neutral. Don't tone the hues down.
      Consistency and density over novelty. A new look only if the user asked for one.
Brand: <primary color or CI guide, logo>. Mockup: <path in docs/source/, or none>.
Thai: every stack that sets Thai text has a Thai face in it (Inter, then Noto Sans Thai); line height at least 1.5.
Fixed: <CSS base: Bootstrap 5.3 in mvc-htmx>, the token names in tokens.css, every component contract and its states,
       the AppShell frame (sidebar, top bar, main area), AA contrast for text (fill and text steps), one icon library.
Deliver: palette (4 to 6 named hex values) mapped to the token names, the hue for each status and KPI, type roles and scale, density, the radius and
         shadow scale, the one bold place, and wireframes of the shell, a list page with an icons column and a quick
         view open, and a form page.
```

## What the direction decides

| Decision | Lands in | Rule |
|---|---|---|
| Palette | `--app-primary` and its hover, active, text, subtle and emphasis steps; the same steps for success, warning, danger and info; `--app-bg`, `--app-surface`, `--app-surface-muted`, `--app-border`, `--app-heading`, `--app-text`, `--app-text-muted` | Each color has a fill step and a text step. The fill (the brand's own hue, however light) colors fills, dots, icons, focus rings, tints and active states; the text step colors text on light surfaces and reaches 4.5:1 there, so a light brand never makes links or codes hard to read. Body text on every surface reaches 4.5:1. White text on a solid fill is a recorded decision when it falls below 4.5:1 (house-style.md, "Contrast"). The semantic colors stay recognisable (green success, amber warning, red danger, blue or teal info) and are tuned to sit with the palette, not replaced by it. The hues (`--app-hue-*`) stay as the house style has them under any CI; when the CI's color is close to one of them, statuses skip that hue so a status never looks like an action. |
| Type | `--app-font`, `--app-font-heading`, `--app-font-mono`, `--app-font-size`, `--app-line-height`, `--app-fs-*` | The house style's stack: Inter for Latin and digits, then Noto Sans Thai for Thai, and JetBrains Mono for codes and amounts. Another choice is either one family that covers Thai and Latin (IBM Plex Sans Thai, Noto Sans Thai, Sarabun, Anuphan, Bai Jamjuree, Prompt, Kanit, Chakra Petch) or a Latin face followed by a Thai face designed to sit with it (Inter with Noto Sans Thai, IBM Plex Sans with IBM Plex Sans Thai), so every Thai character comes from a Thai face. A Latin-only face alone only where no Thai appears, such as a wordmark. Clear steps for page title, section title, body and small text. Numbers in tables and KPI cards use tabular figures. |
| Density | `--app-font-size`, `--app-table-row-height`, the spacing scale, `--app-main-pad-x` and `-y` | From step 1's density answer. Dense back-office is the default. |
| Shape | `--app-radius-sm`, `--app-radius`, `--app-radius-lg`, `--app-radius-pill`, `--app-shadow-float` | The radius grows with the surface (controls, then cards and panels; pills for badges and chips) instead of one radius on everything. Shadows only on what floats over the page (dropdowns, dialogs, side panels); cards in the page flow get a border. |
| The bold place and color | the sidebar tokens (`--app-sidebar-*`) for the brand; the hue tokens (`--app-hue-*`) for meaning | One place carries the brand strongly: the navy sidebar with its active item. In the content area the brand color marks actions and state: the one primary action, the active item, links, selected rows and focus. Everything that carries meaning is in color, from the hues: status chips, initials avatars, KPI icon tiles, category icons and counter badges (house-style.md, "Where color lives"). Surfaces stay neutral (white cards on the app background), so the color reads as information, not decoration. |
| Icons | the kit's icon library (Font Awesome 6 Free, solid, in the house style) | One library and one weight for the menu, buttons and the `icons` column; its licence goes in the Libraries table of `## Stack` (Font Awesome Free: icons CC BY 4.0, fonts SIL OFL 1.1, code MIT). Each icon set (`DataTable` icon column) picks icons a newcomer would recognise for that subject. |
| Motion | `--app-motion` | Only in answer to an action: a dialog or side panel opening, a drawer sliding. Nothing animates on page load, and the kit's stylesheet drops motion under `prefers-reduced-motion`. |

Nothing of the direction goes into screens. A value the tokens lack becomes a new `--app-*` token in the tokens file, used by the kit's stylesheet.

## Avoiding the stock look

Each of these makes a kit look generated, or like every other admin template (adapted from the frontend-design skill's list of generated-design tells). Use one only when it is chosen for this customer, and say so in the theme decisions:
- Bootstrap left as it ships: the default blue, and the same radius and shadow on every card.
- Every block of the page in an identical rounded card with the same soft shadow, and gradients as decoration (the house style's only gradients are identity marks: the brand tile and the initials avatars).
- A grey page with one accent color when the subject has statuses, people and categories: color what carries meaning with the hues, as the house style does.
- A warm cream background with a terracotta accent, or near-black with one neon accent.
- Tracked capital labels above content headings; numbered markers on content that is not a sequence. (Small tracked labels for sidebar groups and table headers, as in the house style, are navigation, not decoration.)
- Entrance animations on every section, hover effects on every card.

Check the plan against this list before building, and change what reads as a default. Write what was chosen instead in design-system.md Decisions (`Look:`).

## Three directions when there is no CI

Instead of three bare palettes, propose three directions: a) the house style as it is (recommended), and b) and c) two adaptations of it, each changing the brand family, and at most one more thing (the sidebar color, or the type), for this subject. All three keep the hues and use them the same way. Each has a short name, its palette, its type, its bold place, and one sentence on why it suits this subject and audience. Render all three on the style guide, then let the user pick one by letter. The others are not kept.

## Critique

With tokens and components built, take screenshots of the style guide and of the sample list page with a quick view open, at the acceptance sizes in `docs/ui/design-system.md` (as §5 of [responsive.md](responsive.md) describes), and check:
- the hierarchy reads at a glance: page title, then section, then body;
- in each area one solid primary button is the only strong action color, and the rest of the color comes from the hues: every status, avatar, KPI tile and category icon shows its hue, two statuses never share one, and the colors stay as bright as the kit's;
- numbers in tables line up, and Thai vowels and tone marks are never clipped, in table rows or in buttons;
- the `icons` column reads without color (filled, outlined, struck through), a status reads by its label, and focus is visible everywhere;
- every text and icon meets the contrast in the table above.

Fix what fails, then remove one decoration that does not earn its place. Record the direction in design-system.md Decisions: its name, the bold place, and its source tag (`[เสนอ]` until the user approves the style guide, `[ยืนยัน]` after).

## Screens

`/mflow:screen` adds no look of its own. When the skill is listed, a screen may use it only for composition and wording: which facts the table shows and which wait in a quick view, the order of columns, the icon set's labels, and plain Thai labels, buttons and empty-state text. Anything visual the kit cannot express is a kit change through `/mflow:theme update look` or `update <component>`, never a style on one page.
