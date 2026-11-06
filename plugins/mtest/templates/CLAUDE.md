@AGENTS.md

## Claude Code specifics
- The mtest hook briefs each session on the newest test run, flow coverage and unreviewed commits. Treat it as the current state.
- Tests: `/mtest:test` (the whole suite, or `since` for a later commit). Flows and their cases: `/mtest:flow`. Review: `/mtest:review`. E2E only on request: `/mtest:e2e`. Not sure which fits: `/mtest:help`.
