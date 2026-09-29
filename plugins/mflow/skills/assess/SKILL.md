---
name: assess
description: Verify another AI's analysis, review, or code-done report (from docs/ai-inbox) against the real code, specs and sources — check its understanding first, then give each finding a verdict with evidence, and turn accepted ones into tasks or proposals.
disable-model-invocation: true
argument-hint: "@docs/ai-inbox/<file>.md"
---

Another model's findings are claims, not facts. First check whether it understood the system and read what it cites; then check each claim yourself. This skill changes no code.

A report whose brief or file name carries `discuss-<NN>` answers a discussion doc. `/mflow:discuss <NN>` handles it, using steps 1 to 3 below and writing the result into the doc itself; do not assess it here as well.

## 1. Normalize

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/inbox-normalize.mjs" <file> [--from <tool>] [--mode <mode>] [--brief <id>]` (values from the brief if the file lacks them). It unwraps a fenced answer, ensures frontmatter, and reports whether `Understanding` and `Files read` exist. Load the brief named in the frontmatter.

If the report does not follow the contract's finding structure, restructure its claims into it and say so.

## 2. Check understanding before findings

Compare the report's `Understanding` with AGENTS.md, `docs/vision.md`, the relevant `openspec/specs/` and hotspot `rules.md`:
- **sound:** matches.
- **partial:** right overall, wrong or missing on something the brief depends on; name it.
- **wrong:** misreads the system's purpose, the bounded context, or a rule central to the brief.

Compare `Files read` with the brief's Read first and Scope: list required files it did not open.

Set a trust level for the whole report and state it with the reasons:
- sound + required files read → normal
- partial, or some required files missing → reduced: every finding touching the misunderstood area or an unread file starts as suspect
- wrong, or Understanding / Files read missing → low: treat every finding as a lead to check, never as evidence

Done when: understanding and coverage each have a rating backed by the files you compared.

## 3. Verify each finding

Open the evidence yourself: code at file:line, spec scenario, source page. A cited file absent from `Files read` is an automatic warning on that finding. Check whether it is already handled (Backlog task, open change, hotspot ticket, Backlog decision). Verdict:

- **accept:** true and worth doing now
- **accept-later:** true, not worth doing now (why)
- **reject:** not true, or conflicts with a spec or decision (cite it)
- **needs-decision:** true but a trade-off for the user to settle; their call is the customer's
- **already-done:** handled; cite where

For a code-done report, also run `/mflow:review` on its branch, or say it is still needed.

Done when: every finding has a verdict based on evidence you opened, never only the report's word.

## 4. Write the assessment

`docs/ai-inbox/<same-name>.assessment.md`:
- Trust: level, Understanding rating, missing required files.
- Table `ID | Verdict | Evidence checked | Action`.
- Tool notes: where this tool was strong or unreliable on this kind of brief, to guide the next delegation.

Set the inbox file's frontmatter `status: assessed`.

## 5. Propose actions, apply after a yes

- accept → Backlog task, or a suggested `/opsx:propose` if it changes behaviour in `openspec/specs/`
- needs-decision → put the trade-off to the user with the proposals; their answer makes it an accept or a reject. Left unanswered: a hotspot `ask` ticket or `backlog decision create`
- accept-later → Backlog task, label `later`
- A misunderstanding caused by a gap or ambiguity in AGENTS.md or the brief → a proposed fix to that file, so the next tool does not repeat it

**What comes next:** tell the user the verdict counts and one next command: the first accepted task, a suggested `/opsx:propose`, `/mflow:review <branch>` for a code report, or the needs-decision questions to answer. Write it into STATUS.md `## Now`.

Done when: accepted items exist as tasks or proposals, STATUS.md records the assessment, and the user has the next command.
