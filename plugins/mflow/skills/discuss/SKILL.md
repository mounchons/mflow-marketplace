---
name: discuss
description: Write Claude's understanding or proposed design of one topic (roles and permissions, menus, data visibility, org structure…) as a numbered doc in docs/discuss for the user to review, optionally have other AI tools (Codex, OpenCode, Gemini…) analyze it side by side, revise it from the user's replies until it matches, then approve it and merge each agreed item into the main flow. Also keeps docs/discuss/AGENDA.md, the recommended list of topics worth discussing.
disable-model-invocation: true
argument-hint: "[<topic> [@files] | <NN> [feedback] | <NN> consult [--to <tool>,…] | <NN> approve | <NN> drop <reason> | agenda [skip <slug> <reason>]]"
---

A discussion doc checks one thing: does Claude's reading of the sources, or its proposed design for a topic, match what the user has in mind? The doc lays out every statement, marks the ones Claude inferred or proposed, and shows concrete scenarios. The user replies until nothing is open, then approves. Only then do its items flow into vision, AGENTS.md, hotspots, decisions and tasks. The best time is right after `/mflow:capture` and before `/mflow:screen inventory`, while a misunderstanding costs one paragraph instead of ten screens.

How it differs from its neighbours:
- **`/mflow:hotspot`** works out a business rule that needs many answers or worked examples, one ticket per session. A discussion doc may spawn hotspot rows; it never replaces them.
- **`/mflow:review-notes`** records what came out of testing and review. A discussion doc records what the user agreed with Claude before building.
- **`/opsx:explore`** thinks through one change to build. A discussion doc settles understanding before any change exists.

Other AI tools can join the discussion (`consult`). Each one analyzes the doc independently. Their picks and findings appear in the doc next to Claude's, and the user decides. Claude checks their evidence but does not choose among their judgments.

**The user's approval is the customer's agreement.** The user is whoever drives the project: an SA, a PM or the system owner. What they answer, and what they tell Claude to do, counts as the customer's direct instruction, so no item waits for the customer to confirm it again. The way forward is build first, test it in use, then refine: a choice the user is unsure of is still answered (Claude's recommendation is a fine answer), and section 5 lists what to look at when the prototype or the first slice is tried. A correction found in testing is the next doc or the next OpenSpec change, not a failure of this one.

Registry commands (run from the repo root):
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" list`: every doc with its status, revision, open decisions, pending notes and unprocessed tool reports, plus the next free number.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" check <NN>`: the open decisions (a `### D<n>` with no answer line counts), decision problems (two answer lines, a D number used twice, a letter that is not one of the options), missing or empty sections 1 to 7, missing frontmatter (title, status, revision), pending notes, unfilled template placeholders, an unclosed code fence, and unprocessed tool reports (`pendingReports`, matched by `discuss-<NN>` in the report's brief id or file name) of one doc, and whether it is ready to approve. It also counts the pictures (`visuals`) and warns about mermaid labels that will not parse (`mermaidWarnings`); neither blocks approval.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" new <slug> --title "<Thai title>" --sources "<file>, <file>"`: creates `docs/discuss/NN-<slug>.md` from [assets/discussion.md](assets/discussion.md). The slug is ASCII kebab-case. The script never overwrites, and refuses a slug that still has an open draft. A frozen doc's slug can be reused for the doc that follows it. It also syncs the agenda, and reports `onAgenda: false` when the slug has no row there.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" cited <NN>`: every line outside the discussion folder and the AI inbox that cites the doc's path, Backlog tasks included through their ref; approve reads it to resume without writing anything twice.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" agenda`: rewrites the สถานะ cells of `docs/discuss/AGENDA.md` from the docs (the newest doc with a row's slug wins; with no doc, a status written by hand is kept), and reports `topics` and `warnings`. It changes nothing else, and does nothing when the file does not exist. `agenda init` creates the file from [assets/agenda.md](assets/agenda.md) first. `list` includes the same view without writing.

Reply markers, explained to the user at the top of every doc:
- **Decision answer:** text after `**เลือก:**` under a `### D<n>: ...` heading. An empty answer means the decision is open.
- **Note:** a line starting with `> ความเห็น:`. It stays pending until a revision processes it.

Only the user writes these markers. Docs written before mflow 0.13 use `**พี่ปูเลือก:**`, `> พี่ปู:` and the tag `[พี่ปู]`; `check` reads the markers the same way. In such a doc, relabel only the open answer lines to `**เลือก:**` in the next revision and log it; leave answered lines, old tags and earlier log entries as written.

The doc is written in Thai for the user and addresses them as คุณ. Status lives only in its frontmatter: `draft`, `approved`, `superseded` or `dropped`.

## Mode: no arguments → overview

Run `list` and show one table: number, title, status, revision, open decisions, pending notes, tool reports waiting. Then show the agenda from the same output: the topics not started, in the agenda's order, each with its reason in one line and its `/mflow:discuss <slug>` command, then any approved topic with a **ทบทวน:** note. Say plainly that it is a recommendation. With no agenda, say that `/mflow:discuss agenda` builds one. Stop.

## Mode: new topic (`<topic>` matches no existing doc and is not `agenda`)

1. **Scope it.** Choose the slug and a Thai title, and confirm both with the user; a topic the user already named needs no second confirmation. When the topic is on the agenda, use that row's slug. A topic split into two docs gets a row for each new slug, and the original row's status becomes แยกเป็น followed by the new slugs in backticks. A topic not on the agenda gets a row after `new` reports `onAgenda: false`, so the agenda stays the index of every topic. If the row carries a **ทบทวน:** note, remove the note once the new doc exists. Check `list` and `docs/hotspots/INDEX.md` for overlap. A single business rule that needs worked examples is a hotspot: say so and stop. A topic too big for ~200 lines becomes two docs; propose the split. Data-dictionary rows and fenced blocks (diagrams, wireframes) do not count toward that cap; a data-model doc covers one aggregate and lists every column.
2. **Gather evidence.** Named `@files` first. Then the active files in `docs/source/INDEX.md`; never use superseded ones. Then `docs/vision.md`, the Domain vocabulary in AGENTS.md, `docs/ui/screens.md` if it exists, relevant hotspot `rules.md`, and `docs/reviews/`. Read only the sections the topic touches. For `tech-stack` and `code-structure`, also read AGENTS.md `## Stack`, the code already in the repo, and a team knowledge base when one is connected, in the order of sources that topics.md gives for them. A named file that `source-index.mjs scan` reports as `new` or `changed` has not been triaged yet. Follow `${CLAUDE_PLUGIN_ROOT}/skills/capture/SKILL.md` for it first. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.
3. **Create and write.** Run `new`, then fill every section of the template, using the topic's checklist in [references/topics.md](references/topics.md):
   - Tag every statement: `[ที่มา: <file> §<section>]`, `[ยืนยัน]` (the user said or confirmed it), `[อนุมาน]`, `[เสนอ]`, or `[เสนอ: <tool>]` for a suggestion from another AI tool that Claude has checked. An untagged statement looks like fact; tag it or cut it.
   - Section 8 says "ยังไม่ได้ขอ" until a consult.
   - Answer each checklist item in the doc, or turn it into a decision, or a line under "ไม่รวมในเรื่องนี้". Skip none silently.
   - **Decisions (section 4)** hold every choice the sources leave open. The user answers them all on the customer's behalf; none is parked for the customer. Give 2 to 4 options with trade-offs and Claude's recommendation, and leave `**เลือก:**` empty. Label the options `a)`, `b)`, `c)`, `d)`, never ก ข ค: the heading is `D1` and the answer should be typed without switching keyboard language. Recommendations, tool picks, pictures per option and the revision log refer to options by the same letter.
   - **Scenarios** use named example people and include at least one edge case. They are how the user spots a wrong assumption fastest.
   - **Section 5** lists up to five checks to try when the prototype or first slice is used: what to try, on which screen, as which example user, and what should appear. Favour the costliest `[อนุมาน]` and `[เสนอ]` items and any decision answered provisionally. "ไม่มี" is a valid answer.
   - **Pictures**, following [references/visuals.md](references/visuals.md) and the topic's Visuals line in topics.md. "ภาพรวม" in section 3 opens with at least one: a mermaid diagram, a wireframe, or a real screenshot from `docs/ui/screens/` once the screen exists. A decision whose options look or flow differently gets one small picture per option. Mark inferred or proposed parts in the label, and add the legend line under the picture. A picture never holds a fact the text lacks. Fix every `mermaidWarnings` entry, and render with mermaid-cli if it is installed.
   - **Section 7** previews the destinations from the merge table below, so the user sees what approval will change.
   - A format or pattern with Thai text in angle brackets (`INV-<ปี พ.ศ.>-<เลขรัน>`) goes in backticks; bare, `check` counts it as an unfilled placeholder.
4. **Register use.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/source-index.mjs" mark <file> --used-by discuss-<NN>` for each source file used.
5. **Hand it over.** Give the user the path, the three `[อนุมาน]` or `[เสนอ]` items that are most costly if wrong, and the open decisions. Remind them how to reply, and that `/mflow:discuss <NN> consult` brings other AI tools in. Set STATUS.md `## Now` to "waiting for the user to review docs/discuss/NN-<slug>.md". Stop. Nothing is merged before approval.

Done when: `check <NN>` reports no `placeholderLines` and no `mermaidWarnings`, `visuals` shows at least one picture (or "ภาพรวม" says in one line why none helps), every checklist item is placed, and the user has the path.

## Mode: consult (`<NN> consult [--to <tool>[,<tool>…]]`)

Other AI tools think through the same doc independently, like a panel. The user runs them, reads every view side by side, and makes the choices.

1. **Gate.** The doc is a `draft`, and `check` reports no `placeholderLines`, because a half-written doc wastes every tool's time. Process pending `> ความเห็น:` notes first (revise mode), so the tools read the current understanding.
2. **Readable sources.** Other tools must check the doc against the customer's documents, not against the doc itself. For every file in the doc's `sources`, make sure a text version exists:
   - `.md`, `.txt`, `.csv`, `.json`: readable as they are.
   - `.docx`, `.xlsx`, `.pdf`: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/source-index.mjs" cache <files>` for the text-version path of each. The path changes whenever the file does, so `exists: false` means there is none for this version, even if an older one was made. Convert those: `.docx` as `/mflow:capture` does (pandoc, or python-docx); `.xlsx` to one Markdown table per sheet the doc relies on, via python (pandas/openpyxl), noting merged cells and formulas; `.pdf` to its text (pdftotext, or python pypdf), noting scanned pages whose text could not be extracted. Begin each with the line `/mflow:capture` describes (source, tool, date, what did not convert). A text version that lacks a sheet this doc relies on gets that sheet added.
   Create only the missing ones, and list the text versions in the brief's Read first and in any context pack. A source with no text version is named in the brief as unreadable, so a tool does not guess at it.
3. **Brief.** Follow steps 1, 2 and 4 of `${CLAUDE_PLUGIN_ROOT}/skills/delegate/SKILL.md` with subject `discuss-<NN>-r<revision>`, mode `analyze`, and the "discuss" output contract. One brief serves every tool: use `--to any` unless the user named tools. With several named tools, run `delegate-cmd.mjs` once per tool on the same brief. The output path is `docs/ai-inbox/<date>-{tool}-discuss-<NN>-r<revision>.md`. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.
4. **Hand over.** Show each tool's command (PowerShell and Bash), and the context pack for chat tools. The user runs whichever tools they want, then types `/mflow:discuss <NN>` when the reports are in. Record the awaited reports in STATUS.md `## Now`. Stop; the doc does not change in this mode.

A second round is a second consult after revising. The brief carries the new revision, and the tools see section 8, so they can answer each other's points.

Done when: the brief exists, every tool has a command with its own output path, and STATUS.md names the awaited reports.

## Mode: revise (`<NN>` with or without feedback text)

1. Run `check <NN>`. Collect the pending `> ความเห็น:` notes, the newly answered decisions, any feedback given in `$ARGUMENTS`, and the `pendingReports` from other tools. A doc that is not `draft` is frozen: stop and point to the new-doc route under Approve step 5. A report that arrives for a frozen doc goes to the user as a possible later change of mind; mark it `status: assessed` with a one-line note.
2. **Fold in the tool reports**, all in one pass, so the user sees the tools side by side:
   - Normalize each report with `node "${CLAUDE_PLUGIN_ROOT}/scripts/inbox-normalize.mjs" <file> --mode analyze --brief <brief id>`, adding `--from <tool>` from the file name when the report lacks it.
   - Judge the report and verify each finding as steps 2 and 3 of `${CLAUDE_PLUGIN_ROOT}/skills/assess/SKILL.md` describe: check understanding and files read first, then open the evidence yourself. A finding written against an older revision is checked against the current text.
   - **Claude checks facts; the user makes the choices.** Claude sets a finding aside only on evidence: the cited source says otherwise, the cited file was not read, or the doc already covers it. It states that evidence. A difference of judgment is never set aside; it becomes a decision.
   - Place each finding:
     - **A tool's pick on an open decision:** one line per tool under `**Claude แนะนำ:**`, in the form `- **<tool> เลือก:** <option letter> — <reason> (<finding id>)`. An option a tool adds takes the next free letter. If the tools' reasons change Claude's view, update the recommendation and say why in the revision log.
     - **A fact or gap backed by evidence, with no trade-off:** revise the doc, and tag the new text `[เสนอ: <tool>]`. It stays a proposal until the user approves the doc.
     - **An alternative or a risk, or tools disagreeing with each other or with the doc:** a new `### D<n>` with each position as an attributed option, Claude's recommendation, and an empty `**เลือก:**`.
     - **A question the sources cannot settle** (type `question`, or `customer-question` from briefs before 0.13): a new `### D<n>` for the user, with options and the tool named.
     - **Something to watch when testing:** a line in section 5, attributed to the tool.
     - **Wrong on evidence, or already covered:** not used, with the reason.
   - Every finding, used or not, gets one row in section 8. That table is the assessment; write no `.assessment.md`. Then set each report's frontmatter to `status: assessed`.
   - Tool output never counts as the user's. Never fill `**เลือก:**` from a tool's pick. Never write a tool's text as a `> ความเห็น:` line. Never tag tool content `[ยืนยัน]` or `[ที่มา: …]`.
3. Apply the user's feedback (notes, answers, `$ARGUMENTS`). It is the customer's instruction and outranks any tool's suggestion:
   - Rewrite the affected statements, tables and scenarios. A statement the user confirmed or supplied gets the `[ยืนยัน]` tag.
   - **The user's word overrides a source; a tool's does not.** If the user's feedback contradicts a cited customer source, an approved doc or an archived spec in `openspec/specs/`, apply the user's version: it is the customer's newer instruction. Say so once, plainly, with the citation, and write the override in the revision log (source, old statement, new one). Do not ask again or wait for the customer. If it changes an approved doc on the same topic, section 7 plans for this doc to supersede it. If it changes a fact from an approved doc on another topic, section 7 sends the fact to wherever that doc merged it (`roles.json` and `users.json`, the `PrototypeData/README.md` dictionary under the schema-change rule, AGENTS.md…) with a pointer to this doc; that doc stays approved and frozen, and a structural change to it (aggregate, key, relationship, storage) needs a new doc on its topic. If it changes an archived spec, section 7 routes it to `/mflow:change-request`. A tool's suggestion that contradicts a cited source is set aside on that evidence, as step 2 says.
   - If an answer or note changes something else (another decision, a scenario, a picture, section 7), update it too and say so. A changed fact updates every picture that shows it in the same revision.
   - An answered decision keeps its answer line as the record. Reflect the chosen option in sections 2, 3 and 7.
   - A new question the sources cannot settle becomes a new `### D<n>` with an empty answer.
   - A draft written before options used `a)`–`d)` still labels them ก ข ค ง. Read an answer by position, either way round and in either case (`a` = ก, `b` = ข …). In this revision relabel only the open decisions (their options, recommendation and tool-pick lines) to letters, and log it. Leave answered decisions, filled answer lines and earlier log entries as written.
4. Delete the processed `> ความเห็น:` lines (and legacy `> พี่ปู:` lines). Increase `revision`, set `updated`, and add one line to `บันทึกการแก้ไข`: `rev N (<date>): <what changed, and which note, decision or tool finding caused it>`.
5. Run `check <NN>` again. Report the changes in three to six lines, plus what is still open. After tool reports, add one line per tool (findings used, new decisions, not used) and name the points where the tools disagree. If nothing is open, say the doc can be approved with `/mflow:discuss <NN> approve`.

Done when: `check` shows no pending notes or reports, every feedback item and tool finding is in the revision log or section 8, and the user has the list of remaining open items.

## Mode: approve (`<NN> approve`)

1. **Gate.** `check <NN>` must report `readyToApprove`. If not, list what it reports (open decisions, decision problems, missing or empty sections, missing frontmatter, notes, placeholder lines, an unclosed fence, unprocessed tool reports), and stop. An open decision cannot be approved by default.
2. **Merge table.** Sort every agreed item into exactly one destination, using the table below, and show it before writing anything:

   | Agreed item | Destination |
   |---|---|
   | Roles and their main job | `docs/vision.md` Users and roles |
   | Customer term | Domain vocabulary in AGENTS.md |
   | Which role sees which menu or screen | `docs/ui/screens.md` Role(s) column if the file exists; otherwise `/mflow:screen inventory` reads this doc later |
   | Per-role permissions, data scope, hidden fields, landing page | the prototype's `PrototypeData/roles.json` and `users.json`, with this doc and its revision in `PrototypeData/README.md`. If the prototype does not exist yet, `/mflow:theme` builds them from this doc; if it does, update them now under the schema-change rule in `${CLAUDE_PLUGIN_ROOT}/skills/screen/references/prototype-data.md` |
   | Rule with conditions that crosses screens (data scope, field masking, approval limits) | a row in `docs/hotspots/INDEX.md` if it still needs many answers or worked examples; else a candidate `/opsx:propose` change |
   | Tables, columns, relations, keys and indexes (data-model doc) | this aggregate's section in `PrototypeData/README.md` (create the file if it is missing), written now. It is the living data dictionary until the aggregate is built, and it cites this doc and its revision. If `PrototypeData/<entity>.json` already exists, align its fields under the schema-change rule; otherwise `/mflow:screen` creates the JSON rows from the README section with the first screen that shows the entity. At build time, the `/opsx:propose` change links this doc and the README |
   | Apps, frameworks and versions, libraries with their licences, database, containers (tech-stack doc) | AGENTS.md `## Stack`: the profile and every seam path (updated when they differ from the profile `/mflow:init` recorded), and the Apps and Libraries tables. `## Commands` lines for a changed stack are marked `(unverified)` until they are run again |
   | An extra left for later, with its trigger | the Later line of AGENTS.md `## Stack` |
   | Folder layout, projects and the reference direction (code-structure doc) | AGENTS.md `## Architecture` (solution layout, the rule "references point inward"); creating the solution is a Backlog task or an `/opsx:propose` change |
   | Architecture, enforcement or storage choice (fixed vs configurable roles, where scope is enforced, key type, soft delete, enum vs lookup table, child table vs JSON; a library over its alternative, a paid licence) | `backlog decision create`, plus one line in AGENTS.md Conventions if every agent must follow it |
   | Durable constraint | one line in AGENTS.md |
   | Scope or release line | `docs/vision.md` story map |
   | Out of scope | `docs/vision.md` Out of scope |
   | Check from section 5 (skip when it says ไม่มี) | one Backlog task per doc, label `prototype`, title `ทดสอบใช้งาน: <doc title>`, `--ref docs/discuss/NN-<slug>.md`, each check an acceptance criterion (`--ac`). The next test or review ticks them off (`/mflow:review-notes`) |
   | Work to do | a Backlog task with `--ref docs/discuss/NN-<slug>.md` |
   | Changes something already built (archived in `openspec/specs/`) | a candidate for `/mflow:change-request`, which records the impact and goes ahead on the user's instruction; never a plain task |
   | Changes an approved doc on the same topic, not built yet | this doc supersedes it at step 4 |
   | Changes a fact from an approved doc on another topic | the destination that doc merged the fact into, with `(docs/discuss/NN-<slug>.md)`. That doc stays approved; never supersede it from another topic |

   Point to the doc instead of copying it: a destination gets the short fact plus `(docs/discuss/NN-<slug>.md)`. A picture travels with the facts it shows: the `erDiagram` goes into the aggregate's section of `PrototypeData/README.md` beside the dictionary, and a status `stateDiagram-v2` goes into the hotspot's `rules.md` when one is created. Every other picture stays in the frozen doc.
3. **Write** as soon as the table is shown: `approve` is the user's go-ahead for every row, so do not ask again. Stop only for an item the table cannot place, and ask about that item alone. Create Backlog items through the CLI only, each with `--ref docs/discuss/NN-<slug>.md`.
   **A rerun finishes, it never repeats.** An approve can stop partway (the context runs out, a CLI fails), and the doc stays `draft` until step 4, so `/mflow:discuss <NN> approve` runs again. Before writing, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" cited <NN>`: it lists every line outside the discussion folder and the AI inbox that cites this doc, Backlog tasks included through their ref. In the table, a row whose fact is already at its destination, citing this doc, is marked `มีแล้ว` and skipped; one whose destination cites the doc with different text is brought in line with the doc. Say in the summary which rows an earlier run had written.
4. **Freeze.** Set the frontmatter: `status: approved`, `approved: <date>`, `merged-into: <comma-separated destinations>`. An approved doc on the same topic that this one replaces gets `status: superseded` and `superseded-by: <NN>`. Add this line under the title: `> อนุมัติแล้ว <date> และนำไปรวมกับ flow หลักแล้ว เอกสารนี้เป็นบันทึกเหตุผล ความจริงปัจจุบันอยู่ที่ปลายทางในหัวข้อ 7`. Run `agenda` so the topic's row shows the approval. Update STATUS.md with a log entry.
5. **Later changes of mind** never edit a frozen doc:
   - Field-level changes after a data-model doc is approved (add, rename or drop a column; change its length or whether it is required) are not a change of mind. They follow the schema-change rule in `PrototypeData/README.md`.
   - Nothing is built yet: start a new doc on the same topic, and cite the old one in section 1. When the new doc is approved, set the old one to `status: superseded` and `superseded-by: <NN>`.
   - Already built: use `/mflow:change-request`. It records the impact and goes ahead on the user's instruction.

**What comes next:** tell the user where the agreed items went, and one next command: the next not-started topic on the agenda (`/mflow:discuss <slug>`), or the next step of the flow this doc unblocks (`/mflow:theme`, `/mflow:screen inventory`, `/mflow:theme update access`, a screen). Write it into STATUS.md `## Now`.

Done when: every agreed item exists at its destination, the doc is frozen, STATUS.md records the approval, and the user has the next command.

## Mode: agenda (`agenda`, `agenda <feedback>`, `agenda skip <slug> <reason>`)

`docs/discuss/AGENDA.md` recommends the topics worth a discussion doc, with the reason for each and when to have it. It is advice, never a gate: no skill waits for it, and the user may take any topic in any order, or none. `/mflow:capture` and `/mflow:screen inventory` add rows as documents and screens arrive. This mode builds it from everything at once, which is how a project captured before mflow 0.15 gets one, and how the user asks for a fresh look.

1. Run `agenda init`. It creates the file from [assets/agenda.md](assets/agenda.md) if it is missing and never overwrites it.
2. **Gather.** The active files in `docs/source/INDEX.md` (never superseded ones), `docs/vision.md`, the Domain vocabulary in AGENTS.md, `docs/hotspots/INDEX.md`, `docs/ui/screens.md` if it exists, and the docs in `list`. Read only the sections a topic needs.
3. **Choose the topics.** `tech-stack` and `code-structure` always stay as rows 1 and 2 (the template starts with them), unless the user skips them. Then take each other topic in [references/topics.md](references/topics.md), and any cross-cutting topic particular to this project. A topic earns a row when the sources leave it open to more than one reading, contradict each other, or say nothing about something the scope needs (approvals in scope, but no approver named). A topic the sources settle clearly gets no row.
4. **Write each row** as the template shows:
   - **หัวข้อ:** a Thai title with the slug in backticks: the topics.md name (`access-control`, `numbering`…), `<aggregate>-data` for a data model, or the split slugs topics.md suggests. The slug becomes the doc's slug.
   - **ทำไมควรคุย:** the statement that makes it ambiguous, tagged `[ที่มา: <file> §<section>]`, and what a misreading costs (every screen, the schema, an integration).
   - **ควรคุยก่อน:** `ก่อน /mflow:screen inventory` for what shapes every screen (roles and data visibility, org structure, menus); `ก่อนหน้าจอแรกของ <กลุ่มข้อมูล>` for a data model or a numbering scheme; `ก่อน /opsx:propose <change>` for integrations, notifications, audit, import and export, and migration.
   - **#:** the order to take them in: by that stage, then by cost.
   - **สถานะ:** leave it empty; the script fills it.
5. **Refresh, never erase.** On an existing agenda keep every row and any status written by hand (`ข้าม: …`, `แยกเป็น …`). Add new topics, add new evidence to a row's reason, and renumber. A row with no doc whose reason no longer holds (its source was superseded by one that settles it) gets `ไม่จำเป็นแล้ว: <why>` as its status; rows are never deleted.
6. Show the rows and write them in the same turn: the agenda is advice, and the user reorders, reworks or skips rows afterwards with `agenda <feedback>` or `agenda skip`. Then run `agenda` and fix every entry in its `warnings`.

`agenda skip <slug> <reason>`: write `ข้าม: <reason>` in that row's status; the user's word is enough. A doc started later on that slug replaces the skip with its own status. `agenda <feedback>`: apply it to the rows the same way.

Done when: every row has a slug the script accepts, a cited reason and a stage, `agenda` reports no warnings, and the user has the file's path and the first topic to take.

## Mode: drop (`<NN> drop <reason>`)

Set `status: dropped`, add the reason to the revision log, and run `agenda`. Nothing is merged. Use it when the topic turned out to be a hotspot, or when it was folded into another doc; name that hotspot or doc.
