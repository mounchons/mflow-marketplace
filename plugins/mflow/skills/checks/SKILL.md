---
name: checks
description: "Split the test, review and E2E of the changes merged into main into a checklist of small jobs on a batch branch checks/<date>-<n>, with a draft pull request to main, so any agent (Claude Code, Codex, Antigravity, OpenCode, later in the cloud too) does them one job at a time, at night or when it is urgent; show the batch, give a job to a tool in words, or run the next jobs here."
disable-model-invocation: true
argument-hint: "[next [<n>] | sync | publish | status | <job> to <tool>]"
---

The day goes into building: each change is applied on `feat/<change>` and merged into main, and its row waits in `docs/reviews/pending.md`. This skill turns what waits into **jobs** that any agent can do later, each small enough to finish within a usage limit, and keeps them in one checklist that every tool reads. It chains what mflow already does, one job at a time: `/mflow:test` (one part), `/mflow:review pending <change>` (one change, report only), `/mflow:e2e <screen>` (one screen). Design: `docs/mflow-checks-proposal.md` in the mflow repository.

Script: `node "${CLAUDE_PLUGIN_ROOT}/scripts/checks.mjs" <command>`, run from the main checkout or the batch's worktree; it prints JSON.

## The batch

- A batch is a branch `checks/<YYYY-MM-DD>-<n>` from main, with its own worktree `.claude/worktrees/checks-<batch>` and its checklist `docs/reviews/checks/<batch>.md`. Every job runs in that worktree, so the main checkout stays free for the day's merges.
- `sync` puts every change that main holds and whose row in `pending.md` still waits into the open batch (making one when none is open). The first job taken pins the batch (`Pinned:`, the commit every test of the batch runs at); a change merged after that goes into the next batch.
- The jobs:
  - `T0` prepare (the build, format and lint check-only, `openspec validate`, the every-test-once count), then `T1…` one test part each from `- Test parts:` in AGENTS.md; or `T1` the whole suite when AGENTS.md names no parts. When the last part is done, the script combines the parts' records into one whole-suite record at the pinned commit and ticks Test in `pending.md`.
  - `R…` one review per change, report only.
  - `EW…` writes or updates the E2E tests of one screen (from the row's E2E screens column), and `E…` runs them.
- Order: reviews wait for the tests to finish (a failed run is what they report); E2E waits for the tests to pass, not for the reviews. Tests and E2E take turns on a machine (they share its database, ports, Docker and browsers); reviews run alongside them.
- A taken job is held outside git, so taking one leaves the tree clean for the run. A job taken more than `checks.staleMinutes` (60) ago counts as given up, because a session cut short by a usage limit never gives it back; the next `next` takes it again.
- Only `checks.mjs` edits the checklist's table; a tool never edits it by hand. The batch branch never edits STATUS.md: STATUS.md is written in the main checkout when the user merges the pull request.

## First use in a project

`.mflow/config.json` has no `checks` key: this command is the user's opt-in. Run `checks.mjs enable`, commit `.mflow/config.json` on main, and say in one line what that allows: after each merge into main Claude adds the change to the open batch and pushes `checks/*` branches and their draft pull requests without asking; it never pushes main and never merges a pull request. The route (which tool takes which kind of job) is `checks.route` in that file, `{ "test": "any", "review": "claude", "e2e": "claude" }` by default; E2E goes only to `claude` or `codex` (the tools with mflow's browser guard).

## No argument, or `status`

`checks.mjs sync`, then `checks.mjs status`. Show each open batch: its branch, the pull request, `Pinned:`, and its jobs as a short table (job, kind, target, agent, state; a running job with its tool and since when; `ready` jobs marked). Then name what comes next in one line: the jobs ready for Claude (`/mflow:checks next`), and the jobs given to other tools, with how they take them (until mflow's runner and `$mflow-checks` exist, the user runs that tool on the job: show its `how` line).

## `sync` and `publish`

`sync` as above; when it made or changed a batch, `publish`: it pushes the branch and opens the draft pull request (`gh pr create --draft`), or updates its title and body. No `origin` remote, no `gh`, or a push refused: say so in one line; the checklist works as a file all the same. When `sync` says it added `.claude/worktrees/` to `.gitignore`, commit `.gitignore` on main.

CLAUDE.md asks for this after every merge into main in a project with `checks` in `.mflow/config.json`, without the command.

## `<job> to <tool>`: give jobs to a tool, in words too

The user says "test2 ให้ agy", "R1 ให้ codex", "EW1 ให้ claude": `checks.mjs assign <job[,job]> <tool>` (claude, codex, antigravity, opencode, or any), then `publish`. Several reviewers on one review ("review2 ให้ claude กับ codex") come with the next mflow version; say so in one line and give it to the first one. The script refuses E2E for a tool without the browser guard: give its reason.

## `next [<n>]`: do jobs here

Do up to `<n>` jobs (default 1), one after another, each to its end before the next:

1. `checks.mjs next --as claude`. No job: give its `reason` and stop.
2. Work in the job's `dir`, as its `how` says, by the skill it names, with these differences:
   - **Test** (`/mflow:test <part>`, or the whole suite for `T1` without parts): run it in the worktree; write the record as that skill says, with `By: claude`, but leave STATUS.md alone and commit nothing: `done` commits. For `T0`, the record's `Scope:` is `prepare`.
   - **Review** (`/mflow:review pending <change>`): the report and the `pending.md` tick as that skill says, from the worktree; leave its section 4 (Fix) out, as `/mflow:night` does: blockers and majors stay in the report for the user or a later fix job. No STATUS.md, no commit.
   - **E2E write** (`/mflow:e2e <screen>`): write or update its tests from its spec and run them, `--workers` at most `e2eMaxWorkers`. A test that fails because the screen breaks its spec stays failing and goes in the note; one that fails because the test is wrong is fixed. Then `done <job> --files <the test files>`.
   - **E2E run**: the screen's E2E tests as `/mflow:test e2e` does, with the cap, and its record.
   - A stack the E2E tests need starts as AGENTS.md `## Commands` says, in this worktree; stop it again when the batch's heavy jobs are done, without `-v`.
3. `checks.mjs done <job> --record <path>` (test, E2E), `--report <path>` (review) or `--files <a,b>` (E2E write), with `--note <text>` for what the user should know. It refuses a record from a commit with other code than the pinned commit, or one run with uncommitted changes: fix that and run again. It commits the record or report, the checklist, `pending.md` and the combined suite record, and says which jobs are left.
4. A job that needs the user's decision (a spec question, a permission rule, a missing table): `checks.mjs block <job> --note "<the question, with options a) b) c)>"`. A job that cannot run here (a tool missing, Docker down): `checks.mjs release <job> --note "<why>"`.
5. After each job, `publish`.

At the end, one message: the jobs done with their results, what is left and for which tool, and, when every job is done or blocked, that the pull request is ready to read and merge on the user's word (it is merged on GitHub or with `git merge --no-ff checks/<batch>` on main; then the main checkout writes the STATUS.md entry).

Done when: the jobs asked for are done, blocked or released, each with its commit, and the user knows what is left.
