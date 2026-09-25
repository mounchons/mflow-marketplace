---
name: golden
description: Turn a customer's real spreadsheet (xlsx/csv) into golden test data for a hotspot rule and an xUnit test that checks the code against it.
disable-model-invocation: true
argument-hint: "@file.xlsx <hotspot-slug> [rule id]"
---

Golden data is the customer's own past results, calculated by hand, used as the answer key. If the code reproduces last month's real numbers, the rule is right in a way no example written from memory can prove.

## 1. Read and map

- If the file is not registered yet, follow `${CLAUDE_PLUGIN_ROOT}/skills/capture/SKILL.md` for it first. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.
- Read it with python (pandas/openpyxl): list sheets, header rows, merged cells, formula cells. Pick the sheet and range with พี่ปู.
- Map columns to the inputs and expected outcome of the rule table in `docs/hotspots/<slug>/rules.md`. Show the mapping and 5 sample rows before writing anything.

Done when: every rule input and the expected outcome has a mapped column, or a gap is listed as a question.

## 2. Clean and protect

- Mask personal data (names, national IDs, phone numbers, addresses) with stable placeholders; keep amounts, dates, codes and categories.
- Rows the customer marks as wrong, or that contradict the rule table, go to a separate `anomalies` list for a hotspot `ask` ticket, not into the golden set.

## 3. Write

- `tests/<Context>.Domain.Tests/Golden/<slug>.json`: array of `{ "id", inputs..., "expected", "sourceRow" }`.
- A test class using `[MemberData]` that loads the file, runs the domain service or aggregate method, and asserts `expected` with the rounding rule from rules.md. If the domain code does not exist yet, write the test against the intended interface and mark it `Skip = "until <change-name> is applied"`.
- Update the hotspot map `Notes → Golden data source`, and `mark` the source `--used-by hs-<slug>`.

Done when: the JSON and test compile, the test runs (passing, failing with a clear diff, or skipped with a reason), and the anomalies list is either empty or turned into tickets.
