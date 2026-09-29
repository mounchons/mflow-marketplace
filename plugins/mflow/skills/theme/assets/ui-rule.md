---
paths:
  - "src/**/Views/**/*.cshtml"
  - "src/**/Pages/**/*.cshtml"
  - "src/**/wwwroot/css/**/*.css"
---

# UI rules

Read `docs/ui/design-system.md` before building or changing a screen.

- Assemble screens from the shared components only (`PageHeader`, `FilterPanel`, `DataTable`, `FormField`, `StatusBadge`, `EmptyState`, `ConfirmDialog`, `Toast`). A missing component is added to the kit and the style guide first, then used.
- Colors, spacing, radius and fonts come from `tokens.css` variables or, if the kit uses Bootstrap, its utility classes. Hex values, `style="..."`, and per-page `<style>` blocks belong nowhere in views.
- Every list uses `DataTable`: server-side paging, the filter panel above the table, and per-column search inside the table, with state in the query string.
- Menu items and buttons are shown or hidden only through `ICurrentUser.Can(Permissions.X)`; never by comparing role names. Hiding is not protection: the endpoint checks the same key (see `docs/ui/design-system.md`).
- Labels, messages and validation text are Thai and come from the page's ViewModel or resource file, so wording is reviewable in one place.
