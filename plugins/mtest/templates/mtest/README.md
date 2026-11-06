# mtest

What this project's tests must prove, and the proof.

| Folder | Holds | Written by |
|---|---|---|
| `flows/` | One doc per flow: Steps, Branches, Transitions, Rules and the Cases that walk them, each with its test | `/mtest:flow` |
| `runs/` | One record per test run, tied to the commit it tested (`Tested: <branch> at <commit>`) | `/mtest:test`, `/mtest:e2e`, `run.mjs all` |
| `reviews/` | One report per review (`Reviewed: <target> <base>..<end>`, verdict, findings) | `/mtest:review` |
| `STATUS.md` | Where testing stands now and what comes next | every command |

Settings live in `../.mtest/config.json`: the test parts with their commands, folders and prerequisites,
the browser cap for E2E (`e2eMaxWorkers`) and the default branch. Logs of each run stay in `../.mtest/logs/`
and are not committed.
