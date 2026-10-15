---
name: discuss
description: Write Claude's understanding or proposed design of one topic (the tech stack, the code structure, the quality expected, security and personal data, or a topic the user names) as a numbered doc in mreq/discuss for the user to review, revise it from the user's replies until it matches, then approve it and merge each agreed item into AGENTS.md and mreq/project. Also keeps mreq/discuss/AGENDA.md, the recommended list of topics.
disable-model-invocation: true
argument-hint: "[<topic> [@files] | <NN> [feedback] | <NN> approve | <NN> drop <reason> | agenda [skip <slug> <reason>]]"
---

A discussion doc checks one thing: does Claude's reading of the sources, or its proposed design for a topic, match what the user has in mind? The doc lays out every statement, marks the ones Claude inferred or proposed, and shows concrete scenarios. The user replies until nothing is open, then approves. Only then do its items flow into AGENTS.md, the vision and the follow-ups. The best time for the four foundation topics (`tech-stack`, `code-structure`, `nfr`, `security-privacy`) is right after `/mreq:init` and before `/mreq:theme`, while a misunderstanding costs one paragraph instead of a rebuilt kit.

The checklists live in [references/topics.md](references/topics.md). This phase of mreq holds the four foundation topics there. A topic the user names that is not in topics.md still gets a doc by the same method: find what the sources leave open, answer what they settle with a tag, and turn every open choice into a decision.

**The user's approval is the customer's agreement.** The user is whoever drives the project: an SA, a PM or the system owner. What they answer, and what they tell Claude to do, counts as the customer's direct instruction, so no item waits for the customer to confirm it again. The way forward is build first, test it in use, then refine: a choice the user is unsure of is still answered (Claude's recommendation is a fine answer), and section 5 lists what to look at when the system is tried. A correction found in testing is the next doc on the topic, not a failure of this one.

Registry commands (run from the project root):
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" list`: every doc with its status, revision, open decisions and pending notes, the next free number, and the agenda with live statuses.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" check <NN>`: the open decisions (a `### D<n>` with no answer line counts), decision problems (two answer lines, a D number used twice, a letter that is not one of the options), missing or empty sections 1 to 7, missing frontmatter (title, status, revision), pending notes, unfilled template placeholders and an unclosed code fence of one doc, and whether it is ready to approve. It also counts the pictures (`visuals`) and warns about mermaid labels that will not parse (`mermaidWarnings`); neither blocks approval.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" new <slug> --title "<Thai title>" --sources "<file>, <file>"`: creates `mreq/discuss/NN-<slug>.md` from [assets/discussion.md](assets/discussion.md). The slug is ASCII kebab-case. The script never overwrites, and refuses a slug that still has an open draft. A frozen doc's slug can be reused for the doc that follows it. It also syncs the agenda, and reports `onAgenda: false` when the slug has no row there.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" cited <NN>`: every line outside `mreq/discuss/` and `.mreq/` that cites the doc's path; approve reads it to resume without writing anything twice.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" agenda`: rewrites the สถานะ cells of `mreq/discuss/AGENDA.md` from the docs (the newest doc with a row's slug wins; with no doc, a status written by hand is kept), and reports `topics` and `warnings`. It changes nothing else, and does nothing when the file does not exist. `agenda init` creates the file from [assets/agenda.md](assets/agenda.md) first. `list` includes the same view without writing.

Reply markers, explained to the user at the top of every doc:
- **Decision answer:** text after `**เลือก:**` under a `### D<n>: ...` heading. An empty answer means the decision is open.
- **Note:** a line starting with `> ความเห็น:`. It stays pending until a revision processes it.

Only the user's answers go on `**เลือก:**` lines: typed by the user in the file, or given in chat (`/mreq:discuss 01 D1 a, D2 b`) and copied there by Claude with `(ตอบในแชต <date>)`. Never fill one from Claude's own recommendation. Only the user writes `> ความเห็น:` lines.

The doc is written in Thai for the user and addresses them as คุณ. Status lives only in its frontmatter: `draft`, `approved`, `superseded` or `dropped`. Progress goes into `mreq/project/STATUS.md`.

## Mode: no arguments → overview

Run `list` and show one table: number, title, status, revision, open decisions, pending notes. Then show the agenda from the same output: the topics not started, in the agenda's order, each with its reason in one line and its `/mreq:discuss <slug>` command, then any approved topic with a **ทบทวน:** note. Say plainly that it is a recommendation. With no agenda, say that `/mreq:discuss agenda` builds one. Stop.

## Mode: new topic (`<topic>` matches no existing doc and is not `agenda`)

1. **Scope it.** Choose the slug and a Thai title, and confirm both with the user; a topic the user already named needs no second confirmation. When the topic is on the agenda, use that row's slug. A topic split into two docs gets a row for each new slug, and the original row's status becomes แยกเป็น followed by the new slugs in backticks. A topic not on the agenda gets a row after `new` reports `onAgenda: false`, so the agenda stays the index of every topic. If the row carries a **ทบทวน:** note, remove the note once the new doc exists. Check `list` for overlap with an existing doc. A topic too big for ~200 lines becomes two docs; propose the split. A single business rule that needs many answers or worked examples is too narrow for a discussion doc: say so, add it to `## Open questions` in `mreq/project/vision.md`, and tell the user that charting rules comes with a later phase of mreq.
2. **Gather evidence**, in this order, reading only the sections the topic touches:
   - Named `@files` first, then the customer's files in `mreq/source/`. Read `.md`, `.txt`, `.csv` and `.json` as they are. For `.docx`, `.xlsx` and `.pdf`, make a text version in a temporary folder outside `mreq/` (for example `.mreq/cache/`): `.docx` with pandoc or python-docx, `.xlsx` as one Markdown table per sheet the topic relies on (python with pandas or openpyxl, noting merged cells and formulas), `.pdf` with pdftotext or python pypdf. Note in the doc anything that did not convert, such as scanned pages; never guess at it.
   - `mreq/project/vision.md`, then AGENTS.md (`## Stack`, `## Architecture`, `## Domain vocabulary`, `## Conventions`), then approved docs on neighbouring topics (`list`, status `approved`).
   - For `tech-stack` and `code-structure`, also the code already in the repo and a team knowledge base when one is connected, in the order of sources that topics.md gives.
3. **Create and write.** Run `new` (with `--sources` naming the files used), then fill every section of the template, using the topic's checklist in topics.md:
   - Tag every statement: `[ที่มา: <file> §<section>]`, `[ที่มา: brain <note title>]` for a team standard, `[ยืนยัน]` (the user said or confirmed it), `[อนุมาน]` or `[เสนอ]`. An untagged statement looks like fact; tag it or cut it.
   - Answer each checklist item in the doc, or turn it into a decision, or a line under "ไม่รวมในเรื่องนี้". Skip none silently.
   - **Decisions (section 4)** hold every choice the sources leave open. The user answers them all on the customer's behalf; none is parked for the customer. Give 2 to 4 options with trade-offs and Claude's recommendation, and leave `**เลือก:**` empty. Label the options `a)`, `b)`, `c)`, `d)`, never ก ข ค: the heading is `D1` and the answer should be typed without switching keyboard language. Recommendations, pictures per option and the revision log refer to options by the same letter.
   - **Project name:** a code-structure doc written while AGENTS.md says `Project name (code): TODO` makes it a decision with three suggestions and one recommended, as `${CLAUDE_PLUGIN_ROOT}/skills/init/references/project-name.md` describes. Files opened with Read are not substituted: where a file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.
   - **Scenarios** use named example people and include at least one edge case. They are how the user spots a wrong assumption fastest.
   - **Section 5** lists up to five checks to try when the system is tried: what to try, on which screen or app, as which example user, and what should appear. Favour the costliest `[อนุมาน]` and `[เสนอ]` items and any decision answered provisionally. "ไม่มี" is a valid answer.
   - **Pictures**, following [references/visuals.md](references/visuals.md) and the topic's Visuals line in topics.md. "ภาพรวม" in section 3 opens with at least one: a mermaid diagram, a folder tree or a wireframe. A decision whose options look or flow differently gets one small picture per option. Mark inferred or proposed parts in the label, and add the legend line under the picture. A picture never holds a fact the text lacks. Fix every `mermaidWarnings` entry, and render with mermaid-cli if it is installed.
   - **Section 7** previews the destinations from the merge table below, so the user sees what approval will change.
   - A format or pattern with Thai text in angle brackets (`INV-<ปี พ.ศ.>-<เลขรัน>`) goes in backticks; bare, `check` counts it as an unfilled placeholder.
4. **Hand it over.** Give the user the path, the three `[อนุมาน]` or `[เสนอ]` items that are most costly if wrong, and the open decisions. Remind them how to reply: a letter after `**เลือก:**` in the file, `> ความเห็น:` lines, or `/mreq:discuss <NN> D1 a, D2 b` in chat. Set `## Now` in `mreq/project/STATUS.md` to "waiting for the user to review mreq/discuss/NN-<slug>.md". Stop. Nothing is merged before approval.

Done when: `check <NN>` reports no `placeholderLines` and no `mermaidWarnings`, `visuals` shows at least one picture (or "ภาพรวม" says in one line why none helps), every checklist item is placed, and the user has the path.

## Mode: revise (`<NN>` with or without feedback text)

1. Run `check <NN>`. Collect the pending `> ความเห็น:` notes, the newly answered decisions, and any feedback or answers given in `$ARGUMENTS`. A doc that is not `draft` is frozen: stop and point to the new-doc route under Approve step 6.
2. Apply the user's feedback. It is the customer's instruction:
   - Copy answers given in chat onto their `**เลือก:**` lines, with `(ตอบในแชต <date>)`.
   - Rewrite the affected statements, tables, scenarios and pictures. A statement the user confirmed or supplied gets the `[ยืนยัน]` tag.
   - **The user's word overrides a source.** If the user's feedback contradicts a cited customer source or an approved doc, apply the user's version: it is the customer's newer instruction. Say so once, plainly, with the citation, and write the override in the revision log (source, old statement, new one). Do not ask again or wait for the customer. If it changes an approved doc on the same topic, section 7 plans for this doc to supersede it. If it changes a fact from an approved doc on another topic, section 7 sends the fact to wherever that doc merged it (AGENTS.md, `mreq/project/vision.md`…) with a pointer to this doc; that doc stays approved and frozen.
   - If an answer or note changes something else (another decision, a scenario, a picture, section 7), update it too and say so. A changed fact updates every picture that shows it in the same revision.
   - An answered decision keeps its answer line as the record. Reflect the chosen option in sections 2, 3 and 7.
   - A new question the sources cannot settle becomes a new `### D<n>` with an empty answer.
3. Delete the processed `> ความเห็น:` lines. Increase `revision`, set `updated`, and add one line to `บันทึกการแก้ไข`: `rev N (<date>): <what changed, and which note or decision caused it>`.
4. Run `check <NN>` again. Report the changes in three to six lines, plus what is still open. If nothing is open, say the doc can be approved with `/mreq:discuss <NN> approve`.

Done when: `check` shows no pending notes, every feedback item is in the revision log, and the user has the list of remaining open items.

## Mode: approve (`<NN> approve`)

1. **Gate.** `check <NN>` must report `readyToApprove`. If not, list what it reports (open decisions, decision problems, missing or empty sections, missing frontmatter, notes, placeholder lines, an unclosed fence), and stop. An open decision cannot be approved by default.
2. **Project name.** When the doc settles app names or the solution layout and AGENTS.md still says `Project name (code): TODO` with no answer in the doc, ask it now, as `${CLAUDE_PLUGIN_ROOT}/skills/init/references/project-name.md` describes, before writing anything; the answer goes into `## Stack` with the rest.
3. **Merge table.** Sort every agreed item into exactly one destination, using the table below, and show it before writing anything:

   | Agreed item | Destination |
   |---|---|
   | Apps, kinds, users, folders, frameworks and versions, release (tech-stack doc) | AGENTS.md `## Stack`: the Apps table (App, Kind, Users, Folder, Technology (version), Release) |
   | Libraries and images with their licences (tech-stack doc) | AGENTS.md `## Stack`: the libraries table, with the date each licence was checked |
   | An extra left for later, with its trigger (tech-stack doc) | the `Later, when needed` line of AGENTS.md `## Stack` |
   | The project name in code | the `Project name (code)` line of AGENTS.md `## Stack` |
   | Folder layout, app names, reference direction, bounded contexts (code-structure doc) | AGENTS.md `## Architecture`, the folder tree as a `text` block |
   | Creating the solution, its folders and shared packages | a line under `## For the builder` in `mreq/project/followups.md` |
   | Users, volume, speed, availability, backup, devices and acceptance sizes, languages (nfr doc) | `## Quality expected` in `mreq/project/vision.md` |
   | A security or personal-data rule every agent and builder must follow (security-privacy doc) | one line per rule in AGENTS.md `## Conventions`; the detail stays in this doc |
   | Roles and their main job | `## Users and roles` in `mreq/project/vision.md` |
   | Customer term | AGENTS.md `## Domain vocabulary` |
   | Scope or release line | the story map in `mreq/project/vision.md` |
   | Out of scope | `## Out of scope` in `mreq/project/vision.md` |
   | Durable constraint | one line in AGENTS.md `## Conventions` |
   | Check from section 5 (skip when it says ไม่มี) | one line per check under `## Check when testing` in `mreq/project/followups.md` |
   | Work for the builder | a line under `## For the builder` in `mreq/project/followups.md` |
   | Changes an approved doc on the same topic | this doc supersedes it at step 5 |
   | Changes a fact from an approved doc on another topic | the destination that doc merged the fact into, with this doc's path. That doc stays approved; never supersede it from another topic |
   | Anything else | a line in `mreq/project/followups.md` with this doc's path |

   Point to the doc instead of copying it: a destination gets the short fact plus `(mreq/discuss/NN-<slug>.md)`. The folder tree of a code-structure doc travels into `## Architecture`, because it is the layout itself; every other picture stays in the frozen doc. Write AGENTS.md only inside its own sections; leave alone any section a tool set up later has added.
4. **Write** as soon as the table is shown: `approve` is the user's go-ahead for every row, so do not ask again. Stop only for an item the table cannot place, and ask about that item alone.
   **A rerun finishes, it never repeats.** An approve can stop partway (the context runs out, a write fails), and the doc stays `draft` until step 5, so `/mreq:discuss <NN> approve` runs again. Before writing, run `cited <NN>`: it lists every line outside `mreq/discuss/` and `.mreq/` that cites this doc. In the table, a row whose fact is already at its destination, citing this doc, is marked `มีแล้ว` and skipped; one whose destination cites the doc with different text is brought in line with the doc. Say in the summary which rows an earlier run had written.
5. **Freeze.** Set the frontmatter: `status: approved`, `approved: <date>`, `merged-into: <comma-separated destinations>`. An approved doc on the same topic that this one replaces gets `status: superseded` and `superseded-by: <NN>`. Add this line under the title: `> อนุมัติแล้ว <date> และนำไปรวมกับเอกสารหลักแล้ว เอกสารนี้เป็นบันทึกเหตุผล ความจริงปัจจุบันอยู่ที่ปลายทางในหัวข้อ 7`. Run `agenda` so the topic's row shows the approval. Add a log entry to `mreq/project/STATUS.md`.
6. **Later changes of mind** never edit a frozen doc. Start a new doc on the same topic with `/mreq:discuss <slug>`, and cite the old one in section 1. When the new doc is approved, the old one becomes `status: superseded` with `superseded-by: <NN>`. When the old decision was already passed to the builder, add a line under `## For the builder` saying what changed.

**What comes next:** tell the user where the agreed items went. When the kit exists (`node "${CLAUDE_PLUGIN_ROOT}/scripts/theme-status.mjs" status` reports `exists: true`) and this doc added a kind of app with screens, or changed the devices, acceptance sizes or languages, suggest `/mreq:theme update <the new shell or sizes>`. Otherwise give one next command: the next not-started topic on the agenda (`/mreq:discuss <slug>`), or `/mreq:theme` once tech-stack, code-structure and nfr are approved or skipped. Write it into `## Now` of `mreq/project/STATUS.md`, with one line on why it is next: what it unblocks, or which risk it settles.

Done when: every agreed item exists at its destination, the doc is frozen, STATUS.md records the approval, and the user has the next command.

## Mode: agenda (`agenda`, `agenda <feedback>`, `agenda skip <slug> <reason>`)

`mreq/discuss/AGENDA.md` recommends the topics worth a discussion doc, with the reason for each and when to have it. It is advice, never a gate: no skill waits for it, and the user may take any topic in any order, or none. `/mreq:init` creates it with the four foundation topics. This mode builds it from everything at once, and is how the user asks for a fresh look.

1. Run `agenda init`. It creates the file from [assets/agenda.md](assets/agenda.md) if it is missing and never overwrites it.
2. **Gather.** The customer's files in `mreq/source/`, `mreq/project/vision.md`, AGENTS.md, and the docs in `list`. Read only the sections a topic needs.
3. **Choose the topics.** `tech-stack`, `code-structure`, `nfr` and `security-privacy` stay as rows 1 to 4 (the template starts with them), unless the user skips them. Then any other cross-cutting topic particular to this project that the sources leave open to more than one reading, contradict each other on, or say nothing about although the scope needs it (approvals in scope, but no approver named). A topic the sources settle clearly gets no row.
4. **Write each row** as the template shows:
   - **หัวข้อ:** a Thai title with the slug in backticks: the topics.md name, or a short kebab-case name for another topic (`access-control`, `numbering`, `<aggregate>-data`). The slug becomes the doc's slug.
   - **ทำไมควรคุย:** the statement that makes it ambiguous, tagged `[ที่มา: <file> §<section>]`, and what a misreading costs (the kit, every screen, the data, an integration).
   - **ควรคุยก่อน:** `ก่อน /mreq:theme` for what shapes the kit (apps with screens, devices, languages); `ก่อนทำรายการหน้าจอ` for roles, menus and data visibility; `ก่อนส่งมอบครั้งแรก` for security, integrations, notifications, audit, import and export, and migration.
   - **#:** the order to take them in: by that stage, then by cost.
   - **สถานะ:** leave it empty; the script fills it.
5. **Refresh, never erase.** On an existing agenda keep every row and any status written by hand (`ข้าม: …`, `แยกเป็น …`). Add new topics, add new evidence to a row's reason, and renumber. A row with no doc whose reason no longer holds gets `ไม่จำเป็นแล้ว: <why>` as its status; rows are never deleted.
6. Show the rows and write them in the same turn: the agenda is advice, and the user reorders, reworks or skips rows afterwards with `agenda <feedback>` or `agenda skip`. Then run `agenda` and fix every entry in its `warnings`.

`agenda skip <slug> <reason>`: write `ข้าม: <reason>` in that row's status; the user's word is enough. A doc started later on that slug replaces the skip with its own status. `agenda <feedback>`: apply it to the rows the same way.

Done when: every row has a slug the script accepts, a cited reason and a stage, `agenda` reports no warnings, and the user has the file's path and the first topic to take.

## Mode: drop (`<NN> drop <reason>`)

Set `status: dropped`, add the reason to the revision log, and run `agenda`. Nothing is merged. Use it when the topic was folded into another doc (name that doc), or turned out not to be needed.
