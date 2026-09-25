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
- Role / permission → Backlog task, or hotspot if it has conditions
- Output document (print, export, legal form) → Backlog task + request a real sample
- Customer term → Domain vocabulary in AGENTS.md
- Priority (day one vs later) → story-map release line in `docs/vision.md`
- Agreed out of scope → `docs/vision.md` Out of scope
- Open question → `docs/vision.md` Open questions with owner and due date
- New request beyond agreed scope → `/mflow:change-request` candidate; never a plain task

"In agreed scope?" is checked against `docs/vision.md`, active files in `docs/source/INDEX.md`, and archived `openspec/specs/`.

Done when: every line of the notes maps to exactly one row, and nothing is left unclassified.

## 3. Apply

After พี่ปู confirms the table, write all destinations. Create Backlog tasks through the CLI with the review file as `--ref`.

## 4. Summary for the customer

Write `docs/reviews/<date>-<topic>-summary.md` with a Thai email draft: polite, direct, no over-selling. Sections: ปรับตามที่คุยกัน / กฎที่ขอยืนยันรายละเอียด / เอกสารที่ขอเพิ่ม / ไว้ช่วงถัดไป / ยังไม่อยู่ในขอบเขต / ขอให้ยืนยันภายในวันที่. New out-of-scope requests appear as "จะประเมินและเสนอแยก", never as promises.

Done when: the source is marked, destinations are written, the email draft exists, and STATUS.md notes the next review date if one was agreed.
