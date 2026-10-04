---
name: review-notes
description: Turn notes or a transcript from testing or a prototype review into Backlog tasks, hotspot rows, vocabulary and decisions, write the agreed summary, and draft a Thai email that informs the people involved when the user wants one.
disable-model-invocation: true
argument-hint: "@notes-or-transcript [@more ...]"
---

A review becomes agreement once it is written down and the user confirms it. The user (the SA, PM or system owner driving the project) speaks for the customer, so that confirmation is the customer's; nothing waits for another round of confirmation. Build first, test it in use, then refine: what a review finds is simply the next round of work.

## 1. Register the input

Notes and transcripts are sources. Copy them into `docs/source/reviews/` if they are elsewhere, then `node "${CLAUDE_PLUGIN_ROOT}/scripts/source-index.mjs" mark <file> --status reference --title "Review <screen/flow> <date>"` after triage (step 4). Audio: ask the user for a transcript first.

## 2. Classify every item

Build one table and show it before writing anything:

| # | What was said or observed | Type | Destination | In agreed scope? |
|---|---|---|---|---|

Types and destinations:
- Flow gap / screen change → Backlog task, label `prototype` (and `/mflow:screen <name> ...` later)
- Look, menu, component or layout of the kit (colors, font, density, the ☰ menu, how pages fit a small screen) → Backlog task for `/mflow:theme update <what>`, which edits the static preview before port and the stack kit after
- Hidden rule (if / except / depends / approve / calculate / round / cancel) → `docs/hotspots/INDEX.md` row, or a ticket on an existing hotspot map
- Field / data detail (required, format, source, monthly volume) → Backlog task; the hotspot's rules.md if it belongs to one
- A check on a `ทดสอบใช้งาน` task (from an approved discussion doc's section 5) → confirmed: tick its acceptance criterion (`backlog task edit <id> --check-ac <n>`); not as expected: tick nothing and route the difference as the next items describe
- Role, permission, menu or data visibility → check approved discussion docs first (`node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" list`, status `approved`):
  - matches the approved doc → no new item; list it in the summary's "สิทธิ์และข้อมูลที่แต่ละ role เห็น" section (step 4)
  - differs from it, not built yet → a new discussion doc (`/mflow:discuss`) that supersedes the old one and cites this review: an ordinary refinement after testing
  - differs from it, already built (archived in `openspec/specs/`) → `/mflow:change-request`, which records the impact and goes ahead on the user's instruction
  - no approved doc covers it → several items: a candidate topic for `/mflow:discuss`; one clear item: a Backlog task; conditions (amount limits, states, approval chains): a hotspot
- Differs from an approved discussion doc on any other topic → the same routing as above. Exception: a field-level change to an approved data-model doc (add, rename or drop a column; change its length or whether it is required) is a Backlog task for `/mflow:screen` under the schema-change rule, not a new doc. A structural change (a new aggregate, a changed key or relationship, reversing a storage decision) follows the routing above
- Output document (print, export, legal form) → Backlog task + request a real sample
- Customer term → Domain vocabulary in AGENTS.md
- Priority (day one vs later) → story-map release line in `docs/vision.md`
- Agreed out of scope → `docs/vision.md` Out of scope
- Open question → put it to the user in this table; the answer goes to its destination. Only what the user cannot answer yet goes to `docs/vision.md` Open questions with owner and due date
- New request beyond agreed scope → `/mflow:change-request` candidate; never a plain task

"In agreed scope?" is checked against `docs/vision.md`, active files in `docs/source/INDEX.md`, archived `openspec/specs/`, approved discussion docs and earlier review summaries. The user's approval is the customer's, so approved discussion docs are part of this baseline. A later statement that differs from one is a refinement, routed as above by whether it is built.

Done when: every line of the notes maps to exactly one row, and nothing is left unclassified.

## 3. Apply

After the user confirms the table, write all destinations. Create Backlog tasks through the CLI with the review file as `--ref`.

## 4. Summary

Write `docs/reviews/<date>-<topic>-summary.md` in Thai: what was agreed, as the user confirmed it in step 3. It joins the agreed baseline the day it is written; it does not wait for a reply. Sections: ปรับตามที่คุยกัน / กฎที่ตกลง / สิทธิ์และข้อมูลที่แต่ละ role เห็น / เอกสารที่ขอเพิ่ม / ไว้ช่วงถัดไป / ยังไม่อยู่ในขอบเขต / ทดสอบรอบถัดไป.

"สิทธิ์และข้อมูลที่แต่ละ role เห็น" appears when roles were shown through the role switcher or discussed. Per role, list what was seen: menus, rows (data scope), hidden fields, and allowed actions. Take these from the approved discussion doc, updated with this review's corrections. This section is the baseline for access, which `/mflow:change-request` uses as evidence. New out-of-scope requests appear as "จะประเมินและเสนอแยก", never as promises.

When the user wants to send it to the people who took part (the usual case for an SA or a PM), add a Thai email draft to the same file: polite, direct, no over-selling. It informs; it does not ask for confirmation. It may close with "ถ้ามีจุดไหนไม่ตรง แจ้งได้ จะปรับในรอบถัดไป".

**What comes next:** tell the user what the review produced, by destination, and one next command, in this order of priority: `/mflow:screen <name> …` for the first prototype task, `/mflow:discuss <slug>` for a doc to supersede, `/mflow:hotspot <idea>` for a new rule, `/mflow:change-request` for a built item. Write it into STATUS.md `## Now`. Add one line on why it is next: what it unblocks, or which risk it settles.

Done when: the source is marked, destinations are written, the summary exists (with the email draft if the user wanted one), STATUS.md notes the next test or review date if one was agreed, and the user has the next command.
