# Static preview of the kit

A static preview is the kit built as plain HTML, CSS and JavaScript in `docs/ui/theme/`, before the app exists. It is a show house built before the estate's roads: the customer walks through the rooms and picks the finishes, then the builder repeats them in every real house. The user approves the look and the responsive behaviour on it, and that approval is the customer's. `/mflow:theme port` then builds the real kit in the stack from it, and the preview is frozen as the record of what was approved.

Use it when the app is not scaffolded yet, when the stack is `custom`, or when the look must be agreed before any code is set up.

## One home at a time

| Phase | Where the kit lives | `docs/ui/theme/README.md` status | `/mflow:theme update <what>` edits |
|---|---|---|---|
| Building | the preview | `draft` | the preview |
| Approved, not ported | the preview | `approved <date>` | the preview |
| Ported | the stack (paths in AGENTS.md `## Stack`) | `frozen <date>, kit in <path>` | the stack kit only; the frozen preview is never edited again |

`docs/ui/design-system.md` Decisions names where the kit lives now, and port changes that line. `/mflow:screen` builds no screen while the status is `draft` or `approved`. A README with no status line comes from a kit made before mflow 0.12, and the older check applies.

## What the preview holds

| File | Role | At port |
|---|---|---|
| `tokens.css` | every color, font, radius, space and layout size, from [../assets/tokens.css](../assets/tokens.css) | copied unchanged to the Tokens file of `## Stack` |
| `app.css` | component and shell styles that read tokens only, with the breakpoints of [responsive.md](responsive.md) §2 | copied unchanged next to the tokens |
| `assets/` | logo and images | copied unchanged |
| `shell.js` | `AppShell` behaviour (three sidebar states, ☰, drawer, remembered choice), `Toast`, `Dialog`, `SidePanel`, `Dropdown`, `Tabs`, `Tooltip`, permission gates, `StatusBadge` dictionary | a behaviour spec: rebuilt per profile to the contracts |
| `datatable.js` | `DataTable` on sample rows: sort, header search on the columns marked searchable, the pager, URL state, every state | a behaviour spec only. It pages in the browser; the stack's DataTable pages on the server, as its contract says |
| `datepicker.js` | `DatePicker` and `DateRangeField` with the date format config and the parser | a behaviour spec: rebuilt per profile, and its parser table becomes the stack's unit test |
| `index.html` | the style guide of theme step 5, with the same two opening sections | rebuilt as the stack's style guide, then compared with it |
| `list.html`, `form.html` (`dashboard.html` if the product has a home dashboard) | sample pages built only from the kit | rebuilt as the stack's sample pages |
| `README.md` | status line, how to open the preview, file roles, sidebar behaviour | status set to `frozen` |

- **Same CSS base as the stack**, or nothing carries over. When the kit uses Bootstrap (always in `mvc-htmx`; in `react-vite` only if the Tokens file row keeps the Bootstrap bridge), load Bootstrap 5.3 CSS and JS from a CDN, so the tokens bridge and `app.css` behave exactly as they will in the app, and build the drawer on Bootstrap's offcanvas as `AppShell` requires. Otherwise use plain CSS.
- **No build step and no npm.** Pages load `tokens.css`, `app.css` and the scripts directly. Each page has `<meta name="viewport" content="width=device-width, initial-scale=1">` and `lang="th"`.
- **Menu and users are copies.** `shell.js` holds the menu (with an icon per item) and some of the fake users from `PrototypeData/users.json` and `roles.json`, marked in a comment as a copy for the preview. The source stays `PrototypeData/` and, after port, `MenuDefinition`. `update access` before port refreshes both together.
- **Browser storage** (the ☰ choice, open filter panels) is preview-only and wrapped in try/catch, as [responsive.md](responsive.md) §3 describes.
- **No screens.** The preview holds the kit and its sample pages only. Prototype screens are built in the stack by `/mflow:screen`, with fake data behind the real seams.

## Opening it

The README gives the command, and theme shows it to the user:

```
python -m http.server 8810 --bind 127.0.0.1 --directory docs/ui/theme
```

Then browse to `http://127.0.0.1:8810/`. Fonts and Bootstrap from a CDN need internet; say so in the README. Serve the folder rather than opening the files directly, because browsers restrict storage and some requests on `file://` pages.

## Building it (`/mflow:theme preview`)

Theme steps 1 to 6 run as usual, with these differences:
- **Step 2:** `tokens.css` goes in `docs/ui/theme/`.
- **Step 3:** the shell is `shell.js` plus the page skeleton every preview page shares. The access seams (`ICurrentUser`, endpoint checks, `MenuDefinition` in code) cannot exist in static files. Write `PrototypeData/users.json` and `roles.json` from the approved access-control discussion doc as usual, copy what the preview needs into `shell.js`, and let port build the seams. The role switcher in the preview's banner changes the menu, buttons and fields the same way.
- **Steps 4 and 5:** the components in `app.css` and the scripts; the style guide is `index.html`, with the sample pages. `form.html` uses a `DatePicker` and a `DateRangeField`, and `list.html` a `FilterPanel` with a date range above a `DataTable` with the pager.
- **Step 6:** `docs/ui/design-system.md` says the kit lives in `docs/ui/theme/` until port. `.claude/rules/ui.md` takes its paths from `## Stack` as usual.
- **Verify** at the acceptance sizes as [responsive.md](responsive.md) §5 describes, on the served preview.

Write the README with `Status: draft`. When the user approves the preview, set `Status: approved <date>` and record the approval in STATUS.md. Feedback from others who try the preview goes through `/mflow:review-notes` like any prototype review.

This Done-when replaces step 6's, because there is no app to build yet.

Done when: the preview opens from the README's command, the style guide passes §5 at the acceptance sizes (or reports them `(unverified)`), design-system.md names the preview as the kit's home, and the status is `draft` or `approved`.

## Porting it (`/mflow:theme port`)

1. **Gate.** The README says `Status: approved`, AGENTS.md `## Stack` has a profile, and the app project exists at the paths `## Stack` names.
   - **No app yet:** porting does not scaffold the app. Suggest `/opsx:propose` for a change that scaffolds it, with a task "port the kit: `/mflow:theme port`", and stop. Production code goes through OpenSpec.
   - **Status `draft`:** ask the user to approve the preview first.
2. **Build the kit in the stack** by running theme steps 2 to 6 with the preview as the source. Copy `tokens.css`, `app.css` and `assets/` unchanged into the stack's locations. Rebuild `AppShell` and every component to [component-contracts.md](component-contracts.md), taking behaviour from `shell.js`, `datatable.js` and `datepicker.js`, and turn the DatePicker's parser table into the stack's unit test. Build the access seams of step 3. The stack's style guide gets the same sections and sample pages as `index.html`.
3. **Compare** the stack's style guide with the preview at each acceptance size. Fix each difference, or list it for the user's yes. Report sizes that could not be checked as `(unverified)`, as §5 says.
4. **Freeze.**
   - Set the README status to `frozen <date>, kit in <path>`, and add under it: "ภาพรวมที่อนุมัติ ณ วันที่ <date> เก็บไว้เป็นหลักฐาน kit จริงอยู่ที่ <path> ถ้าจะเปลี่ยน kit ให้แก้ที่นั่น ไม่ใช่ที่นี่".
   - In design-system.md, change the kit's home to the stack paths, and keep one line pointing at the frozen preview.
   - Update STATUS.md.

Done when: the build command in AGENTS.md passes, the stack's style guide matches the preview at the acceptance sizes (or the differences are listed and agreed), the preview is frozen, and design-system.md points at the stack kit.
