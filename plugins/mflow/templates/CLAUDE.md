@AGENTS.md

## Claude Code specifics
- mflow hooks inject a briefing at session start and, before a `git commit`, ask once for the STATUS.md entry to go into that commit. Treat the briefing as the current state; never add a STATUS.md update after an answer.
- `/opsx:apply`, `/opsx:archive`, `/mflow:test`, `/mflow:review` and its fixes commit their own work without asking; push and merge only on the user's yes.
- Not sure which command fits: `/mflow:help`. Big or fuzzy business logic: `/mflow:hotspot`. Clear, small change: `/opsx:propose`.
- Use plan mode before implementing any task labelled `hotspot` or touching an aggregate's invariants.
