---
name: analyze
description: Optional. Have other AI tools analyze the current system, a part of it, or a document side by side, then check their evidence and merge the findings into one summary. Can split the code into review units and review one unit at a time as built, sending the fixes the user picks into OpenSpec. No other step requires it.
disable-model-invocation: true
argument-hint: "<system | \"topic\" | @file | units | unit:<name>> [--basis built] [--focus <a,b>] [--to <tool,tool | any>] | <AN-NNN> [answers]"
---

What the system does now, what is missing, and what to improve, seen by more than one AI tool and checked against evidence. It is **optional**: nothing in mflow waits for it, the main flow continues while reports are out, and a project that never runs it loses nothing. The user runs the other tools; this skill writes the brief, then assesses and merges what comes back. The other tools never call mflow: `/mflow:*` runs only in Claude Code, and a tool gets everything it needs from the brief.

**As built** (`unit:<name>`, or `--basis built` on another scope): the tools learn the system from the code and what is lifted from it, not from the customer's sources or the decision docs, which changed while it was built. Then they check the code for wrong behaviour, missing logic and what to improve.

The steps shared with `/mflow:design` and `/mflow:challenge` are in `${CLAUDE_PLUGIN_ROOT}/skills/delegate/references/consultation.md`. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.

## Review units (`units`)

Not a consultation: it writes the plan that unit analyses use, `.mflow/review-units.json`. Claude splits the code from the files git tracks, never from what anyone remembers: a split made from memory leaves out the code every module shares.

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/review-units.mjs" draft`: module folders, files matched to a module by a name prefix (check each), the rest grouped by folder, suggested `notReviewed` groups, and the spec capabilities.
2. Write the plan:
   ```json
   { "version": 1,
     "units": [
       { "name": "supplier", "kind": "feature", "globs": ["apps/api/src/*/Modules/Supplier/**", "apps/api/tests/**/Supplier*"], "specs": ["supplier-master"], "neighbours": ["persistence"] },
       { "name": "persistence", "kind": "shared", "globs": ["apps/api/src/*/Persistence/**"] },
       { "name": "joins", "kind": "joins", "flows": [{ "name": "import → account → invite mail", "units": ["supplier", "auth", "mail"] }] } ],
     "notReviewed": [{ "globs": ["**/*.png"], "reason": "images" }] }
   ```
   - **feature** units take a module through every layer: API, application, domain, infrastructure, its tests, and its web pages and client code.
   - **shared** units own the code every unit uses: persistence and migrations, common API and application code, identity and security, integrations and background jobs, prototype and test-only endpoints, the UI kit, the web shells. Feature units name them in `neighbours`.
   - one **joins** unit lists the flows that cross units, from the call graph (codebase-memory-mcp `trace_path` when it is there) and from specs that name several capabilities. It owns no files.
   - **notReviewed** holds only files without logic (images, fonts, lockfiles, documents, specs, AI tool settings), each group with a reason the user can read. Never widen a group to make the check pass.
   - every spec capability, archived or in a change not yet archived, goes in some unit's `specs`.
   Globs match the whole repo-relative path: `*` stays in one folder, `**` crosses folders, `{a,b}` is either.
3. `node "${CLAUDE_PLUGIN_ROOT}/scripts/review-units.mjs" check` until `ok`, or until what it still lists is stated for the user.
4. Show the user: a table `หน่วย | ชนิด | ไฟล์ | spec | หน่วยข้างเคียง`, the notReviewed groups with reason and count, what `check` still lists, and an order to review in, riskiest first (just built, money, permissions, external systems, the largest). The user merges, splits or reorders; the plan is theirs to edit.

Done when: `check` is ok or the user accepted what it lists, and the user has the next command `/mflow:analyze unit:<name> --to <tools>`.

## Start (`<scope> [--basis built] [--focus …] [--to …]`)

1. **Scope.**
   - `system`: the whole project. Read first: AGENTS.md (architecture, domain vocabulary), `docs/vision.md`, `openspec/specs/`, the approved discussion docs; Scope: the source tree AGENTS.md describes. With `--basis built`, the as-built brief below instead.
   - `unit:<name>`: one unit of the plan, read as built. Without a plan, run `units` first.
   - a quoted topic, such as `"ระบบรับงานและจัดรถ"`: the files AGENTS.md and a code search point to, listed in the brief's Scope so the user can check them.
   - `@file`, such as `@docs/requirement.md`: that document, checked against the code and the customer's sources. Pass it as `--from <file>` too, so the session pins its hash.
   - `--focus` narrows the questions: workflow, data, permissions, performance, gaps, edge-cases, or the user's own words.
2. **Open:** `node "${CLAUDE_PLUGIN_ROOT}/scripts/consult.mjs" new analyze --scope "<scope>" [--basis built] [--focus …] [--to …] [--from <file>]`. For a unit, also `node "${CLAUDE_PLUGIN_ROOT}/scripts/review-units.mjs" facts <name> --out <the session's facts path>` and `check`: when `check` lists anything (a new folder in no unit, an unclaimed spec), say so and offer to update the plan; it never stops the analysis.
3. Steps A and B of the pipeline with the `consult-analyze` contract.

Done when: the brief is written, the user has every tool's command, and STATUS.md says the analysis is optional and the main work continues.

### The brief on the system as built

- **Read first**, in this order, each with its label:
  1. *Facts* (a unit only): the facts file. "Lifted from the code by a script at the commit it names: file list, test names, routes and endpoints, schema."
  2. *Agreed behaviour*: `openspec/specs/<cap>/spec.md` for the unit's `specs`, and `openspec/changes/<change>/specs/<cap>/spec.md` of changes not yet archived (`openspec list`). "Written by hand; may lag the code." Without the unarchived ones, the tools report the newest work as undocumented. For `system`, every spec.
  3. *Overview*: the architecture part of AGENTS.md, `docs/ui/screens.md` when it exists, and the data-model file AGENTS.md points to.
  4. *Scope*: the unit's files (the facts file lists them), and a neighbour's files only where the unit calls them. For the joins unit, each flow end to end.
- **Do not open**, verbatim, with the project's folders from `.mflow/config.json` (`sourceDir`, the folder above `discussDir` and `hotspotsDir`, `inboxDir`):
  ```
  Do not open:
  - docs/source/ — superseded by later changes; not the current system
  - docs/decisions/ (discussion docs, hotspots, decision log)
  - docs/vision.md
  - docs/ai/inbox/ — other tools' reports; keep your view independent
  - STATUS.md, docs/status-log.md, backlog/ — work logs, not system behaviour
  Specs cite sources in parentheses (e.g. "vision Q85", "UAT S15-06",
  "docs/decisions/discuss/07-supplier-data.md"). They are labels: do not open them.
  Where a spec and the code disagree, report it as a finding; neither side is assumed right.
  ```
- **Goal** adds the five types, and every finding carries `Type:`:
  - a: the spec says it, the code does not do it
  - b: the code does it, the spec does not say it
  - c: a logic fault whatever the spec says (permission check, state change, transaction and rollback, two users at once, validation, the error path)
  - d: a scenario with no test
  - e: missing logic or an improvement
- **Known**: for each summary in `previous`, its items the user set aside or chose not to fix, and its `## คำตัดสิน`, listed as known: "report again only with new evidence".

## Reports back (`AN-NNN`)

Step C of the pipeline (and D only for findings still disputed). For a unit session, normalize each report with `--unit <name>` too: the unit's files no report read (`coverage.unread`) go in `## ยังตรวจไม่ได้` with their count. The summary at `docs/ai/analysis/<id>/summary.md`, after the frontmatter the pipeline gives:
- `## ภาพรวมที่ตรวจแล้ว`: what the system does now, only what the evidence confirmed.
- `## ข้อค้นพบ`: table `ID | ข้อค้นพบ | หลักฐาน | จาก | คำตัดสิน | สถานะ`, every finding of every report, rejected ones included with the reason. As built, the table is `ID | ประเภท | ข้อค้นพบ | หลักฐาน | จาก | คำตัดสิน | ไปที่ | สถานะ`, with `ไปที่` from the rule in "Using the results as built": `OpenSpec`, `Backlog`, `ต้องตัดสิน Q<n>` or `ไม่แก้`.
- `## ต้องตัดสินก่อน` (as built): one `### Q<n> <question>` per decision the user must make first, with the findings that wait on it, the options (ก. ข. …), `**Claude แนะนำ:**`, `**ถ้าผิด:**` (what a wrong answer costs), and `ระดับ: เบา | หนัก` with the reason. Questions come from every type b (keep it and write it into the spec, or remove it), a spec–code conflict the evidence cannot settle, and a type e with real options. หนัก is the "hard to fix" bar: a schema, permissions, data the customer never mentioned, deleting, or sending anything outside the system. The rest are เบา.
- `## คำตัดสิน` (as built): each answer the user gives, with the date and "by the user".
- `## ความเห็นต่าง`: each position, who holds it, why, and what would settle it.
- `## ข้อเสนอเรียงตามลำดับ`: what to do, why, and which findings it answers; a confirmed finding is not yet an instruction to fix it.
- `## ยังตรวจไม่ได้`: what no report could verify, and how to find out.
- `## รายงานที่รวม`: each report, its tool, round and trust level.

Then step E: offer the routes, and act on the items the user picks. As built, step E's first row gives way to the next section.

Done when: every report is assessed, the summary lists every report in `reports:` (`consult.mjs status` shows `summarized`), and the user has one next command with the reason.

## Using the results as built (`AN-NNN <answers>`)

The user picks and answers in one line, such as `/mflow:analyze AN-003 แก้ F1,F3,F7; Q1=ก; ที่เหลือตามแนะนำ`, or in words. `ที่เหลือตามแนะนำ` takes Claude's recommendation for every question not answered. Write the answers under `## คำตัดสิน`, set each item's status, make a new revision, then carry it out without asking again:

1. **One question decides where a fix goes:** after the fix, does the spec still read true untouched?
   - No (type b kept, c, e): OpenSpec, with a spec delta. Every type c gets a scenario for its case, so it cannot break again unseen and the next round knows the rule.
   - Yes (type a, d, a type b removed, refactoring, faster with the same result): a task.
2. **One change per unit and round:** `/opsx:propose <unit>-review-fixes`. The proposal cites the summary path and revision and the finding ids; design.md names the code as it is now; the delta specs carry the "No" items; tasks.md carries every item, "Yes" ones included, each naming its finding. When every picked item is a "Yes", there is no change (OpenSpec refuses one without a delta): the batch is worked from Backlog on one branch, so the project's full test gate runs once.
3. **Backlog tracks the batch:** one task per batch, not one per finding, linked to the change. The summary's `สถานะ` points to the change or the task.
4. **New scope:** a type e that is new work beyond what was agreed goes through `/mflow:change-request` first, then its own change.
5. **Decisions:**
   - เบา, once answered, goes into the change. At propose, `rules.proposal` asks only the hard-to-fix questions not already in `## คำตัดสิน`.
   - หนัก goes to `/mflow:discuss <topic>` with the evidence and options from the summary. The unit's change goes ahead without the findings waiting on it, so one open question never holds up the unit's other fixes; they follow as a second change once the discussion is approved, or join the first change if it has not reached `/opsx:apply` yet.
   - A business rule still unclear, needing examples: `/mflow:hotspot`. A question only an experiment settles: a spike task with its hypothesis.
6. **Not fixed or later:** Backlog with the reason. The next analysis of the unit lists it as known.

Then the main flow as usual: `/opsx:apply` → `/mflow:test` → `/mflow:review` → `/opsx:archive`. The next round of the same unit (`/mflow:analyze unit:<name>`) reads the updated specs.

Done when: the answers are in `## คำตัดสิน`, every picked item has its change, task or discussion, and the user has one next command.
