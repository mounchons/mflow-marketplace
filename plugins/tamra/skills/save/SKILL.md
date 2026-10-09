---
name: save
description: บันทึกความรู้จากบทสนทนาปัจจุบัน (วิธีแก้บั๊ก, pattern, การตัดสินใจ, how-to) ลง Tamra knowledge base (plugin tamra) แล้ว publish — เรียกด้วย /tamra:save [space] [สิ่งที่จะบันทึก] [--draft]
argument-hint: "[space] [สิ่งที่จะบันทึก] [--draft]"
disable-model-invocation: true
allowed-tools: mcp__plugin_tamra_kb__kb_overview, mcp__plugin_tamra_kb__kb_template, mcp__plugin_tamra_kb__kb_search, mcp__plugin_tamra_kb__kb_get, mcp__plugin_tamra_kb__kb_save
---

# /tamra:save — save knowledge to Tamra KB

Input: `$ARGUMENTS`

1. **Space.** If the input starts with a space code, use it. Known spaces: `dev-patterns` (reusable dev knowledge), `estamphub` (EStampHub work), `notes` (general; agents can only save drafts there). Otherwise choose from the work context, and call `kb_overview` when unsure. If still unclear, ask with the options. A space that does not exist (NOT_FOUND): if `kb_overview` reports `capabilities.admin=true`, offer to create it with `kb_admin` `action=space_create` (show the inferred prefix, which cannot change later, and ask once), then save; otherwise ask the Tamra owner to create it (`/tamra:space`).
2. **What to save.** The rest of the input, or, when empty, the main reusable finding of this conversation (bug cause + fix, pattern, decision, procedure). Use only facts from the conversation, the code or cited sources; never invent details. If there is nothing worth saving, say so and stop.
3. **Kind.** Pick one: software-dev `bug_fix`, `pattern`, `architecture`, `api_contract`, `data_model`, `runbook`; core `note`, `howto`, `reference`, `decision`, `glossary`, `checklist`, `handoff` (needs `expires_at`, future UTC). Call `kb_template` for that kind and space to get the metadata schema, section headings and allowed tags.
4. **Search first.** Call `kb_search` in that space with the key terms (Thai and English). If an existing item already covers it, show it and ask: update it (`/tamra:update <item_code> ...`) or create a separate item.
5. **Build the payload.**
   - `title`: short and specific (≤ 300 chars); `summary`: 1–2 sentences (≤ 300 chars).
   - `content`: Markdown with `#` headings that follow the template sections; include commands, code and error text verbatim where they matter.
   - `metadata`: fill what the schema requires from facts you have.
   - `keywords`: 5–15 terms mixing Thai, English and identifiers (each ≤ 100 chars, total with unknown tags ≤ 20); `questions`: 2–5 questions this item answers, phrased as a user would ask.
   - `tags`: only from the template's taxonomy (others become keywords). If the user explicitly wants a missing tag and `capabilities.admin=true`, offer `kb_admin` `action=tag_create` (or `/tamra:tag`) first; never create tags on your own initiative.
   - `sources`: `{"type":"conversation","uri":"conversation <YYYY-MM-DD> <project>"}` plus any URLs (`type":"url"`) or documents (`"type":"manual"`) that were actually used.
   - `publish`: `true`, unless the input contains `--draft` or the space is `notes`.
   - Omit `idempotency_key`.
6. **Call `kb_save`** and handle errors:
   - `POSSIBLE_DUPLICATE` → show the candidates and ask: update one of them, or create anyway (`confirm_new=true` + `confirmation_reason` in the user's words).
   - `HUMAN_ACTION_REQUIRED` / `POLICY_REQUIRES_REVIEW` → save again with `publish=false` and explain that a human must publish it.
   - `VALIDATION_FAILED` → apply `error.fix` and retry once.
   - Any other error → show code, message, fix and `request_id`; do not loop.
7. **Report** in Thai, short: `ITEM-CODE rN` (status), space, kind, title, and only the hints worth acting on.
