# Consultation pipeline (analyze, design, challenge)

Shared by `/mflow:analyze`, `/mflow:design` and `/mflow:challenge`. Each one is **optional**: only the user calls it, no hook or other command does, no step of the main flow waits for one, and a consultation with reports still out never blocks other work or marks anything blocked. mflow writes the brief and the commands; the user runs the other tools (mflow does not run them, requirement §13). What the tools return is advice, checked against evidence before anyone uses it, and the user decides what to use.

Files opened with Read are not substituted: where this file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.

`node "${CLAUDE_PLUGIN_ROOT}/scripts/consult.mjs"` keeps each session in `.mflow/consultations/<id>/session.json` and reads its state from the files on disk:
- `new <intent> --scope "<what>" [--to <tool,tool | any>] [--focus <a,b>] [--target <file>] [--from <file>]`: opens `AN-NNN`, `DS-NNN` or `CH-NNN` with a snapshot (commit, uncommitted changes, and the hash of `--target` and `--from`) and prints where the brief (`brief`), the reports (`out`, with `{tool}`) and the summary (`summary`) go. The same intent and scope while that session is open returns it with `existing: true`, so a rerun never opens a second one; `--again` opens a new one on purpose.
- `status <id>`: `state` (`prepared` → `awaiting-reports` → `assessing` → `summarized`), `completeness` (`none`, `partial`, `complete` against the tools named in `--to`), the reports found, the tools `missing`, `stale` (`changed`: the target or `--from` file was edited since the session opened; `baseMoved`: new commits since), and `next`.
- `round <id> --issues <F3,C2>`: opens the next round on findings still disputed.
- `list`: every session; the session briefing shows the open ones in an optional section, never as the next action.

## A. Open

1. Run `consult.mjs new …`. With `existing: true`, say so and carry on from the step its `state` names: `prepared` → B, `awaiting-reports` → the hand-over reminder in B4, `assessing` → C.
2. Tell the user the id, and that it runs alongside the main work, which does not wait for it.

## B. Brief and hand over

1. **Brief.** Write it at the session's `brief` path, following steps 1, 2 and 4 of `${CLAUDE_PLUGIN_ROOT}/skills/delegate/SKILL.md`, with subject `<id>-r<round>`, mode `analyze` (read-only, whatever the intent), the output contract the skill names from `${CLAUDE_PLUGIN_ROOT}/skills/delegate/references/brief-template.md`, and `--out` set to the session's `out`. Record `base` and `dirty` as delegate step 2 says. One brief serves every tool.
2. **Independence.** In round 1 every tool works alone: the brief says not to open `docs/ai-inbox/`. Roles are the user's choice, never fixed per tool brand: by default every tool takes the whole scope, which makes their answers comparable; for a large system the user may split it by viewpoint (business, data, security…), each tool taking one. Then the brief gives each role its own heading and questions, and the summary checks the joins between the parts, because parts that each look right can still fail to fit.
3. **Sources.** Point to text versions of customer documents (`source-index.mjs cache`), never to a binary; a chat tool gets a context pack (delegate step 2).
4. **Hand over.** Show each tool's commands (delegate step 4) and the pack for chat tools. Two tools and at most two rounds is the default; the user may change both. Write one line in STATUS.md `## Now`: `<id> รอรายงาน (ไม่บังคับ งานหลักทำต่อได้)`. Stop.

## C. Reports back (`/mflow:<intent> <id>`)

The command with the id is the go to assess and summarize; ask nothing more.

1. `consult.mjs status <id>`. A tool still missing does not stop this step: summarize what is in as `partial` when the user goes ahead, and name what is missing.
2. **Normalize** each report: `node "${CLAUDE_PLUGIN_ROOT}/scripts/inbox-normalize.mjs" <file> --mode analyze --brief <id>-r<n> --base <the session's snapshot base> --from <tool>`.
3. **Assess** each report as steps 2 to 4 of `${CLAUDE_PLUGIN_ROOT}/skills/assess/SKILL.md` describe: trust level from Understanding and Files read, a verdict for every finding from evidence opened yourself (`outdated` included, from `stale.changedSince`), the `.assessment.md`, and `status: assessed`. When `status` reports the target or `--from` file as changed, the reports read an earlier version: check findings on the changed parts against the current text.
4. **Merge.** One item per distinct finding, naming every tool that raised it and the evidence. **Agreement is not evidence:** a claim several tools share with nothing behind it stays a hypothesis. Disagreements stay in a table of positions (who, why, and what would settle it: a source, a test, or the user's choice), never smoothed away. Rejected findings stay listed with the reason, so every line traces back to a report.
5. **Summary** at the session's `summary` path, in Thai for the user (paths and identifiers as they are), in the shape the skill gives. Frontmatter: `id`, `intent`, `revision` (1, then one more per rewrite), `round`, `completeness` (with the missing tools when partial), `base`, and `reports:` with every report folded in, comma-separated (`consult.mjs` reads it to know the summary is current). Each item carries a status: `proposed`, `selected` (only when the user picks it) or `set-aside` (with the reason). A report that arrives later makes a new revision; items the user already selected keep their status and are never changed silently.

## D. Second round (optional)

Only for findings still disputed and worth settling: `consult.mjs round <id> --issues <ids>`, then a brief at the new `brief` path that lists each disputed finding with every position and its evidence, asks each tool to answer by finding id, and tells them this round replies to the others. Then C again.

## E. Using the results

Nothing is acted on because a tool proposed it, and never production code, `openspec/specs/`, or a frozen doc. The user picks; once they say which items to take (and where), carry that out without asking again (P4):

| Result | Goes to |
|---|---|
| A verified fact about the system now, or a gap | the summary; fixes go to Backlog on the user's instruction |
| Options the user must choose between | `/mflow:discuss <topic>`, with the evidence and comparison already gathered |
| A business rule still unclear, needing examples | `/mflow:hotspot <topic>` |
| A design the user chose that changes behaviour | `/opsx:propose <change>`, citing the summary and its revision |
| Work beyond the approved baseline | `/mflow:change-request <request>` |
| A question only an experiment can settle | a spike task with its hypothesis and the result that decides it |
| Not worth doing now | Backlog, with the reason and what would bring it back |

A finding confirmed true is not an instruction to fix it: the summary keeps "พบจริง" apart from "ให้แก้".

**What comes next:** one next command with one line on why. Usually that is the main flow's own next step, which this consultation does not change, or the route for an item the user selected.
