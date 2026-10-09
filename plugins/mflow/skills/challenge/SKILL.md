---
name: challenge
description: Optional. Have other AI tools try to break a design or document before it is built (counterexamples, failure scenarios, weak assumptions), then check each challenge against evidence and merge them into one summary. No other step requires it.
disable-model-invocation: true
argument-hint: "@<file> [--focus <a,b>] [--to <tool,tool | any>] | <CH-NNN>"
---

What would go wrong if this design were built as written, or what it leaves unanswered, found by more than one AI tool and checked against evidence. It is **optional**: no step of mflow needs it, the target may come from `/mflow:design` or from anywhere else, and the main flow continues while reports are out. Unlike `/mflow:review`, which checks a code diff, it works on a design before there is code. The user runs the other tools; this skill writes the brief, then assesses and merges what comes back.

The steps shared with `/mflow:analyze` and `/mflow:design` are in `${CLAUDE_PLUGIN_ROOT}/skills/delegate/references/consultation.md`. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.

## Start (`@<file> [--focus …] [--to …]`)

1. **Target.** Any project file that states a design or a decision: a design proposal (`docs/ai/design/DS-NNN/proposal.md`), a discussion doc, an OpenSpec change, a hotspot's `rules.md`, a requirement section. Read first: the target, then the sources, specs and code it rests on. `--focus` names where to push: permissions, concurrency, recovery, data integrity, scale, edge cases, or the user's own words.
2. **Open:** `node "${CLAUDE_PLUGIN_ROOT}/scripts/consult.mjs" new challenge --target <file> [--focus …] [--to …]`, which pins the target's hash, then steps A and B of the pipeline with the `consult-challenge` contract. The brief names the target with that hash.

Done when: the brief is written, the user has every tool's command, and STATUS.md says the challenge is optional and the main work continues.

## Reports back (`CH-NNN`)

Step C of the pipeline (and D only for challenges still disputed). When `consult.mjs status` lists the target under `stale.changed`, the target was edited after the session opened: say so, and check each challenge against the current text, giving `outdated` to the ones the edit already answered.

Write `docs/ai/challenge/<id>/summary.md`, in Thai for the user, after the frontmatter the pipeline gives plus `target:` and `targetHash:` (the session's snapshot):
- `## เป้าหมาย`: the target, the version the tools read, and the areas the brief pushed on.
- `## ข้อทักท้วง`: table `ID | ข้อความที่ถูกทักท้วง | สถานการณ์ | ผลที่ควรเป็น → สิ่งที่ผิดพลาด | หลักฐาน | จาก | คำตัดสิน | สถานะ`, every challenge of every report, rejected ones included with the reason.
- `## ส่วนที่ตรวจแล้วยังยืน`: what the tools examined and found holding.
- `## ข้อเสนอการทดสอบและการแก้`: the tests that would settle each open challenge, and the changes to the target.
- `## ความเห็นต่าง` and `## รายงานที่รวม`, as the pipeline describes.

The summary keeps no copy of the target. Link back without editing what must not change: when the target is a design proposal mflow wrote (`docs/ai/design/DS-NNN/proposal.md`), add one line under its `## ความเห็นต่าง`: `ถูกทักท้วงใน docs/ai/challenge/<id>/summary.md`. Never edit an approved or frozen discussion doc, `openspec/specs/`, or a document the user wrote; the session and the summary hold the link there.

Then step E: a confirmed failure becomes a change to the target on the user's instruction (a new revision of the proposal, a new discussion doc, or an OpenSpec change), a suggested test becomes an acceptance scenario or a test task, and an open question goes to `/mflow:discuss` or `/mflow:hotspot`.

Done when: every report is assessed, the summary lists every report in `reports:` (`consult.mjs status` shows `summarized`), and the user has one next command with the reason.
