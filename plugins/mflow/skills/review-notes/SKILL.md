---
name: review-notes
description: Turn notes or a transcript from a prototype review with the customer into Backlog tasks, hotspot rows, vocabulary and open questions, and draft the Thai summary email for the customer to confirm.
disable-model-invocation: true
argument-hint: "@notes-or-transcript [@more ...]"
---

A review meeting only becomes agreement once it is written down and the customer confirms it. This skill does both halves.

## 1. Register the input

Notes and transcripts are sources. Copy them into `docs/source/reviews/` if they are elsewhere, then `node "${CLAUDE_PLUGIN_ROOT}/scripts/source-index.mjs" mark <file> --status reference --title "Review <screen/flow> <date>"` after triage (step 4). Audio: ask พี่ปู for a transcript first.

## 2. Classify every item

Build one table and show it before writing anything:

| # | What was said or observed | Type | Destination | In agreed scope? |
|---|---|---|---|---|

Types and destinations:
- Flow gap / screen change → Backlog task, label `prototype` (and `/mflow:screen <name> ...` later)
- Hidden rule (if / except / depends / approve / calculate / round / cancel) → `docs/hotspots/INDEX.md` row, or a ticket on an existing hotspot map
- Field / data detail (required, format, source, monthly volume) → Backlog task; the hotspot's rules.md if it belongs to one
- Role, permission, menu or data visibility → check approved discussion docs first (`node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" list`, status `approved`):
  - matches the approved doc → no new item; list it in the summary's confirmation section (step 4)
  - differs from it → a new discussion doc (`/mflow:discuss`) that supersedes the old one and cites this review. The customer is correcting พี่ปู's understanding, not adding scope. Use `/mflow:change-request` instead only when the item is already built (archived in `openspec/specs/`) or the customer confirmed it in an earlier review summary
  - no approved doc covers it → several items: a candidate topic for `/mflow:discuss`; one clear item: a Backlog task; conditions (amount limits, states, approval chains): a hotspot
- Differs from an approved discussion doc on any other topic → the same routing as above. Exception: a field-level change to an approved data-model doc (add, rename or drop a column; change its length or whether it is required) is a Backlog task for `/mflow:screen` under the schema-change rule, not a new doc. A structural change (a new aggregate, a changed key or relationship, reversing a storage decision) follows the routing above
- Output document (print, export, legal form) → Backlog task + request a real sample
- Customer term → Domain vocabulary in AGENTS.md
- Priority (day one vs later) → story-map release line in `docs/vision.md`
- Agreed out of scope → `docs/vision.md` Out of scope
- Open question → `docs/vision.md` Open questions with owner and due date
- New request beyond agreed scope → `/mflow:change-request` candidate; never a plain task

"In agreed scope?" is checked against `docs/vision.md`, active files in `docs/source/INDEX.md`, archived `openspec/specs/`, and review summaries the customer confirmed. Approved discussion docs are not part of this baseline: they record พี่ปู's understanding, so a customer statement that differs from one corrects that understanding and is routed as above, never as new scope by itself.

Done when: every line of the notes maps to exactly one row, and nothing is left unclassified.

## 3. Apply

After พี่ปู confirms the table, write all destinations. Create Backlog tasks through the CLI with the review file as `--ref`.

## 4. Summary for the customer

Write `docs/reviews/<date>-<topic>-summary.md` with a Thai email draft: polite, direct, no over-selling. Sections: ปรับตามที่คุยกัน / กฎที่ขอยืนยันรายละเอียด / สิทธิ์และข้อมูลที่แต่ละ role เห็น / เอกสารที่ขอเพิ่ม / ไว้ช่วงถัดไป / ยังไม่อยู่ในขอบเขต / ขอให้ยืนยันภายในวันที่.

"สิทธิ์และข้อมูลที่แต่ละ role เห็น" appears when roles were shown through the role switcher or discussed. Per role, list what the customer saw: menus, rows (data scope), hidden fields, and allowed actions. Take these from the approved discussion doc, updated with this review's corrections, and ask the customer to confirm. Once confirmed, this summary is the customer's baseline for access, which `/mflow:change-request` uses as evidence. New out-of-scope requests appear as "จะประเมินและเสนอแยก", never as promises.

Done when: the source is marked, destinations are written, the email draft exists, and STATUS.md notes the next review date if one was agreed.
