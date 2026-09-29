---
name: hotspot
description: Chart a piece of big or fuzzy business logic into decision tickets and resolve them one per session until the rules are ready for an OpenSpec proposal.
disable-model-invocation: true
argument-hint: "[<idea> [@files] | <slug> [TASK-ID] [@files]]"
---

A **hotspot** is business logic that crosses screens or is expensive to get wrong: pricing, state machines, stock and ledger rules, approval chains, anything with money or legal impact. Building it slice by slice without seeing the whole rule is how the foundation ends up rebuilt mid-project. This skill finds the rules first and hands them to OpenSpec; it produces decisions, not code.

Every hotspot has the same **destination**: a `rules.md` that passes the readiness bar in [references/rule-spec.md](references/rule-spec.md), ready to become an OpenSpec change.

## Where things live

- `docs/hotspots/<slug>/map.md`: the **map**. An index, never a store: destination, notes, one line per resolved ticket pointing at its task, the fog, out of scope. Template: [assets/map.md](assets/map.md).
- `docs/hotspots/<slug>/rules.md`: the growing rule spec. Template: [assets/rules.md](assets/rules.md).
- `docs/hotspots/<slug>/questions-for-customer.md`: only for `ask` questions the user chooses to take to someone else first, written in Thai.
- **Tickets** are Backlog.md tasks with labels `decision`, `hs-<slug>`, and one type label; milestone `HS: <slug>`. The answer lives in the task's final summary and nowhere else.
- The **frontier** is `backlog task list --labels hs-<slug> --json` filtered to status `To Do` and `isReady: true`.
- **Sources** (customer documents) are tracked by `/mflow:capture`'s registry, `docs/source/INDEX.md`, and listed in the map's `Sources` section.

## Reading source documents

Read only the files named in `$ARGUMENTS` (`@file`), never a whole folder. Before reading:
1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/source-index.mjs" scan`.
2. A named file that is `new` or `changed` has not been triaged: follow `${CLAUDE_PLUGIN_ROOT}/skills/capture/SKILL.md` for that file first, then continue. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.
3. A named file that is `superseded`: tell the user and use its replacement instead.
4. A file already listed in this map's `Sources` and `unchanged`: use the map and rules.md; reopen the file only for the specific section a ticket needs.

After using a file: `node "${CLAUDE_PLUGIN_ROOT}/scripts/source-index.mjs" mark <file> --used-by hs-<slug>` and add it to the map's `Sources` with the sections used. Customer spreadsheets meant as answer keys: suggest `/mflow:golden`.

Use `backlog <command> --help` for exact flags; edit Backlog files only through the CLI.

## Ticket types (type label)

- `ask` (HITL): a choice the sources do not settle. Put it to the user in polite, direct Thai with 2 to 4 concrete options, an example for each and Claude's recommendation. The user's answer resolves it: the user speaks for the customer, so it needs no further confirmation, and "use the recommendation" is a full answer. Claude never picks on the user's behalf. Only if the user wants to ask someone else first: draft the question into `questions-for-customer.md`, add label `waiting-customer`, and resolve it from the answer the user brings back.
- `examples` (HITL): turn a rule into an example table (inputs → expected outcome), preferably from real past data the customer already calculates by hand. Resolved when the user confirms the table's rows.
- `research` (AFK): a fact outside the repo (law, tax rate, an API's behaviour). Resolve with sources cited in the summary. Several research tickets may run in one session, in parallel subagents.
- `spike` (AFK or HITL): throwaway code to learn whether an approach is feasible. Lives on a `spike/<slug>-<task>` branch; the summary records what was learned, the code is not merged.

## Mode: no arguments → overview

List each folder in `docs/hotspots/` with its map status and frontier count, plus unregistered rows in `INDEX.md`. Stop.

## Mode: chart a new hotspot (argument is an idea, no map exists)

1. **Name it.** Choose a short kebab-case slug and confirm it with the user. Add or update its row in `docs/hotspots/INDEX.md`.
2. **Check it needs a map.** Grill breadth-first across the whole rule area: states, actors, inputs, outcomes, edge cases, what happens on failure or reversal. If every question can be settled in this one conversation, it is not a hotspot: say so and suggest `/opsx:explore` or `/opsx:propose` directly. Stop.
3. **Create the map and rules files** from the templates. Fill Destination, Notes (bounded context, likely owning aggregate, related screens), Sources, and sketch the fog into `Not yet specified`.
4. **Create the tickets you can phrase sharply now**, one question each, sized to one session. Create them all first, then wire dependencies with `--dep` in a second pass. The test for ticket vs fog: can the question be stated precisely now, even if it cannot be answered yet?
5. **Write the options** into every `ask` ticket's description: 2 to 4 concrete options, an example for each and Claude's recommendation, so the user can answer as soon as the ticket comes up.
6. **Fire research** tickets in parallel subagents if any exist.
7. Update STATUS.md and stop. Charting is one session's work; resolve nothing else.

Done when: map.md has a destination, every sharp question is a ticket with its type label, dependencies are wired, and the fog is written down.

## Mode: work the map (argument is an existing slug, optional task ID)

1. Load `map.md` and `rules.md`, not every ticket body.
2. Pick the ticket: the one given, else the first frontier ticket. Claim it: status `In Progress`.
3. Resolve it by its type. Zoom into related or closed tickets only when needed.
4. Record:
   - the answer in the task's final summary, status `Done`;
   - one line in map.md `Decisions so far`: `- TASK-ID <title>: <one-line gist>`;
   - the consequence in `rules.md` (a table row, a state, an invariant), citing the task ID;
   - an architecture-level choice (aggregate boundary, sync vs async, where a rule is enforced) also as `backlog decision create`.
5. Advance the frontier: create newly sharp tickets (create, then wire), move graduated fog out of `Not yet specified`, and close tickets that the answer made pointless. Work beyond the destination goes to `Out of scope` with a reason; it never returns to the fog.
6. Check the readiness bar in [references/rule-spec.md](references/rule-spec.md). If it passes, go to **Graduate**; otherwise update STATUS.md and stop.

Resolve exactly one ticket per session (research tickets excepted). The pull to start coding is the signal to graduate or stop, not to build.

## Graduate

1. Show the user the readiness checklist with evidence for each item.
2. After a yes, propose the OpenSpec change: run `/opsx:propose <change-name>` with `rules.md` as the input. Each distinct outcome row becomes a Scenario; each invariant becomes a requirement.
3. Put the golden examples where tests can read them, in the Golden data folder of AGENTS.md `## Stack` (for example `tests/<Context>.Domain.Tests/Golden/<slug>.json` or `.csv`), and reference that path in the change's tasks.
4. Set map.md frontmatter `status: graduated` and `change: <change-name>`; add at the top of `rules.md`: "Frozen. Source of truth after archive: `openspec/specs/<domain>/spec.md`." Update the INDEX.md row and STATUS.md.

Done when: the OpenSpec change exists and validates (`openspec validate <change-name>`), the map is marked graduated, and nothing in `rules.md` is newer than the change.
