# Diagrams: SVG inside HTML, exported to SVG and PNG

## The set to produce

| Diagram | Shows | Notes |
|---|---|---|
| Architecture (one file per cloud) | users → edge → region box (network, subnets, AZs, compute, data) + managed services column + numbered flows + cost table | the main picture for the customer |
| Logging and alert flow | log sources per layer → hot store → locked archive account; alarms → notification channel; TraceId band | pairs with the alert catalog |
| Cost map | one-time → fixed + scale = monthly → first year; on-demand vs committed bars; item bars per column; "if we scale" table | numbers copied from the recalculated workbook |
| Comparison (on request) | e.g. storage tiers, option A vs B, cumulative cost over months | follow the dataviz rules: one axis, colours validated |
| Install plan (optional page) | timeline of phases, steps with owner, tests, acceptance, handover | generated from the same data as the markdown plan |

Mermaid inside the README is fine for small flows (sequence, phases, gantt). Validate it renders: `npx -y @mermaid-js/mermaid-cli -i x.mmd -o x.png` (mermaid gantt with numeric dates is unreliable: use real dates + `weekday monday`).

## Building a page

1. Copy `examples/example_architecture.py` into a scratch or docs folder; keep geometry as named constants (column x / width, region box, subnet rows).
2. Draw boxes outer → inner, then nodes, then arrows, then badges (badges last so they sit on top).
3. Route arrows orthogonally with `M x y H x V y`; give every arrow a `flow` number that matches the numbered list (`page(flows=...)`), so hovering a list item highlights its path.
4. Where a line must cross another, call `d.bridge(x, y1, y2)` before drawing the crossing line.
5. Pass `cloud="aws" | "azure" | "gcp"` to `page()` for the region tab / border colour.
6. Put costs in a panel built from the workbook values (never typed twice by hand); add a callout for the monthly total after discount and the THB figure.

## Text fitting

At 12–13.5 px, Latin and Thai average ~7 px per character. A 200 px node holds ~22 title characters after the icon. Shorten labels instead of shrinking fonts; move detail into the flow list or a panel. Labels on lines use `t-lbl` (halo) and sit in open space, clear of boxes.

## Checks before delivering (all of them, every page)

```bash
python3 <generator>.py out/page.html
node scripts/shot.js page out/page.html out/check      # light / dark figure + full page + phone; prints scrollWidth
python3 scripts/export_svg.py out/page.html out/page.svg
node scripts/shot.js svg out/page.svg out/page.png <W> <H> 2
```

Look at the light and dark screenshots: no text overlapping boxes or lines, no label crossing a boundary, every badge number readable, totals equal to the workbook. `scrollWidth` must equal the viewport for the phone run (the SVG scrolls inside its own container). Fix and re-run once; then publish.

## Where files go

`docs/<Topic>/diagrams/<cloud>-<name>.html|svg|png` in the project, generators in a scratch folder (or `docs/<Topic>/tools/` if the user wants them kept). When an artifact / page publishing tool is available, publish the HTML and give the link; republish to the same link on updates.
