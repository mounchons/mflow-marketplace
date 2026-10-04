---
name: golden
description: Turn a customer's real spreadsheet (xlsx/csv) into golden test data for a hotspot rule and a data-driven unit test that checks the code against it.
disable-model-invocation: true
argument-hint: "@file.xlsx <hotspot-slug> [rule id]"
---

Golden data is the customer's own past results, calculated by hand, used as the answer key. If the code reproduces last month's real numbers, the rule is right in a way no example written from memory can prove.

## 1. Read and map

- If AGENTS.md has no `## Stack`, or its profile is `TODO`, ask first, as "Asking" in `${CLAUDE_PLUGIN_ROOT}/skills/init/references/stacks.md` describes, and write the section. Step 3 takes the folder and test framework from it.
- If the file is not registered yet, follow `${CLAUDE_PLUGIN_ROOT}/skills/capture/SKILL.md` for it first. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.
- If `<slug>.source.json` already exists in the Golden data folder and its `sourceHash` differs from the file's current hash (`node "${CLAUDE_PLUGIN_ROOT}/scripts/source-index.mjs" hash <file>`), say so first: the old answer key came from an earlier version of the spreadsheet, and this run replaces it.
- Read it with python (pandas/openpyxl): list sheets, header rows, merged cells, formula cells. Pick the sheet and range with the user.
- Map columns to the inputs and expected outcome of the rule table in `docs/hotspots/<slug>/rules.md`. Show the mapping and 5 sample rows before writing anything.

Done when: every rule input and the expected outcome has a mapped column, or a gap is listed as a question.

## 2. Clean and protect

- Mask personal data (names, national IDs, phone numbers, addresses) with stable placeholders; keep amounts, dates, codes and categories.
- Rows the customer marks as wrong, or that contradict the rule table, go to a separate `anomalies` list for a hotspot `ask` ticket, not into the golden set.

## 3. Write

- `<Golden data folder>/<slug>.json`, the folder from AGENTS.md `## Stack` (`tests/<Context>.Domain.Tests/Golden/` in the .NET profiles): array of `{ "id", inputs..., "expected", "sourceRow" }`.
- `<Golden data folder>/<slug>.source.json` beside it, so the answer key can be traced and checked later: `source` (project path), `sourceHash` (from `source-index.mjs hash <file>`), `sheet`, `range`, `mapping` (`version`, and the column of each rule input and of the expected outcome), `units`, `rounding` (the rule from rules.md, by its id), `dates` (the source's calendar and format, and what the JSON uses), `formulas` (cells with no cached value: listed as anomalies, never computed by guess), `rows`, `anomalies` and `generatedAt`. `/mflow:help check setup` warns once the source changes; rerunning this skill for the slug rewrites both files.
- A data-driven test in the Unit tests framework of AGENTS.md `## Stack` (xUnit `[MemberData]` in the .NET profiles) that loads the file, runs the domain service or aggregate method, and asserts `expected` with the rounding rule from rules.md. If the domain code does not exist yet, write the test against the intended interface and mark it skipped with the reason `until <change-name> is applied`.
- Update the hotspot map `Notes → Golden data source`, and `mark` the source `--used-by hs-<slug>`.

**What comes next:** tell the user the test result in one line. A failing test means the code or a rule row is wrong: name the rows that differ. Then give one next command: `/mflow:hotspot <slug>`, which rechecks the readiness bar now that golden data exists, or takes the anomaly tickets this run created. Write it into STATUS.md `## Now`. Add one line on why it is next: what it unblocks, or which risk it settles.

Done when: the JSON, its `.source.json` and the test exist and compile, the test runs (passing, failing with a clear diff, or skipped with a reason), the anomalies list is either empty or turned into tickets, and the user has the next command.
