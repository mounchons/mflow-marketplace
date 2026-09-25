---
name: theme
description: Build the project's design system before any screen — color and type tokens, app shell layout, shared UI components, a style-guide page, and the rules that make every screen use them.
disable-model-invocation: true
argument-hint: "[brand notes | @logo | @CI-guide] | update <what to change>"
---

A theme is the shared kit every screen is built from, the way a housing project picks one set of doors, tiles and switches for every house. Screens stay consistent because they can only be assembled from the kit: colors come from tokens, inputs and tables come from components, and nothing is styled inline.

Run this before the first `/mflow:screen`. Run `/mflow:theme update <what>` to change the kit; every screen follows automatically because none of them carry their own styles. `/mflow:theme update access` builds or refreshes only the access seams (step 3) from the current approved access-control discussion doc. That includes `users.json` and `roles.json`, which follow the schema-change rule once screens exist. Projects themed before mflow 0.5 need it before their next screen.

Stack: detect it. ASP.NET Core MVC/Razor + Bootstrap 5 + HTMX is the default below. For a React + Vite project, apply the same contracts as React components in `src/components/ui/` and tokens in `src/styles/tokens.css`.

## 1. Brand input

Collect in one batch: logo, primary color or the customer's CI guide (`$ARGUMENTS` may reference files), the app's feel (dense back-office vs. spacious), and the Thai font preference. If the customer has no CI, propose three palettes rendered on the style-guide page and let พี่ปู or the customer choose.

Done when: primary color, font, and density are decided or explicitly delegated to the three-palette choice.

## 2. Tokens

Create `wwwroot/css/tokens.css` from [assets/tokens.css](assets/tokens.css): brand colors, semantic colors (success, warning, danger, info), surfaces, text, radius, spacing, font stack, plus the Bootstrap 5.3 variable overrides so native Bootstrap classes follow the brand. Include light values; add a dark block only if asked.

Done when: every color, radius and font used anywhere in the app resolves to a token.

## 3. App shell

`Views/Shared/_Layout.cshtml`: `SidebarMenu`, top bar (current user's name and role, notifications slot), content area with page header slot, toast container, and the prototype banner partial with the role switcher, rendered when `Prototype:UseFakeData` is true. Load order: Bootstrap CSS → `tokens.css` → `app.css` (component styles only, token-based) → Bootstrap JS → HTMX.

The shell needs to know who is logged in, so build the access seams here, exactly as "Current user, permissions and the role switcher" in `${CLAUDE_PLUGIN_ROOT}/skills/screen/references/prototype-data.md` describes them. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`. Take the roles, users and scopes from the approved access-control discussion doc. With none approved, use the single all-permission user it describes.

Done when: the style guide renders the `SidebarMenu` sample twice, each with an explicit permission-set stub, and the two show different items. When `users.json` holds more than one user, switching in the banner also changes who the top bar shows.

## 4. Components

Build every component in [references/component-contracts.md](references/component-contracts.md) as Razor partials or view components under `Views/Shared/Components/` (or tag helpers where noted). Follow each contract exactly; these contracts are what makes screens predictable for both people and agents.

Done when: each contract has an implementation and the style guide shows it.

## 5. Style guide page

`/_styleguide` (development and prototype only): every token swatch, typography scale, every component in every state (default, hover/focus, disabled, error, loading, empty), a `SidebarMenu` sample with two items behind different permissions, rendered for two stub permission sets, a full sample list page and a sample form page assembled only from components. This page is what the customer approves once, instead of approving colors screen by screen.

## 6. Rules for agents

- Write `docs/ui/design-system.md` from [assets/design-system.md](assets/design-system.md): which component for which need, the do-and-don't list, how to add a component.
- Write `.claude/rules/ui.md` from [assets/ui-rule.md](assets/ui-rule.md), adjusting `paths:` to the real view and component folders. It loads only when Claude opens a UI file.
- Add one pointer line to AGENTS.md under Conventions: `UI: build screens only from the components in docs/ui/design-system.md; colors and spacing only from tokens.css.`

Done when: `dotnet build` passes, the style guide renders, the three files above exist, and STATUS.md records the theme decisions (palette, font, density).
