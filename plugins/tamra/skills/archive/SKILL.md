---
name: archive
description: เก็บถาวร (archive) หรือเอาคืน (unarchive) item ใน Tamra knowledge base ผ่าน kb_admin — archive ซ่อนจากการค้นปกติแต่ไม่ลบ อ่านย้อนหลังได้ด้วยสิทธิ์ history — เรียกด้วย /tamra:archive <item_code> <เหตุผล> หรือ /tamra:archive <item_code> --undo [เหตุผล]
argument-hint: "<item_code> <เหตุผล> | <item_code> --undo [เหตุผล]"
disable-model-invocation: true
allowed-tools: mcp__plugin_tamra_kb__kb_admin, mcp__plugin_tamra_kb__kb_get
---

# /tamra:archive — archive or unarchive a Tamra KB item

Input: `$ARGUMENTS`

Uses `kb_admin` (needs `kb:admin` + tenant_admin, and membership of the item's space). If it is missing or FORBIDDEN, say so and stop.

1. The first token is the item code. `--undo` → `item_unarchive`; otherwise `item_archive`.
2. Reason: the rest of the input. If there is none for archive, ask for one sentence (it is kept in the audit log).
3. For archive, `kb_get` the item first (with `include_archived=true`) and show `ITEM-CODE rN — title` so the user sees what will be hidden; archive when the input already gave a reason, otherwise ask.
4. Call `kb_admin` with `action`, `item`, `reason`. Omit `idempotency_key`.
5. Report in Thai: lifecycle now, and that archived items are hidden from search and default reads (readers with history permission can still open them with `include_archived=true`); `changed=false` means it was already in that state.

Archive is reversible. To hide only one wrong revision, use `/tamra:withdraw` instead.
