---
name: analyze
description: Optional. Have other AI tools analyze the current system, a part of it, or a document side by side, then check their evidence and merge the findings into one summary. No other step requires it.
disable-model-invocation: true
argument-hint: "<system | \"topic\" | @file> [--focus <a,b>] [--to <tool,tool | any>] | <AN-NNN>"
---

What the system does now, what is missing, and what to improve, seen by more than one AI tool and checked against evidence. It is **optional**: nothing in mflow waits for it, the main flow continues while reports are out, and a project that never runs it loses nothing. The user runs the other tools; this skill writes the brief, then assesses and merges what comes back.

The steps shared with `/mflow:design` and `/mflow:challenge` are in `${CLAUDE_PLUGIN_ROOT}/skills/delegate/references/consultation.md`. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.

## Start (`<scope> [--focus …] [--to …]`)

1. **Scope.**
   - `system`: the whole project. Read first: AGENTS.md (architecture, domain vocabulary), `docs/vision.md`, `openspec/specs/`, the approved discussion docs; Scope: the source tree AGENTS.md describes.
   - a quoted topic, such as `"ระบบรับงานและจัดรถ"`: the files AGENTS.md and a code search point to, listed in the brief's Scope so the user can check them.
   - `@file`, such as `@docs/requirement.md`: that document, checked against the code and the customer's sources. Pass it as `--from <file>` too, so the session pins its hash.
   - `--focus` narrows the questions: workflow, data, permissions, performance, gaps, edge-cases, or the user's own words.
2. **Open:** `node "${CLAUDE_PLUGIN_ROOT}/scripts/consult.mjs" new analyze --scope "<scope>" [--focus …] [--to …] [--from <file>]`, then steps A and B of the pipeline with the `consult-analyze` contract.

Done when: the brief is written, the user has every tool's command, and STATUS.md says the analysis is optional and the main work continues.

## Reports back (`AN-NNN`)

Step C of the pipeline (and D only for findings still disputed). The summary at `docs/ai/analysis/<id>/summary.md`, after the frontmatter the pipeline gives:
- `## ภาพรวมที่ตรวจแล้ว`: what the system does now, only what the evidence confirmed.
- `## ข้อค้นพบ`: table `ID | ข้อค้นพบ | หลักฐาน | จาก | คำตัดสิน | สถานะ`, every finding of every report, rejected ones included with the reason.
- `## ความเห็นต่าง`: each position, who holds it, why, and what would settle it.
- `## ข้อเสนอเรียงตามลำดับ`: what to do, why, and which findings it answers; a confirmed finding is not yet an instruction to fix it.
- `## ยังตรวจไม่ได้`: what no report could verify, and how to find out.
- `## รายงานที่รวม`: each report, its tool, round and trust level.

Then step E: offer the routes, and act on the items the user picks.

Done when: every report is assessed, the summary lists every report in `reports:` (`consult.mjs status` shows `summarized`), and the user has one next command with the reason.
