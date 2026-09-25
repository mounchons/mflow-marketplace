---
name: discuss
description: Write Claude's understanding or proposed design of one topic (roles and permissions, menus, data visibility, org structure…) as a numbered doc in docs/discuss for พี่ปู to review, optionally have other AI tools (Codex, OpenCode, Gemini…) analyze it side by side, revise it from พี่ปู's replies until it matches, then approve it and merge each agreed item into the main flow.
disable-model-invocation: true
argument-hint: "[<topic> [@files] | <NN> [feedback] | <NN> consult [--to <tool>,…] | <NN> approve | <NN> drop <reason>]"
---

A discussion doc checks one thing: does Claude's reading of the sources, or its proposed design for a topic, match what พี่ปู has in mind? The doc lays out every statement, marks the ones Claude inferred or proposed, and shows concrete scenarios. พี่ปู replies until nothing is open, then approves. Only then do its items flow into vision, AGENTS.md, hotspots, decisions and tasks. The best time is right after `/mflow:source` and before `/mflow:screen inventory`, while a misunderstanding costs one paragraph instead of ten screens.

How it differs from its neighbours:
- **`/mflow:hotspot`** works out a business rule that needs customer answers or worked examples, one ticket per session. A discussion doc may spawn hotspot rows; it never replaces them.
- **`/mflow:review-notes`** records what the customer said. A discussion doc records what พี่ปู agreed with Claude.
- **`/opsx:explore`** thinks through one change to build. A discussion doc settles understanding before any change exists.

Other AI tools can join the discussion (`consult`). Each one analyzes the doc independently. Their picks and findings appear in the doc next to Claude's, and พี่ปู decides. Claude checks their evidence but does not choose among their judgments.

**พี่ปู's approval is not the customer's agreement.** Questions only the customer can answer stay questions. At merge they go to `docs/vision.md` Open questions or a hotspot `ask` ticket. The customer confirms through the prototype review and the `/mflow:review-notes` summary email.

Registry commands (run from the repo root):
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" list`: every doc with its status, revision, open decisions, pending notes and unprocessed tool reports, plus the next free number.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" check <NN>`: the open decisions, pending notes, unfilled template placeholders and unprocessed tool reports (`pendingReports`, matched by `discuss-<NN>` in the report's brief id or file name) of one doc, and whether it is ready to approve.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" new <slug> --title "<Thai title>" --sources "<file>, <file>"`: creates `docs/discuss/NN-<slug>.md` from [assets/discussion.md](assets/discussion.md). The slug is ASCII kebab-case. The script never overwrites, and refuses a slug that still has an open draft. A frozen doc's slug can be reused for the doc that follows it.

Reply markers, explained to พี่ปู at the top of every doc:
- **Decision answer:** text after `**พี่ปูเลือก:**` under a `### D<n>: ...` heading. An empty answer means the decision is open.
- **Note:** a line starting with `> พี่ปู:`. It stays pending until a revision processes it.

Only พี่ปู writes these markers.

The doc is written in Thai for พี่ปู. Status lives only in its frontmatter: `draft`, `approved`, `superseded` or `dropped`.

## Mode: no arguments → overview

Run `list` and show one table: number, title, status, revision, open decisions, pending notes, tool reports waiting. Then suggest up to three topics that have no doc yet. Take them from [references/topics.md](references/topics.md) where the active sources (`docs/source/INDEX.md`) leave room for interpretation, and give one line of evidence for each. Stop.

## Mode: new topic (`<topic>` matches no existing doc)

1. **Scope it.** Choose the slug and a Thai title, and confirm both with พี่ปู. Check `list` and `docs/hotspots/INDEX.md` for overlap. A single business rule that needs customer examples is a hotspot: say so and stop. A topic too big for ~200 lines becomes two docs; propose the split.
2. **Gather evidence.** Named `@files` first. Then the active files in `docs/source/INDEX.md`; never use superseded ones. Then `docs/vision.md`, the Domain vocabulary in AGENTS.md, `docs/ui/screens.md` if it exists, relevant hotspot `rules.md`, and `docs/reviews/`. Read only the sections the topic touches. A named file that `source-index.mjs scan` reports as `new` or `changed` has not been triaged yet. Follow `${CLAUDE_PLUGIN_ROOT}/skills/source/SKILL.md` for it first. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.
3. **Create and write.** Run `new`, then fill every section of the template, using the topic's checklist in [references/topics.md](references/topics.md):
   - Tag every statement: `[ที่มา: <file> §<section>]`, `[พี่ปู]`, `[อนุมาน]`, `[เสนอ]`, or `[เสนอ: <tool>]` for a suggestion from another AI tool that Claude has checked. An untagged statement looks like fact; tag it or cut it.
   - Section 8 says "ยังไม่ได้ขอ" until a consult.
   - Answer each checklist item in the doc, or turn it into a decision, a customer question, or a line under "ไม่รวมในเรื่องนี้". Skip none silently.
   - **Decisions (section 4)** are only for choices พี่ปู can make without the customer. Give 2 to 4 options with trade-offs and Claude's recommendation, and leave `**พี่ปูเลือก:**` empty. Choices only the customer can make go in section 5.
   - **Scenarios** use named example people and include at least one edge case. They are how พี่ปู spots a wrong assumption fastest.
   - **Section 7** previews the destinations from the merge table below, so พี่ปู sees what approval will change.
   - A format or pattern with Thai text in angle brackets (`INV-<ปี พ.ศ.>-<เลขรัน>`) goes in backticks; bare, `check` counts it as an unfilled placeholder.
4. **Register use.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/source-index.mjs" mark <file> --used-by discuss-<NN>` for each source file used.
5. **Hand it over.** Give พี่ปู the path, the three `[อนุมาน]` or `[เสนอ]` items that are most costly if wrong, and the open decisions. Remind them how to reply, and that `/mflow:discuss <NN> consult` brings other AI tools in. Set STATUS.md `## Now` to "waiting for พี่ปู to review docs/discuss/NN-<slug>.md". Stop. Nothing is merged before approval.

Done when: `check <NN>` reports no `placeholderLines`, every checklist item is placed, and พี่ปู has the path.

## Mode: consult (`<NN> consult [--to <tool>[,<tool>…]]`)

Other AI tools think through the same doc independently, like a panel. พี่ปู runs them, reads every view side by side, and makes the choices.

1. **Gate.** The doc is a `draft`, and `check` reports no `placeholderLines`, because a half-written doc wastes every tool's time. Process pending `> พี่ปู:` notes first (revise mode), so the tools read the current understanding.
2. **Readable sources.** Other tools must check the doc against the customer's documents, not against the doc itself. For every file in the doc's `sources`, make sure a text version exists:
   - `.md`, `.txt`, `.csv`, `.json`: readable as they are.
   - `.docx`: `.mflow/cache/<name>.md`, converted as `/mflow:source` does (pandoc, or python-docx).
   - `.xlsx`: `.mflow/cache/<name>.md` with one Markdown table per sheet the doc relies on, via python (pandas/openpyxl). Note merged cells and formulas.
   - `.pdf`: `.mflow/cache/<name>.md` with its text (pdftotext, or python pypdf). Scanned pages get a note that their text could not be extracted.
   Create only the missing ones, and list the text versions in the brief's Read first and in any context pack. A source with no text version is named in the brief as unreadable, so a tool does not guess at it.
3. **Brief.** Follow steps 1, 2 and 4 of `${CLAUDE_PLUGIN_ROOT}/skills/delegate/SKILL.md` with subject `discuss-<NN>-r<revision>`, mode `analyze`, and the "discuss" output contract. One brief serves every tool: use `--to any` unless พี่ปู named tools. With several named tools, run `delegate-cmd.mjs` once per tool on the same brief. The output path is `docs/ai-inbox/<date>-{tool}-discuss-<NN>-r<revision>.md`. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.
4. **Hand over.** Show each tool's command (PowerShell and Bash), and the context pack for chat tools. พี่ปู runs whichever tools they want, then types `/mflow:discuss <NN>` when the reports are in. Record the awaited reports in STATUS.md `## Now`. Stop; the doc does not change in this mode.

A second round is a second consult after revising. The brief carries the new revision, and the tools see section 8, so they can answer each other's points.

Done when: the brief exists, every tool has a command with its own output path, and STATUS.md names the awaited reports.

## Mode: revise (`<NN>` with or without feedback text)

1. Run `check <NN>`. Collect the pending `> พี่ปู:` notes, the newly answered decisions, any feedback given in `$ARGUMENTS`, and the `pendingReports` from other tools. A doc that is not `draft` is frozen: stop and point to the new-doc route under Approve step 5. A report that arrives for a frozen doc goes to พี่ปู as a possible later change of mind; mark it `status: assessed` with a one-line note.
2. **Fold in the tool reports**, all in one pass, so พี่ปู sees the tools side by side:
   - Normalize each report with `node "${CLAUDE_PLUGIN_ROOT}/scripts/inbox-normalize.mjs" <file> --mode analyze --brief <brief id>`, adding `--from <tool>` from the file name when the report lacks it.
   - Judge the report and verify each finding as steps 2 and 3 of `${CLAUDE_PLUGIN_ROOT}/skills/assess/SKILL.md` describe: check understanding and files read first, then open the evidence yourself. A finding written against an older revision is checked against the current text.
   - **Claude checks facts; พี่ปู makes the choices.** Claude sets a finding aside only on evidence: the cited source says otherwise, the cited file was not read, or the doc already covers it. It states that evidence. A difference of judgment is never set aside; it becomes a decision.
   - Place each finding:
     - **A tool's pick on an open decision:** one line per tool under `**Claude แนะนำ:**`, in the form `- **<tool> เลือก:** <option> — <reason> (<finding id>)`. If the tools' reasons change Claude's view, update the recommendation and say why in the revision log.
     - **A fact or gap backed by evidence, with no trade-off:** revise the doc, and tag the new text `[เสนอ: <tool>]`. It stays a proposal until พี่ปู approves the doc.
     - **An alternative or a risk, or tools disagreeing with each other or with the doc:** a new `### D<n>` with each position as an attributed option, Claude's recommendation, and an empty `**พี่ปูเลือก:**`.
     - **Only the customer can answer it:** a question in section 5, attributed to the tool.
     - **Wrong on evidence, or already covered:** not used, with the reason.
   - Every finding, used or not, gets one row in section 8. That table is the assessment; write no `.assessment.md`. Then set each report's frontmatter to `status: assessed`.
   - Tool output never counts as พี่ปู's. Never fill `**พี่ปูเลือก:**` from a tool's pick. Never write a tool's text as a `> พี่ปู:` line. Never tag tool content `[พี่ปู]` or `[ที่มา: …]`.
3. Apply พี่ปู's feedback (notes, answers, `$ARGUMENTS`). It outranks any tool's suggestion:
   - Rewrite the affected statements, tables and scenarios. A statement พี่ปู confirmed or supplied gets the `[พี่ปู]` tag.
   - **Never trade a source for agreement.** If feedback contradicts a cited customer source, keep the cited statement. Write the conflict in the revision log with the citation, and add it to section 5 as a customer question. Tell พี่ปู plainly. The same goes for feedback that contradicts an approved doc or an archived spec in `openspec/specs/`.
   - If an answer or note changes something else (another decision, a scenario, section 7), update it too and say so.
   - An answered decision keeps its answer line as the record. Reflect the chosen option in sections 2, 3 and 7.
   - A new question that only พี่ปู can answer becomes a new `### D<n>` with an empty answer.
4. Delete the processed `> พี่ปู:` lines. Increase `revision`, set `updated`, and add one line to `บันทึกการแก้ไข`: `rev N (<date>): <what changed, and which note, decision or tool finding caused it>`.
5. Run `check <NN>` again. Report the changes in three to six lines, plus what is still open. After tool reports, add one line per tool (findings used, new decisions, not used) and name the points where the tools disagree. If nothing is open, say the doc can be approved with `/mflow:discuss <NN> approve`.

Done when: `check` shows no pending notes or reports, every feedback item and tool finding is in the revision log or section 8, and พี่ปู has the list of remaining open items.

## Mode: approve (`<NN> approve`)

1. **Gate.** `check <NN>` must report `readyToApprove`. If not, list the open decisions, notes, placeholder lines and unprocessed tool reports, and stop. An open decision cannot be approved by default.
2. **Merge table.** Sort every agreed item into exactly one destination, using the table below, and show it before writing anything:

   | Agreed item | Destination |
   |---|---|
   | Roles and their main job | `docs/vision.md` Users and roles |
   | Customer term | Domain vocabulary in AGENTS.md |
   | Which role sees which menu or screen | `docs/ui/screens.md` Role(s) column if the file exists; otherwise `/mflow:screen inventory` reads this doc later |
   | Per-role permissions, data scope, hidden fields, landing page | the prototype's `PrototypeData/roles.json` and `users.json`, with this doc and its revision in `PrototypeData/README.md`. If the prototype does not exist yet, `/mflow:theme` builds them from this doc; if it does, update them now under the schema-change rule in `${CLAUDE_PLUGIN_ROOT}/skills/screen/references/prototype-data.md` |
   | Rule with conditions that crosses screens (data scope, field masking, approval limits) | a row in `docs/hotspots/INDEX.md` if it still needs customer answers or examples; else a candidate `/opsx:propose` change |
   | Architecture or enforcement choice (fixed vs configurable roles, where scope is enforced) | `backlog decision create`, plus one line in AGENTS.md Conventions if every agent must follow it |
   | Durable constraint | one line in AGENTS.md |
   | Scope or release line | `docs/vision.md` story map |
   | Out of scope | `docs/vision.md` Out of scope |
   | Customer question from section 5 | `docs/vision.md` Open questions (owner: customer, due date), or an `ask` ticket on the hotspot it belongs to |
   | Work to do | a Backlog task with `--ref docs/discuss/NN-<slug>.md` |
   | Changes something the customer already approved or that is already built | a candidate for `/mflow:change-request`; never a plain task |

   Point to the doc instead of copying it: a destination gets the short fact plus `(docs/discuss/NN-<slug>.md)`.
3. **Write** after พี่ปู says yes. Create Backlog items through the CLI only.
4. **Freeze.** Set the frontmatter: `status: approved`, `approved: <date>`, `merged-into: <comma-separated destinations>`. Add this line under the title: `> อนุมัติแล้ว <date> และนำไปรวมกับ flow หลักแล้ว เอกสารนี้เป็นบันทึกเหตุผล ความจริงปัจจุบันอยู่ที่ปลายทางในหัวข้อ 7`. Update STATUS.md with a log entry.
5. **Later changes of mind** never edit a frozen doc:
   - Nothing is built yet: start a new doc on the same topic, and cite the old one in section 1. When the new doc is approved, set the old one to `status: superseded` and `superseded-by: <NN>`.
   - Already built, or already confirmed with the customer: use `/mflow:change-request`.

Done when: every agreed item exists at its destination, the doc is frozen, and STATUS.md records the approval.

## Mode: drop (`<NN> drop <reason>`)

Set `status: dropped` and add the reason to the revision log. Nothing is merged. Use it when the topic turned out to be a hotspot, or when it was folded into another doc; name that hotspot or doc.
