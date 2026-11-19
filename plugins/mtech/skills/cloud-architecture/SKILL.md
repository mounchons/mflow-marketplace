---
name: cloud-architecture
description: Read a legacy system and deliver a cloud modernization proposal — As-Is inventory from the code, target architecture, official AWS / Azure / GCP prices in a formula-driven workbook, SVG / HTML diagrams, the design README and an install, test and handover plan.
disable-model-invocation: true
argument-hint: "[system or folder] [target cloud and region] [what to produce: plan | costs | diagrams | install-plan]"
---

# Cloud architecture study

Turn a legacy codebase into a costed, diagrammed modernization proposal a customer can sign. Work backwards from the end state: what the customer runs, what it costs per month, and what is handed over.

Write deliverables in the user's language, with numbers in USD and the customer's local currency. When the user names only part of the work in the arguments (costs, diagrams, install plan), run the steps that part needs and reuse what the project's docs already hold. Scripts live in `scripts/`, references in `references/`, a worked example in `examples/`. Every `scripts/…`, `references/…`, `examples/…` and `assets/…` path in this skill and its references means `${CLAUDE_PLUGIN_ROOT}/skills/cloud-architecture/<path>`; outputs go into the user's project (its docs folder) or a scratch folder, never into the plugin.

## Ground rules

- **Evidence over memory.** Every As-Is claim cites a file path (`path:line`); every price cites its source and date.
- **Credentials stay where they are.** When the legacy repo holds passwords, keys or connection strings, name the file path only and list "rotate before go-live" as a task. Values never enter docs, diagrams, logs or commits.
- **One source of truth for numbers.** Quantities and prices live in the cost spec JSON → workbook. README tables, diagram cost panels and callouts are copied from the recalculated workbook. When a decision changes a number, update spec, workbook, README, diagrams and plan in the same commit, then re-check that totals match everywhere.
- **The user decides.** Present options with a recommendation; record each decision with its date ("ตัดสินใจ 8 พ.ย. 2026") in the README where it applies.

## Steps

1. **Frame.** Capture goals, deadline, target region, budget ceiling, users (total / concurrent), data volumes (DB size, file count and TB), SLA / RPO / RTO, who owns the cloud account. Done when each item has a value or sits in an open-questions list.

2. **Inventory the As-Is** with [references/discovery.md](references/discovery.md). Done when every row of its inventory table is filled with evidence or turned into a question, and the container / cloud blockers are listed.

3. **Choose the path** with [references/options.md](references/options.md): rehost, replatform or refactor per component, phased (strangler fig). Done when the phase list exists and each phase delivers value on its own.

4. **Design the target** with [references/service-map.md](references/service-map.md): network and security, compute and scaling (incl. night scale-down), data and storage tiers, identity / MFA, logging and alert catalog, backup / DR. Done when every legacy component maps to a target service or an explicit "retire".

5. **Price it** with [references/pricing.md](references/pricing.md), `scripts/aws_price.py` and `scripts/cost_workbook.py`. Done when the workbook recalculates with zero errors, every line has unit price + source + date + region, one-time costs are separate, and commitment discounts apply only to the 24-hour baseline.

6. **Draw** with [references/diagrams.md](references/diagrams.md) and `scripts/svgkit.py`: architecture per cloud, logging / alert flow, cost map (one-time / fixed / scale), plus any comparison the user asks for. Done when each page is screenshotted in light, dark and phone width with no overlaps or horizontal overflow, and SVG + PNG are exported.

7. **Write the documents** with [references/documents.md](references/documents.md): README (design + decisions + costs), install / test / handover plan, open questions. Done when every number in the documents equals the workbook.

8. **Deliver.** Commit following the repo's conventions, publish the HTML pages if an artifact tool is available, send the workbook and PNGs, and add the business layer from [references/business.md](references/business.md) (proposal structure, managed-service offer, reminders).

## Tooling

**Python:** the scripts need Python 3.10 or newer. Before the first script, find the interpreter once: the first of `python3 --version`, `python --version` and, on Windows, `py -3 --version` that prints 3.10 or newer. Use it wherever this skill and its references write `python3`; on Windows `python3` may be missing or the Microsoft Store stub, and `python` may be Python 2. Check `openpyxl` with `<python> -c "import openpyxl"` before the cost workbook; when it is missing, tell the user `<python> -m pip install openpyxl` and do not install it yourself. When no interpreter of 3.10 or newer answers, say so and stop before the scripts.

| Need | Command |
|---|---|
| AWS official prices | `python3 "${CLAUDE_PLUGIN_ROOT}/skills/cloud-architecture/scripts/aws_price.py" regions AmazonRDS` · `… fetch AmazonRDS ap-southeast-7 --out <dir>` · `… query <file> --attr k=v` |
| Cost workbook | `python3 "${CLAUDE_PLUGIN_ROOT}/skills/cloud-architecture/scripts/cost_workbook.py" spec.json out.xlsx` (spec format: [examples/cost-spec.example.json](examples/cost-spec.example.json)) |
| Diagram page | copy [examples/example_architecture.py](examples/example_architecture.py) into the project or a scratch folder and run it with `SVGKIT_DIR="${CLAUDE_PLUGIN_ROOT}/skills/cloud-architecture/scripts"` so it imports `svgkit.py` |
| Standalone SVG | `python3 "${CLAUDE_PLUGIN_ROOT}/skills/cloud-architecture/scripts/export_svg.py" page.html out.svg` |
| PNG / visual check | `node "${CLAUDE_PLUGIN_ROOT}/skills/cloud-architecture/scripts/shot.js" svg out.svg out.png <w> <h> 2` · `node "${CLAUDE_PLUGIN_ROOT}/skills/cloud-architecture/scripts/shot.js" page page.html <prefix>` |

Requirements: Python 3.10 or newer with `openpyxl`; Node with Playwright + Chromium for screenshots; LibreOffice (headless) to recalculate a workbook before reading values back.
