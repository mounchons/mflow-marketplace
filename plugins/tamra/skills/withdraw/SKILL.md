---
name: withdraw
description: ถอน (withdraw) revision ที่ publish แล้วแต่ผิดหรือไม่ควรเผยแพร่ ใน Tamra knowledge base ผ่าน kb_admin — กลับคืนไม่ได้ การอ่านปกติจะ fallback ไปฉบับก่อนหน้า — เรียกด้วย /tamra:withdraw <item_code> rN <เหตุผล>
argument-hint: "<item_code> rN <เหตุผล>"
disable-model-invocation: true
allowed-tools: mcp__plugin_tamra_kb__kb_get, mcp__plugin_tamra_kb__kb_history
---

# /tamra:withdraw — withdraw a published Tamra KB revision

Input: `$ARGUMENTS`

Withdraw is **irreversible**: the revision stays for audit and for readers with history permission, but is never served as current again. `kb_admin` is deliberately not pre-approved here, so Claude Code asks before the call.

1. Parse the item code, the revision (`rN` or a number) and the reason. Ask for anything missing; the reason is required (one sentence, kept in the audit log and in the withdraw event).
2. `kb_history` the item and show the revisions with status, so the user sees which one is current and what default reads will fall back to after the withdraw. Only `published` revisions can be withdrawn.
3. Ask for an explicit yes, naming `ITEM-CODE rN`, then call `kb_admin` with `action=revision_withdraw`, `item`, `revision_no`, `reason`. Omit `idempotency_key`.
4. Report in Thai: `current_published_revision_no` after the withdraw, any `NO_PUBLISHED_REVISION` warning (the item disappears from search until a new revision is published), and that a correction is published with `/tamra:update`.

If the whole item should disappear from search, `/tamra:archive` is the reversible option.
