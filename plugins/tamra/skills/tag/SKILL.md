---
name: tag
description: จัดการ tag ใน taxonomy ของ Tamra knowledge base ผ่าน kb_admin — สร้าง tag (ระดับ tenant หรือราย space), เพิ่ม alias, เลิกใช้ tag — เพื่อให้ tag ไม่ถูกย้ายไปเป็น keyword — เรียกด้วย /tamra:tag list | /tamra:tag <code> [label] [alias1,alias2] [space:<code>] | /tamra:tag <code> alias <a,b> | /tamra:tag <code> deprecate
argument-hint: "list | <code> [label] [alias1,alias2] [space:<code>] | <code> alias <a,b> [space:<code>] | <code> deprecate [space:<code>]"
disable-model-invocation: true
allowed-tools: mcp__plugin_tamra_kb__kb_admin, mcp__plugin_tamra_kb__kb_overview
---

# /tamra:tag — manage Tamra KB tags

Input: `$ARGUMENTS`

Uses `kb_admin` (needs `kb:admin` + tenant_admin). If it is missing or FORBIDDEN, say so and stop.

- **`list` or empty** → `kb_overview` with `include=["tags"]` (add `space` when `space:<code>` is given); show tag codes, labels and usage.
- **`<code> [label] [aliases] [space:<code>]`** → `tag_create`. Code: short lowercase words joined by `-` (e.g. `payment`, `ef-core`); label: from the input, else a readable form of the code; aliases: comma-separated alternative spellings (Thai/English/abbreviations), each also lowercase. Without `space:` the tag works in every space.
  Before creating, check `kb_overview` tags for a near-duplicate (same meaning, other spelling); if one exists, suggest `alias` on it instead and ask.
- **`<code> alias <a,b> [space:<code>]`** → `tag_alias_add`.
- **`<code> deprecate [space:<code>]`** → `tag_deprecate` (items keep the tag; new saves turn it into a keyword). Confirm first.

Every change needs `reason` (one sentence from the user's words). Omit `idempotency_key`. CONFLICT means the code or an alias is taken: show which and offer the alternative.
Report in Thai: the tag, its aliases and scope, and that `/tamra:save` now keeps it as a tag.
