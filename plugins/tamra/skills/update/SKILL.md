---
name: update
description: แก้ไข item ที่มีอยู่แล้วใน Tamra knowledge base (plugin tamra) โดยสร้าง revision ใหม่ (ฉบับที่ publish แล้วแก้ทับไม่ได้) แล้ว publish — เรียกด้วย /tamra:update <item_code> <สิ่งที่จะแก้> [--draft]
argument-hint: "<item_code> <สิ่งที่จะแก้> [--draft]"
disable-model-invocation: true
allowed-tools: mcp__plugin_tamra_kb__kb_get, mcp__plugin_tamra_kb__kb_save, mcp__plugin_tamra_kb__kb_template, mcp__plugin_tamra_kb__kb_search
---

# /tamra:update — revise a Tamra KB item

Input: `$ARGUMENTS`

1. The first token is the item code; the rest describes the change (or, when empty, apply what was learned in this conversation about that item; ask if unclear).
2. Call `kb_get` for the item. Note `row_version`, `revision_no`, `working_revision` (an existing draft), and each section's `section_key` and heading.
3. Plan the smallest change:
   - Partial edits → `section_ops`: `update` (section_key + new content/heading), `insert` (client_section_ref + heading + content, with after_section_key or parent_section_key), `move`, `remove` (cascade=true for subtrees).
   - Title/summary/metadata/keywords/questions/tags/sources: send only the fields that change (others keep their values; `[]` clears a list).
   - Rewriting the whole body is the last resort; use `sections[]` with the existing `section_key`s so section identities stay stable.
4. Call `kb_save` with `item`, `expected_row_version`, `change_summary` (one sentence: what changed and why), the change, and:
   - no working draft → `base_revision_no` = the current published `revision_no`;
   - a working draft exists → omit `base_revision_no` (the edit goes into that draft) and tell the user.
   - `publish=true` unless the input contains `--draft`. Omit `idempotency_key`.
5. Errors:
   - `CONFLICT` → the item changed since it was read: `kb_get` again, re-apply the change to the new content, retry once, and show what differed.
   - `SECTION_MAPPING_REQUIRED` → resend with `section_ops` or `sections[]` carrying the existing `section_key`s.
   - `HUMAN_ACTION_REQUIRED` / `POLICY_REQUIRES_REVIEW` → save with `publish=false` and explain.
   - `VALIDATION_FAILED` → apply `error.fix` and retry once; other errors → show code, message, fix, `request_id`.
6. Report in Thai: `ITEM-CODE` revision before → after, status, and the changed sections.
