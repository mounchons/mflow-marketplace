---
name: capture
description: Register and triage customer documents (TOR, Word, Excel, PDF, notes) in docs/source; only new or changed files are read, older versions are marked superseded.
disable-model-invocation: true
argument-hint: "[@file ...] [--replaces @old-file]"
---

Customer documents are evidence: originals are never edited, a new version is a new file, and each file is read for triage once. The registry script tracks this by content hash, so "already read" is a fact, not a memory.

Registry commands (run from the repo root):
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/source-index.mjs" scan`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/source-index.mjs" mark <file> [--status active|superseded|reference] [--by <new-file>] [--used-by <hs-slug|change|review>] [--title "..."] [--note "..."]`

`mark` regenerates `docs/source/INDEX.md`; never edit that file by hand.

## 1. Decide what to read

- Files given in `$ARGUMENTS`: read exactly those. If one is outside `docs/source/`, ask to move or copy it there first.
- No files given: run `scan` and take `new` + `changed`. Report `unchanged` files as skipped by name and do not open them.
- A file already marked `superseded` is never used as a source of truth; follow its replacement instead.

Done when: พี่ปู has seen the list of files that will be read and the list skipped.

## 2. Read by type

- `.pdf`, `.md`, `.txt`, `.csv`, `.json`: read directly. For scanned PDFs, flag any number or table you are not certain of.
- `.docx`: convert to Markdown in `.mflow/cache/<name>.md` (pandoc, or python-docx) and read that; the original in `docs/source/` stays untouched.
- `.xlsx`: read with python (pandas/openpyxl); list sheets first, then read only the sheets that matter. Note merged cells and formulas you cannot see as values.

## 3. Versions

When a file replaces an older one (`--replaces`, or the name/content makes it obvious; confirm with พี่ปู), compare the two and list what was added, removed, and changed, section by section. Then `mark <old> --by <new>`.

Done when: every changed statement between versions is listed or the files were confirmed unrelated.

## 4. Triage

Sort every meaningful statement from the read files into one destination and show the table before writing anything:

| Statement type | Destination |
|---|---|
| Durable constraint (platform, DB, compliance, performance) | one line in AGENTS.md |
| Scope, flow, screens | `docs/vision.md` story map / scope, with the source file cited |
| Out of scope | `docs/vision.md` Out of scope |
| Business rule crossing screens | row in `docs/hotspots/INDEX.md`; if the hotspot already exists, a new ticket or fog note on its map |
| Change to something already built or archived in `openspec/specs/` | candidate for `/mflow:change-request` |
| Customer term | Domain vocabulary in AGENTS.md |
| Vague or contradictory | Open questions in `docs/vision.md` |
| Open to interpretation on a cross-cutting topic (roles and permissions, menus, data visibility, org structure, numbering…; see `${CLAUDE_PLUGIN_ROOT}/skills/discuss/references/topics.md`) | candidate topic for `/mflow:discuss`, listed in the report; nothing written |

After พี่ปู confirms, write the changes.

## 5. Mark

For each file read: `mark <file> --status active --title "<short title>"` plus `--used-by` for each hotspot or change it fed. Reference-only material (samples, screenshots) gets `--status reference`.

Done when: `scan` reports nothing in `new` or `changed`, and STATUS.md records what was processed.

## 6. Next

Only when this ran as `/mflow:capture` itself, not as a step of another skill: list the `/mflow:discuss` candidates from the triage, most costly to misread first, with the statement that makes each one ambiguous. Suggest `/mflow:discuss <topic>` for the first one before `/mflow:screen inventory`. If there are none, say so.
