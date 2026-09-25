---
name: discuss
description: Write Claude's understanding or proposed design of one topic (roles and permissions, menus, data visibility, org structure…) as a numbered doc in docs/discuss for พี่ปู to review, revise it from พี่ปู's replies until it matches, then approve it and merge each agreed item into the main flow.
disable-model-invocation: true
argument-hint: "[<topic> [@files] | <NN> [feedback] | <NN> approve | <NN> drop <reason>]"
---

A discussion doc checks one thing: does Claude's reading of the sources, or its proposed design for a topic, match what พี่ปู has in mind? The doc lays out every statement, marks the ones Claude inferred or proposed, and shows concrete scenarios. พี่ปู replies until nothing is open, then approves. Only then do its items flow into vision, AGENTS.md, hotspots, decisions and tasks. The best time is right after `/mflow:source` and before `/mflow:screen inventory`, while a misunderstanding costs one paragraph instead of ten screens.

How it differs from its neighbours:
- **`/mflow:hotspot`** works out a business rule that needs customer answers or worked examples, one ticket per session. A discussion doc may spawn hotspot rows; it never replaces them.
- **`/mflow:review-notes`** records what the customer said. A discussion doc records what พี่ปู agreed with Claude.
- **`/opsx:explore`** thinks through one change to build. A discussion doc settles understanding before any change exists.

**พี่ปู's approval is not the customer's agreement.** Questions only the customer can answer stay questions. At merge they go to `docs/vision.md` Open questions or a hotspot `ask` ticket. The customer confirms through the prototype review and the `/mflow:review-notes` summary email.

Registry commands (run from the repo root):
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" list`: every doc with its status, revision, open decisions and pending notes, plus the next free number.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" check <NN>`: the open decisions, pending notes and unfilled template placeholders of one doc, and whether it is ready to approve.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" new <slug> --title "<Thai title>" --sources "<file>, <file>"`: creates `docs/discuss/NN-<slug>.md` from [assets/discussion.md](assets/discussion.md). The slug is ASCII kebab-case. The script never overwrites, and refuses a slug that still has an open draft. A frozen doc's slug can be reused for the doc that follows it.

Reply markers, explained to พี่ปู at the top of every doc:
- **Decision answer:** text after `**พี่ปูเลือก:**` under a `### D<n>: ...` heading. An empty answer means the decision is open.
- **Note:** a line starting with `> พี่ปู:`. It stays pending until a revision processes it.

The doc is written in Thai for พี่ปู. Status lives only in its frontmatter: `draft`, `approved`, `superseded` or `dropped`.

## Mode: no arguments → overview

Run `list` and show one table: number, title, status, revision, open decisions, pending notes. Then suggest up to three topics that have no doc yet. Take them from [references/topics.md](references/topics.md) where the active sources (`docs/source/INDEX.md`) leave room for interpretation, and give one line of evidence for each. Stop.

## Mode: new topic (`<topic>` matches no existing doc)

1. **Scope it.** Choose the slug and a Thai title, and confirm both with พี่ปู. Check `list` and `docs/hotspots/INDEX.md` for overlap. A single business rule that needs customer examples is a hotspot: say so and stop. A topic too big for ~200 lines becomes two docs; propose the split.
2. **Gather evidence.** Named `@files` first. Then the active files in `docs/source/INDEX.md`; never use superseded ones. Then `docs/vision.md`, the Domain vocabulary in AGENTS.md, `docs/ui/screens.md` if it exists, relevant hotspot `rules.md`, and `docs/reviews/`. Read only the sections the topic touches. A named file that `source-index.mjs scan` reports as `new` or `changed` has not been triaged yet. Follow `${CLAUDE_PLUGIN_ROOT}/skills/source/SKILL.md` for it first. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.
3. **Create and write.** Run `new`, then fill every section of the template, using the topic's checklist in [references/topics.md](references/topics.md):
   - Tag every statement: `[ที่มา: <file> §<section>]`, `[พี่ปู]`, `[อนุมาน]` or `[เสนอ]`. An untagged statement looks like fact; tag it or cut it.
   - Answer each checklist item in the doc, or turn it into a decision, a customer question, or a line under "ไม่รวมในเรื่องนี้". Skip none silently.
   - **Decisions (section 4)** are only for choices พี่ปู can make without the customer. Give 2 to 4 options with trade-offs and Claude's recommendation, and leave `**พี่ปูเลือก:**` empty. Choices only the customer can make go in section 5.
   - **Scenarios** use named example people and include at least one edge case. They are how พี่ปู spots a wrong assumption fastest.
   - **Section 7** previews the destinations from the merge table below, so พี่ปู sees what approval will change.
   - A format or pattern with Thai text in angle brackets (`INV-<ปี พ.ศ.>-<เลขรัน>`) goes in backticks; bare, `check` counts it as an unfilled placeholder.
4. **Register use.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/source-index.mjs" mark <file> --used-by discuss-<NN>` for each source file used.
5. **Hand it over.** Give พี่ปู the path, the three `[อนุมาน]` or `[เสนอ]` items that are most costly if wrong, and the open decisions. Remind them how to reply. Set STATUS.md `## Now` to "waiting for พี่ปู to review docs/discuss/NN-<slug>.md". Stop. Nothing is merged before approval.

Done when: `check <NN>` reports no `placeholderLines`, every checklist item is placed, and พี่ปู has the path.

## Mode: revise (`<NN>` with or without feedback text)

1. Run `check <NN>`. Collect the pending `> พี่ปู:` notes, the newly answered decisions, and any feedback given in `$ARGUMENTS`. A doc that is not `draft` is frozen: stop and point to the new-doc route under Approve step 5.
2. Apply each piece of feedback:
   - Rewrite the affected statements, tables and scenarios. A statement พี่ปู confirmed or supplied gets the `[พี่ปู]` tag.
   - **Never trade a source for agreement.** If feedback contradicts a cited customer source, keep the cited statement. Write the conflict in the revision log with the citation, and add it to section 5 as a customer question. Tell พี่ปู plainly. The same goes for feedback that contradicts an approved doc or an archived spec in `openspec/specs/`.
   - If an answer or note changes something else (another decision, a scenario, section 7), update it too and say so.
   - An answered decision keeps its answer line as the record. Reflect the chosen option in sections 2, 3 and 7.
   - A new question that only พี่ปู can answer becomes a new `### D<n>` with an empty answer.
3. Delete the processed `> พี่ปู:` lines. Increase `revision`, set `updated`, and add one line to `บันทึกการแก้ไข`: `rev N (<date>): <what changed, and which note or decision caused it>`.
4. Run `check <NN>` again. Report the changes in three to six lines, plus what is still open. If nothing is open, say the doc can be approved with `/mflow:discuss <NN> approve`.

Done when: `check` shows no pending notes, every feedback item has a line in the revision log, and พี่ปู has the list of remaining open items.

## Mode: approve (`<NN> approve`)

1. **Gate.** `check <NN>` must report `readyToApprove`. If not, list the open decisions, notes and placeholder lines, and stop. An open decision cannot be approved by default.
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
