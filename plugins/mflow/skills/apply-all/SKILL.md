---
name: apply-all
description: Take what the user approved in /mflow:discuss all the way to main — lay the approved documents out as a plan of changes, ask for one yes, then unattended, for each change, a branch from main, /opsx:propose, /opsx:apply (which archives and commits it), /mflow:test and /mflow:review with fix rounds until both pass, a merge into main, then the next change. Stops at the first change that does not pass. Never pushes and runs no E2E tests.
disable-model-invocation: true
argument-hint: "[<NN> ...] [--rounds <n>]"
---

The user settles what to build in `/mflow:discuss`. This command takes what they approved there to `main`. A topic that has not been through `/mflow:discuss` and been approved does not run here: the approved document holds the user's conclusions, and that is what lets a proposal be written with no one to ask. The user's yes to the plan is their word to propose, build and merge into `main` each change that passes, and for nothing more: it pushes nothing, and it writes and runs no E2E tests (`/mflow:e2e` and `/mflow:night` do, when the user calls them).

Numbers (`/mflow:apply-all 10 11`) limit the plan to those documents. `--rounds` is how many fix rounds one change gets at test and again at review (default 3).

**How the commands below run here.** `/mflow:test`, `/mflow:review` and `/mflow:change-request` cannot be called as skills from another skill: read `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md` and follow it. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`. `/opsx:propose` and `/opsx:apply` are the project's `openspec-propose` and `openspec-apply-change` skills (`.claude/skills/<name>/SKILL.md`), with the change's name as their input. The guidance in `openspec/config.yaml` still applies to them.

## 1. The plan (the one time the user is asked)

`node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-all.mjs" status`. A run is open: go on from its `next` at section 2, and never plan again.

Otherwise `apply-all.mjs candidates`. It refuses, and the reason goes to the user, when the checkout is not on `main`, the tree has uncommitted changes, or no document is approved; nothing has started then, so stop there. It gives the approved documents (`builtBy`: the proposals that already cite one), the documents still in draft, the changes already proposed and the branches `change/*` of earlier runs.

Read section 7 and the frontmatter of each approved document, `packs.mjs selected` and `docs/decisions/discuss/AGENDA.md`, and lay out the changes:
- **Not a change:** a document whose work a change in `builtBy` already holds, and one whose section 7 leaves nothing to build (a stack, a folder layout, a rule every feature follows).
- **One change:** a document with `packs:`, named after its topic, and a document whose section 7 names `/opsx:propose` or `/mflow:change-request`. A change holds one feature whole, its server side and its screens.
- **Joins a change:** a data-model document (its section 7 goes to `PrototypeData/README.md`) goes with the change that first builds its tables.
- **Waits for a discussion:** a change that needs a topic still in draft or not yet discussed stays out of the plan, named with `/mflow:discuss <slug>`.
- **Order:** what a pack requires comes first (`order` of `packs.mjs selected`), then what the documents' `sources:` and the agenda's "ควรคุยก่อน" say, then the document number.
- A branch `change/<name>` of an earlier run keeps its name, and comes first.

Show the plan in Thai, addressing the user as คุณ, and end the turn. For each change, numbered in order:
- the change, its documents, its packs, what it comes after, and whether it alters a spec already built (which one);
- **the work** it will do, in a few short lines: the tables, the rules and endpoints, the screens;
- **no prototype:** each screen it builds whose prototype is not done (a Backlog task citing the document for that screen and not Done, from `discuss.mjs cited <NN>`, or a row of `docs/ui/screens.md` with no prototype), with your recommendation for it: build it now from what the pack requires, or make the prototype first with `/mflow:screen <screen>`, and why in a few words. A missing prototype never keeps a change out of the plan: the user decides.

Then list the documents that are not a change and those that wait, each with its reason in a few words. In the same message say what happens after the yes: the session must not stop for permission prompts (start it with `claude --permission-mode auto`), the machine must not sleep (on Windows: Settings → System → Power, Sleep: Never while plugged in), each change that passes is merged into `main`, nothing is pushed, and the first change that does not pass stops the run. Close with one question, options a) ทำทั้งหมด b) ทำบางข้อ (เช่น `b 1,3`) c) แก้แผน (บอกว่าแก้อะไร) d) ยกเลิก.

Nothing is written before the answer. On c), show the plan again. On b), when a chosen change comes after one left out, name what it needs and show the plan again with that choice open. On a) or b): `apply-all.mjs start <change>=<NN>[,<NN>...] ... [--rounds <n>]`, each chosen change with the documents it builds. It refuses a document that is not approved, and a change already archived.

## The rules of the whole run, after the yes

- **No questions.** Where a skill this run follows would ask the user, take the choice this file names, or else the one that changes nothing outside this repository and loses nothing, and write the question and the choice into the run file (`--note "asked: …; took: …"`). What needs the user's decision (a spec question, a permission rule, a table the spec does not have) is never guessed: that change stops.
- **One long turn.** Do not end the turn before "Finish" is done: nobody is there to say go on. After each step, `apply-all.mjs status` names the next one, and when the context is compacted or the session restarted, it says where to go on; never start the run over.
- **The run file.** `apply-all.mjs log <step> <state> --target <change> [--note <text>]` after every step and every round (`started`, `round`, `done`, `skipped`, `stopped`). It waits inside `.git` until the run finishes, so logging never dirties the tree.
- **Commits.** Every commit of a change goes on its branch, its files added by name, never `git add -A`. `main` gets only the merges and the run's last commit. Where a skill this run follows says when to commit, or to push or merge only on the user's yes, this file decides.
- **Never** push, force, rebase or delete a branch.
- **One stop stops the run.** The next changes may build on this one. A change stops when its rounds run out, when something needs the user's decision, when `/opsx:propose` or `/opsx:apply` is blocked, on a merge conflict, or on a missing prerequisite that one start as AGENTS.md says does not bring up. Log the step `stopped` with why, and go to "Finish".

## 2. Each change, in order

**Branch.** `next` names the change, its branch `change/<change>` and its documents. `git switch -c change/<change> main`. A branch of that name already exists (a run stopped there): `git switch` to it.

**Propose.** The branch already holds the change, in `openspec/changes/<change>/` or its archive: log `propose skipped --note "already proposed"`. When it holds the archive, log `apply done --note "from an earlier run"` too, and go on at Test. Otherwise log `propose started`, then:
1. When section 7 of one of its documents sends something to `/mflow:change-request`, follow that skill for it. The yes to the plan is the user's instruction: write `Approved: <date>, by the user (the apply-all plan)` in the CR file.
2. `/opsx:propose <change>`, with `next.docs` as its input, each filled pack those documents wrote (`packs/<name>.md` beside the discussion folder), and the CR file. Link every one of those documents in `proposal.md`. The planning boundary holds, no code during propose; its "the user must start apply" is met by the yes to the plan.
3. Every choice the rules of `openspec/config.yaml` mark for the user is answered from the documents and packs, citing the one that settles it. A marked choice they do not settle stops the change: log `propose stopped` with the question, numbered with options a), b), c). Choices not marked stay as questions for testing in use.
4. A proposal that lists parts under Later changes: for each, in order, `apply-all.mjs extend <part>=<NN>[,<NN>...] --after <the change or part before it>`, so the parts run next.
5. `openspec validate <change> --strict` must pass; fix what it names. Commit the change's files (`propose <change>`), and log `propose done`.

**Apply.** Log `apply started`. `/opsx:apply <change>`: it does every task, adds the change's row to `docs/reviews/pending.md` with `change/<change>` as its branch, archives the change and commits once. Then check the branch holds the archive, the row and a clean tree; do what an older `openspec/config.yaml` left out (`/opsx:archive`, the row with `pending.mjs add`, the commit). Log `apply done --note <commit>`.

**Test.** Log `test started`, then `/mflow:test since`, which runs the whole suite when there is no earlier whole run to start from. Say nothing about a second session: no one is there.
- Passed: log `test done --note <record path>`. Its record, `docs/reviews/pending.md` and STATUS.md stay uncommitted, and go in one commit with what the review writes.
- Failed: commit its documents, then `apply-all.mjs log test round --target <change>`; when that is refused, the rounds are out: log `test stopped` with what still fails. For each failure, find whether the code breaks its spec or the test asserts behaviour the spec changed on purpose, and fix the one that is wrong. Never remove, skip or loosen a test to pass. Commit the fix (`fix(<change>): failing tests (apply-all)`), and `/mflow:test since` again.

**Review.** The level is the one in the change's row (`pending.mjs status`).
- Level `skip`: log `review skipped`, and commit the documents (`apply-all: test <change>`).
- Otherwise log `review started`, then `/mflow:review change/<change>`, with `--short` at level `short` and `Change: <change>` in its report. As for any branch, it fixes blockers and majors on this branch and commits them. Then `pending.mjs tick-review <change> --report <report path> --verdict <verdict>`, and commit the documents (`apply-all: review <change>`).
- `approve`: log `review done --note <report path>`.
- `changes-requested`, or `none` because the tests did not run: `apply-all.mjs log review round --target <change>`; when that is refused, the rounds are out: log `review stopped` with the findings still open and the report. Then `/mflow:test since`, fixing a failure as above within this round, then `/mflow:review change/<change> --short`, then tick and commit as above.
- A blocker or major that needs the user's decision stays open, and the review cannot approve: log `review stopped` with the question, numbered with options a), b), c). Minors and nits do not hold the merge.

**Merge.** `apply-all.mjs gate <change>` on the branch must say `ready: true`. When it does not, do what its `why` names if this run can; otherwise log `merge stopped` with the reasons. Then `git switch main` and `git merge --no-ff change/<change> -m "Merge change <change>"`. A conflict: `git merge --abort`, log `merge stopped`. Log `merge done --note <merge commit>`, and go on with the next change from the `main` this merge made.

## 3. Finish

Always runs, after the last merge or the first stop.
1. `git switch main`.
2. Write STATUS.md `## Now` as the list for the user's return, most urgent first: **stopped** (the change, the step, why, its report or record, and that its branch `change/<change>` holds the work), **questions for the user** (numbered, with options a), b), c)), **taken without you** (each question a skill would have asked, and the choice taken), **merged** (each change with its merge commit), **not started** (the changes after a stop).
3. `apply-all.mjs finish --result done` (or `--result stopped` when a change stopped). Commit the run file it names and STATUS.md on `main` (`apply-all: finished`).

Tell the user, for when they are back: the run file, that list in a few lines, and, in one line, that nothing was pushed and pushing waits for their word. After a stop, once it is settled (by a new `/mflow:discuss` when a decision was missing), `/mflow:apply-all` again shows the plan, with that change first, and goes on from its branch.

Done when: the run file sits under `docs/reviews/apply-all/` with a `Finished:` line, STATUS.md holds the list, and the checkout is on `main` with a clean tree.
