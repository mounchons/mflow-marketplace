# Making mflow ask fewer questions across projects

Review date: 2026-11-26. Plugin: mflow 0.58.2. Marketplace commit: `bd83f77`.

## Recommendation for Claude

Start with two changes to the existing workflow. On an `init` rerun, show the changes that need attention and remember earlier setup choices. During `discuss`, recover the project's answer before drafting a question. Measure both changes against real project histories before adding automatic delegation.

The owner's stated goal is a personal workflow that carries familiar ways of working into each new project. My interpretation is that the owner wants to spend attention on decisions where their judgment changes the outcome. The proposals below describe possible changes. The current foundation confirmation and manual delegation rules remain the baseline for evaluating them.

## Evidence from four consuming repositories

These were read-only inspections of local checkouts under `D:\GitHub`. Counts cover numbered discussion documents in the directory named by each checkout's `.mflow/config.json`. They describe the available material. A document or revision count alone cannot tell us how often the owner answered the same question.

| Checkout | HEAD | Discussion documents | Observation |
|---|---|---:|---|
| BanchiDesk | `e7fdc42` | 11 | Commit `d0602f7` reran init at 0.58.1. The next commit refreshed the Claude web copy. This is a concrete upgrade sequence to replay. |
| BunTukTransport | `15a473d` | 4 | Its config points to `docs/discuss` and `docs/ai-inbox`. A survey using only the current template paths would miss this history. |
| StemHub | `153066c9` | 21 | An external Codex review has both the original report and an assessment. Earlier workflow studies also link the owner's interventions to subsequent plugin changes. |
| ThawSi | `1187dd6` | 13 | The approved stack discussion records an explicit architecture choice that can be compared with a different answer in BunTukTransport. |

### The same question can legitimately have two answers

ThawSi's approved `docs/decisions/discuss/01-tech-stack.md`, D6, chooses direct application-service calls and handwritten mapping. BunTukTransport's draft `docs/discuss/04-tech-stack.md`, D3, records a choice of source-generated mediator and mapping libraries. Both assistants recommended the first option. The foundation pack now identifies this question as `FOUND-D03`. These older documents establish a semantic match even though their local decision numbers differ. BunTukTransport's draft status still matters when reusing its answer.

Use the existing pack ID to find the decision across projects. Preserve the chosen behavior, its source and its approval state. The letter alone is fragile because the options can change order. An explicit project answer should survive a plugin upgrade or a switch from Claude to Codex. A choice from a different project is evidence for a recommendation. The owner can promote it to a personal default when its scope is clear. [Foundation decisions](../../plugins/mflow/packs/foundation/decisions.md)

### Some questions earn their place

An earlier StemHub study examined 91 answered decisions. The owner accepted 68 recommendations as written, accepted 11 with extra conditions, and chose differently on 12. Ten of those 12 involved costly consequences such as schema, permissions, external effects or overriding customer text. A shorter review still needs somewhere for the owner to add a condition. These historical counts come from one project running an earlier plugin version. [StemHub discussion study](../discuss-usage-analysis-stemhub.md)

A second study found that the owner skipped per-change testing and review three times in one day. mflow subsequently introduced a pending list so the owner could run those checks together. This is a model for future surveys. Trace a repeated intervention through the work that followed, find the instruction responsible, then change that instruction. [Change sizing and deferred checks](01-change-size-pending-checks-2026-10-31.md)

## Proposed changes in priority order

### 1. Make repeat setup reflect the owner's previous choices

`init` already carries forward a filled stack and tracks template versions. It also contains separate confirmation points for project tools, agent skills, worktree setup and a Claude web copy. Some steps already skip work when the target is current. On a rerun, read the existing state first and show one short plan for the applicable project-local changes. Where absence is ambiguous, distinguish an earlier explicit decline from an option that was never offered. Reopen a choice when the owner changes it or when an update materially changes what it would authorize. Keep machine-wide installation and writes outside the allowed workspace within the owner's existing approval rules. [Init procedure](../../plugins/mflow/skills/init/SKILL.md)

**Acceptance example.** Replay the BanchiDesk upgrade using a workspace fixture. With the same inputs and current generated files, a second run produces no setup questions and no diff. With one changed template, the owner sees which project file needs attention and why. An unrelated option previously declined stays quiet.

### 2. Resolve decisions before presenting the discussion

The pack procedure already defines source precedence, conditional questions and first-use confirmation for a matching foundation stack. The discussion procedure already labels the cost of a wrong answer and supports accepting remaining recommendations together. Extend these behaviors at the point where a new question is drafted. [Pack procedure](../../plugins/mflow/skills/discuss/references/packs.md) · [Discussion procedure](../../plugins/mflow/skills/discuss/SKILL.md)

| Evidence available | Proposed behavior |
|---|---|
| Current project has an approved answer and the relevant facts still hold | Apply it in discussion, proposal and implementation. Link to the decision. |
| Owner selected a pack or personal default that settles this item | Apply its value with attribution, subject to the pack's confirmation and exception rules. |
| Current draft contains the owner's answer | Carry it into the next revision with its draft status. Include it in the normal document approval. |
| New evidence conflicts with an earlier answer | State the old answer, the new evidence and the consequence. Ask once if the conflict needs the owner's judgment. |
| A reversible choice remains open | Put the suggested choice in the document and group it with the other recommendations for approval. |

In chat, lead with unresolved costly decisions and departures from the owner's usual settings. Keep the full comparison available in the document. A useful handoff would say, “The project already settled mapping in D6. One decision needs you today: who may view records across branches?” Preserve the existing first foundation review, which the owner explicitly requested. 

**Acceptance example.** Resume an approved ThawSi-style project in a fresh agent session. The agent finds D6 and proceeds. Resume the BunTukTransport draft and it retains D3 for review. Introduce a conflicting customer requirement and the agent can explain in one sentence why it reopened the question.

### 3. Review how consuming repositories actually use mflow

Given an explicit list of checkout paths, read each config to locate its artifacts and record the commit examined. Start with one workflow question per survey. Follow the evidence from discussion and proposal to implementation, review, or a later change request. Older projects may require matching the meaning of a decision before it has a pack ID.

Return one row per finding with the project, evidence path and decision or commit, the owner's intervention, the observed outcome, and the proposed destination for a fix. A project exception belongs in that project. An owner-declared reusable convention belongs in a pack. A repeated interruption caused by skill instructions belongs in the plugin. When the conversation or reason for a choice is missing, record it as unknown. Keep the source checkouts read-only.

### 4. Give other agents bounded assignments

Use one lead agent to own the question list and the final assessment. An external agent can gather a single decision across repositories, review a bounded change against its acceptance criteria, or implement one change in its own workspace-local worktree. Give it the relevant sources, commit and expected output. The lead checks findings against the evidence and brings only unresolved decisions to the owner.

StemHub's `docs/ai/inbox/2026-10-01-codex-email-templates.assessment.md` illustrates why the brief matters. Codex supplied concrete parser examples, but it also read a status summary containing the first reviewer's findings. The assessor correctly reduced the weight of the overlapping findings. For independent reviews, check what each reviewer actually saw before counting agreement as corroboration.

Today `delegate` prepares a brief and commands for the owner to run. An optional next step would let the lead invoke a selected tool for an explicitly authorized read-only scope and collect its report. Preserve the manual route. Treat code execution as a separate decision. The current Antigravity code-mode command uses `--dangerously-skip-permissions`, and the skill documents an empty-output case even with a successful exit code. Validate the returned report before reporting completion. This review inspected the definitions and past reports. It did not execute Codex or Antigravity. [Delegate procedure](../../plugins/mflow/skills/delegate/SKILL.md) · [Consultation procedure](../../plugins/mflow/skills/delegate/references/consultation.md)

## How to judge the first iteration

Replay the same upgrade and discussion inputs before and after the change. Count user turns spent on already settled questions, genuinely new decisions surfaced, and project exceptions preserved. Inspect any reopened decision for a specific change in evidence. Include one conflicting requirement and one previously declined setup option in the replay. Success means the duplicate prompts disappear while both cases still receive the intended treatment. This gives Claude a small first implementation with a result the owner can verify in the next real session.
