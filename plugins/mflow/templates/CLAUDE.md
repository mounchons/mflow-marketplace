@AGENTS.md

## Claude Code specifics
- mflow hooks inject a briefing at session start and, before a `git commit`, ask once for the STATUS.md entry to go into that commit. Treat the briefing as the current state; never add a STATUS.md update after an answer.
- Commit each finished piece of work without asking, its files added by name (never `git add -A`). Push, merge and deploy only on the user's word, asked once in one line at the end, never as a numbered menu.
- `/opsx:apply` archives the change in the same turn and commits once. "Do X to the end" runs propose, apply and archive in one go, asking only what the user must decide.
- Not sure which command fits: `/mflow:help`. Big or fuzzy business logic: `/mflow:hotspot`. A fix that changes no behaviour the specs describe: just ask, no change. New or changed behaviour: `/opsx:propose`.
- Use plan mode before implementing any task labelled `hotspot` or touching an aggregate's invariants.
