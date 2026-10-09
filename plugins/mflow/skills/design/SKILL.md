---
name: design
description: Optional. Have other AI tools propose a design for a topic (a module, an API, a data model, a workflow) side by side, then check their evidence and merge them into one proposal with its alternatives and the decisions left to the user. No other step requires it.
disable-model-invocation: true
argument-hint: "\"<topic>\" [--from @file] [--focus <a,b>] [--to <tool,tool | any>] | <DS-NNN>"
---

How the system should be built or changed for a topic, proposed by more than one AI tool and checked against evidence. It is **optional**: no step of mflow needs it, it does not need `/mflow:analyze` first, and the main flow continues while reports are out. The user runs the other tools; this skill writes the brief, then assesses and merges what comes back.

The steps shared with `/mflow:analyze` and `/mflow:challenge` are in `${CLAUDE_PLUGIN_ROOT}/skills/delegate/references/consultation.md`. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.

## Start (`"<topic>" [--from …] [--focus …] [--to …]`)

1. **Scope.** Read first: AGENTS.md (`## Stack`, architecture, conventions, domain vocabulary), the approved discussion docs and `openspec/specs/` the topic touches, and the code it would change. `--from @file` adds a starting point, such as an analysis summary (`docs/ai/analysis/AN-NNN/summary.md`) or a requirement section, and the session pins its hash. `--focus` names what matters most: api, data, permissions, failure-recovery, migration, performance, or the user's own words.
2. **Open:** `node "${CLAUDE_PLUGIN_ROOT}/scripts/consult.mjs" new design --scope "<topic>" [--from <file>] [--focus …] [--to …]`, then steps A and B of the pipeline with the `consult-design` contract.

Done when: the brief is written, the user has every tool's command, and STATUS.md says the design consultation is optional and the main work continues.

## Reports back (`DS-NNN`)

Step C of the pipeline (and D only for points still disputed). Write `docs/ai/design/<id>/proposal.md`, in Thai for the user, after the frontmatter the pipeline gives plus `status: proposed` (`selected` once the user picks it, `superseded` when a later design replaces it):
- `## ปัญหาและขอบเขต`: goal, constraints, out of scope.
- `## แบบที่แนะนำ`: the merged design, only as deep as the topic needs, every element labelled `[เสนอ: <tool>]` or `[อนุมาน]` unless it has evidence. A picture follows `${CLAUDE_PLUGIN_ROOT}/skills/discuss/references/visuals.md`.
- `## ทางเลือก`: every alternative a report argued for, keeping the current structure among them when a tool proposed it, with who proposed it and when it wins.
- `## สิทธิ์ ความล้มเหลว และการทำงานพร้อมกัน`, `## trade-offs`, `## การย้ายจากระบบเดิม`, `## เกณฑ์ตรวจรับ`: as far as the reports and the evidence reach.
- `## ข้อที่คุณต้องตัดสินใจ`: each open choice with its options and a recommendation; the user's answer is the customer's.
- `## ความเห็นต่าง` and `## รายงานที่รวม`, as the pipeline describes.

With two or more alternatives still in the running, also write `docs/ai/design/<id>/comparison.md`: a table of the criteria that decide between them, one column per alternative, each cell citing the report or evidence behind it.

The proposal changes nothing by itself: not the code, not `openspec/specs/`. Then step E: a chosen design that changes behaviour goes to `/opsx:propose <change>` citing the proposal and its revision; open choices may go to `/mflow:discuss <topic>` with this evidence; `/mflow:challenge @docs/ai/design/<id>/proposal.md` is offered as an optional check before building, never as a requirement.

Done when: every report is assessed, `proposal.md` lists every report in `reports:` (`consult.mjs status` shows `summarized`), and the user has one next command with the reason.
