@AGENTS.md

## Claude Code specifics
- mflow hooks inject a briefing at session start and ask for a STATUS.md entry before stopping. Treat the briefing as the current state.
- Not sure which command fits: `/mflow:help`. Big or fuzzy business logic: `/mflow:hotspot`. Clear, small change: `/opsx:propose`.
- Use plan mode before implementing any task labelled `hotspot` or touching an aggregate's invariants.
