# Design system

<!-- Written by /mflow:theme. Agent-facing: which component for which need.
     Change the kit with /mflow:theme update; screens follow automatically. -->

## Decisions
- Palette: TODO (tokens in the Tokens file of AGENTS.md `## Stack`)
- Font: TODO
- Density: TODO
- Style guide: `/_styleguide` (dev/prototype only)

## Which component for which need
| Need | Component | Notes |
|---|---|---|
| Page title, breadcrumb, main actions | `PageHeader` | one per page |
| Filters above a list | `FilterPanel` | collapsible; refreshes only the list, no full page reload |
| Any list of records | `DataTable` | server-side paging, column search, sort, page size |
| Any input with label + validation | `FormField` | wraps text, number, date, select, textarea, checkbox |
| Status of a record | `StatusBadge` | status → color mapping lives in one place |
| Nothing to show | `EmptyState` | message + primary action |
| Destructive or irreversible action | `ConfirmDialog` | always states what will happen |
| Result feedback | `Toast` | success/error after an action |
| Side navigation | `SidebarMenu` | items from `MenuDefinition`; visibility by permission only |
| Prototype marker | `PrototypeBanner` | automatic in layout while using fake data; holds the role switcher |

## Do / don't
- Do build new needs as a component first, add it to the style guide, then use it.
- Do keep Thai text in ViewModels/resources.
- Don't put hex colors, inline styles or page-level CSS in views.
- Don't build a table by hand, even a small one.
- Don't compare role names in views or controllers. Check a `Permissions` key with `ICurrentUser.Can(...)`; the endpoint carries the same key.

## Adding a component
1. Write its contract in this file (parameters, states, behaviour).
2. Implement in the Components folder of AGENTS.md `## Stack`.
3. Show every state on `/_styleguide`.
